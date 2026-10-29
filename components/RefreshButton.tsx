"use client";

import { RefreshCw } from "lucide-react";
import { usePathname } from "next/navigation";
import { useTransition } from "react";
import { refreshLibrary } from "@/app/(app)/actions";

/** 일기장 안에 있을 때만(사이드 메뉴 아래): Drive에서 방금 바꾼 내용을 바로 다시 읽는다 */
export function RefreshButton() {
  const pathname = usePathname();
  const [pending, start] = useTransition();
  const rootId = /^\/d\/([^/]+)/.exec(pathname)?.[1];
  if (!rootId) return null;
  return (
    <button
      className="side-refresh"
      title="Drive·Claude 쪽에서 방금 고친 내용을 바로 반영 (가만히 두어도 30초 안에 반영돼요)"
      disabled={pending}
      onClick={() => start(() => refreshLibrary(decodeURIComponent(rootId)))}
    >
      <RefreshCw size={16} className={pending ? "spin" : undefined} aria-hidden />
      {pending ? "불러오는 중…" : "Drive에서 다시 불러오기"}
    </button>
  );
}
