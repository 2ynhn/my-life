import Link from "next/link";
import { DriveProblem } from "@/components/DriveProblem";
import { FolderView } from "@/components/FolderView";
import { hrefFor, loadIndex, type FileEntry } from "@/lib/drive";
import { requireUser } from "@/lib/session";

export default async function HomePage() {
  // 레이아웃과 페이지는 병렬로 렌더링되므로 페이지에서도 직접 확인한다
  await requireUser();
  const { index, problem } = await loadIndex();
  if (!index) return <DriveProblem message={problem} />;

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
