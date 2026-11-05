"use client";

import { ChevronDown, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import type { TemplateChoice } from "@/lib/template-types";

/**
 * '새 글' 버튼. 유형이 없는 폴더(choices가 있을 때)는 눌러서 유형(서식)을 고른다:
 * 기본 · 구매 · 여행 · 건강 · 음식 · _templates의 다른 서식. 고르면 그 서식으로 새 글.
 */
export function NewNoteMenu({ href, choices }: { href: string; choices: TemplateChoice[] | null }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    // 바깥을 누르거나 Esc면 닫기
    const close = (e: Event) => {
      const d = ref.current;
      if (!d?.open) return;
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !d.contains(e.target as Node)) d.open = false;
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, []);

  if (!choices || choices.length < 2)
    return (
      <Link className="btn btn-save" href={`${href}?mode=new`}>
        <Plus size={16} aria-hidden />새 글
      </Link>
    );
  return (
    <details className="new-menu" ref={ref}>
      <summary className="btn btn-save" aria-label="새 글 · 유형 고르기">
        <Plus size={16} aria-hidden />새 글
        <ChevronDown size={14} aria-hidden />
      </summary>
      <ul className="new-menu-list" aria-label="글 유형">
        {choices.map((c) => (
          <li key={c.key}>
            <Link
              href={`${href}?mode=new${c.key === "default" ? "" : `&tpl=${encodeURIComponent(c.key)}`}`}
              onClick={() => {
                if (ref.current) ref.current.open = false;
              }}
            >
              <span>{c.label}</span>
              {c.detail && <span className="muted small">{c.detail}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}
