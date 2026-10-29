import "server-only";
import { cachedText, readNote, type DriveIndex, type FileEntry, type FolderEntry } from "@/lib/drive";
import { listableNotes } from "@/lib/search";

// 폴더 안 글들의 앞머리를 읽어 요약 화면(지출·여행·건강)에 쓴다.
// 기억해 둔 내용을 먼저 쓰고, 나머지는 시간 안에서 내려받는다 (못 읽은 수를 함께 돌려줌).

const BUDGET_MS = 6_000;

export async function collectNotes<T>(
  index: DriveIndex,
  folder: FolderEntry,
  parse: (file: FileEntry, text: string) => T | null,
): Promise<{ items: T[]; read: number; total: number }> {
  const inside = (f: FileEntry) => {
    for (let p = f.parent; p; p = p.parent) if (p === folder) return true;
    return false;
  };
  const notes = listableNotes(index).filter(inside);
  const texts = await readTexts(index, notes, BUDGET_MS);
  const items: T[] = [];
  for (const n of notes) {
    const t = texts.get(n.id);
    const v = t === undefined ? null : parse(n, t);
    if (v) items.push(v);
  }
  const read = texts.size;
  return { items, read, total: notes.length };
}

/** 글 내용을 모아 읽는다: 기억해 둔 것은 바로, 나머지는 8개씩 시간 안에서 (못 읽은 글은 빠짐) */
export async function readTexts(index: DriveIndex, files: FileEntry[], budgetMs: number): Promise<Map<string, string>> {
  const texts = new Map<string, string>();
  const pending: FileEntry[] = [];
  for (const f of files) {
    const t = cachedText(index, f);
    if (t === null) pending.push(f);
    else texts.set(f.id, t);
  }
  const deadline = Date.now() + budgetMs;
  let next = 0;
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      while (next < pending.length && Date.now() < deadline) {
        const f = pending[next++];
        try {
          texts.set(f.id, (await readNote(index, f)).text);
        } catch (e) {
          console.error("[folder-meta] read", f.id, e);
        }
      }
    }),
  );
  return texts;
}

/** 앞머리 날짜 값(YYYY-MM-DD 문자열·Date) → 없으면 파일 이름의 날짜 */
export function dateOf(value: unknown, file: FileEntry): string {
  const raw = value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? "");
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}/.exec(file.name)?.[0] ?? "";
}
