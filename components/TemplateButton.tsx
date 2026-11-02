"use client";

import { LayoutTemplate } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createFolderTemplate } from "@/app/(app)/note-actions";

/**
 * 폴더 서식(_template.md) 고치기. 있으면 바로 편집기로, 없으면 지금 쓰는 서식 내용으로 만들고 편집기로.
 * 보이는지는 Drive 권한이 정한다: 파일이 있으면 그 파일을 고칠 수 있을 때, 없으면 폴더에 추가할 수 있을 때.
 */
export function TemplateButton({
  rootId,
  folderId,
  existing,
  canCreate,
}: {
  rootId: string;
  folderId: string;
  existing: { href: string; editable: boolean } | null;
  canCreate: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = <span className="btn-label">{busy ? "만드는 중…" : "서식"}</span>;
  const icon = <LayoutTemplate size={16} aria-hidden />;

  if (existing) {
    if (!existing.editable) return null;
    return (
      <Link className="btn template-btn" href={`${existing.href}?mode=edit`} title="이 폴더의 새 글 서식 고치기" aria-label="서식 고치기">
        {icon}
        {label}
      </Link>
    );
  }
  if (!canCreate) return null;
  return (
    <>
      <button
        className="btn template-btn"
        disabled={busy}
        title="이 폴더의 새 글 서식 만들기 (_template.md)"
        aria-label="서식 만들기"
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const res = await createFolderTemplate(rootId, folderId);
            if (res.ok) router.push(`${res.href}?mode=edit`);
            else setError(res.error);
          } catch {
            setError("서버에 연결하지 못했습니다.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {icon}
        {label}
      </button>
      {error && (
        <p className="status small error title-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
