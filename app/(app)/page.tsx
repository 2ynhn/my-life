import Link from "next/link";
import { FolderView } from "@/components/FolderView";
import { getIndex, hrefFor, type FileEntry } from "@/lib/drive";

export default async function HomePage() {
  const index = await getIndex();
  const recent = [...index.byId.values()]
    .filter((e): e is FileEntry => e.kind === "file" && e.isMarkdown)
    .sort((a, b) => b.modifiedTime.localeCompare(a.modifiedTime))
    .slice(0, 8);

  return (
    <>
      <h1 className="page-title">my-life</h1>
      <FolderView folder={index.root} />
      {recent.length > 0 && (
        <section className="recent">
          <h2>최근 수정</h2>
          <ul className="note-list">
            {recent.map((n) => (
              <li key={n.id}>
                <Link href={hrefFor(n)}>
                  <span className="title">{n.slug}</span>
                  <span className="muted small">{n.slugPath.slice(0, -1).join(" / ")}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
