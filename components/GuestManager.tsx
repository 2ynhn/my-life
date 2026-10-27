"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { addGuestAction, removeGuestAction } from "@/app/(app)/settings/actions";

type Guest = { email: string; addedAt: string };

const fmtDate = (iso: string) => (iso ? new Date(iso).toLocaleDateString("ko-KR") : "");

export function GuestManager({ guests }: { guests: Guest[] }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => ReturnType<typeof addGuestAction>, after?: () => void) => {
    setBusy(true);
    setError(null);
    try {
      const res = await action();
      if (res.ok) {
        after?.();
        router.refresh();
      } else setError(res.error);
    } catch {
      setError("서버에 연결하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="guest-manager">
      <form
        className="guest-add"
        onSubmit={(e) => {
          e.preventDefault();
          if (email.trim()) void run(() => addGuestAction(email), () => setEmail(""));
        }}
      >
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="게스트 구글 이메일"
          aria-label="게스트 이메일"
          autoComplete="off"
          required
        />
        <button className="btn btn-save" type="submit" disabled={busy}>
          추가
        </button>
      </form>
      {error && <p className="status small error">{error}</p>}

      {guests.length === 0 ? (
        <p className="muted small">아직 등록한 게스트가 없습니다.</p>
      ) : (
        <ul className="person-list">
          {guests.map((g) => (
            <li key={g.email}>
              <span className="email">{g.email}</span>
              <span className="muted small">{fmtDate(g.addedAt)} 추가</span>
              <button
                className="btn danger"
                disabled={busy}
                onClick={() => {
                  if (confirm(`${g.email} 의 접근을 해제할까요?\n1분 안에 차단됩니다.`)) void run(() => removeGuestAction(g.email));
                }}
              >
                해제
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
