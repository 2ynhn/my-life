import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CalendarView, onThisDay } from "@/components/CalendarView";
import { DriveProblem } from "@/components/DriveProblem";
import { Editor } from "@/components/Editor";
import { FolderView } from "@/components/FolderView";
import { NoteActions } from "@/components/NoteActions";
import { NoteBody } from "@/components/NoteBody";
import { SearchView } from "@/components/SearchView";
import {
  DriveError,
  ReauthError,
  fileUrl,
  hrefFor,
  isListable,
  linkResolver,
  linkTable,
  loadTemplate,
  readNote,
  resolveSlugPath,
  webUrlFor,
  type DriveIndex,
  type Entry,
  type FileEntry,
  type FolderEntry,
} from "@/lib/drive";
import { libraryTitle } from "@/lib/labels";
import { loadLibrary } from "@/lib/library";
import { requireUser } from "@/lib/session";

type Props = {
  params: Promise<{ rootId: string; slug?: string[] }>;
  searchParams: Promise<{ mode?: string; sub?: string; view?: string; q?: string; tag?: string; month?: string; day?: string }>;
};

const decode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

async function resolve(index: DriveIndex, params: Props["params"]) {
  const { slug = [] } = await params;
  return resolveSlugPath(index, slug.map(decode));
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const user = await requireUser();
  const loaded = await loadLibrary(user, decode((await params).rootId));
  const entry = loaded.kind === "ok" ? await resolve(loaded.index, params) : null;
  const { mode, view, q, tag } = await searchParams;
  const name = !entry ? "찾을 수 없음" : !entry.parent ? libraryTitle(entry.lib) : entry.kind === "file" ? entry.slug : entry.name;
  if (entry && !entry.parent && view === "search") return { title: tag ? `#${tag}` : q ? `검색: ${q}` : "검색" };
  if (entry && !entry.parent && view === "calendar") return { title: "캘린더" };
  return { title: mode === "edit" ? `편집: ${name}` : mode === "new" ? "새 글" : name };
}

export default async function EntryPage({ params, searchParams }: Props) {
  const user = await requireUser();
  const rootId = decode((await params).rootId);
  let loaded = await loadLibrary(user, rootId);
  // 열 수 없는 일기장(공유 안 됨·끊김·삭제)은 존재 여부를 알리지 않고 '없음'
  if (loaded.kind === "missing") notFound();
  if (loaded.kind === "problem") return <DriveProblem message={loaded.problem} reauth={loaded.reauth} />;
  let entry = await resolve(loaded.index, params);
  // 다른 서버 인스턴스나 Drive에서 방금 만들거나 이름을 바꾼 파일일 수 있으니 한 번 다시 읽어 본다
  if (!entry) {
    loaded = await loadLibrary(user, rootId, { fresh: true });
    if (loaded.kind !== "ok") notFound();
    entry = await resolve(loaded.index, params);
  }
  // 접근 제한 폴더는 Drive가 이름만 보여 주고 열지는 못하게 한다 → 앱에서도 '없음'
  if (!entry || (entry.kind === "folder" && !entry.can.listChildren)) notFound();
  const index = loaded.index;

  // md가 아닌 파일(이미지 등)은 원본으로 보낸다
  if (entry.kind === "file" && !entry.isMarkdown) redirect(fileUrl(entry));

  const { mode, sub, view, q, tag, month, day } = await searchParams;

  // 일기장 단위 화면: 검색·캘린더 (주소: /d/<id>?view=…)
  if (!entry.parent && view === "search") return <SearchView index={index} q={String(q ?? "")} tag={String(tag ?? "")} />;
  if (!entry.parent && view === "calendar") return <CalendarView index={index} month={month} day={day} />;

  // 편집·새 글은 Drive가 허락한 경우에만 (게스트도 Drive에서 편집자로 공유받았으면 가능)
  if (mode === "edit" && entry.kind === "file" && entry.can.edit) return <EditNote entry={entry} index={index} />;
  if (mode === "new" && entry.kind === "folder" && entry.can.addChildren) {
    // sub: 저장할 때 만들 하위 폴더 (오늘 일기 쓰기의 연도 폴더). 이미 있으면 그 폴더로 바로 보낸다
    if (sub !== undefined) {
      if (!/^\d{4}$/.test(sub)) notFound();
      const existing = entry.children.find((c) => c.kind === "folder" && c.name === sub);
      if (existing) redirect(`${hrefFor(existing)}?mode=new`);
    }
    return <NewNote folder={entry} index={index} subfolder={sub} />;
  }

  return (
    <>
      <div className="entry-head">
        <Breadcrumbs entry={entry} />
        <a className="small muted" href={webUrlFor(entry)} target="_blank" rel="noopener noreferrer">
          Drive에서 열기 ↗
        </a>
      </div>
      {entry.kind === "folder" ? (
        <Folder folder={entry} index={index} />
      ) : (
        <Note entry={entry} index={index} />
      )}
    </>
  );
}

/** 오늘 일기 쓰기 주소: daily/<올해> 폴더. 아직 없으면 저장할 때 만들도록 sub로 넘긴다 */
function diaryHref(root: FolderEntry): string | null {
  const sub = (f: FolderEntry, name: string) =>
    f.children.find((c): c is FolderEntry => c.kind === "folder" && c.name.toLowerCase() === name);
  const daily = sub(root, "daily");
  if (!daily) return null;
  const year = new Intl.DateTimeFormat("en", { timeZone: "Asia/Seoul", year: "numeric" }).format(new Date());
  const yearFolder = sub(daily, year);
  if (yearFolder) return yearFolder.can.addChildren ? `${hrefFor(yearFolder)}?mode=new` : null;
  return daily.can.addChildren ? `${hrefFor(daily)}?mode=new&sub=${year}` : null;
}

function Folder({ folder, index }: { folder: FolderEntry; index: DriveIndex }) {
  const isRoot = !folder.parent;
  const diary = isRoot ? diaryHref(folder) : null;
  const past = isRoot ? onThisDay(index) : [];
  const recent = isRoot
    ? [...index.byId.values()]
        .filter((e): e is FileEntry => e.kind === "file" && e.isMarkdown && isListable(e.parent!) && !hiddenAncestor(e))
        .sort((a, b) => b.modifiedTime.localeCompare(a.modifiedTime))
        .slice(0, 8)
    : [];

  return (
    <>
      <div className="title-row">
        <h1 className="page-title">{isRoot ? libraryTitle(folder.lib) : folder.name}</h1>
        {diary ? (
          <Link className="btn btn-save" href={diary}>
            오늘 일기 쓰기
          </Link>
        ) : (
          !isRoot &&
          folder.can.addChildren && (
            <Link className="btn btn-save" href={`${hrefFor(folder)}?mode=new`}>
              새 글
            </Link>
          )
        )}
      </div>
      {isRoot && !folder.lib.ownedByMe && (
        <p className="muted small">
          {folder.lib.ownerName}님이 Drive에서 공유한 일기장입니다.{" "}
          {folder.can.edit ? "편집 권한이 있어 글을 쓰고 고칠 수 있어요." : "읽기만 할 수 있어요."}
        </p>
      )}
      {isRoot && (
        <div className="lib-tools">
          <form className="search-form" action={folder.lib.base}>
            <input type="hidden" name="view" value="search" />
            <input name="q" placeholder="일기 검색" aria-label="검색어" />
            <button className="btn" type="submit">
              검색
            </button>
          </form>
          <Link className="btn" href={`${folder.lib.base}?view=calendar`}>
            📅 캘린더
          </Link>
        </div>
      )}
      {past.length > 0 && (
        <section className="on-this-day">
          <h2>지난 오늘</h2>
          <ul className="note-list">
            {past.map(({ years, note }) => (
              <li key={note.id}>
                <Link href={hrefFor(note)}>
                  <span className="title">{note.slug}</span>
                  <span className="muted small">{years}년 전</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <FolderView folder={folder} />
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

/** _templates 같은 숨김 폴더 안의 글은 최근 목록에서 뺀다 */
function hiddenAncestor(e: Entry): boolean {
  for (let f = e.parent; f?.parent; f = f.parent) if (!isListable(f)) return true;
  return false;
}

function readProblem(e: unknown) {
  // 공유가 방금 끊겼거나 파일이 지워진 경우: 오류 대신 '없음'
  if (e instanceof DriveError && (e.status === 403 || e.status === 404) && !(e instanceof ReauthError)) notFound();
  console.error("[drive] read failed:", e);
  return (
    <DriveProblem
      message={e instanceof DriveError ? e.message : "파일을 읽지 못했습니다."}
      reauth={e instanceof ReauthError}
    />
  );
}

async function Note({ entry, index }: { entry: FileEntry; index: DriveIndex }) {
  let text: string;
  try {
    ({ text } = await readNote(index, entry));
  } catch (e) {
    return readProblem(e);
  }
  const { edit, rename, trash } = entry.can;
  return (
    <>
      {(edit || rename || trash) && (
        <NoteActions
          rootId={index.lib.rootId}
          fileId={entry.id}
          fileName={entry.name}
          editHref={edit ? `${hrefFor(entry)}?mode=edit` : null}
          canRename={rename}
          canTrash={trash}
        />
      )}
      <NoteBody
        text={text}
        links={linkResolver(index, entry.parent!)}
        tagHref={(t) => `${index.lib.base}?view=search&tag=${encodeURIComponent(t)}`}
      />
    </>
  );
}

async function EditNote({ entry, index }: { entry: FileEntry; index: DriveIndex }) {
  let note: { text: string; checksum: string };
  try {
    note = await readNote(index, entry);
  } catch (e) {
    return readProblem(e);
  }
  return (
    <Editor
      key={entry.id}
      mode="edit"
      rootId={index.lib.rootId}
      fileId={entry.id}
      fileName={entry.name}
      checksum={note.checksum}
      initialText={note.text}
      closeHref={hrefFor(entry)}
      uploadFolderId={entry.parent!.id}
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

async function NewNote({ folder, index, subfolder }: { folder: FolderEntry; index: DriveIndex; subfolder?: string }) {
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
      rootId={index.lib.rootId}
      folderId={folder.id}
      folderName={subfolder ? `${folder.name} / ${subfolder}` : folder.name}
      subfolder={subfolder}
      // 새로 만들 폴더는 비어 있으니 이름이 겹칠 일이 없다
      defaultName={subfolder ? date : freeName(folder, date)}
      initialText={template.replaceAll("{{date}}", date).replaceAll("{{title}}", "")}
      closeHref={hrefFor(folder)}
      // 연도 폴더가 아직 없으면 부모(daily) 기준 → daily/attachments 에 저장되고, 새 폴더에서도 그대로 찾아진다
      uploadFolderId={folder.id}
      links={linkTable(index, folder)}
    />
  );
}
