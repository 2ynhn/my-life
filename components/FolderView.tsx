import { FeatureIcon } from "@/components/FeatureIcon";
import { PendingNotes } from "@/components/SaveStatus";
import Link from "next/link";
import { Suspense } from "react";
import { hrefFor, visibleChildren, type DriveIndex, type FileEntry, type FolderEntry, type FolderKind } from "@/lib/drive";
import { readTexts } from "@/lib/folder-meta";
import { noteSummary } from "@/lib/note-summary";
import { JUMP_MIN_ITEMS, YearJump, yearAnchor } from "@/components/YearJump";

// 글 목록: 오른쪽에는 수정 날짜 대신 글 내용 한 줄 (제목·첫 품목·여행 이름·식당).
// 이름부터 바로 보여 주고, 내용은 읽히는 대로 채운다.

export function FolderView({ folder, index, kind }: { folder: FolderEntry; index: DriveIndex; kind: FolderKind | null }) {
  const items = visibleChildren(folder);
  const folders = items.filter((c) => c.kind === "folder");
  const notes = items.filter((c) => c.kind === "file");
  // 글이 많고 여러 해에 걸치면 해마다 구분선 + 위에 연도 점프
  const noteYears = [...new Set(notes.flatMap((n) => /^(\d{4})-/.exec(n.slug)?.[1] ?? []))];
  const years = notes.length >= JUMP_MIN_ITEMS && noteYears.length >= 2 ? noteYears : null;

  if (!items.length)
    return (
      <>
        <PendingNotes folderId={folder.id} />
        <p className="muted">비어 있는 폴더입니다.</p>
      </>
    );

  return (
    <div className="listing">
      {folders.length > 0 && (
        <ul className="folder-grid">
          {folders.map((f) => (
            <li key={f.id}>
              <Link href={hrefFor(f)}>
                <FeatureIcon kind={null} restricted={f.restricted} size="sm" />
                <span className="name">{f.name}</span>
                {f.restricted && <span className="sr-only">접근 제한</span>}
                <span className="count">{visibleChildren(f).length}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <PendingNotes folderId={folder.id} />
      {/* 여행은 위 타임라인에 따로 있다 */}
      {years && kind !== "travel" && <YearJump years={years} prefix="y" />}
      {notes.length > 0 && (
        <Suspense fallback={<NoteList notes={notes} years={years} />}>
          <SummarizedList notes={notes} index={index} kind={kind} years={years} />
        </Suspense>
      )}
    </div>
  );
}

async function SummarizedList({
  notes,
  index,
  kind,
  years,
}: {
  notes: FileEntry[];
  index: DriveIndex;
  kind: FolderKind | null;
  years: string[] | null;
}) {
  const texts = await readTexts(index, notes, 4_000);
  const summaries = new Map<string, string>();
  for (const n of notes) {
    const t = texts.get(n.id);
    if (t !== undefined) summaries.set(n.id, noteSummary(t, n.slug, kind));
  }
  return <NoteList notes={notes} summaries={summaries} years={years} />;
}

function NoteList({ notes, summaries, years }: { notes: FileEntry[]; summaries?: Map<string, string>; years: string[] | null }) {
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
            <Link href={hrefFor(n)}>
              <span className="title">{n.slug}</span>
              {summary && <span className="summary muted small">{summary}</span>}
            </Link>
          </li>,
        ];
      })}
    </ul>
  );
}
