import { givenNoteName } from "@/lib/note-name";
import { GraphJump, LocalGraph } from "@/components/LocalGraph";
import type { Metadata } from "next";
import { Plus } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AskView } from "@/components/AskView";
import { DriveProblem } from "@/components/DriveProblem";
import { Editor } from "@/components/Editor";
import { FolderView } from "@/components/FolderView";
import { TemplateButton } from "@/components/TemplateButton";
import { NewNoteMenu } from "@/components/NewNoteMenu";
import { NewFolderButton } from "@/components/NewFolderButton";
import { NoteActions } from "@/components/NoteActions";
import { NoteBody } from "@/components/NoteBody";
import { FeatureIcon } from "@/components/FeatureIcon";
import type { FormKind } from "@/components/MetaForm";
import { FeatureView } from "@/components/FeatureView";
import { LocalRootView } from "@/components/LocalRootView";
import { LOCAL_ROOT_VIEWS, type RootViewName } from "@/lib/root-views";
import { Home } from "@/components/Home";
import { TEMPLATE_FOLDER, isTemplateFile, withEnd } from "@/lib/templates";
import { kindOfTemplate, templateChoices, templateTextFor } from "@/lib/template-types";
import { homeData } from "@/lib/home-data";
import { TripSection } from "@/components/TripSection";
import {
  DriveError,
  ReauthError,
  fileUrl,
  hrefFor,
  folderKind,
  linkResolver,
  linkTable,
  loadTemplate,
  ME_FOLDER,
  ownTemplateFile,
  templateFiles,
  templatesFolder,
  readNote,
  resolveSlugPath,
  type DriveIndex,
  type Entry,
  type FileEntry,
  type FolderEntry,
} from "@/lib/drive";
import { featureByName, type FeatureKey } from "@/lib/features";
import { setFields } from "@/lib/frontmatter-edit";
import { libraryTitle } from "@/lib/labels";
import { loadLibrary } from "@/lib/library";
import { splitFrontmatter } from "@/lib/markdown";
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
    tpl?: string;
    tab?: string;
    who?: string;
    store?: string;
    date?: string;
    end?: string;
    photo?: string;
    name?: string;
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

  const sp = await searchParams;
  const { mode, sub, view, q, spend, range, shared } = sp;
  // '이 사진으로 일기 쓰기': 그 날짜로, 그 사진을 넣은 채로
  const photo = typeof sp.photo === "string" && sp.photo.length <= 200 ? sp.photo : undefined;
  const date = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : undefined;
  // 공유한 사진으로 새 여행: 돌아온 날 (가장 늦은 사진 날)
  const end = date && typeof sp.end === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.end) && sp.end > date ? sp.end : undefined;

  // 일기장 단위 화면: 검색·캘린더 (주소: /d/<id>?view=…)
  // 검색·캘린더·모아보기는 기기 사본으로 그린다 (서버는 Drive를 읽지 않는다)
  if (!entry.parent && typeof view === "string" && LOCAL_ROOT_VIEWS.has(view)) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (typeof v === "string") params.set(k, v);
    return <LocalRootView view={view as RootViewName} search={params.toString()} />;
  }
  if (!entry.parent && view === "ask") return <AskView base={index.lib.base} rootId={index.lib.rootId} q={String(q ?? "")} />;

  // 편집·새 글은 Drive가 허락한 경우에만 (게스트도 Drive에서 편집자로 공유받았으면 가능)
  if (mode === "edit" && entry.kind === "file" && entry.can.edit)
    return <EditNote entry={entry} index={index} sharedPhotos={shared === "photos"} insertPhoto={photo} />;
  if (mode === "new" && entry.kind === "folder" && entry.can.addChildren) {
    // sub: 저장할 때 만들 하위 폴더 (오늘 일기 쓰기의 연도 폴더). 이미 있으면 그 폴더로 바로 보낸다
    if (sub !== undefined) {
      if (!/^\d{4}$/.test(sub)) notFound();
      const existing = entry.children.find((c) => c.kind === "folder" && c.name === sub);
      if (existing) {
        const keep = new URLSearchParams({ mode: "new" });
        for (const [k, v] of [["shared", shared], ["date", date], ["end", end], ["photo", photo]] as const) if (v) keep.set(k, v);
        redirect(`${hrefFor(existing)}?${keep}`);
      }
    }
    const tpl = typeof sp.tpl === "string" ? sp.tpl : undefined;
    const given = sub === undefined ? givenNoteName(typeof sp.name === "string" ? sp.name : null) : null;
    return <NewNote folder={entry} index={index} subfolder={sub} shared={shared} date={date} end={end} insertPhoto={photo} tpl={tpl} given={given} />;
  }

  // 첫 화면은 경로 표시 없이 바로 카드
  if (entry.kind === "folder" && !entry.parent) return <Folder folder={entry} index={index} />;

  // 쓰임새(일기·구매·여행·건강·음식)마다 강조색: 이 범위 안의 칩·버튼·링크가 그 색 (globals.css [data-feature])
  const feature = await featureOf(index, entry);
  return (
    <div className="feature-scope" data-feature={feature ?? undefined}>
      {entry.kind === "folder" ? (
        <Folder folder={entry} index={index} spend={spend} range={range} />
      ) : (
        <Note entry={entry} index={index} />
      )}
    </div>
  );
}

/** 맨 위 폴더로 정한 쓰임새 (일기는 이름, 나머지는 템플릿) */
async function featureOf(index: DriveIndex, entry: Entry): Promise<FeatureKey | null> {
  let top: Entry = entry;
  while (top.parent?.parent) top = top.parent;
  if (top.kind !== "folder" || top === index.root) return null;
  if (featureByName(top.name) === "diary") return "diary";
  return await folderKind(index, top);
}

async function Folder({ folder, index, spend, range }: { folder: FolderEntry; index: DriveIndex; spend?: string; range?: string }) {
  if (!folder.parent) return <Home data={await homeData(index)} />;
  const kind = await folderKind(index, folder);
  let top = folder;
  while (top.parent?.parent) top = top.parent;
  const feature = kind ?? (featureByName(top.name) === "diary" ? "diary" : null);
  // 유형이 정해진 폴더: '서식' 버튼으로 _templates/<최상위 폴더>.md 고치기. 유형이 없는 폴더: 새 글에서 유형 고르기
  const templateFile = feature ? ownTemplateFile(index, folder) : null;
  const templates = templatesFolder(index);
  const canMakeTemplate = !!feature && (templates ? templates.can.addChildren : index.root.can.addChildren);
  const choices = !feature && folder.can.addChildren ? templateChoices(await templateFiles(index).catch(() => [])) : null;

  return (
    <>
      <div className="title-row">
        <h1 className="page-title">
          {feature && <FeatureIcon kind={feature} />}
          {folder.name}
        </h1>
        {(folder.can.addChildren || templateFile?.can.edit || canMakeTemplate) && (
          <div className="title-actions">
            {feature && (
              <TemplateButton
                rootId={index.lib.rootId}
                folderId={folder.id}
                existing={templateFile ? { href: hrefFor(templateFile), editable: templateFile.can.edit } : null}
                canCreate={canMakeTemplate}
              />
            )}
            {folder.can.addChildren && <NewFolderButton rootId={index.lib.rootId} folderId={folder.id} />}
            {folder.can.addChildren && <NewNoteMenu href={hrefFor(folder)} choices={choices} />}
          </div>
        )}
      </div>
      {/* 요약은 기기 사본으로 그린다 (서버는 Drive를 읽지 않음) */}
      {kind && <FeatureView kind={kind} folderId={folder.id} spend={spend} range={range} />}
      <FolderView folder={folder} kind={kind} />
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
  // 여행 글이면 지도(들른 곳·사진)와 이 여행의 사진·일기
  const isTrip = (await folderKind(index, entry.parent!)) === "travel";
  return (
    <div className="note-layout">
      <div className="note-main">
        {(edit || rename || trash) && (
          <NoteActions
            rootId={index.lib.rootId}
            fileId={entry.id}
            fileName={entry.name}
            editHref={edit ? `${hrefFor(entry)}?mode=edit` : null}
            canRename={rename}
            canTrash={trash}
            extra={<GraphJump id={entry.id} />}
          />
        )}
        {isTrip && <TripSection index={index} entry={entry} text={text} meta={splitFrontmatter(text).meta as Record<string, unknown>} />}
        <NoteBody
          text={text}
          title={entry.slug}
          links={linkResolver(index, entry.parent!)}
          tagHref={(t) => `${index.lib.base}?view=search&tag=${encodeURIComponent(t)}`}
        />
      </div>
      {/* 이어진 글은 기기 사본으로 (서버는 다른 글을 읽지 않음) */}
      <LocalGraph id={entry.id} />
    </div>
  );
}

async function EditNote({
  entry,
  index,
  sharedPhotos = false,
  insertPhoto,
}: {
  entry: FileEntry;
  index: DriveIndex;
  sharedPhotos?: boolean;
  insertPhoto?: string;
}) {
  // 서식 파일(_templates 안·_template.md)은 {{date}} 같은 자리표시가 있어 입력 폼 대신 원문으로 고친다
  const template = isTemplateFile(entry.name) || (entry.parent?.name === TEMPLATE_FOLDER && entry.parent.parent === index.root);
  let note: { text: string; checksum: string };
  try {
    note = await readNote(index, entry);
  } catch (e) {
    return readProblem(e);
  }
  // 나에 대해(_me/me.md): 저장하면 설정으로 돌아간다
  const aboutMe = entry.parent?.name === ME_FOLDER && entry.parent.parent === index.root;
  // 폼 종류: 폴더 유형 → (유형 없는 폴더) 글 앞머리 모양 (예: 가족 폴더의 건강 글)
  const form: FormKind | null = template ? null : ((await formKindOf(index, entry.parent!)) ?? kindOfTemplate(note.text));
  return (
    <Editor
      key={entry.id}
      mode="edit"
      rootId={index.lib.rootId}
      fileId={entry.id}
      fileName={entry.name}
      checksum={note.checksum}
      places={form === "travel" || form === "food"}
      form={form}
      manageCategories={index.root.can.addChildren}
      sharedPhotos={sharedPhotos}
      insertPhoto={insertPhoto}
      initialText={note.text}
      closeHref={hrefFor(entry)}
      doneHref={aboutMe ? "/settings" : form === "diary" ? index.lib.base : hrefFor(entry.parent!)}
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
  shared,
  date: forDate,
  end,
  insertPhoto,
  tpl,
  given,
}: {
  folder: FolderEntry;
  index: DriveIndex;
  subfolder?: string;
  /** "1": 공유받은 이미지를 영수증으로 · "photos": 공유받은 사진을 글에 */
  shared?: string;
  /** 오늘 대신 이 날짜로 (사진으로 일기·여행 쓰기) */
  date?: string;
  /** 여행의 돌아온 날 (공유한 사진들의 가장 늦은 날) */
  end?: string;
  /** 이미 올린 사진을 글 끝에 넣기 */
  insertPhoto?: string;
  /** 유형이 없는 폴더에서 고른 유형 (_templates/<이름>.md 또는 내장 서식) */
  tpl?: string;
  /** 이 이름으로 (로컬 그래프의 '+ 새 글') */
  given?: string | null;
}) {
  const folderForm = await formKindOf(index, folder);
  let template: string;
  try {
    // 유형이 정해진 폴더는 늘 자기 서식. 유형이 없는 폴더만 고른 유형을 따른다
    const chosen = !folderForm && tpl ? templateTextFor(tpl, await templateFiles(index)) : null;
    template = chosen ?? (await loadTemplate(index, folder));
  } catch (e) {
    return readProblem(e);
  }
  const date = forDate ?? today();
  const kind: FormKind | null = folderForm ?? kindOfTemplate(template);
  return (
    <Editor
      mode="new"
      receipt={kind === "spending"}
      sharedImage={shared === "1" && kind === "spending"}
      sharedPhotos={shared === "photos"}
      sharedPlace={shared === "place" && kind === "food"}
      insertPhoto={insertPhoto}
      places={kind === "travel" || kind === "food"}
      form={kind}
      manageCategories={kind === "spending" && index.root.can.addChildren}
      doneHref={kind === "diary" ? index.lib.base : undefined}
      rootId={index.lib.rootId}
      folderId={folder.id}
      folderName={subfolder ? `${folder.name} / ${subfolder}` : folder.name}
      subfolder={subfolder}
      // 새로 만들 폴더는 비어 있으니 이름이 겹칠 일이 없다
      defaultName={subfolder ? date : freeName(folder, given ?? date)}
      nameGiven={!!given}
      initialText={withEnd(template.replaceAll("{{date}}", date).replaceAll("{{title}}", ""), end)}
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

