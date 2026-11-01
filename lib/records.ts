import type { FeatureKey } from "@/lib/features";
import { metaTags, splitFrontmatter } from "@/lib/markdown";
import { dateOf, type VFile } from "@/lib/view-source";

// 쓰임새 폴더 글의 앞머리를 모은 기록 (모아보기·입력 폼 자동 완성). 브라우저·서버 공용

/** path: 일기장 맨 위부터 부모까지의 이름 (목록 오른쪽에 보이는 위치) */
export type RecFile = VFile & { path?: string[] };
export type Record_<F extends { id: string; name: string } = RecFile> = {
  file: F;
  feature: FeatureKey;
  date: string;
  meta: Record<string, unknown>;
  heading: string;
};

export function recordOf<F extends { id: string; name: string }>(file: F, feature: FeatureKey, text: string): Record_<F> {
  const { meta, body } = splitFrontmatter(text) as { meta: Record<string, unknown>; body: string };
  const heading = /^#[ \t]+(.+)$/m.exec(body)?.[1].trim() ?? "";
  return { file, feature, meta, heading, date: dateOf(meta.date ?? meta.start, file) };
}

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => String(x ?? "").trim()).filter(Boolean) : typeof v === "string" && v.trim() ? [v.trim()] : [];

/** 일기 people + 여행 companions */
export const peopleOf = (r: { meta: Record<string, unknown> }) => [...new Set([...strings(r.meta.people), ...strings(r.meta.companions)])];
export const tagsOf = (r: { meta: Record<string, unknown> }) =>
  metaTags(r.meta as never).map((t) => t.replace(/^#/, "").trim()).filter(Boolean);

/** 많이 나온 순 */
export function topCounts(values: string[], limit = 30): string[] {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko")).slice(0, limit).map(([v]) => v);
}

export type Suggestions = {
  tags: string[];
  people: string[];
  stores: string[];
  payments: string[];
  categories?: string[];
  restaurants?: string[];
  menus?: string[];
};

/** 입력 폼 자동 완성: 자주 쓴 키워드·사람·가게·결제 수단·식당·메뉴 */
export function suggestionsOf(records: { feature: FeatureKey; meta: Record<string, unknown> }[], categories: string[]): Suggestions {
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const spending = records.filter((r) => r.feature === "spending");
  const food = records.filter((r) => r.feature === "food");
  const list = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x ?? "").trim()).filter(Boolean) : []);
  return {
    tags: topCounts(records.flatMap(tagsOf)),
    people: topCounts(records.flatMap(peopleOf)),
    stores: topCounts(spending.map((r) => text(r.meta.store)).filter(Boolean), 50),
    payments: topCounts(spending.map((r) => text(r.meta.payment)).filter(Boolean), 15),
    categories,
    restaurants: topCounts(food.map((r) => text(r.meta.restaurant)).filter(Boolean), 50),
    menus: topCounts(food.flatMap((r) => list(r.meta.menu)), 50),
  };
}
