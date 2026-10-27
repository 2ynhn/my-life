import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { FolderView } from "@/components/FolderView";
import { NoteView } from "@/components/NoteView";
import { getIndex, readText, resolveSlugPath, webUrlFor } from "@/lib/drive";
import { requireUser } from "@/lib/session";

type Props = { params: Promise<{ slug: string[] }> };

const decode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

async function resolve(params: Props["params"]) {
  const { slug } = await params;
  return resolveSlugPath(await getIndex(), slug.map(decode));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await requireUser();
  const entry = await resolve(params);
  return { title: entry?.kind === "file" ? entry.slug : (entry?.name ?? "없음") };
}

export default async function EntryPage({ params }: Props) {
  const user = await requireUser();
  const index = await getIndex();
  const entry = await resolve(params);
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
        <NoteView file={entry} text={await readText(entry)} index={index} />
      )}
    </>
  );
}
