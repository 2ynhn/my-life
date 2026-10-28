"use client";

import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { useState, useTransition } from "react";
import { saveCategories } from "@/app/(app)/budget-actions";
import { CATEGORIES } from "@/lib/receipt-shape";

// 구매 분류 관리: 더하기·이름 바꾸기·빼기·순서. 저장하면 입력 폼·요약·예산·영수증 읽기에 바로 쓰인다
export function CategoryManager({ rootId, initial }: { rootId: string; initial: string[] }) {
  const [list, setList] = useState(initial);
  const [input, setInput] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const changed = list.join("\n") !== initial.join("\n");

  const add = () => {
    const name = input.replace(/\s+/g, " ").trim();
    if (!name) return;
    if (list.includes(name)) return setMsg({ ok: false, text: "이미 있는 분류예요." });
    if (/[#:[\]{}]/.test(name)) return setMsg({ ok: false, text: "# : [ ] { } 는 쓸 수 없어요." });
    setList([...list, name.slice(0, 30)]);
    setInput("");
    setMsg(null);
  };
  const move = (i: number, d: number) => {
    const next = [...list];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setList(next);
  };

  return (
    <div className="category-manager">
      <ul>
        {list.map((c, i) => (
          <li key={i}>
            <input
              value={c}
              aria-label={`분류 ${i + 1} 이름`}
              maxLength={30}
              onChange={(e) => setList(list.map((x, j) => (j === i ? e.target.value : x)))}
            />
            <button type="button" className="icon-btn" aria-label="위로" disabled={i === 0} onClick={() => move(i, -1)}>
              <ArrowUp size={14} aria-hidden />
            </button>
            <button type="button" className="icon-btn" aria-label="아래로" disabled={i === list.length - 1} onClick={() => move(i, 1)}>
              <ArrowDown size={14} aria-hidden />
            </button>
            <button type="button" className="icon-btn" aria-label={`${c} 빼기`} onClick={() => setList(list.filter((_, j) => j !== i))}>
              <X size={14} aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      <div className="row">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="새 분류 (예: 사무용품)"
          aria-label="새 분류 이름"
          maxLength={30}
        />
        <button type="button" className="btn" onClick={add}>
          <Plus size={14} aria-hidden /> 더하기
        </button>
      </div>
      <p className="muted small">
        이미 쓴 글의 분류는 바뀌지 않아요. 지우거나 이름을 바꾼 분류가 적힌 글은 요약에서 그 이름 그대로 따로 보여요.
      </p>
      <div className="row">
        <button
          type="button"
          className="btn btn-save"
          disabled={pending || !changed}
          onClick={() =>
            start(async () => {
              const res = await saveCategories(rootId, list).catch(() => ({ ok: false, error: "서버에 연결하지 못했습니다." }));
              setMsg(res.ok ? { ok: true, text: "저장했어요" } : { ok: false, text: res.error ?? "저장하지 못했습니다." });
            })
          }
        >
          {pending ? "저장 중…" : "분류 저장"}
        </button>
        <button type="button" className="btn" disabled={pending} onClick={() => setList([...CATEGORIES])}>
          기본 목록으로
        </button>
        {msg && <span className={`status small ${msg.ok ? "ok" : "error"}`}>{msg.text}</span>}
      </div>
    </div>
  );
}
