"use client";

import { Check, CloudUpload, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { dismiss, getJobs, kick, onResult, retry, subscribe, type Job } from "@/lib/save-queue";

// 뒤에서 저장 중인 글 알림 (화면 아래). 끝나면 지금 화면을 새로 그려 목록 등에 반영한다.

const none: Job[] = [];

export function useJobs(): Job[] {
  return useSyncExternalStore(subscribe, getJobs, () => none);
}

export function SaveStatus() {
  const router = useRouter();
  const jobs = useJobs();
  const [done, setDone] = useState(false);

  useEffect(() => {
    // 지난번에 못 보낸 것이 있으면 다시 보내고, 인터넷이 돌아오거나 앱으로 돌아오면 다시 시도
    void kick();
    const again = () => void kick();
    const onVisible = () => document.visibilityState === "visible" && again();
    window.addEventListener("online", again);
    document.addEventListener("visibilitychange", onVisible);
    const off = onResult((_, result) => {
      if (!result.ok) return;
      router.refresh();
      setDone(true);
    });
    return () => {
      off();
      window.removeEventListener("online", again);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(false), 2000);
    return () => clearTimeout(t);
  }, [done]);

  const failed = jobs.filter((j) => j.state === "failed");
  const pending = jobs.length - failed.length;
  if (!jobs.length && !done) return null;

  return (
    <div className="save-status" role="status" aria-live="polite">
      {failed.map((j) => (
        <div key={j.id} className="save-toast error">
          <TriangleAlert size={16} aria-hidden />
          <span className="save-msg">
            <b>{j.label}</b> 저장 못 함: {j.error}
          </span>
          <Link className="btn" href={j.reopenHref} onClick={() => dismiss(j.id)}>
            열기
          </Link>
          <button className="btn" onClick={() => retry(j.id)}>
            다시
          </button>
        </div>
      ))}
      {pending > 0 ? (
        <div className="save-toast">
          <CloudUpload size={16} aria-hidden />
          <span className="save-msg">Drive에 저장 중{pending > 1 ? ` (${pending})` : ""}…</span>
        </div>
      ) : (
        done &&
        !failed.length && (
          <div className="save-toast ok">
            <Check size={16} aria-hidden />
            <span className="save-msg">저장됨</span>
          </div>
        )
      )}
    </div>
  );
}

/** 폴더 목록 위: 아직 Drive에 만들어지는 중인 새 글 */
export function PendingNotes({ folderId }: { folderId: string }) {
  const jobs = useJobs().filter((j) => j.op === "create" && j.folderId === folderId && j.state !== "failed");
  if (!jobs.length) return null;
  return (
    <ul className="note-list pending-notes">
      {jobs.map((j) => (
        <li key={j.id}>
          <span className="pending-row">
            <span className="title">{j.name}</span>
            <span className="summary muted small">저장 중…</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
