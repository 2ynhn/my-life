import { FeatureIcon } from "@/components/FeatureIcon";
import Link from "next/link";
import { hrefFor, visibleChildren, type FolderEntry } from "@/lib/drive";

const fmtDate = (iso: string) => (iso ? iso.slice(0, 10) : "");

export function FolderView({ folder }: { folder: FolderEntry }) {
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
