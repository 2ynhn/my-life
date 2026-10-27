import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { DriveProblem } from "@/components/DriveProblem";
import { Editor } from "@/components/Editor";
import { FolderView } from "@/components/FolderView";
import { NoteActions } from "@/components/NoteActions";
import { NoteBody } from "@/components/NoteBody";
import {
  DriveError,
  getIndex,
  hrefFor,
  linkResolver,
  linkTable,
  loadIndex,
  loadTemplate,
  readNote,
  resolveSlugPath,
  webUrlFor,
  type DriveIndex,
  type FileEntry,
  type FolderEntry,
} from "@/lib/drive";
import { requireUser } from "@/lib/session";

type Props = {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<{ mode?: string }>;
};

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

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  await requireUser();
  const { index } = await loadIndex();
  const entry = index && (await resolve(index, params));
  const { mode } = await searchParams;
  const name = entry ? (entry.kind === "file" ? entry.slug : entry.name) : "my-life";
  return { title: mode === "edit" ? `편집: ${name}` : mode === "new" ? "새 글" : name };
}

export default async function EntryPage({ params, searchParams }: Props) {
  const user = await requireUser();
  const loaded = await loadIndex();
  if (!loaded.index) return <DriveProblem message={loaded.problem} />;
  let index = loaded.index;
  let entry = await resolve(index, params);
  // 다른 서버 인스턴스에서 방금 만들거나 이름을 바꾼 파일일 수 있으니 한 번 다시 읽어 본다
  if (!entry && Date.now() - index.builtAt > 5_000) {
    index = await getIndex({ fresh: true });
    entry = await resolve(index, params);
  }
  if (!entry) notFound();

  // md가 아닌 파일(이미지 등)은 원본으로 보낸다
  if (entry.kind === "file" && !entry.isMarkdown) redirect(`/api/file/${encodeURIComponent(entry.id)}`);

  const isOwner = user.role === "owner";
  const { mode } = await searchParams;

  if (isOwner && mode === "edit" && entry.kind === "file") return <EditNote entry={entry} index={index} />;
  if (isOwner && mode === "new" && entry.kind === "folder") return <NewNote folder={entry} index={index} />;

  const driveUrl = isOwner ? webUrlFor(entry) : null;

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
          <div className="title-row">
            <h1 className="page-title">{entry.name}</h1>
            {isOwner && (
              <Link className="btn btn-save" href={`${hrefFor(entry)}?mode=new`}>
                새 글
              </Link>
            )}
          </div>
          <FolderView folder={entry} />
        </>
      ) : (
        <Note entry={entry} index={index} isOwner={isOwner} />
      )}
    </>
  );
}

function readProblem(e: unknown) {
  console.error("[drive] read failed:", e);
  return <DriveProblem message={e instanceof DriveError ? e.message : "파일을 읽지 못했습니다."} />;
}

async function Note({ entry, index, isOwner }: { entry: FileEntry; index: DriveIndex; isOwner: boolean }) {
  let text: string;
  try {
    ({ text } = await readNote(entry));
  } catch (e) {
    return readProblem(e);
  }
  return (
    <>
      {isOwner && <NoteActions fileId={entry.id} fileName={entry.name} editHref={`${hrefFor(entry)}?mode=edit`} />}
      <NoteBody text={text} links={linkResolver(index, entry.parent!)} />
    </>
  );
}

async function EditNote({ entry, index }: { entry: FileEntry; index: DriveIndex }) {
  let note: { text: string; checksum: string };
  try {
    note = await readNote(entry);
  } catch (e) {
    return readProblem(e);
  }
  return (
    <Editor
      key={entry.id}
      mode="edit"
      fileId={entry.id}
      fileName={entry.name}
      checksum={note.checksum}
      initialText={note.text}
      closeHref={hrefFor(entry)}
      links={linkTable(index, entry.parent!)}
    />
  );
}

/** 오늘 날짜(한국 시간) */
const today = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());

/** 오늘 날짜로, 이미 있으면 -2, -3 … 을 붙인 이름 */
function freeName(folder: FolderEntry, base: string) {
  const taken = new Set(folder.children.map((c) => c.name.toLowerCase()));
  for (let i = 1; ; i++) {
    const name = i === 1 ? base : `${base}-${i}`;
    if (!taken.has(`${name}.md`.toLowerCase())) return name;
  }
}

async function NewNote({ folder, index }: { folder: FolderEntry; index: DriveIndex }) {
  let template: string;
  try {
    template = await loadTemplate(index, folder);
  } catch (e) {
    return readProblem(e);
  }
  const date = today();
  return (
    <Editor
      mode="new"
      folderId={folder.id}
      folderName={folder.name}
      defaultName={freeName(folder, date)}
      initialText={template.replaceAll("{{date}}", date).replaceAll("{{title}}", "")}
      closeHref={hrefFor(folder)}
      links={linkTable(index, folder)}
    />
  );
}
