"use client";

import { FolderPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createFolderIn } from "@/app/(app)/note-actions";

/** 이 폴더 안에 새 폴더 (Drive 권한이 허락할 때만 보인다) */
export function NewFolderButton({ rootId, folderId }: { rootId: string; folderId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <button
        className="btn"
        disabled={busy}
        onClick={async () => {
          const name = prompt("새 폴더 이름");
          if (name === null || !name.trim()) return;
          setBusy(true);
          setError(null);
          try {
            const res = await createFolderIn(rootId, folderId, name);
            if (res.ok) router.push(res.href);
            else setError(res.error);
          } catch {
            setError("서버에 연결하지 못했습니다.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <FolderPlus size={16} aria-hidden />
        {busy ? "만드는 중…" : "새 폴더"}
      </button>
      {error && (
        <p className="status small error title-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
