import { FeatureIcon } from "@/components/FeatureIcon";
import Link from "next/link";
import { Suspense } from "react";
import { hrefFor, visibleChildren, type DriveIndex, type FileEntry, type FolderEntry, type FolderKind } from "@/lib/drive";
import { readTexts } from "@/lib/folder-meta";
import { noteSummary } from "@/lib/note-summary";

// 글 목록: 오른쪽에는 수정 날짜 대신 글 내용 한 줄 (제목·첫 품목·여행 이름·식당).
// 이름부터 바로 보여 주고, 내용은 읽히는 대로 채운다.

export function FolderView({ folder, index, kind }: { folder: FolderEntry; index: DriveIndex; kind: FolderKind | null }) {
  const items = visibleChildren(folder);
  const folders = items.filter((c) => c.kind === "folder");
  const notes = items.filter((c) => c.kind === "file");

  if (!items.length) return <p className="muted">비어 있는 폴더입니다.</p>;

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
      {notes.length > 0 && (
        <Suspense fallback={<NoteList notes={notes} />}>
          <SummarizedList notes={notes} index={index} kind={kind} />
        </Suspense>
      )}
    </div>
  );
}

async function SummarizedList({ notes, index, kind }: { notes: FileEntry[]; index: DriveIndex; kind: FolderKind | null }) {
  const texts = await readTexts(index, notes, 4_000);
  const summaries = new Map<string, string>();
  for (const n of notes) {
    const t = texts.get(n.id);
    if (t !== undefined) summaries.set(n.id, noteSummary(t, n.slug, kind));
  }
  return <NoteList notes={notes} summaries={summaries} />;
}

function NoteList({ notes, summaries }: { notes: FileEntry[]; summaries?: Map<string, string> }) {
  return (
    <ul className="note-list">
      {notes.map((n) => {
        const summary = summaries?.get(n.id);
        return (
          <li key={n.id}>
            <Link href={hrefFor(n)}>
              <span className="title">{n.slug}</span>
              {summary && <span className="summary muted small">{summary}</span>}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
