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
  const items: T[] = [];
  const pending: FileEntry[] = [];
  for (const n of notes) {
    const t = cachedText(index, n);
    if (t === null) pending.push(n);
    else {
      const v = parse(n, t);
      if (v) items.push(v);
    }
  }
  const deadline = Date.now() + BUDGET_MS;
  let next = 0;
  let read = notes.length - pending.length;
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      while (next < pending.length && Date.now() < deadline) {
        const n = pending[next++];
        try {
          const v = parse(n, (await readNote(index, n)).text);
          if (v) items.push(v);
          read++;
        } catch (e) {
          console.error("[folder-meta] read", n.id, e);
        }
      }
    }),
  );
  return { items, read, total: notes.length };
}

/** 앞머리 날짜 값(YYYY-MM-DD 문자열·Date) → 없으면 파일 이름의 날짜 */
export function dateOf(value: unknown, file: FileEntry): string {
  const raw = value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? "");
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}/.exec(file.name)?.[0] ?? "";
}
