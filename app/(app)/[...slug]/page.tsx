import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { DriveProblem } from "@/components/DriveProblem";
import { FolderView } from "@/components/FolderView";
import { NoteView } from "@/components/NoteView";
import { DriveError, loadIndex, readText, resolveSlugPath, webUrlFor, type DriveIndex, type FileEntry } from "@/lib/drive";
import { requireUser } from "@/lib/session";

type Props = { params: Promise<{ slug: string[] }> };

const decode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

async function resolve(index: DriveIndex, params: Props["params"]) {
  const { slug } = await params;
  return resolveSlugPath(index, slug.map(decode));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await requireUser();
  const { index } = await loadIndex();
  const entry = index && (await resolve(index, params));
  return { title: entry ? (entry.kind === "file" ? entry.slug : entry.name) : "my-life" };
}

export default async function EntryPage({ params }: Props) {
  const user = await requireUser();
  const { index, problem } = await loadIndex();
  if (!index) return <DriveProblem message={problem} />;
  const entry = await resolve(index, params);
  if (!entry) notFound();

  // md가 아닌 파일(이미지 등)은 원본으로 보낸다
  if (entry.kind === "file" && !entry.isMarkdown) redirect(`/api/file/${encodeURIComponent(entry.id)}`);

  const driveUrl = user.role === "owner" ? webUrlFor(entry) : null;

  return (
    <>
      <div className="entry-head">
        <Breadcrumbs entry={entry} />
        {driveUrl && (
          <a className="small muted" href={driveUrl} target="_blank" rel="noopener noreferrer">
            Drive에서 열기 ↗
          </a>
        )}
      </div>
      {entry.kind === "folder" ? (
        <>
          <h1 className="page-title">{entry.name}</h1>
          <FolderView folder={entry} />
        </>
      ) : (
        <Note entry={entry} index={index} />
      )}
    </>
  );
}

async function Note({ entry, index }: { entry: FileEntry; index: DriveIndex }) {
  let text: string;
  try {
    text = await readText(entry);
  } catch (e) {
    console.error("[drive] read failed:", e);
    return <DriveProblem message={e instanceof DriveError ? e.message : "파일을 읽지 못했습니다."} />;
  }
  return <NoteView file={entry} text={text} index={index} />;
}
