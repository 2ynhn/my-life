"use client";

import { usePathname } from "next/navigation";
import { useTransition } from "react";
import { refreshLibrary } from "@/app/(app)/actions";

/** 일기장 안에 있을 때만: Drive에서 방금 바꾼 내용을 바로 다시 읽는다 */
export function RefreshButton() {
  const pathname = usePathname();
  const [pending, start] = useTransition();
  const rootId = /^\/d\/([^/]+)/.exec(pathname)?.[1];
  if (!rootId) return null;
  return (
    <button
      className="btn"
      title="Drive에서 다시 불러오기"
      disabled={pending}
      onClick={() => start(() => refreshLibrary(decodeURIComponent(rootId)))}
    >
      {pending ? "불러오는 중…" : "새로고침"}
    </button>
  );
}
