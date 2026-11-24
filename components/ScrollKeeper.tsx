"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

// 뒤로·앞으로 가기에서 보던 자리로: 목록마다 마지막 스크롤 위치를 기억해 두었다가, 뒤로·앞으로 갈 때만 되살린다.
// (기기 사본으로 화면을 먼저 그리는 동안 원래 화면이 잠깐 숨어 높이가 줄어서, 브라우저·Next 기본 복원은 맨 위로 떨어진다)
// 머리줄의 ←(위로, data-restore-scroll)로 목록에 돌아갈 때도 되살린다. 그 밖에 링크를 눌러 새로 들어갈 때는 맨 위에서 시작한다.

const STORE = "my-life:scroll";
const KEEP_TRYING_MS = 2500;

const keyNow = () => location.pathname + location.search;

function load(): Record<string, number> {
  try {
    return JSON.parse(sessionStorage.getItem(STORE) ?? "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

export function ScrollKeeper() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const saved = useRef<Record<string, number>>({});
  /** 떠나는 중: 다음 화면이 그려질 때까지 스크롤 기록을 멈춘다 (맨 위로 올리는 것이 기록되지 않게) */
  const leaving = useRef(false);
  /** 뒤로·앞으로로 자리를 되살리는 중 */
  const restoring = useRef(false);
  /** ←(위로)로 가는 화면: 도착하면 그 화면의 자리를 되살린다 */
  const upTarget = useRef<string | null>(null);
  const restoreRef = useRef<(key: string, y: number) => void>(() => {});

  useEffect(() => {
    saved.current = load();
    try {
      history.scrollRestoration = "manual";
    } catch {}
    const persist = () => {
      try {
        // 너무 많이 쌓이지 않게 최근 50개만
        const entries = Object.entries(saved.current).slice(-50);
        sessionStorage.setItem(STORE, JSON.stringify(Object.fromEntries(entries)));
      } catch {}
    };
    let t: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      if (leaving.current || restoring.current) return;
      const key = keyNow();
      delete saved.current[key];
      saved.current[key] = Math.round(scrollY);
      clearTimeout(t);
      t = setTimeout(persist, 200);
    };
    // 링크를 누르는 순간(다른 처리보다 먼저): 지금 자리를 적어 두고 기록을 멈춘다
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search)) return;
      saved.current[keyNow()] = Math.round(scrollY);
      persist();
      leaving.current = true;
      upTarget.current = a.hasAttribute("data-restore-scroll") ? url.pathname + url.search : null;
    };

    // 되살리기: 목록이 늦게 그려지거나 기기 사본 → 서버 화면으로 바뀌어도 자리를 지키도록 잠시 계속 옮긴다.
    // 사용자가 직접 움직이면 바로 그만
    let raf = 0;
    let stopRestore = () => {};
    const restore = (key: string, y: number) => {
      stopRestore();
      restoring.current = true;
      const until = Date.now() + KEEP_TRYING_MS;
      const end = () => {
        cancelAnimationFrame(raf);
        restoring.current = false;
        leaving.current = false;
        window.removeEventListener("wheel", end);
        window.removeEventListener("touchstart", end);
        window.removeEventListener("keydown", end);
        stopRestore = () => {};
      };
      stopRestore = end;
      window.addEventListener("wheel", end, { passive: true });
      window.addEventListener("touchstart", end, { passive: true });
      window.addEventListener("keydown", end);
      const step = () => {
        // 다른 화면으로 또 옮겨 갔으면 그만
        if (keyNow() !== key) return end();
        const max = document.documentElement.scrollHeight - innerHeight;
        if (max >= y - 2 && Math.abs(scrollY - y) > 1) window.scrollTo(0, y);
        if (Date.now() < until) raf = requestAnimationFrame(step);
        else end();
      };
      raf = requestAnimationFrame(step);
    };
    restoreRef.current = restore;
    const onPop = () => {
      upTarget.current = null;
      // 떠나는 화면의 자리는 이미 기록돼 있다. 돌아갈 화면의 자리가 있으면 되살린다
      const key = keyNow();
      const y = saved.current[key];
      if (y) restore(key, y);
      else stopRestore();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPop);
      clearTimeout(t);
      stopRestore();
    };
  }, []);

  // 화면이 바뀌면 기록을 다시 시작 (되살리는 중이면 그것이 끝날 때). ←(위로)로 왔으면 그 화면의 자리를 되살린다
  useEffect(() => {
    const key = keyNow();
    if (upTarget.current && decodeURI(upTarget.current) === decodeURI(key)) {
      upTarget.current = null;
      const y = saved.current[key];
      if (y) return void restoreRef.current(key, y);
    }
    if (!restoring.current) leaving.current = false;
  }, [pathname, search]);

  return null;
}
