"use client";

import { useState, useTransition } from "react";
import { saveBudget } from "@/app/(app)/budget-actions";

// 예산 정하기: 한 달 전체 + (선택) 분류별. 비우면 예산 없음
export function BudgetForm({
  rootId,
  monthly,
  categories,
  names,
}: {
  rootId: string;
  monthly: number | null;
  categories: Record<string, number>;
  /** 분류 이름 (분류 관리 순서) */
  names: string[];
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fmt = (n: number | null | undefined) => (n ? n.toLocaleString("ko-KR") : "");

  return (
    <form
      className="budget-form"
      action={(form) =>
        start(async () => {
          const res = await saveBudget(rootId, form).catch(() => ({ ok: false, error: "서버에 연결하지 못했습니다." }));
          setMsg(res.ok ? { ok: true, text: "저장했어요" } : { ok: false, text: res.error ?? "저장하지 못했습니다." });
        })
      }
    >
      <label className="form-field">
        <span className="form-label">한 달 전체 (원)</span>
        <input name="monthly" defaultValue={fmt(monthly)} inputMode="numeric" placeholder="예: 1,500,000" />
      </label>
      <div className="form-grid">
        {names.map((c) => (
          <label key={c} className="form-field">
            <span className="form-label">{c}</span>
            <input name={`cat:${c}`} defaultValue={fmt(categories[c])} inputMode="numeric" placeholder="없음" />
          </label>
        ))}
      </div>
      <div className="row">
        <button className="btn btn-save" type="submit" disabled={pending}>
          {pending ? "저장 중…" : "예산 저장"}
        </button>
        {msg && <span className={`status small ${msg.ok ? "ok" : "error"}`}>{msg.text}</span>}
      </div>
    </form>
  );
}
