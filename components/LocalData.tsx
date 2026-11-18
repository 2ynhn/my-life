"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useSyncExternalStore } from "react";
import { getLocal, isPendingId, localVersion, normHref, setLocalChecksum, setPendingJobs, subscribeLocal, syncLocal, type LocalState } from "@/lib/local-store";
import { getJobs, onResult, subscribe as subscribeJobs } from "@/lib/save-queue";

// 일기장 화면 안: 기기에 받아 둔 목록·글을 맞춰 두고(LocalProvider), 화면이 그 데이터를 쓴다(useLocal)

type Ctx = { email: string; rootId: string };
const LocalContext = createContext<Ctx | null>(null);

const AGAIN_MS = 60_000;

export function LocalProvider({ email, rootId, children }: Ctx & { children: React.ReactNode }) {
  const router = useRouter();
  useEffect(() => {
    let last = 0;
    const sync = (force = false) => {
      if (!force && Date.now() - last < AGAIN_MS) return Promise.resolve();
      last = Date.now();
      return syncLocal(email, rootId);
    };
    // 아직 저장 중인 새 글을 누르면: 저장이 끝나 진짜 글이 생길 때 연다 (그 전에는 서버에 없는 주소)
    let waitHref: string | null = null;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      const entry = getLocal(email, rootId)?.byHref.get(normHref(url.pathname));
      if (!entry || !isPendingId(entry.id)) return;
      e.preventDefault();
      e.stopPropagation();
      waitHref = url.pathname;
    };
    document.addEventListener("click", onClick, true);
    sync(true);
    const onVisible = () => document.visibilityState === "visible" && sync();
    document.addEventListener("visibilitychange", onVisible);
    // 설정(예산·분류)처럼 저장 대기열 밖에서 바꾼 것
    const onAsk = () => sync(true);
    window.addEventListener("my-life:sync", onAsk);
    // 저장이 끝나면 바뀐 목록을 받아 온다
    const off = onResult((job, result) => {
      if (!result.ok) return;
      if (job.fileId && result.checksum) setLocalChecksum(email, rootId, job.fileId, result.checksum);
      setTimeout(
        () =>
          void sync(true).then(() => {
            if (!waitHref) return;
            const entry = getLocal(email, rootId)?.byHref.get(normHref(waitHref));
            if (entry && !isPendingId(entry.id)) {
              router.push(entry.h);
              waitHref = null;
            }
          }),
        500,
      );
    });
    // 저장 대기열의 새 글은 사본에 임시 항목으로 (목록에 바로). 사본을 처음 불러온 뒤에도 다시 맞춘다
    const pend = () =>
      setPendingJobs(
        email,
        rootId,
        getJobs().flatMap((j) =>
          j.op === "create" && j.folderId && j.name
            ? [{ id: j.id, at: j.at, rootId: j.rootId, folderId: j.folderId, subfolder: j.subfolder, name: j.name, text: j.text, failed: j.state === "failed" }]
            : [],
        ),
      );
    pend();
    const offJobs = subscribeJobs(pend);
    const offLocal = subscribeLocal(pend);
    // 다음 번 첫 화면(주소가 / 일 때)을 이 일기장 사본으로 먼저 그리게
    try {
      localStorage.setItem(`my-life:last-root:${email}`, rootId);
    } catch {}
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("my-life:sync", onAsk);
      off();
      offJobs();
      offLocal();
      document.removeEventListener("click", onClick, true);
    };
  }, [email, rootId, router]);
  return <LocalContext.Provider value={{ email, rootId }}>{children}</LocalContext.Provider>;
}

export const useLocalContext = () => useContext(LocalContext);

/** 동기화 없이 사본만 쓰는 범위 (첫 화면: 일기장 화면 틀이 Drive를 기다리는 동안) */
export function LocalScope({ email, rootId, children }: Ctx & { children: React.ReactNode }) {
  return <LocalContext.Provider value={{ email, rootId }}>{children}</LocalContext.Provider>;
}

/** 기기에 받아 둔 이 일기장 (아직 없으면 null) */
export function useLocal(): LocalState | null {
  const ctx = useContext(LocalContext);
  // 서버 화면을 이어받는 첫 그리기(하이드레이션) 동안은 서버와 같게 '없음'
  const version = useSyncExternalStore(subscribeLocal, localVersion, () => -1);
  return ctx && version >= 0 ? getLocal(ctx.email, ctx.rootId) : null;
}
