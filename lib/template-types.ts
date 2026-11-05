import { BUILTIN_TEMPLATES, DEFAULT_TEMPLATE } from "@/lib/templates";

// 글 유형(서식) 고르기 (브라우저·서버 공용, Drive 호출 없음).
// 서식은 일기장의 _templates 폴더에서 관리한다: _templates/<이름>.md 하나가 유형 하나.
// 유형이 정해진 폴더(구매·여행·건강·음식·일기)는 늘 자기 서식, 유형이 없는 폴더에서만 새 글을 쓸 때 고른다.

export type TemplateKind = "spending" | "travel" | "health" | "food";

/** 서식(또는 글) 앞머리 모양으로 유형: amount → 구매 · places → 여행 · 건강 수치 → 건강 · restaurant → 음식 */
export function kindOfTemplate(text: string): TemplateKind | null {
  if (/^amount:/m.test(text)) return "spending";
  if (/^places:/m.test(text)) return "travel";
  if (/^(weight|sleep|steps|bp_sys|glucose):/m.test(text)) return "health";
  if (/^restaurant:/m.test(text)) return "food";
  return null;
}

/** _templates 안의 md 하나: 이름(확장자 뺀 것)과 내용 (아직 못 읽었으면 null) */
export type TemplateFile = { stem: string; text: string | null };
export type TemplateChoice = { key: string; label: string; detail?: string };

const KINDS: { kind: TemplateKind; label: string; builtin: string }[] = [
  { kind: "spending", label: "구매", builtin: "purchase" },
  { kind: "travel", label: "여행", builtin: "travel" },
  { kind: "health", label: "건강", builtin: "health" },
  { kind: "food", label: "음식", builtin: "food" },
];
const DIARY_STEMS = new Set(["daily", "diary", "일기"]);

/** 고를 수 있는 유형: 기본 → 구매·여행·건강·음식(_templates에 있으면 그 파일, 없으면 내장) → 일기 → 그 밖의 서식 */
export function templateChoices(files: TemplateFile[]): TemplateChoice[] {
  const isDefault = (f: TemplateFile) => f.stem.toLowerCase() === "default";
  const out: TemplateChoice[] = [{ key: "default", label: "기본" }];
  const used = new Set<string>();
  for (const k of KINDS) {
    const own = files.filter((f) => !isDefault(f) && f.text !== null && kindOfTemplate(f.text) === k.kind);
    if (own.length) {
      for (const f of own) {
        used.add(f.stem);
        out.push({ key: f.stem, label: k.label, detail: own.length > 1 || f.stem.toLowerCase() !== k.builtin ? f.stem : undefined });
      }
    } else out.push({ key: k.builtin, label: k.label });
  }
  for (const f of files) {
    if (used.has(f.stem) || isDefault(f)) continue;
    out.push(DIARY_STEMS.has(f.stem.toLowerCase()) ? { key: f.stem, label: "일기", detail: f.stem } : { key: f.stem, label: f.stem });
  }
  return out;
}

/** 고른 유형의 서식 글: _templates/<key>.md → 내장 서식 → (기본이면) 기본 서식. 모르는 유형이면 null */
export function templateTextFor(key: string, files: TemplateFile[]): string | null {
  const k = key.trim().toLowerCase();
  if (!k || k.length > 100) return null;
  const file = files.find((f) => f.stem.toLowerCase() === k);
  if (file) return file.text;
  if (k === "default") return DEFAULT_TEMPLATE;
  return BUILTIN_TEMPLATES[k] ?? null;
}
