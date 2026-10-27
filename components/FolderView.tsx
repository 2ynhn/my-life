import Link from "next/link";
import type { Role } from "@/lib/access";
import { hrefFor, visibleChildren, type FolderEntry } from "@/lib/drive";

const fmtDate = (iso: string) => (iso ? iso.slice(0, 10) : "");

export function FolderView({ folder, role }: { folder: FolderEntry; role: Role }) {
  const items = visibleChildren(folder, role);
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
                <span className="icon" aria-hidden>
                  📁
                </span>
                {f.name}
                {f.private && !folder.private && (
                  <span className="lock" title="비공개: 게스트에게 안 보임" aria-label="비공개">
                    🔒
                  </span>
                )}
                <span className="count">{visibleChildren(f, role).length}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {notes.length > 0 && (
        <ul className="note-list">
          {notes.map((n) => (
            <li key={n.id}>
              <Link href={hrefFor(n)}>
                <span className="title">{n.slug}</span>
                <span className="muted small">수정 {fmtDate(n.modifiedTime)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
