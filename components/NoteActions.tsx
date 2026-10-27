"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { renameNote, trashNote } from "@/app/(app)/note-actions";

/** 보기 화면의 소유자용 버튼: 편집 / 이름 바꾸기 / 삭제 */
export function NoteActions({ fileId, fileName, editHref }: { fileId: string; fileName: string; editHref: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<{ ok: true; href: string } | { ok: false; error: string }>) => {
    setBusy(true);
    setError(null);
    try {
      const res = await action();
      if (res.ok) router.push(res.href);
      else setError(res.error);
    } catch {
      setError("서버에 연결하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="note-actions">
      <Link className="btn btn-save" href={editHref}>
        편집
      </Link>
      <button
        className="btn"
        disabled={busy}
        onClick={() => {
          const next = prompt("새 파일 이름", fileName.replace(/\.md$/i, ""));
          if (next !== null && next.trim()) void run(() => renameNote(fileId, next));
        }}
      >
        이름 바꾸기
      </button>
      <button
        className="btn danger"
        disabled={busy}
        onClick={() => {
          if (confirm(`'${fileName}'을(를) 휴지통으로 옮길까요?\nDrive 휴지통에서 30일 안에 복구할 수 있어요.`))
            void run(() => trashNote(fileId));
        }}
      >
        삭제
      </button>
      {error && <span className="status small error">{error}</span>}
    </div>
  );
}
