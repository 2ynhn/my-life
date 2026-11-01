"use client";

import { createContext, useContext, useEffect, useSyncExternalStore } from "react";
import { getLocal, localVersion, setLocalChecksum, subscribeLocal, syncLocal, type LocalState } from "@/lib/local-store";
import { onResult } from "@/lib/save-queue";

// 일기장 화면 안: 기기에 받아 둔 목록·글을 맞춰 두고(LocalProvider), 화면이 그 데이터를 쓴다(useLocal)

type Ctx = { email: string; rootId: string };
const LocalContext = createContext<Ctx | null>(null);

const AGAIN_MS = 60_000;

export function LocalProvider({ email, rootId, children }: Ctx & { children: React.ReactNode }) {
  useEffect(() => {
    let last = 0;
    const sync = (force = false) => {
      if (!force && Date.now() - last < AGAIN_MS) return;
      last = Date.now();
      void syncLocal(email, rootId);
    };
    sync(true);
    const onVisible = () => document.visibilityState === "visible" && sync();
    document.addEventListener("visibilitychange", onVisible);
    // 저장이 끝나면 바뀐 목록을 받아 온다
    const off = onResult((job, result) => {
      if (!result.ok) return;
      if (job.fileId && result.checksum) setLocalChecksum(email, rootId, job.fileId, result.checksum);
      setTimeout(() => sync(true), 500);
    });
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      off();
    };
  }, [email, rootId]);
  return <LocalContext.Provider value={{ email, rootId }}>{children}</LocalContext.Provider>;
}

export const useLocalContext = () => useContext(LocalContext);

/** 기기에 받아 둔 이 일기장 (아직 없으면 null) */
export function useLocal(): LocalState | null {
  const ctx = useContext(LocalContext);
  // 서버 화면을 이어받는 첫 그리기(하이드레이션) 동안은 서버와 같게 '없음'
  const version = useSyncExternalStore(subscribeLocal, localVersion, () => -1);
  return ctx && version >= 0 ? getLocal(ctx.email, ctx.rootId) : null;
}
