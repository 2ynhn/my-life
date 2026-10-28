import "server-only";
import {
  cachedText,
  driveFullText,
  isListable,
  readNote,
  type DriveIndex,
  type Entry,
  type FileEntry,
} from "@/lib/drive";
import { metaTags, splitFrontmatter } from "@/lib/markdown";

// 검색 = ① 제목·경로 ② Drive 본문 검색(빠르지만 '단어 전체'만) ③ 글 내용 직접 훑기(글자 단위, 시간 제한).
// ③은 처음에는 내려받느라 느리므로 정해진 시간만 훑고, 못 본 글이 남으면 '계속 찾기'를 보여 준다.
// 한 번 읽은 글은 기억해 두므로 다시 찾을수록 빨라진다.

const BUDGET_MS = 5_000;
const CONCURRENCY = 8;

export type Hit = { file: FileEntry; inTitle: boolean; snippet: string | null };
export type SearchResult = { hits: Hit[]; scanned: number; total: number; driveFailed: boolean };

/** 목록에 보이는 글만 (attachments·_templates 안은 제외) */
export function listableNotes(index: DriveIndex): FileEntry[] {
  const hidden = (e: Entry) => {
    for (let f = e.parent; f?.parent; f = f.parent) if (!isListable(f)) return true;
    return false;
  };
  return [...index.byId.values()].filter((e): e is FileEntry => e.kind === "file" && e.isMarkdown && !hidden(e));
}

/** 날짜 이름(최신 먼저) → 수정 시각 순 */
const newestFirst = (a: FileEntry, b: FileEntry) =>
  b.name.localeCompare(a.name, "ko") || b.modifiedTime.localeCompare(a.modifiedTime);

/** 기억해 둔 내용을 먼저 쓰고, 나머지는 시간 안에서 내려받는다 */
async function scan(index: DriveIndex, notes: FileEntry[], test: (text: string, file: FileEntry) => void) {
  const deadline = Date.now() + BUDGET_MS;
  const pending: FileEntry[] = [];
  let scanned = 0;
  for (const file of notes) {
    const text = cachedText(index, file);
    if (text === null) pending.push(file);
    else {
      test(text, file);
      scanned++;
    }
  }
  // 최근 글부터 내려받는다
  pending.sort(newestFirst);
  let next = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < pending.length && Date.now() < deadline) {
        const file = pending[next++];
        try {
          test((await readNote(index, file)).text, file);
          scanned++;
        } catch (e) {
          console.error("[search] read", file.id, e);
        }
      }
    }),
  );
  return scanned;
}

function snippetOf(text: string, needle: string): string | null {
  const body = splitFrontmatter(text).body;
  const i = body.toLowerCase().indexOf(needle);
  if (i < 0) return null;
  const start = Math.max(0, i - 50);
  const end = Math.min(body.length, i + needle.length + 70);
  return (start > 0 ? "…" : "") + body.slice(start, end).replace(/\s+/g, " ").trim() + (end < body.length ? "…" : "");
}

async function safeFullText(index: DriveIndex, term: string): Promise<Set<string> | null> {
  try {
    return await driveFullText(index, term);
  } catch (e) {
    console.error("[search] drive fullText", e);
    return null;
  }
}

export async function searchText(index: DriveIndex, query: string): Promise<SearchResult> {
  const needle = query.trim().toLowerCase();
  const notes = listableNotes(index);
  if (!needle) return { hits: [], scanned: 0, total: notes.length, driveFailed: false };

  const found = new Map<string, Hit>();
  for (const file of notes) {
    if ([...file.slugPath].join("/").toLowerCase().includes(needle))
      found.set(file.id, { file, inTitle: true, snippet: null });
  }
  const fromDrive = await safeFullText(index, query.trim());
  const scanned = await scan(index, notes, (text, file) => {
    const snippet = snippetOf(text, needle);
    if (snippet === null && !text.toLowerCase().includes(needle)) return;
    const hit = found.get(file.id);
    if (hit) hit.snippet ??= snippet;
    else found.set(file.id, { file, inTitle: false, snippet });
  });
  // 아직 못 훑은 글이라도 Drive가 찾아 준 것은 넣는다
  for (const id of fromDrive ?? []) {
    const file = index.byId.get(id) as FileEntry;
    if (!found.has(id) && notes.includes(file)) found.set(id, { file, inTitle: false, snippet: null });
  }

  const hits = [...found.values()].sort((a, b) => Number(b.inTitle) - Number(a.inTitle) || newestFirst(a.file, b.file));
  return { hits, scanned, total: notes.length, driveFailed: fromDrive === null };
}

/** 앞머리 tags에 이 태그가 있는 글 */
export async function searchTag(index: DriveIndex, tag: string): Promise<SearchResult> {
  const want = tag.trim().toLowerCase();
  const notes = listableNotes(index);
  if (!want) return { hits: [], scanned: 0, total: notes.length, driveFailed: false };

  const found = new Map<string, Hit>();
  const check = (text: string, file: FileEntry) => {
    if (metaTags(splitFrontmatter(text).meta).some((t) => t.toLowerCase() === want))
      found.set(file.id, { file, inTitle: false, snippet: null });
  };
  // 태그는 [주하, 하연]처럼 단어로 적혀 있어 Drive 검색으로 후보를 먼저 좁힐 수 있다
  const fromDrive = await safeFullText(index, tag.trim());
  const candidates = notes.filter((n) => fromDrive?.has(n.id));
  await scan(index, candidates, check);
  const scanned = await scan(index, notes.filter((n) => !fromDrive?.has(n.id)), check);

  const hits = [...found.values()].sort((a, b) => newestFirst(a.file, b.file));
  return { hits, scanned: scanned + candidates.length, total: notes.length, driveFailed: fromDrive === null };
}

export type KeywordHit = { file: FileEntry; score: number; text: string };

/**
 * 물어보기용: 여러 검색어를 한 번에 훑어, 맞은 검색어가 많은 글부터.
 * keep으로 기간·종류를 먼저 거른다. 검색어가 없으면 거른 글 전부(최근 먼저).
 */
export async function findByKeywords(
  index: DriveIndex,
  keywords: string[],
  keep: (file: FileEntry) => boolean,
): Promise<{ hits: KeywordHit[]; scanned: number; total: number }> {
  const notes = listableNotes(index).filter(keep);
  const needles = [...new Set(keywords.map((k) => k.trim().toLowerCase()).filter(Boolean))];
  const hits: KeywordHit[] = [];
  const scanned = await scan(index, notes, (text, file) => {
    if (!needles.length) return void hits.push({ file, score: 0, text });
    const title = file.slugPath.join("/").toLowerCase();
    const lower = text.toLowerCase();
    let score = 0;
    for (const n of needles) {
      if (title.includes(n)) score += 2;
      else if (lower.includes(n)) score += 1;
    }
    if (score) hits.push({ file, score, text });
  });
  hits.sort((a, b) => b.score - a.score || newestFirst(a.file, b.file));
  return { hits, scanned, total: notes.length };
}
