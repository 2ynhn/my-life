import { splitFrontmatter } from "@/lib/markdown";
import type { FolderKind } from "@/lib/drive";

// 글 목록 오른쪽에 보일 한 줄: 수정 날짜 대신 글 내용에서 뽑는다
//  구매 → 첫 품목 (없으면 가게) · 여행 → 여행 이름 · 음식 → 식당 · 건강 → 검진/수치 · 그 밖 → # 제목

const text = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v).trim() : "");

/** 본문의 첫 # 제목 (파일 이름과 같으면 없는 셈) */
function heading(body: string, slug: string): string {
  const h = /^#[ \t]+(.+)$/m.exec(body)?.[1].trim() ?? "";
  return h === slug ? "" : h;
}

/** 제목이 없을 때: 본문 첫 줄 */
function firstLine(body: string, slug: string): string {
  for (const raw of body.split(/\r?\n/)) {
    const line = raw
      .replace(/!?\[\[[^\]]*\]\]|!\[[^\]]*\]\([^)]*\)/g, "") // 사진·첨부
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/^\s*(#+|[-*+]|\d+\.|>)\s*/, "")
      .replace(/[*_`~]/g, "")
      .trim();
    if (line && line !== slug && !/^메모:?$/.test(line)) return line;
  }
  return "";
}

function firstItem(meta: Record<string, unknown>): string {
  const names = (Array.isArray(meta.items) ? meta.items : [])
    .map((i) => (i && typeof i === "object" ? text((i as Record<string, unknown>).name) : text(i)))
    .filter(Boolean);
  if (!names.length) return "";
  return names.length > 1 ? `${names[0]} 외 ${names.length - 1}` : names[0];
}

function healthLine(meta: Record<string, unknown>): string {
  const checkup = text(meta.checkup);
  if (checkup) return checkup;
  const parts: string[] = [];
  if (text(meta.weight)) parts.push(`체중 ${text(meta.weight)}`);
  if (text(meta.bp_sys) && text(meta.bp_dia)) parts.push(`혈압 ${text(meta.bp_sys)}/${text(meta.bp_dia)}`);
  if (text(meta.glucose)) parts.push(`혈당 ${text(meta.glucose)}`);
  return parts.join(" · ");
}

export function noteSummary(source: string, slug: string, kind: FolderKind | null): string {
  let meta: Record<string, unknown> = {};
  let body = source;
  try {
    ({ meta, body } = splitFrontmatter(source) as { meta: Record<string, unknown>; body: string });
  } catch {}
  const own =
    kind === "spending"
      ? firstItem(meta) || text(meta.store)
      : kind === "travel"
        ? text(meta.title)
        : kind === "food"
          ? text(meta.restaurant)
          : kind === "health"
            ? healthLine(meta)
            : "";
  return own || heading(body, slug) || text(meta.title) || firstLine(body, slug);
}
