import { readMeta } from "@/lib/frontmatter-edit";
import type { FormKind } from "@/components/MetaForm";

// 새 글 파일 이름 자동 완성: 날짜 + 무엇인지 (브라우저용)
//  구매 2026-10-26 을지면옥 · 음식 2026-10-25 성수 파스타 · 여행 2026-09-12 경주 당일치기 · 일기·건강은 날짜만

const LABEL: Partial<Record<FormKind, string>> = { spending: "store", food: "restaurant", travel: "title" };

const clean = (s: string) =>
  s.replace(/[\/\\\x00-\x1f]/g, " ").replace(/\s+/g, " ").trim().replace(/^\.+/, "").slice(0, 60).trim();

/** 앞머리로 만든 이름. 앞머리를 못 읽으면 null(이름은 그대로) */
export function autoNoteName(text: string, form: FormKind | null | undefined, defaultName: string): string | null {
  const meta = readMeta(text);
  if (!meta) return null;
  const fallbackDate = defaultName.slice(0, 10);
  const raw = String(meta.start ?? meta.date ?? "").slice(0, 10);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : fallbackDate;
  const key = form ? LABEL[form] : undefined;
  const label = key ? clean(String(meta[key] ?? "")) : "";
  // 아무것도 안 바뀌었으면 처음 이름(겹침 번호 -2 포함)을 그대로
  if (!label && date === fallbackDate) return defaultName;
  return label ? `${date} ${label}` : date;
}
