"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useLocal } from "@/components/LocalData";
import { PreviewFor } from "@/components/LocalPreview";

// 방금 이 기기에서 고친 글: Drive 저장이 끝나 서버 화면이 새 내용을 받기 전까지는 기기 사본(새 내용)을 보여 준다.
// (저장은 뒤에서 하므로, 그 사이 서버가 그린 화면은 고치기 전 내용일 수 있다)

const HOLD_MS = 120_000;

export function FreshNote({ fileId, serverText, children }: { fileId: string; serverText: string; children: React.ReactNode }) {
  const local = useLocal();
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const t = local?.texts.get(fileId);
  if (t?.w && Date.now() - t.w < HOLD_MS && t.t !== serverText) return <PreviewFor pathname={pathname} search={search} />;
  return <>{children}</>;
}
