"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { LocalScope, useLocal } from "@/components/LocalData";
import { PreviewFor } from "@/components/LocalPreview";
import { openLocal, rootOf } from "@/lib/local-store";

// 앱을 처음 열 때: 서버가 Drive에서 일기장 목록을 받는 동안(수 초) 자리표시(skeleton) 대신 기기에 받아 둔 사본으로 먼저 그린다.
// 첫 문서를 받는 동안 기다리는 자리(loading.tsx)는 브라우저가 아직 살려 두지 않아서, 이미 살아 있는 앱 틀(레이아웃)에 두고
// 자리표시가 보이는 동안만 그 위에 보인다. 서버 화면이 오면(자리표시가 사라지면) 내려가고, 그 뒤 화면 이동은 loading.tsx의 LocalPreview가 맡는다.
// 주소가 / 이면 지난번에 연 내 일기장의 첫 화면. 사본이 없거나 그릴 수 없는 화면이면 아무것도 안 그린다 (자리표시 그대로).

const waiting = () => !!document.querySelector(".content .skeleton");

export function BootPreview({ email }: { email: string }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [on, setOn] = useState(false);
  const [last, setLast] = useState<string | null>(null);

  useEffect(() => {
    if (!waiting()) return;
    setOn(true);
    try {
      setLast(localStorage.getItem(`my-life:last-root:${email}`));
    } catch {}
    const main = document.querySelector(".content");
    if (!main) return;
    const watch = new MutationObserver(() => {
      if (waiting()) return;
      setOn(false);
      watch.disconnect();
    });
    watch.observe(main, { childList: true, subtree: true });
    return () => watch.disconnect();
  }, [email]);

  const inLib = /^\/d\/([^/?]+)/.exec(pathname);
  const rootId = inLib ? decodeURIComponent(inLib[1]) : pathname === "/" ? last : null;
  useEffect(() => {
    if (on && rootId) void openLocal(email, rootId);
  }, [on, email, rootId]);
  if (!on || !rootId) return null;
  return (
    <LocalScope email={email} rootId={rootId}>
      <BootView pathname={pathname} search={search} />
    </LocalScope>
  );
}

function BootView({ pathname, search }: { pathname: string; search: string }) {
  const local = useLocal();
  if (!local) return null;
  const path = pathname === "/" ? rootOf(local).h : pathname;
  const sp = pathname === "/" ? "" : search;
  return (
    <div className="boot-preview">
      <PreviewFor pathname={path} search={sp} />
    </div>
  );
}
