"use client";

import { Search, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { FeatureIcon } from "@/components/FeatureIcon";
import type { AskResult } from "@/lib/ask";

// 물어보기 화면: 주소의 질문(?q=)을 바로 묻고, 답과 근거 글을 보여 준다

export function AskView({ base, rootId, q }: { base: string; rootId: string; q: string }) {
  const router = useRouter();
  const [input, setInput] = useState(q);
  const [state, setState] = useState<
    { kind: "idle" } | { kind: "busy" } | { kind: "done"; result: AskResult } | { kind: "error"; error: string; needsKey?: boolean }
  >({ kind: "idle" });

  useEffect(() => {
    setInput(q);
    if (!q.trim()) return setState({ kind: "idle" });
    let cancelled = false;
    setState({ kind: "busy" });
    fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ root: rootId, q }) })
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as AskResult & { error?: string; needsKey?: boolean };
        if (cancelled) return;
        if (!res.ok || body.error) setState({ kind: "error", error: body.error ?? `답을 받지 못했습니다 (${res.status})`, needsKey: body.needsKey });
        else setState({ kind: "done", result: body });
      })
      .catch(() => !cancelled && setState({ kind: "error", error: "서버에 연결하지 못했습니다." }));
    return () => {
      cancelled = true;
    };
  }, [q, rootId]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) router.push(`${base}?view=ask&q=${encodeURIComponent(input.trim())}`);
  };

  return (
    <div className="ask">
      <form className="search-form home-search ask-form" onSubmit={submit}>
        <Sparkles size={18} className="search-icon" aria-hidden />
        <input
          name="q"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="예: 작년 제주에서 간 식당? 지난달 외식비는? 엄마랑 언제 산책했지?"
          aria-label="질문"
          maxLength={500}
          autoFocus={!q}
        />
        <button className="btn btn-ask" type="submit" disabled={state.kind === "busy"}>
          물어보기
        </button>
      </form>

      {state.kind === "idle" && (
        <p className="muted small">
          일기·구매·여행·건강 기록을 Claude가 찾아 읽고 답해요. 근거가 된 글을 함께 보여 드려요. 비용은 설정에 넣은 내 API 키로 나가요
          (질문 하나에 보통 몇십 원).
        </p>
      )}
      {state.kind === "busy" && (
        <p className="ask-busy muted" role="status">
          <Sparkles size={16} className="spin-slow" aria-hidden /> 기록을 찾아 읽는 중… (10~30초)
        </p>
      )}
      {state.kind === "error" && (
        <p className="status error">
          {state.error} {state.needsKey && <Link href="/settings">설정으로 가기</Link>}
        </p>
      )}
      {state.kind === "done" && <Answer result={state.result} base={base} q={q} />}
    </div>
  );
}

function Answer({ result, base, q }: { result: AskResult; base: string; q: string }) {
  const href = new Map(result.sources.map((s) => [s.n, s.href]));
  // [1] → 그 글로 가는 링크
  const md = result.answer.replace(/\[(\d+)\]/g, (m, n) => (href.has(Number(n)) ? `[[${n}]](${href.get(Number(n))})` : m));
  const used = new Set(result.used);
  const shown = result.sources.filter((s) => used.has(s.n));
  const rest = result.sources.filter((s) => !used.has(s.n));
  const { plan } = result;
  return (
    <>
      <section className="ask-answer note">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{md}</ReactMarkdown>
      </section>
      {shown.length > 0 && (
        <section className="home-section">
          <h2>근거가 된 기록</h2>
          <SourceList sources={shown} />
        </section>
      )}
      {rest.length > 0 && (
        <details className="ask-more">
          <summary className="small muted">함께 읽은 기록 {rest.length}개</summary>
          <SourceList sources={rest} />
        </details>
      )}
      <p className="muted small ask-plan">
        찾은 낱말: {plan.keywords.length ? plan.keywords.join(", ") : "없음"}
        {(plan.from || plan.to) && ` · 기간 ${plan.from || "…"} ~ ${plan.to || "…"}`}
        {result.scanned < result.total && ` · ${result.total}개 중 ${result.scanned}개를 훑었어요 (다시 물으면 더 많이 봐요)`} ·{" "}
        <Link href={`${base}?view=search&q=${encodeURIComponent(q)}`}>
          <Search size={12} aria-hidden /> 그냥 검색하기
        </Link>
      </p>
    </>
  );
}

function SourceList({ sources }: { sources: AskResult["sources"] }) {
  return (
    <ul className="note-list collect-list">
      {sources.map((s) => (
        <li key={s.n}>
          <Link href={s.href}>
            <span className="title">
              <span className="src-n">{s.n}</span>
              <FeatureIcon kind={s.kind} size="sm" />
              {s.title}
            </span>
            <span className="muted small">{s.path.split(" / ").slice(0, -1).join(" / ")}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
