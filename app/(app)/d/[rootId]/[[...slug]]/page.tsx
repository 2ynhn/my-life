import type { Metadata } from "next";
import { Plus } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CalendarView, onThisDay } from "@/components/CalendarView";
import { AskView } from "@/components/AskView";
import { CollectView } from "@/components/CollectView";
import { DriveProblem } from "@/components/DriveProblem";
import { Editor } from "@/components/Editor";
import { FolderView } from "@/components/FolderView";
import { NewFolderButton } from "@/components/NewFolderButton";
import { NoteActions } from "@/components/NoteActions";
import { NoteBody } from "@/components/NoteBody";
import { SearchView } from "@/components/SearchView";
import { FeatureIcon } from "@/components/FeatureIcon";
import type { FormKind } from "@/components/MetaForm";
import { HealthView } from "@/components/HealthView";
import { Home, hiddenAncestor } from "@/components/Home";
import { SpendingView } from "@/components/SpendingView";
import { TravelMap } from "@/components/TravelMap";
import { TravelView } from "@/components/TravelView";
import {
  DriveError,
  ReauthError,
  fileUrl,
  hrefFor,
  folderKind,
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
import { featureByName } from "@/lib/features";
import { libraryTitle } from "@/lib/labels";
import { loadLibrary } from "@/lib/library";
import { splitFrontmatter } from "@/lib/markdown";
import { placesOf } from "@/lib/places";
import { requireUser } from "@/lib/session";

type Props = {
  params: Promise<{ rootId: string; slug?: string[] }>;
  searchParams: Promise<{
    mode?: string;
    sub?: string;
    view?: string;
    q?: string;
    tag?: string;
    month?: string;
    day?: string;
    spend?: string;
    range?: string;
    shared?: string;
    tab?: string;
    who?: string;
    store?: string;
  }>;
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
  if (entry && !entry.parent && view === "collect") return { title: "모아보기" };
  if (entry && !entry.parent && view === "ask") return { title: q ? `물어보기: ${q}` : "물어보기" };
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

  const { mode, sub, view, q, tag, month, day, spend, range, shared, tab, who, store } = await searchParams;

  // 일기장 단위 화면: 검색·캘린더 (주소: /d/<id>?view=…)
  if (!entry.parent && view === "search") return <SearchView index={index} q={String(q ?? "")} tag={String(tag ?? "")} />;
  if (!entry.parent && view === "calendar") return <CalendarView index={index} month={month} day={day} />;
  if (!entry.parent && view === "ask") return <AskView base={index.lib.base} rootId={index.lib.rootId} q={String(q ?? "")} />;
  if (!entry.parent && view === "collect") return <CollectView index={index} tab={tab} who={who} store={store} />;

  // 편집·새 글은 Drive가 허락한 경우에만 (게스트도 Drive에서 편집자로 공유받았으면 가능)
  if (mode === "edit" && entry.kind === "file" && entry.can.edit) return <EditNote entry={entry} index={index} />;
  if (mode === "new" && entry.kind === "folder" && entry.can.addChildren) {
    // sub: 저장할 때 만들 하위 폴더 (오늘 일기 쓰기의 연도 폴더). 이미 있으면 그 폴더로 바로 보낸다
    if (sub !== undefined) {
      if (!/^\d{4}$/.test(sub)) notFound();
      const existing = entry.children.find((c) => c.kind === "folder" && c.name === sub);
      if (existing) redirect(`${hrefFor(existing)}?mode=new`);
    }
    return <NewNote folder={entry} index={index} subfolder={sub} shared={shared === "1"} />;
  }

  // 첫 화면은 경로 표시 없이 바로 카드
  if (entry.kind === "folder" && !entry.parent) return <Folder folder={entry} index={index} />;

  return (
    <>
      <div className="entry-head">
        <a className="small muted" href={webUrlFor(entry)} target="_blank" rel="noopener noreferrer">
          Drive에서 열기 ↗
        </a>
      </div>
      {entry.kind === "folder" ? (
        <Folder folder={entry} index={index} spend={spend} range={range} />
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

async function Folder({ folder, index, spend, range }: { folder: FolderEntry; index: DriveIndex; spend?: string; range?: string }) {
  if (!folder.parent) {
    const recent = [...index.byId.values()]
      .filter((e): e is FileEntry => e.kind === "file" && e.isMarkdown && isListable(e.parent!) && !hiddenAncestor(e))
      .sort((a, b) => b.modifiedTime.localeCompare(a.modifiedTime))
      .slice(0, 8);
    return <Home root={folder} index={index} diary={diaryHref(folder)} past={onThisDay(index)} recent={recent} />;
  }
  const kind = await folderKind(index, folder);
  let top = folder;
  while (top.parent?.parent) top = top.parent;
  const feature = kind ?? (featureByName(top.name) === "diary" ? "diary" : null);

  return (
    <>
      <div className="title-row">
        <h1 className="page-title">
          {feature && <FeatureIcon kind={feature} />}
          {folder.name}
        </h1>
        {folder.can.addChildren && (
          <div className="title-actions">
            <NewFolderButton rootId={index.lib.rootId} folderId={folder.id} />
            <Link className="btn btn-save" href={`${hrefFor(folder)}?mode=new`}>
              <Plus size={16} aria-hidden />새 글
            </Link>
          </div>
        )}
      </div>
      {kind === "spending" && <SpendingView index={index} folder={folder} month={spend} />}
      {kind === "travel" && <TravelView index={index} folder={folder} />}
      {kind === "health" && <HealthView index={index} folder={folder} range={range} />}
      <FolderView folder={folder} />
    </>
  );
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
  // 여행 글이면 들른 곳을 순서대로 지도에
  const places = (await folderKind(index, entry.parent!)) === "travel" ? placesOf(splitFrontmatter(text).meta) : [];
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
      {places.length > 0 && <TravelMap points={places.map((p) => ({ ...p, sub: p.date.replace(/-/g, ".") || undefined }))} route />}
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
      places={(await formKindOf(index, entry.parent!)) === "travel"}
      form={await formKindOf(index, entry.parent!)}
      manageCategories={index.root.can.addChildren}
      initialText={note.text}
      closeHref={hrefFor(entry)}
      doneHref={(await formKindOf(index, entry.parent!)) === "diary" ? index.lib.base : hrefFor(entry.parent!)}
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

async function NewNote({
  folder,
  index,
  subfolder,
  shared = false,
}: {
  folder: FolderEntry;
  index: DriveIndex;
  subfolder?: string;
  shared?: boolean;
}) {
  let template: string;
  try {
    template = await loadTemplate(index, folder);
  } catch (e) {
    return readProblem(e);
  }
  const date = today();
  const kind = await formKindOf(index, folder);
  return (
    <Editor
      mode="new"
      receipt={kind === "spending"}
      sharedImage={shared && kind === "spending"}
      places={kind === "travel"}
      form={kind}
      manageCategories={kind === "spending" && index.root.can.addChildren}
      doneHref={kind === "diary" ? index.lib.base : undefined}
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

/** 입력 폼 종류: 템플릿으로 구매·여행·건강, 최상위 폴더 이름으로 일기 */
async function formKindOf(index: DriveIndex, folder: FolderEntry): Promise<FormKind | null> {
  const kind = await folderKind(index, folder);
  if (kind) return kind;
  let top = folder;
  while (top.parent?.parent) top = top.parent;
  return top.parent && featureByName(top.name) === "diary" ? "diary" : null;
}
