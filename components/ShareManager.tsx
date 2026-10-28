"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { inviteAction, restrictAction, revokeAction, type Result } from "@/app/(app)/settings/actions";

type Share = { id: string; email: string; name: string; role: string };
type FolderRow = { id: string; path: string; restricted: boolean; legacyPrivate: boolean };

const ROLE: Record<string, string> = { reader: "보기", commenter: "보기(댓글)", writer: "편집" };

function useRun() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (action: () => Promise<Result>, after?: () => void) => {
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
  return { busy, error, run };
}

export function InviteLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="invite-link">
      <code>{link}</code>
      <button
        className="btn"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(link);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {}
        }}
      >
        {copied ? "복사됨" : "복사"}
      </button>
    </div>
  );
}

export function ShareList({ shares }: { shares: Share[] }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("reader");
  const { busy, error, run } = useRun();

  return (
    <div className="guest-manager">
      <form
        className="guest-add"
        onSubmit={(e) => {
          e.preventDefault();
          if (email.trim()) void run(() => inviteAction(email, role), () => setEmail(""));
        }}
      >
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="초대할 구글 이메일"
          aria-label="초대할 이메일"
          autoComplete="off"
          required
        />
        <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="권한">
          <option value="reader">보기</option>
          <option value="writer">편집</option>
        </select>
        <button className="btn btn-save" type="submit" disabled={busy}>
          초대
        </button>
      </form>
      {error && <p className="status small error">{error}</p>}

      {shares.length === 0 ? (
        <p className="muted small">아직 공유한 사람이 없습니다.</p>
      ) : (
        <ul className="person-list">
          {shares.map((s) => (
            <li key={s.id}>
              <span className="email">
                {s.email || s.name}
                {s.name && s.email && <span className="muted small"> · {s.name}</span>}
              </span>
              <span className={`badge${s.role === "writer" ? " owner" : ""}`}>{ROLE[s.role] ?? s.role}</span>
              <button
                className="btn danger"
                disabled={busy}
                onClick={() => {
                  if (confirm(`${s.email || s.name} 와의 공유를 끊을까요?\nDrive 공유가 해제되어 바로 볼 수 없게 됩니다.`))
                    void run(() => revokeAction(s.id));
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

export function RestrictList({ folders }: { folders: FolderRow[] }) {
  const { busy, error, run } = useRun();
  return (
    <>
      {error && <p className="status small error">{error}</p>}
      <ul className="person-list">
        {folders.map((f) => (
          <li key={f.id}>
            <span className="email">
              {f.restricted ? "🔒 " : "📁 "}
              {f.path}
              {f.legacyPrivate && !f.restricted && (
                <span className="status small error"> · .private 표시가 있지만 Drive에서는 아직 공유됨</span>
              )}
            </span>
            <button
              className={`btn${f.restricted ? "" : " danger"}`}
              disabled={busy}
              onClick={() => void run(() => restrictAction(f.id, !f.restricted))}
            >
              {f.restricted ? "제한 풀기" : "게스트에게 숨기기"}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
