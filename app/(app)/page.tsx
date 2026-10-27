import Link from "next/link";
import { DriveProblem } from "@/components/DriveProblem";
import { FolderView } from "@/components/FolderView";
import { hrefFor, isListable, loadIndex, type FileEntry, type FolderEntry } from "@/lib/drive";
import { requireUser } from "@/lib/session";

/** 오늘 일기를 쓸 폴더: daily/<올해> → daily */
function diaryFolder(root: FolderEntry): FolderEntry | null {
  const sub = (f: FolderEntry, name: string) =>
    f.children.find((c): c is FolderEntry => c.kind === "folder" && c.name.toLowerCase() === name);
  const daily = sub(root, "daily");
  if (!daily) return null;
  const year = new Intl.DateTimeFormat("en", { timeZone: "Asia/Seoul", year: "numeric" }).format(new Date());
  return sub(daily, year) ?? daily;
}

export default async function HomePage() {
  // 레이아웃과 페이지는 병렬로 렌더링되므로 페이지에서도 직접 확인한다
  const user = await requireUser();
  const { index, problem } = await loadIndex();
  if (!index) return <DriveProblem message={problem} />;
  const diary = diaryFolder(index.root);

  const recent = [...index.byId.values()]
    .filter((e): e is FileEntry => e.kind === "file" && e.isMarkdown && isListable(e.parent!))
    .sort((a, b) => b.modifiedTime.localeCompare(a.modifiedTime))
    .slice(0, 8);

  return (
    <>
      <div className="title-row">
        <h1 className="page-title">my-life</h1>
        {user.role === "owner" && diary && (
          <Link className="btn btn-save" href={`${hrefFor(diary)}?mode=new`}>
            오늘 일기 쓰기
          </Link>
        )}
      </div>
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
