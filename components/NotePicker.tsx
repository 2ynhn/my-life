"use client";

import { FileText, Link2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useLocal } from "@/components/LocalData";
import { pathOf } from "@/lib/local-store";

// 글 링크([[이름]]) 고르기: 기기 사본의 글 목록에서 이름·폴더로 찾는다. 없는 이름도 그대로 링크할 수 있다 (옵시디언처럼)

export function NotePicker({
  fallback,
  date,
  exclude,
  onPick,
  onClose,
}: {
  /** 쓰는 글의 날짜 (YYYY-MM-DD). 같은 날 글을 맨 위로 */
  date?: string;
  /** 지금 쓰는 글 (목록에서 뺀다) */
  exclude?: string;
  /** 기기 사본이 없을 때 쓸 이름들 (편집기의 링크 표) */
  fallback: string[];
  onPick: (name: string) => void;
  onClose: () => void;
}) {
  const local = useLocal();
  const [q, setQ] = useState("");

  const notes = useMemo(() => {
    const day = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
    if (!local)
      return fallback
        .map((n) => ({ id: n, name: n, path: "", m: "", same: !!day && n.startsWith(day) }))
        .sort((a, b) => Number(b.same) - Number(a.same));
    return local.tree.entries
      .filter((e) => e.k === "f" && e.md && e.v && e.id !== exclude)
      .map((e) => {
        // 같은 날: 파일 이름이 그 날짜로 시작하거나, 앞머리 date·start가 그 날짜
        const t = day ? local.texts.get(e.id)?.t : undefined;
        const same = !!day && (e.n.startsWith(day) || (!!t && new RegExp(`^(date|start):\\s*["']?${day}`, "m").test(t.slice(0, 600))));
        return { id: e.id, name: e.n.replace(/\.md$/i, ""), path: pathOf(local, e).join(" / "), m: e.m, same };
      })
      .sort((a, b) => Number(b.same) - Number(a.same) || b.m.localeCompare(a.m));
  }, [local, fallback, date, exclude]);

  const query = q.trim().toLowerCase();
  const found = (query ? notes.filter((n) => n.name.toLowerCase().includes(query) || n.path.toLowerCase().includes(query)) : notes).slice(0, 40);
  const exact = notes.some((n) => n.name.toLowerCase() === query);

  return (
    <div className="picker-backdrop" role="dialog" aria-modal="true" aria-label="글 링크" onClick={onClose}>
      <div className="picker note-picker" onClick={(e) => e.stopPropagation()}>
        <div className="picker-head">
          <strong>글 링크</strong>
          <button className="btn" onClick={onClose}>
            닫기
          </button>
        </div>
        <form
          className="search-form"
          onSubmit={(e) => {
            e.preventDefault();
            const first = found[0];
            if (first && (!query || first.name.toLowerCase().includes(query))) onPick(first.name);
            else if (q.trim()) onPick(q.trim());
          }}
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="글 이름으로 찾기"
            aria-label="글 이름"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
            }}
          />
        </form>
        <ul className="picker-results">
          {query && !exact && (
            <li>
              <button onClick={() => onPick(q.trim())}>
                <span>
                  <Link2 size={14} aria-hidden /> [[{q.trim()}]]
                </span>
                <span className="muted small">아직 없는 글로 링크</span>
              </button>
            </li>
          )}
          {found.map((n) => (
            <li key={n.id}>
              <button onClick={() => onPick(n.name)} className={n.same ? "same-day" : undefined}>
                <span>
                  <FileText size={14} aria-hidden /> {n.name}
                </span>
                <span className="muted small">{[n.same ? "같은 날" : "", n.path].filter(Boolean).join(" · ")}</span>
              </button>
            </li>
          ))}
          {!found.length && !query && <li className="muted small">글이 없어요.</li>}
        </ul>
      </div>
    </div>
  );
}
