import { FolderList, noteYears, type NoteItem } from "@/components/FolderList";
import { LocalNoteList } from "@/components/LocalNoteList";
import { hrefFor, visibleChildren, type FileEntry, type FolderEntry, type FolderKind } from "@/lib/drive";

// 폴더 안 목록. 글 오른쪽 한 줄(제목·첫 품목·여행 이름·식당)은 기기 사본으로 채운다 (LocalNoteList)

export function FolderView({ folder, kind }: { folder: FolderEntry; kind: FolderKind | null }) {
  const items = visibleChildren(folder);
  const notes: NoteItem[] = items
    .filter((c): c is FileEntry => c.kind === "file")
    .map((n) => ({ id: n.id, href: hrefFor(n), slug: n.slug }));
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
      list={<LocalNoteList notes={notes} kind={kind} years={years} />}
    />
  );
}
