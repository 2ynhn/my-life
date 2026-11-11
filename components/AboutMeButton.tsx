"use client";

import { UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { openAboutMe } from "@/app/(app)/note-actions";

/** 나에 대해(_me/me.md) 쓰기·고치기: 없으면 만들고(접근 제한 폴더) 편집기로 */
export function AboutMeButton({ exists }: { exists: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        className="btn"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const res = await openAboutMe();
            if (res.ok) router.push(`${res.href}?mode=edit`);
            else setError(res.error);
          } catch {
            setError("서버에 연결하지 못했습니다.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <UserRound size={16} aria-hidden />
        {busy ? "여는 중…" : exists ? "나에 대해 고치기" : "나에 대해 쓰기"}
      </button>
      {error && (
        <p className="status small error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
