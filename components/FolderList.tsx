import Link from "next/link";
import { FeatureIcon } from "@/components/FeatureIcon";
import { PendingNotes } from "@/components/SaveStatus";
import { JUMP_MIN_ITEMS, YearJump, yearAnchor } from "@/components/YearJump";

// 폴더 안 목록의 모양 (하위 폴더 칸 + 글 목록). 서버 화면(FolderView)과 기기 데이터로 바로 그리는 화면(LocalPreview)이 같이 쓴다

export type FolderItem = { id: string; href: string; name: string; restricted: boolean; count: number };
export type NoteItem = { id: string; href: string; slug: string };

/** 글이 많고 여러 해에 걸치면 해마다 구분선 + 위에 연도 점프 */
export function noteYears(notes: NoteItem[]): string[] | null {
  const years = [...new Set(notes.flatMap((n) => /^(\d{4})-/.exec(n.slug)?.[1] ?? []))];
  return notes.length >= JUMP_MIN_ITEMS && years.length >= 2 ? years : null;
}

export function FolderList({
  folderId,
  folders,
  notes,
  years,
  showJump,
  list,
}: {
  folderId: string;
  folders: FolderItem[];
  notes: NoteItem[];
  years: string[] | null;
  /** 여행은 위 타임라인에 따로 있어 목록 위 점프는 뺀다 */
  showJump: boolean;
  /** 글 목록 자리 (서버는 내용을 읽는 동안 Suspense로 감싼다) */
  list: React.ReactNode;
}) {
  if (!folders.length && !notes.length)
    return (
      <>
        <PendingNotes folderId={folderId} />
        <p className="muted">비어 있는 폴더입니다.</p>
      </>
    );
  return (
    <div className="listing">
      {folders.length > 0 && (
        <ul className="folder-grid">
          {folders.map((f) => (
            <li key={f.id}>
              <Link href={f.href}>
                <FeatureIcon kind={null} restricted={f.restricted} size="sm" />
                <span className="name">{f.name}</span>
                {f.restricted && <span className="sr-only">접근 제한</span>}
                <span className="count">{f.count}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <PendingNotes folderId={folderId} />
      {years && showJump && <YearJump years={years} prefix="y" />}
      {notes.length > 0 && list}
    </div>
  );
}

export function NoteList({ notes, summaries, years }: { notes: NoteItem[]; summaries?: Map<string, string>; years: string[] | null }) {
  const marked = new Set<string>();
  return (
    <ul className="note-list">
      {notes.flatMap((n) => {
        const summary = summaries?.get(n.id);
        const year = /^(\d{4})-/.exec(n.slug)?.[1];
        const divider =
          years && year && !marked.has(year) && marked.add(year) ? (
            <li key={`y${year}`} id={yearAnchor("y", year)} className="year-divider">
              {year}
            </li>
          ) : null;
        return [
          divider,
          <li key={n.id}>
            <Link href={n.href}>
              <span className="title">{n.slug}</span>
              {summary && <span className="summary muted small">{summary}</span>}
            </Link>
          </li>,
        ];
      })}
    </ul>
  );
}
