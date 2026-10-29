import "server-only";
import { featureFolders } from "@/lib/collect";
import { findAttachment, readText, visibleChildren, type DriveIndex, type FileEntry, type FolderEntry } from "@/lib/drive";

// 여행과 사진·일기 잇기: 여행 글에 넣은 사진 + 여행 기간(출발~돌아온 날)에 쓴 일기와 그 사진.
// 사진의 위치·시각은 올릴 때 원본 EXIF에서 읽어 Drive 파일 정보로 붙여 둔 것 (FileEntry.photo)

export type TripPhoto = { file: FileEntry; note: FileEntry; date: string; fromDiary: boolean };

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

/** 글에 넣은 사진 파일들 (찾지 못한 이름은 뺀다) */
export function photosIn(note: FileEntry, text: string): FileEntry[] {
  return photoNames(text)
    .map((n) => findAttachment(note.parent!, n))
    .filter((f): f is FileEntry => !!f);
}

/** 사진 날짜: 찍은 날 → 없으면 파일 이름(올린 날) → 없으면 기본값 */
export const photoDate = (f: FileEntry, fallback: string) => f.photo?.taken?.slice(0, 10) ?? DATE.exec(f.name)?.[0] ?? fallback;

function notesIn(folder: FolderEntry): FileEntry[] {
  return visibleChildren(folder).flatMap((c) => (c.kind === "file" ? (c.isMarkdown ? [c] : []) : notesIn(c)));
}

/** 일기 폴더와 그 안의 날짜 이름 글들 (읽지 않고 이름으로) */
export async function diaryNotes(index: DriveIndex): Promise<{ daily: FolderEntry | null; notes: FileEntry[] }> {
  const daily = (await featureFolders(index)).find((f) => f.feature === "diary")?.folder ?? null;
  return { daily, notes: daily ? notesIn(daily).filter((n) => DATE.test(n.name)) : [] };
}

/** 기간 안의 일기와 그 일기에 넣은 사진 (일기는 많아도 기간 안 것만 읽는다) */
export async function diariesBetween(
  index: DriveIndex,
  all: FileEntry[],
  start: string,
  end: string,
): Promise<{ diaries: FileEntry[]; photos: TripPhoto[] }> {
  const diaries = all
    .filter((n) => {
      const d = n.name.slice(0, 10);
      return d >= start && d <= end;
    })
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 60);
  const texts = await Promise.all(diaries.map((d) => readText(index, d).catch(() => "")));
  const photos = diaries.flatMap((d, i) =>
    photosIn(d, texts[i]).map((file) => ({ file, note: d, date: photoDate(file, d.name.slice(0, 10)), fromDiary: true })),
  );
  return { diaries, photos };
}
