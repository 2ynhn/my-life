"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useLocal } from "@/components/LocalData";
import { canPreview, PreviewFor } from "@/components/LocalPreview";
import { normHref } from "@/lib/local-store";

// 링크를 누르는 순간: 서버 응답(또는 미리 받기)을 기다리지 않고 기기에 받아 둔 데이터로 다음 화면을 바로 그린다.
// 주소가 실제로 바뀌면(loading.tsx나 서버 화면이 들어오면) 걷어 낸다.

const GIVE_UP_MS = 20_000;

/** 화면 비교용 (주소의 퍼센트 인코딩 차이는 무시) */
const keyOf = (pathname: string, search: string) => `${normHref(pathname)}?${new URLSearchParams(search).toString()}`;

export function LocalNav() {
  const local = useLocal();
  const localRef = useRef(local);
  useEffect(() => {
    localRef.current = local;
  }, [local]);
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [pending, setPending] = useState<{ pathname: string; search: string; from: string } | null>(null);

  // 주소가 바뀌면 이 화면의 일은 끝
  const here = keyOf(pathname, search);
  if (pending && pending.from !== here) setPending(null);
  const hereRef = useRef(here);
  useEffect(() => {
    hereRef.current = here;
  }, [here]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search) return; // 같은 화면(연도 점프 등)
      const target = url.search.slice(1);
      if (!canPreview(localRef.current, url.pathname, target)) return;
      setPending({ pathname: url.pathname, search: target, from: keyOf(location.pathname, location.search.slice(1)) });
      window.scrollTo(0, 0);
    };
    // 뒤로·앞으로: 주소는 이미 바뀌었고 화면은 아직 이전 것
    const onPop = () => {
      const target = location.search.slice(1);
      // 같은 화면 안의 이동(#연도 점프)도 popstate가 온다
      if (keyOf(location.pathname, target) === hereRef.current) return;
      if (!canPreview(localRef.current, location.pathname, target)) return;
      setPending({ pathname: location.pathname, search: target, from: hereRef.current });
    };
    document.addEventListener("click", onClick);
    window.addEventListener("popstate", onPop);
    return () => {
      document.removeEventListener("click", onClick);
      window.removeEventListener("popstate", onPop);
    };
  }, []);

  // 이동이 안 되면(오류 등) 원래 화면으로
  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => setPending(null), GIVE_UP_MS);
    return () => clearTimeout(t);
  }, [pending]);

  if (!pending) return null;
  return (
    <div className="local-overlay">
      <PreviewFor pathname={pending.pathname} search={pending.search} />
    </div>
  );
}
