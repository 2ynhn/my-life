import { Suspense } from "react";
import { FolderList, NoteList, noteYears, type NoteItem } from "@/components/FolderList";
import { hrefFor, visibleChildren, type DriveIndex, type FileEntry, type FolderEntry, type FolderKind } from "@/lib/drive";
import { readTexts } from "@/lib/folder-meta";
import { noteSummary } from "@/lib/note-summary";

// 글 목록: 오른쪽에는 수정 날짜 대신 글 내용 한 줄 (제목·첫 품목·여행 이름·식당).
// 이름부터 바로 보여 주고, 내용은 읽히는 대로 채운다.

export function FolderView({ folder, index, kind }: { folder: FolderEntry; index: DriveIndex; kind: FolderKind | null }) {
  const items = visibleChildren(folder);
  const files = items.filter((c): c is FileEntry => c.kind === "file");
  const notes: NoteItem[] = files.map((n) => ({ id: n.id, href: hrefFor(n), slug: n.slug }));
  const years = noteYears(notes);
  return (
    <FolderList
      folderId={folder.id}
      folders={items.flatMap((f) =>
        f.kind === "folder" ? [{ id: f.id, href: hrefFor(f), name: f.name, restricted: f.restricted, count: visibleChildren(f).length }] : [],
      )}
      notes={notes}
      years={years}
      showJump={kind !== "travel"}
      list={
        <Suspense fallback={<NoteList notes={notes} years={years} />}>
          <SummarizedList files={files} notes={notes} index={index} kind={kind} years={years} />
        </Suspense>
      }
    />
  );
}

async function SummarizedList({
  files,
  notes,
  index,
  kind,
  years,
}: {
  files: FileEntry[];
  notes: NoteItem[];
  index: DriveIndex;
  kind: FolderKind | null;
  years: string[] | null;
}) {
  const texts = await readTexts(index, files, 4_000);
  const summaries = new Map<string, string>();
  for (const n of files) {
    const t = texts.get(n.id);
    if (t !== undefined) summaries.set(n.id, noteSummary(t, n.slug, kind));
  }
  return <NoteList notes={notes} summaries={summaries} years={years} />;
}
