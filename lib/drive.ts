import "server-only";
import { createHash } from "node:crypto";
import { API, DriveError, driveFetch, isNotFound, type DriveUser } from "@/lib/google";
import type { LinkResolver, LinkTable } from "@/lib/markdown";

export { DriveError, ReauthError, type DriveUser } from "@/lib/google";

// 일기장(library) = 누군가의 Drive에 있는 my-life 폴더 하나.
// 누가 무엇을 읽고 쓸 수 있는지는 전부 Drive 권한이 정한다: 모든 호출은 로그인한 사람 본인의 토큰으로 하고,
// 앱은 Drive가 알려 주는 capabilities(편집 가능 여부 등)로 버튼을 보여 줄지만 정한다.

const FOLDER_MIME = "application/vnd.google-apps.folder";
const MD_MIME = "text/markdown; charset=UTF-8";
export const LIBRARY_NAME = "my-life";
/** 이 간격마다 Drive 변경 목록으로 바뀐 게 있는지만 확인한다 (싸다) */
const CHECK_MS = 30 * 1000;
/** 변경 목록에 안 잡히는 것(상속 권한 변화 등)에 대비해 이 시간이 지나면 통째로 다시 읽는다 */
const MAX_AGE_MS = 15 * 60 * 1000;

const CAP_FIELDS = "capabilities(canEdit,canAddChildren,canListChildren,canRename,canTrash)";
const ITEM_FIELDS = `id,name,mimeType,modifiedTime,size,inheritedPermissionsDisabled,${CAP_FIELDS}`;

type RawCaps = {
  canEdit?: boolean;
  canAddChildren?: boolean;
  canListChildren?: boolean;
  canRename?: boolean;
  canTrash?: boolean;
};
type RawItem = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  size?: string;
  inheritedPermissionsDisabled?: boolean;
  capabilities?: RawCaps;
};

export type Caps = { edit: boolean; addChildren: boolean; listChildren: boolean; rename: boolean; trash: boolean };
const caps = (c: RawCaps = {}): Caps => ({
  edit: !!c.canEdit,
  addChildren: !!c.canAddChildren,
  listChildren: c.canListChildren !== false,
  rename: !!c.canRename,
  trash: !!c.canTrash,
});

const md5 = (buf: Uint8Array) => createHash("md5").update(buf).digest("hex");
const fileApi = (id: string) => `${API.drive}/files/${encodeURIComponent(id)}`;
const q = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

// ───────────── 일기장 찾기 ─────────────

export type Library = {
  rootId: string;
  name: string;
  ownedByMe: boolean;
  ownerName: string;
  ownerEmail: string;
  /** 소유자이거나 공유 권한이 있으면 게스트를 초대할 수 있다 */
  canShare: boolean;
  /** 이 일기장 안의 페이지 주소 앞부분: /d/<rootId> */
  base: string;
};

export const libraryBase = (rootId: string) => `/d/${encodeURIComponent(rootId)}`;

type RawLibrary = {
  id: string;
  name: string;
  mimeType: string;
  trashed?: boolean;
  ownedByMe?: boolean;
  owners?: { displayName?: string; emailAddress?: string }[];
  capabilities?: { canShare?: boolean };
  modifiedTime?: string;
};
const LIB_FIELDS = "id,name,mimeType,trashed,ownedByMe,modifiedTime,owners(displayName,emailAddress),capabilities(canShare)";

const toLibrary = (f: RawLibrary): Library => ({
  rootId: f.id,
  name: f.name,
  ownedByMe: !!f.ownedByMe,
  ownerName: f.owners?.[0]?.displayName ?? f.owners?.[0]?.emailAddress ?? "",
  ownerEmail: f.owners?.[0]?.emailAddress ?? "",
  canShare: !!f.capabilities?.canShare,
  base: libraryBase(f.id),
});

/** 이 사람이 열 수 있는 폴더면 일기장 정보, 아니면 null (Drive가 판단) */
export async function openLibrary(user: DriveUser, rootId: string): Promise<Library | null> {
  try {
    const res = await driveFetch(user, `${fileApi(rootId)}?fields=${LIB_FIELDS}`);
    const f = (await res.json()) as RawLibrary;
    return f.mimeType === FOLDER_MIME && !f.trashed ? toLibrary(f) : null;
  } catch (e) {
    if (isNotFound(e) || (e instanceof DriveError && e.status === 400)) return null;
    throw e;
  }
}

async function searchFolders(user: DriveUser, query: string): Promise<Library[]> {
  const params = new URLSearchParams({ q: query, fields: `files(${LIB_FIELDS})`, pageSize: "50", orderBy: "modifiedTime desc" });
  const res = await driveFetch(user, `${API.drive}/files?${params}`);
  return ((await res.json()) as { files: RawLibrary[] }).files.map(toLibrary);
}

/** 내 Drive에 있는 my-life 폴더들 */
export const findMyLibraries = (user: DriveUser) =>
  searchFolders(user, `name = '${LIBRARY_NAME}' and mimeType = '${FOLDER_MIME}' and 'me' in owners and trashed = false`);

/** 나에게 공유된 my-life 폴더들 (Drive 공유 = 초대) */
export const sharedLibraries = (user: DriveUser) =>
  searchFolders(user, `sharedWithMe = true and name = '${LIBRARY_NAME}' and mimeType = '${FOLDER_MIME}' and trashed = false`);

/** 내 Drive 맨 위에 my-life 폴더를 만든다 */
export async function createMyLibrary(user: DriveUser): Promise<string> {
  const res = await driveFetch(user, `${API.drive}/files?fields=id`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: LIBRARY_NAME, mimeType: FOLDER_MIME }),
  });
  return ((await res.json()) as { id: string }).id;
}

// ───────────── 인덱스 ─────────────

type BaseEntry = {
  id: string;
  name: string;
  /** URL 경로 조각. .md 확장자는 떼고, 같은 폴더에 이름이 겹치면 id 일부를 붙인다 */
  slug: string;
  slugPath: string[];
  modifiedTime: string;
  parent: FolderEntry | null;
  lib: Library;
  /** 이 사람이 이 항목에 대해 할 수 있는 일 (Drive capabilities) */
  can: Caps;
};
export type FolderEntry = BaseEntry & {
  kind: "folder";
  children: Entry[];
  /** Drive '접근 제한'(상위 공유를 상속하지 않음)이 켜진 폴더 */
  restricted: boolean;
  /** 예전 앱 규칙의 .private 표시 파일이 남아 있는 폴더 (Drive 제한으로 옮기라고 안내) */
  legacyPrivate: boolean;
};
export type FileEntry = BaseEntry & { kind: "file"; mimeType: string; size: number; isMarkdown: boolean };
export type Entry = FolderEntry | FileEntry;

export type DriveIndex = {
  lib: Library;
  user: DriveUser;
  root: FolderEntry;
  byId: Map<string, Entry>;
  builtAt: number;
  /** 마지막으로 Drive 변경 목록을 확인한 시각과 그 위치(page token) */
  checkedAt: number;
  changeToken: string | null;
};

const isHidden = (name: string) => name.startsWith(".");
const isLegacyPrivateMarker = (item: RawItem) => item.mimeType !== FOLDER_MIME && /^\.private(\.|$)/i.test(item.name);
const isMarkdownName = (name: string) => name.toLowerCase().endsWith(".md");

async function listChildren(user: DriveUser, folderId: string): Promise<RawItem[]> {
  const items: RawItem[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      q: `'${q(folderId)}' in parents and trashed = false`,
      fields: `nextPageToken, files(${ITEM_FIELDS})`,
      pageSize: "1000",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const res = await driveFetch(user, `${API.drive}/files?${params}`);
    const json = (await res.json()) as { files: RawItem[]; nextPageToken?: string };
    items.push(...json.files);
    pageToken = json.nextPageToken;
  } while (pageToken);
  return items;
}

function assignSlugs(folder: FolderEntry) {
  const seen = new Map<string, number>();
  for (const child of folder.children) {
    const key = child.slug.toLowerCase();
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  for (const child of folder.children) {
    if ((seen.get(child.slug.toLowerCase()) ?? 0) > 1) child.slug = `${child.slug}~${child.id.slice(-6)}`;
    child.slugPath = [...folder.slugPath, child.slug];
  }
}

/** 폴더 먼저. 숫자로 시작하는 이름(연도·날짜)은 최신이 위로, 나머지는 가나다순 */
function compareEntries(a: Entry, b: Entry): number {
  if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
  const aDated = /^\d/.test(a.name);
  const bDated = /^\d/.test(b.name);
  if (aDated !== bDated) return aDated ? -1 : 1;
  return aDated ? b.name.localeCompare(a.name, "ko") : a.name.localeCompare(b.name, "ko");
}

async function startPageToken(user: DriveUser): Promise<string | null> {
  try {
    const res = await driveFetch(user, `${API.drive}/changes/startPageToken?fields=startPageToken`);
    return ((await res.json()) as { startPageToken: string }).startPageToken;
  } catch (e) {
    console.error("[drive] startPageToken", e);
    return null; // 없으면 예전처럼 시간이 지나면 통째로 다시 읽는다
  }
}

async function buildIndex(user: DriveUser, lib: Library): Promise<DriveIndex> {
  // 목록을 읽기 '전'의 위치를 기억해야, 읽는 도중 바뀐 것도 다음 확인 때 잡힌다
  const changeToken = await startPageToken(user);
  const rootMeta = (await (
    await driveFetch(user, `${fileApi(lib.rootId)}?fields=${ITEM_FIELDS}`)
  ).json()) as RawItem;
  const root: FolderEntry = {
    kind: "folder",
    id: lib.rootId,
    name: lib.name,
    slug: "",
    slugPath: [],
    modifiedTime: rootMeta.modifiedTime,
    parent: null,
    lib,
    can: caps(rootMeta.capabilities),
    restricted: false,
    legacyPrivate: false,
    children: [],
  };
  const byId = new Map<string, Entry>([[root.id, root]]);

  // 폴더 단위 너비우선 탐색. 목록을 볼 수 없는 폴더(접근 제한)는 들어가지 않는다
  let level: FolderEntry[] = [root];
  while (level.length) {
    const lists = await Promise.all(level.map((f) => listChildren(user, f.id)));
    const next: FolderEntry[] = [];
    level.forEach((folder, i) => {
      folder.legacyPrivate = lists[i].some(isLegacyPrivateMarker);
      for (const item of lists[i]) {
        if (isHidden(item.name)) continue;
        const base = {
          id: item.id,
          name: item.name,
          modifiedTime: item.modifiedTime,
          parent: folder,
          slugPath: [],
          lib,
          can: caps(item.capabilities),
        };
        let entry: Entry;
        if (item.mimeType === FOLDER_MIME) {
          entry = {
            ...base,
            kind: "folder",
            slug: item.name,
            children: [],
            restricted: !!item.inheritedPermissionsDisabled,
            legacyPrivate: false,
          };
          if (entry.can.listChildren) next.push(entry);
        } else {
          const md = isMarkdownName(item.name);
          entry = {
            ...base,
            kind: "file",
            slug: md ? item.name.slice(0, -3) : item.name,
            mimeType: item.mimeType,
            size: Number(item.size ?? 0),
            isMarkdown: md,
          };
        }
        folder.children.push(entry);
        byId.set(entry.id, entry);
      }
      folder.children.sort(compareEntries);
      assignSlugs(folder);
    });
    level = next;
  }

  const now = Date.now();
  return { lib, user, root, byId, builtAt: now, checkedAt: now, changeToken };
}

type RawChange = { fileId: string; removed?: boolean; file?: RawItem & { trashed?: boolean; parents?: string[] } };

const sameCaps = (a: Caps, b: Caps) =>
  a.edit === b.edit && a.addChildren === b.addChildren && a.listChildren === b.listChildren && a.rename === b.rename && a.trash === b.trash;

/**
 * 마지막 확인 이후 Drive 변경 목록을 훑는다.
 * - 이 일기장과 상관없는 변경만 있으면 그대로 쓴다
 * - 글 내용만 바뀐 경우(수정 시각·크기)는 그 자리에서 고친다
 * - 새 파일·이름 변경·이동·삭제·권한 변화처럼 구조가 바뀌면 false → 통째로 다시 읽기
 */
async function catchUp(index: DriveIndex): Promise<boolean> {
  if (!index.changeToken) return false;
  const changes: RawChange[] = [];
  let pageToken: string | undefined = index.changeToken;
  let newToken = index.changeToken;
  while (pageToken) {
    const params = new URLSearchParams({
      pageToken,
      pageSize: "1000",
      includeRemoved: "true",
      fields: `nextPageToken,newStartPageToken,changes(fileId,removed,file(${ITEM_FIELDS},trashed,parents))`,
    });
    const res = await driveFetch(index.user, `${API.drive}/changes?${params}`);
    const json = (await res.json()) as { changes: RawChange[]; nextPageToken?: string; newStartPageToken?: string };
    changes.push(...json.changes);
    pageToken = json.nextPageToken;
    if (json.newStartPageToken) newToken = json.newStartPageToken;
  }

  const patches: (() => void)[] = [];
  for (const c of changes) {
    const known = index.byId.get(c.fileId);
    const intoKnownFolder = c.file?.parents?.some((p) => index.byId.get(p)?.kind === "folder");
    if (!known && !intoKnownFolder) continue; // 이 일기장과 상관없음
    if (!known || c.removed || !c.file || c.file.trashed) return false;
    if (c.file.name !== known.name) return false;
    if (known.parent && !c.file.parents?.includes(known.parent.id)) return false;
    const can = caps(c.file.capabilities);
    if (known.kind === "folder") {
      // 폴더 권한·접근 제한이 바뀌면 하위 전체가 달라질 수 있다
      if (!sameCaps(known.can, can) || !!c.file.inheritedPermissionsDisabled !== known.restricted) return false;
      continue;
    }
    const file = c.file;
    patches.push(() => {
      known.modifiedTime = file.modifiedTime;
      known.can = can;
      if (known.kind === "file") known.size = Number(file.size ?? known.size);
    });
  }
  for (const patch of patches) patch();
  index.changeToken = newToken;
  index.checkedAt = Date.now();
  return true;
}

// 사람마다·일기장마다 따로 캐시한다. 같은 폴더라도 사람마다 Drive 권한이 달라 보이는 내용이 다르기 때문
const indexes = new Map<string, { index?: DriveIndex; building?: Promise<DriveIndex>; checking?: Promise<boolean> }>();
const cacheKey = (user: DriveUser, rootId: string) => `${user.email.toLowerCase()}\n${rootId}`;
const MAX_CACHED = 100;

export async function getIndex(user: DriveUser, lib: Library, options: { fresh?: boolean } = {}): Promise<DriveIndex> {
  const key = cacheKey(user, lib.rootId);
  const slot = indexes.get(key) ?? {};
  const cached = slot.index;
  if (!options.fresh && cached && !slot.building) {
    const now = Date.now();
    if (now - cached.checkedAt < CHECK_MS) return cached;
    if (now - cached.builtAt < MAX_AGE_MS) {
      // 동시에 여러 요청이 와도 변경 확인은 한 번만
      slot.checking ??= catchUp(cached)
        .catch((e) => {
          console.error("[drive] changes", e);
          return false;
        })
        .finally(() => (slot.checking = undefined));
      if (await slot.checking) return cached;
    }
  }
  slot.building ??= buildIndex(user, lib)
    .then((idx) => {
      slot.index = idx;
      return idx;
    })
    .finally(() => (slot.building = undefined));
  indexes.delete(key); // 최근 쓴 것이 뒤로 가게 (오래된 것부터 지운다)
  indexes.set(key, slot);
  if (indexes.size > MAX_CACHED) indexes.delete(indexes.keys().next().value!);
  return slot.building;
}

/** 쓰기 직후: 이 사람의 이 일기장 목록을 다음에 다시 읽게 한다 */
export function invalidateIndex(index: { user: DriveUser; lib: Library }) {
  indexes.delete(cacheKey(index.user, index.lib.rootId));
}

export function resolveSlugPath(index: DriveIndex, slugs: string[]): Entry | null {
  let current: Entry = index.root;
  for (const slug of slugs) {
    if (current.kind !== "folder") return null;
    const next: Entry | undefined = current.children.find((c) => c.slug === slug);
    if (!next) return null;
    current = next;
  }
  return current;
}

// ───────────── 링크·첨부 ─────────────

/**
 * 옵시디언식 첨부 찾기: 노트가 있는 폴더부터 위로 올라가며
 * 같은 폴더 → 그 폴더의 attachments 하위 폴더 순서로 이름을 찾는다.
 */
export function findAttachment(from: FolderEntry, name: string): FileEntry | null {
  const target = name.toLowerCase();
  const match = (folder: FolderEntry) =>
    folder.children.find((c): c is FileEntry => c.kind === "file" && c.name.toLowerCase() === target);
  for (let folder: FolderEntry | null = from; folder; folder = folder.parent) {
    const direct = match(folder);
    if (direct) return direct;
    for (const child of folder.children) {
      if (child.kind === "folder" && child.name.toLowerCase() === "attachments") {
        const found = match(child);
        if (found) return found;
      }
    }
  }
  return null;
}

/** [[노트 이름]] 링크용: 이름(확장자 제외)이 같은 첫 번째 md 파일 */
export function findNoteByName(index: DriveIndex, name: string): FileEntry | null {
  const target = name.toLowerCase().replace(/\.md$/, "");
  for (const entry of index.byId.values()) {
    if (entry.kind === "file" && entry.isMarkdown && entry.slug.toLowerCase() === target) return entry;
  }
  return null;
}

/** 첨부 주소에 일기장 id를 넣어, 서버가 그 사람의 그 일기장 안에 있는 파일인지 확인할 수 있게 한다 */
export const fileUrl = (file: FileEntry) =>
  `/api/file/${encodeURIComponent(file.lib.rootId)}/${encodeURIComponent(file.id)}`;

export function linkResolver(index: DriveIndex, folder: FolderEntry): LinkResolver {
  return {
    attachment(name) {
      const file = findAttachment(folder, name);
      return file && !file.isMarkdown ? fileUrl(file) : null;
    },
    note(name) {
      const note = findNoteByName(index, name);
      return note ? hrefFor(note) : null;
    },
  };
}

/** 편집기 미리보기용: 이 폴더에서 보이는 첨부와 전체 노트 링크를 표로 만들어 넘긴다 */
export function linkTable(index: DriveIndex, folder: FolderEntry): LinkTable {
  const attachments: Record<string, string> = {};
  const add = (f: FolderEntry) => {
    for (const c of f.children) {
      if (c.kind === "file" && !c.isMarkdown) attachments[c.name.toLowerCase()] ??= fileUrl(c);
    }
  };
  // findAttachment와 같은 순서: 가까운 폴더가 우선
  for (let f: FolderEntry | null = folder; f; f = f.parent) {
    add(f);
    for (const c of f.children) if (c.kind === "folder" && c.name.toLowerCase() === "attachments") add(c);
  }
  const notes: Record<string, string> = {};
  for (const e of index.byId.values()) {
    if (e.kind === "file" && e.isMarkdown) notes[e.slug.toLowerCase()] ??= hrefFor(e);
  }
  return { attachments, notes };
}

// ───────────── 읽기 ─────────────

export function downloadFile(index: DriveIndex, file: FileEntry): Promise<Response> {
  return driveFetch(index.user, `${fileApi(file.id)}?alt=media`);
}

export async function readNote(index: DriveIndex, file: FileEntry): Promise<{ text: string; checksum: string }> {
  const res = await downloadFile(index, file);
  const buf = new Uint8Array(await res.arrayBuffer());
  const text = new TextDecoder().decode(buf);
  rememberText(index, file, text);
  return { text, checksum: md5(buf) };
}

// ───────────── 글 내용 기억 (검색용) ─────────────
// 검색할 때마다 모든 글을 내려받지 않도록 잠깐 기억한다. 사람별로 따로 두고(권한이 다를 수 있음),
// 수정 시각이 바뀌면 다시 읽는다. 서버 인스턴스 메모리에만 있고 디스크·DB에는 남지 않는다.

const texts = new Map<string, { modifiedTime: string; text: string }>();
let textChars = 0;
const MAX_TEXT_CHARS = 40_000_000;
const textKey = (index: DriveIndex, file: FileEntry) => `${index.user.email.toLowerCase()}\n${file.id}`;

function rememberText(index: DriveIndex, file: FileEntry, text: string) {
  const key = textKey(index, file);
  const old = texts.get(key);
  if (old) textChars -= old.text.length;
  texts.delete(key);
  texts.set(key, { modifiedTime: file.modifiedTime, text });
  textChars += text.length;
  // 오래 안 쓴 것부터 버린다
  for (const [k, v] of texts) {
    if (textChars <= MAX_TEXT_CHARS) break;
    texts.delete(k);
    textChars -= v.text.length;
  }
}

/** 기억해 둔 최신 내용 (수정 시각이 다르면 없음) */
export function cachedText(index: DriveIndex, file: FileEntry): string | null {
  const hit = texts.get(textKey(index, file));
  return hit && hit.modifiedTime === file.modifiedTime ? hit.text : null;
}

/** Drive 본문 검색 (단어 전체가 맞아야 찾음). 이 일기장 안의 md 파일 id만 돌려준다 */
export async function driveFullText(index: DriveIndex, term: string): Promise<Set<string>> {
  const params = new URLSearchParams({
    q: `fullText contains '${q(term)}' and trashed = false and mimeType != '${FOLDER_MIME}'`,
    fields: "files(id)",
    pageSize: "200",
  });
  const res = await driveFetch(index.user, `${API.drive}/files?${params}`);
  const ids = ((await res.json()) as { files: { id: string }[] }).files.map((f) => f.id);
  return new Set(ids.filter((id) => index.byId.get(id)?.kind === "file"));
}

// ───────────── 쓰기 (Drive가 권한을 확인한다) ─────────────

export async function fileChecksum(index: DriveIndex, file: FileEntry): Promise<string> {
  const res = await driveFetch(index.user, `${fileApi(file.id)}?fields=md5Checksum`);
  return ((await res.json()) as { md5Checksum: string }).md5Checksum;
}

export async function updateFile(index: DriveIndex, file: FileEntry, text: string): Promise<string> {
  texts.delete(textKey(index, file));
  const res = await driveFetch(index.user, `${API.upload}/files/${encodeURIComponent(file.id)}?uploadType=media&fields=md5Checksum`, {
    method: "PATCH",
    headers: { "Content-Type": MD_MIME },
    body: text,
  });
  return ((await res.json()) as { md5Checksum: string }).md5Checksum;
}

async function createRaw(user: DriveUser, parentId: string, name: string, content: string | Uint8Array, mimeType: string) {
  const boundary = `my-life-${crypto.randomUUID()}`;
  const meta = JSON.stringify({ name, parents: [parentId], mimeType });
  const contentType = mimeType === "text/markdown" ? MD_MIME : mimeType;
  // 이미지 같은 바이너리도 그대로 넣을 수 있게 Blob으로 이어 붙인다
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n` +
      `--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`,
    content as BlobPart,
    `\r\n--${boundary}--`,
  ]);
  const res = await driveFetch(user, `${API.upload}/files?uploadType=multipart&fields=id`, {
    method: "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  return ((await res.json()) as { id: string }).id;
}

async function patchMeta(user: DriveUser, id: string, body: Record<string, unknown>) {
  await driveFetch(user, `${fileApi(id)}?fields=id`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export const createFile = (index: DriveIndex, folder: FolderEntry, name: string, text: string) =>
  createRaw(index.user, folder.id, name, text, "text/markdown");

export async function createFolder(index: DriveIndex, parent: FolderEntry, name: string): Promise<string> {
  const res = await driveFetch(index.user, `${API.drive}/files?fields=id`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, parents: [parent.id], mimeType: FOLDER_MIME }),
  });
  return ((await res.json()) as { id: string }).id;
}

export async function renameFile(index: DriveIndex, file: FileEntry, name: string): Promise<string> {
  await patchMeta(index.user, file.id, { name });
  return file.id;
}

export const trashFile = (index: DriveIndex, file: FileEntry) => patchMeta(index.user, file.id, { trashed: true });

/** Drive '접근 제한': 켜면 상위 폴더 공유가 이 폴더로 이어지지 않는다 (게스트에게 숨김) */
export const setRestricted = (index: DriveIndex, folder: FolderEntry, on: boolean) =>
  patchMeta(index.user, folder.id, { inheritedPermissionsDisabled: on });

/** 파일 이름 검사. 문제가 있으면 오류 메시지, 없으면 .md를 붙인 이름 */
export function checkNoteName(raw: string, folder: FolderEntry, self?: FileEntry): { name: string } | { error: string } {
  const base = raw.trim().replace(/\.md$/i, "").trim();
  if (!base) return { error: "파일 이름을 입력하세요." };
  if (base.length > 120) return { error: "파일 이름이 너무 깁니다." };
  if (/[\/\\\x00-\x1f]/.test(base) || base.startsWith(".")) return { error: "파일 이름에 / \\ 나 맨 앞 . 은 쓸 수 없습니다." };
  const name = `${base}.md`;
  const taken = folder.children.some((c) => c !== self && c.name.toLowerCase() === name.toLowerCase());
  return taken ? { error: `이 폴더에 '${name}' 파일이 이미 있습니다.` } : { name };
}

// ───────────── 첨부 업로드 ─────────────

const ATTACHMENTS = "attachments";

/**
 * 노트 폴더에서 올라가며 가장 가까운 attachments 폴더를 찾는다 (findAttachment가 찾는 순서와 같음).
 * 없으면 최상위 분류 폴더(예: daily) 아래에 만든다.
 */
export async function attachmentFolderFor(index: DriveIndex, folder: FolderEntry): Promise<FolderEntry> {
  const find = (f: FolderEntry) =>
    f.children.find((c): c is FolderEntry => c.kind === "folder" && c.name.toLowerCase() === ATTACHMENTS);
  for (let f: FolderEntry | null = folder; f; f = f.parent) {
    if (f.name.toLowerCase() === ATTACHMENTS) return f;
    const found = find(f);
    if (found) return found;
  }
  let top = folder;
  while (top.parent && top.parent !== index.root) top = top.parent;
  const id = await createFolder(index, top, ATTACHMENTS);
  return {
    ...top,
    id,
    name: ATTACHMENTS,
    parent: top,
    children: [],
    slug: ATTACHMENTS,
    slugPath: [...top.slugPath, ATTACHMENTS],
    restricted: false,
    legacyPrivate: false,
  };
}

/** 폴더 안에서 겹치지 않는 이름: "이름.jpg" → "이름-2.jpg" … */
export function uniqueName(folder: FolderEntry, base: string, ext: string): string {
  const taken = new Set(folder.children.map((c) => c.name.toLowerCase()));
  for (let i = 1; ; i++) {
    const name = `${i === 1 ? base : `${base}-${i}`}${ext}`;
    if (!taken.has(name.toLowerCase())) return name;
  }
}

/**
 * 업로드 후 캐시된 인덱스에 바로 끼워 넣는다. 사진 여러 장을 연달아 올릴 때마다
 * Drive 전체를 다시 훑지 않도록. (새로 만든 폴더라 인덱스에 없으면 그냥 무효화)
 */
export async function uploadFile(index: DriveIndex, folder: FolderEntry, name: string, bytes: Uint8Array, mimeType: string) {
  const id = await createRaw(index.user, folder.id, name, bytes, mimeType);
  const cachedFolder = index.byId.get(folder.id);
  if (indexes.get(cacheKey(index.user, index.lib.rootId))?.index === index && cachedFolder?.kind === "folder") {
    const entry: FileEntry = {
      kind: "file",
      id,
      name,
      slug: name,
      slugPath: [...cachedFolder.slugPath, name],
      modifiedTime: new Date().toISOString(),
      parent: cachedFolder,
      lib: index.lib,
      can: { ...cachedFolder.can, addChildren: false, listChildren: false },
      mimeType,
      size: bytes.length,
      isMarkdown: false,
    };
    cachedFolder.children.push(entry);
    index.byId.set(id, entry);
  } else {
    invalidateIndex(index);
  }
  return id;
}

// ───────────── 공유 (Drive 공유 = 초대) ─────────────

export type Share = { id: string; email: string; name: string; role: "reader" | "commenter" | "writer" | "owner" | string };

export async function listShares(index: DriveIndex): Promise<Share[]> {
  const res = await driveFetch(
    index.user,
    `${fileApi(index.lib.rootId)}/permissions?fields=permissions(id,type,role,emailAddress,displayName,deleted)`,
  );
  const { permissions } = (await res.json()) as {
    permissions: { id: string; type: string; role: string; emailAddress?: string; displayName?: string; deleted?: boolean }[];
  };
  return permissions
    .filter((p) => p.type === "user" && p.role !== "owner" && !p.deleted)
    .map((p) => ({ id: p.id, email: p.emailAddress ?? "", name: p.displayName ?? "", role: p.role }));
}

/** 일기장 폴더를 이 사람과 공유한다. Drive가 초대 메일(앱 주소 포함)을 보낸다 */
export async function addShare(index: DriveIndex, email: string, role: "reader" | "writer", message: string) {
  const params = new URLSearchParams({ sendNotificationEmail: "true", emailMessage: message, fields: "id" });
  await driveFetch(index.user, `${fileApi(index.lib.rootId)}/permissions?${params}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "user", role, emailAddress: email }),
  });
}

export async function removeShare(index: DriveIndex, permissionId: string) {
  await driveFetch(index.user, `${fileApi(index.lib.rootId)}/permissions/${encodeURIComponent(permissionId)}`, {
    method: "DELETE",
  });
}

// ───────────── 템플릿 ─────────────

const TEMPLATE_FOLDER = "_templates";

export const DEFAULT_TEMPLATE = `---
date: {{date}}
written: {{date}}
title: ""
tags: []
---

# {{title}}

`;

/** 지출 기록: 영수증 한 장 = 글 하나. amount가 있으면 지출 요약·영수증 자동 입력이 켜진다 */
export const PURCHASE_TEMPLATE = `---
date: {{date}}
store: ""            # 가게·쇼핑몰 이름
amount: 0            # 총액, 원 단위 숫자만 (쉼표 없이). 환불은 음수
category: 식비        # 식비 · 외식 · 생활용품 · 의류 · 의료 · 교육 · 교통 · 문화/여가 · 경조사 · 기타
payment: ""          # 신한카드, 현금, 네이버페이 …
items:               # 선택: 품목별로 적고 싶을 때만
  - name: ""
    price: 0
tags: []
---

# {{title}}

메모:
`;

/** 여행 한 번 = 글 하나. places에 좌표가 있으면 지도에 나온다 (편집기의 '장소 추가'로 채우기) */
export const TRAVEL_TEMPLATE = `---
title: ""
start: {{date}}      # 출발일
end: {{date}}        # 돌아온 날
places:              # 들른 곳 (지도에 표시). 편집기의 '장소 추가'로 넣으면 좌표까지 채워짐
companions: []       # 함께 간 사람
tags: []
---

# {{title}}

## 1일차

`;

/** 하루 = 글 하나. 숫자 항목은 자동으로 그래프가 된다 (항목을 새로 추가해도 됨) */
export const HEALTH_TEMPLATE = `---
date: {{date}}
weight:              # 체중 kg
sleep:               # 수면 시간
steps:               # 걸음 수
bp_sys:              # 혈압 수축기
bp_dia:              # 혈압 이완기
condition:           # 컨디션 1~5
exercise: ""         # 운동 (예: 걷기 30분)
---

메모:
`;

/** Drive에 템플릿이 없을 때 최상위 폴더 이름별 내장 템플릿 */
const BUILTIN_TEMPLATES: Record<string, string> = {
  purchase: PURCHASE_TEMPLATE,
  travel: TRAVEL_TEMPLATE,
  health: HEALTH_TEMPLATE,
};

const topFolderOf = (index: DriveIndex, folder: FolderEntry) => {
  let top: FolderEntry = folder;
  while (top.parent && top.parent !== index.root) top = top.parent;
  return top;
};

/** _templates/<최상위 폴더 이름>.md → _templates/default.md → 내장 기본값 */
export async function loadTemplate(index: DriveIndex, folder: FolderEntry): Promise<string> {
  const top = topFolderOf(index, folder);
  const builtin = (top !== index.root && BUILTIN_TEMPLATES[top.name.toLowerCase()]) || DEFAULT_TEMPLATE;
  const templates = index.root.children.find(
    (c): c is FolderEntry => c.kind === "folder" && c.name === TEMPLATE_FOLDER,
  );
  if (!templates) return builtin;
  const pick = (name: string) =>
    templates.children.find((c): c is FileEntry => c.kind === "file" && c.name.toLowerCase() === name.toLowerCase());
  const own = top !== index.root ? pick(`${top.name}.md`) : undefined;
  if (own) return (await readNote(index, own)).text;
  // 폴더 전용 내장 템플릿이 있으면 default.md보다 우선
  if (builtin !== DEFAULT_TEMPLATE) return builtin;
  const fallback = pick("default.md");
  return fallback ? (await readNote(index, fallback)).text : DEFAULT_TEMPLATE;
}

export type FolderKind = "spending" | "travel" | "health";

/**
 * 템플릿 모양으로 폴더 종류를 정한다 (폴더 이름이 아니라 템플릿 기준이라, 이름을 바꿔도 템플릿만 맞추면 된다)
 *  amount: → 지출 · places: → 여행 · weight/sleep/steps: → 건강
 */
export async function folderKind(index: DriveIndex, folder: FolderEntry): Promise<FolderKind | null> {
  if (folder === index.root) return null;
  try {
    const t = await loadTemplate(index, folder);
    if (/^amount:/m.test(t)) return "spending";
    if (/^places:/m.test(t)) return "travel";
    if (/^(weight|sleep|steps):/m.test(t)) return "health";
  } catch {}
  return null;
}

export const isSpendingFolder = async (index: DriveIndex, folder: FolderEntry) =>
  (await folderKind(index, folder)) === "spending";

// ───────────── 앱 설정 파일 (내 일기장의 _settings) ─────────────
// _로 시작해 목록에 안 보인다. 비밀값은 넣기 전에 암호화한다 (lib/ai-settings.ts) — 공유받은 사람이 열어도 읽을 수 없게.

const SETTINGS_FOLDER = "_settings";

export async function readSettingsJson<T>(index: DriveIndex, name: string): Promise<T | null> {
  const folder = index.root.children.find(
    (c): c is FolderEntry => c.kind === "folder" && c.name === SETTINGS_FOLDER,
  );
  const file = folder?.children.find((c): c is FileEntry => c.kind === "file" && c.name === name);
  if (!file) return null;
  try {
    return JSON.parse((await readNote(index, file)).text) as T;
  } catch {
    return null;
  }
}

export async function writeSettingsJson(index: DriveIndex, name: string, data: unknown): Promise<void> {
  const text = JSON.stringify(data, null, 2) + "\n";
  const fresh = await getIndex(index.user, index.lib, { fresh: true });
  let folder = fresh.root.children.find((c): c is FolderEntry => c.kind === "folder" && c.name === SETTINGS_FOLDER);
  if (!folder) {
    const id = await createFolder(fresh, fresh.root, SETTINGS_FOLDER);
    folder = { ...fresh.root, id, name: SETTINGS_FOLDER, parent: fresh.root, children: [] };
  }
  const file = folder.children.find((c): c is FileEntry => c.kind === "file" && c.name === name);
  if (file) await updateFile(fresh, file, text);
  else await createRaw(fresh.user, folder.id, name, text, "application/json");
  invalidateIndex(fresh);
}

// ───────────── 주소·목록 ─────────────

export function webUrlFor(entry: Entry): string {
  return entry.kind === "folder"
    ? `https://drive.google.com/drive/folders/${entry.id}`
    : `https://drive.google.com/file/d/${entry.id}/view`;
}

export function hrefFor(entry: Entry): string {
  return [entry.lib.base, ...entry.slugPath.map(encodeURIComponent)].join("/");
}

/** attachments(이미지 보관)와 _로 시작하는 앱 내부 폴더(_templates)는 목록에서 숨긴다 */
export function isListable(entry: Entry): boolean {
  if (entry.kind === "folder")
    return entry.name.toLowerCase() !== "attachments" && !entry.name.startsWith("_") && entry.can.listChildren;
  return entry.isMarkdown;
}

/** 목록에 보여 줄 하위 항목. 열 수 없는 폴더(Drive 접근 제한)는 빠진다 */
export function visibleChildren(folder: FolderEntry): Entry[] {
  return folder.children.filter(isListable);
}

export type TreeNode = { name: string; href: string; restricted: boolean; children: TreeNode[] };

/** 사이드바용: 폴더만, 클라이언트로 넘길 수 있는 순수 객체 */
export function folderTree(folder: FolderEntry): TreeNode[] {
  return visibleChildren(folder)
    .filter((c): c is FolderEntry => c.kind === "folder")
    .map((c) => ({ name: c.name, href: hrefFor(c), restricted: c.restricted, children: folderTree(c) }));
}

/** 설정 화면용: 최상위 폴더 + 더 깊은 곳에서 접근 제한이 켜졌거나 .private 표시가 남은 폴더 */
export function sharingFolders(index: DriveIndex): FolderEntry[] {
  const out: FolderEntry[] = [];
  const walk = (f: FolderEntry, depth: number) => {
    for (const c of f.children) {
      if (c.kind !== "folder" || c.name.startsWith("_") || c.name.toLowerCase() === "attachments") continue;
      if (depth === 0 || c.restricted || c.legacyPrivate) out.push(c);
      walk(c, depth + 1);
    }
  };
  walk(index.root, 0);
  return out;
}
