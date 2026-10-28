"use client";

import { PenLine } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { quickNote } from "@/app/(app)/note-actions";

// 첫 화면 '지금 한 줄': 오늘 일기 끝에 시간과 함께 붙인다
export function QuickNote({ rootId }: { rootId: string }) {
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: true; href: string } | { ok: false; error: string } | null>(null);

  const submit = () =>
    start(async () => {
      try {
        const res = await quickNote(rootId, text);
        setResult(res);
        if (res.ok) setText("");
      } catch {
        setResult({ ok: false, error: "서버에 연결하지 못했습니다." });
      }
    });

  return (
    <form
      className="quick-note"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim() && !pending) submit();
      }}
    >
      <PenLine size={18} className="quick-icon" aria-hidden />
      <input
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (result?.ok) setResult(null);
        }}
        placeholder="지금 한 줄 (오늘 일기에 시간과 함께)"
        aria-label="빠른 한 줄 기록"
        maxLength={2000}
        enterKeyHint="send"
      />
      <button className="btn btn-save" type="submit" disabled={pending || !text.trim()}>
        {pending ? "남기는 중…" : "남기기"}
      </button>
      {result && (
        <p className={`quick-result small ${result.ok ? "ok" : "error"}`} role="status">
          {result.ok ? (
            <>
              오늘 일기에 남겼어요 · <Link href={result.href}>보기</Link>
            </>
          ) : (
            result.error
          )}
        </p>
      )}
    </form>
  );
}
