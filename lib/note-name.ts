import { readBody, readMeta } from "@/lib/frontmatter-edit";
import { firstLine } from "@/lib/note-summary";
import type { FormKind } from "@/components/MetaForm";

// 새 글 파일 이름 자동 완성: 날짜 + 제목 (브라우저·서버 공용)
//  구매 2026-10-26 우유 (첫 품목, 없으면 가게) · 음식 2026-10-25 성수 파스타 · 여행 2026-09-12 경주 당일치기
//  일기·건강·그 밖: 2026-11-01 공원 산책 (# 제목, 없으면 내용 첫 문장 앞부분)

const LABEL: Partial<Record<FormKind, string>> = { spending: "store", food: "restaurant", travel: "title", health: "checkup" };

/** 구매 품목 중 첫 이름 */
export function firstItemName(items: unknown): string {
  for (const i of Array.isArray(items) ? items : []) {
    const name = String((i && typeof i === "object" ? (i as Record<string, unknown>).name : i) ?? "").trim();
    if (name) return name;
  }
  return "";
}

const clean = (s: string) =>
  s.replace(/[\/\\\x00-\x1f]/g, " ").replace(/\s+/g, " ").trim().replace(/^\.+/, "").slice(0, 60).trim();

/** 파일 이름에 붙일 만큼만: 글자 수로 자르고 끝의 문장부호는 뺀다 */
export const SNIPPET_CHARS = 20;
export function titleSnippet(line: string): string {
  const s = clean(line);
  if (s.length <= SNIPPET_CHARS) return s.replace(/[.,!?。…~\s]+$/, "");
  const cut = s.slice(0, SNIPPET_CHARS);
  // 낱말 중간에서 끊지 않게 (띄어쓰기가 있으면 거기까지)
  const space = cut.lastIndexOf(" ");
  return (space >= SNIPPET_CHARS / 2 ? cut.slice(0, space) : cut).replace(/[.,!?。…~\s]+$/, "");
}

/** 제목 칸이 없는 글의 이름: # 제목 → 앞머리 title → 내용 첫 문장 앞부분 */
export function bodyTitle(text: string, meta: Record<string, unknown>): string {
  const { heading, content } = readBody(text);
  const title = (heading && heading !== "{{title}}" ? heading : "") || String(meta.title ?? "").trim();
  return title ? clean(title) : titleSnippet(firstLine(content));
}

/** 앞머리로 만든 이름. 앞머리를 못 읽으면 null(이름은 그대로) */
export function autoNoteName(text: string, form: FormKind | null | undefined, defaultName: string): string | null {
  const meta = readMeta(text);
  if (!meta) return null;
  const fallbackDate = defaultName.slice(0, 10);
  const raw = String(meta.start ?? meta.date ?? "").slice(0, 10);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : fallbackDate;
  const key = form ? LABEL[form] : undefined;
  // 칸으로 정해진 이름(품목·식당·여행 이름·검진)이 없으면 # 제목 → 내용 첫 문장
  const label =
    (key ? clean((form === "spending" ? firstItemName(meta.items) : "") || String(meta[key] ?? "")) : "") || bodyTitle(text, meta);
  // 아무것도 안 바뀌었으면 처음 이름(겹침 번호 -2 포함)을 그대로
  if (!label && date === fallbackDate) return defaultName;
  return label ? `${date} ${label}` : date;
}
