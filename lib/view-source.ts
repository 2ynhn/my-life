import type { PhotoInfo } from "@/lib/drive";
import { CATEGORIES, cleanCategories } from "@/lib/receipt-shape";

// 구매·여행·건강·음식 요약 화면이 읽는 재료 (브라우저·서버 공용).
// 지금은 기기 사본(components/FeatureView)에서 만든다 — 화면을 그리려고 서버가 Drive를 읽지 않게.

export type VFile = { id: string; name: string; slug: string; href: string; url?: string; photo?: PhotoInfo };

export type Budget = { monthly: number | null; categories: Record<string, number> };

export type ViewSource = {
  rootId: string;
  folderHref: string;
  /** 일기장 설정(예산·분류)을 바꿀 수 있는지 (Drive 권한) */
  canManage: boolean;
  /** 이 폴더 아래 글 중 내용을 받아 둔 것 */
  notes: { file: VFile; text: string }[];
  /** 이 폴더 아래 글 전체 수 (아직 받는 중인 것 포함) */
  total: number;
  /** 글에 넣은 사진 파일 (가까운 attachments → 일기장 전체에서 이름으로) */
  photosIn(file: VFile, text: string): VFile[];
  /** 일기 폴더의 날짜 이름 글 */
  diaries: VFile[];
  diaryText(id: string): string | undefined;
  budget: Budget;
  categories: string[];
};

/** 앞머리 날짜 값(YYYY-MM-DD 문자열·Date) → 없으면 파일 이름의 날짜 */
export function dateOf(value: unknown, file: { name: string }): string {
  const raw = value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? "");
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}/.exec(file.name)?.[0] ?? "";
}

const IMAGE = /\.(jpe?g|png|webp|gif|heic)$/i;
const DATE = /^\d{4}-\d{2}-\d{2}/;

/** 글 본문의 사진 이름: ![[사진.jpg]] · ![[사진.jpg|300]] */
export function photoNames(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/!\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g)) {
    const name = m[1].trim();
    if (IMAGE.test(name) && !out.includes(name)) out.push(name);
  }
  return out;
}

/** 사진 날짜: 찍은 날 → 없으면 파일 이름(올린 날) → 없으면 기본값 */
export const photoDate = (f: { name: string; photo?: PhotoInfo }, fallback: string) =>
  f.photo?.taken?.slice(0, 10) ?? DATE.exec(f.name)?.[0] ?? fallback;

export type ViewTripPhoto = { file: VFile; note: VFile; date: string; fromDiary: boolean };

/** 기간 안의 일기와 그 일기에 넣은 사진 */
export function diariesBetween(src: ViewSource, start: string, end: string): { diaries: VFile[]; photos: ViewTripPhoto[] } {
  const diaries = src.diaries
    .filter((n) => {
      const d = n.name.slice(0, 10);
      return d >= start && d <= end;
    })
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 60);
  const photos = diaries.flatMap((d) =>
    src.photosIn(d, src.diaryText(d.id) ?? "").map((file) => ({ file, note: d, date: photoDate(file, d.name.slice(0, 10)), fromDiary: true })),
  );
  return { diaries, photos };
}

const amount = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : null);

/** _settings/budget.json 내용 → 예산 */
export function parseBudget(raw: Partial<Budget> | null | undefined): Budget {
  const categories: Record<string, number> = {};
  for (const [c, n] of Object.entries(raw?.categories ?? {})) {
    const v = amount(n);
    if (v) categories[c] = v;
  }
  return { monthly: amount(raw?.monthly), categories };
}

/** _settings/categories.json 내용 → 분류 목록 (없으면 기본) */
export function parseCategories(raw: { categories?: unknown } | null | undefined): string[] {
  const list = cleanCategories(raw?.categories);
  return list.length ? list : [...CATEGORIES];
}
