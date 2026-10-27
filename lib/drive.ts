import "server-only";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Role } from "@/lib/access";
import type { LinkResolver, LinkTable } from "@/lib/markdown";

const FOLDER_MIME = "application/vnd.google-apps.folder";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const MD_MIME = "text/markdown; charset=UTF-8";
const INDEX_TTL_MS = 2 * 60 * 1000;

export class DriveError extends Error {}

type RawItem = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  size?: string;
};

/** 저장소 추상화: 운영은 Google Drive, 로컬 개발은 디스크 폴더 */
interface Source {
  rootId: string;
  list(folderId: string): Promise<RawItem[]>;
  download(fileId: string): Promise<Response>;
  /** 현재 내용의 md5 (충돌 감지용) */
  checksum(fileId: string): Promise<string>;
  /** 내용 교체 후 새 md5 반환 */
  update(fileId: string, text: string): Promise<string>;
  /** 새 파일 id 반환 */
  create(parentId: string, name: string, content: string | Uint8Array, mimeType: string): Promise<string>;
  createFolder(parentId: string, name: string): Promise<string>;
  /** 바뀐 id 반환 (Drive는 그대로, 로컬은 경로가 바뀜) */
  rename(fileId: string, name: string): Promise<string>;
  trash(fileId: string): Promise<void>;
  webUrl(item: { id: string; isFolder: boolean }): string | null;
}

// ───────────── Google Drive ─────────────

let token: { value: string; expiresAt: number } | null = null;

/** 붙여넣다 딸려 온 공백·줄바꿈 제거 */
const env = (name: string) => process.env[name]?.trim() || undefined;

const TOKEN_HINTS: Record<string, string> = {
  invalid_grant:
    "refresh token이 만료·취소되었거나 다른 OAuth 클라이언트로 발급된 토큰입니다. OAuth Playground에서 'Use your own OAuth credentials'를 켜고 다시 발급하세요. (앱이 '테스트' 상태면 7일마다 만료됩니다)",
  unauthorized_client:
    "refresh token을 발급한 클라이언트와 AUTH_GOOGLE_ID가 다릅니다. OAuth Playground에서 내 클라이언트 ID/보안 비밀번호로 다시 발급하세요.",
  invalid_client: "AUTH_GOOGLE_ID 또는 AUTH_GOOGLE_SECRET 값이 잘못되었습니다.",
};

async function accessToken(): Promise<string> {
  if (token && token.expiresAt > Date.now() + 60_000) return token.value;

  const clientId = env("AUTH_GOOGLE_ID");
  const clientSecret = env("AUTH_GOOGLE_SECRET");
  const refreshToken = env("GOOGLE_DRIVE_REFRESH_TOKEN");
  const missing = [
    !clientId && "AUTH_GOOGLE_ID",
    !clientSecret && "AUTH_GOOGLE_SECRET",
    !refreshToken && "GOOGLE_DRIVE_REFRESH_TOKEN",
  ].filter(Boolean);
  if (missing.length) throw new DriveError(`환경변수가 비어 있습니다: ${missing.join(", ")}`);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      client_id: clientId!,
      client_secret: clientSecret!,
      refresh_token: refreshToken!,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    const { error } = (await res.json().catch(() => ({}))) as { error?: string };
    const hint = (error && TOKEN_HINTS[error]) ?? "";
    throw new DriveError(`Drive 토큰 갱신 실패 (${res.status}${error ? `, ${error}` : ""}). ${hint}`.trim());
  }
  const json = (await res.json()) as { access_token: string; expires_in: number; scope?: string };
  if (json.scope && !json.scope.split(" ").includes("https://www.googleapis.com/auth/drive")) {
    throw new DriveError(
      "refresh token에 Drive 권한(https://www.googleapis.com/auth/drive)이 없습니다. OAuth Playground에서 이 범위로 다시 발급하세요.",
    );
  }
  token = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return token.value;
}

async function driveFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${await accessToken()}` },
    cache: "no-store",
  });
  if (res.ok) return res;

  const body = (await res.json().catch(() => ({}))) as {
    error?: { message?: string; errors?: { reason?: string }[] };
  };
  const reason = body.error?.errors?.[0]?.reason ?? "";
  const hint =
    reason === "accessNotConfigured" || /has not been used|is disabled/.test(body.error?.message ?? "")
      ? "GCP 프로젝트에서 Google Drive API를 '사용'으로 설정하세요."
      : res.status === 404
        ? "DRIVE_ROOT_FOLDER_ID가 틀렸거나, refresh token을 발급한 계정이 이 폴더에 접근할 수 없습니다."
        : reason === "insufficientPermissions"
          ? "refresh token에 Drive 권한이 부족합니다. drive 범위로 다시 발급하세요."
          : (body.error?.message ?? "");
  throw new DriveError(`Drive API 오류 (${res.status}${reason ? `, ${reason}` : ""}). ${hint}`.trim());
}

const googleSource = (rootId: string): Source => ({
  rootId,
  async list(folderId) {
    const items: RawItem[] = [];
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({
        q: `'${folderId}' in parents and trashed = false`,
        fields: "nextPageToken, files(id, name, mimeType, modifiedTime, size)",
        pageSize: "1000",
      });
      if (pageToken) params.set("pageToken", pageToken);
      const res = await driveFetch(`${DRIVE_API}/files?${params}`);
      const json = (await res.json()) as { files: RawItem[]; nextPageToken?: string };
      items.push(...json.files);
      pageToken = json.nextPageToken;
    } while (pageToken);
    return items;
  },
  download(fileId) {
    return driveFetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`);
  },
  async checksum(fileId) {
    const res = await driveFetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?fields=md5Checksum`);
    return ((await res.json()) as { md5Checksum: string }).md5Checksum;
  },
  async update(fileId, text) {
    const res = await driveFetch(
      `${UPLOAD_API}/files/${encodeURIComponent(fileId)}?uploadType=media&fields=md5Checksum`,
      { method: "PATCH", headers: { "Content-Type": MD_MIME }, body: text },
    );
    return ((await res.json()) as { md5Checksum: string }).md5Checksum;
  },
  async create(parentId, name, content, mimeType) {
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
    const res = await driveFetch(`${UPLOAD_API}/files?uploadType=multipart&fields=id`, {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    });
    return ((await res.json()) as { id: string }).id;
  },
  async createFolder(parentId, name) {
    const res = await driveFetch(`${DRIVE_API}/files?fields=id`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, parents: [parentId], mimeType: FOLDER_MIME }),
    });
    return ((await res.json()) as { id: string }).id;
  },
  async rename(fileId, name) {
    await driveFetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?fields=id`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    return fileId;
  },
  async trash(fileId) {
    await driveFetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?fields=id`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trashed: true }),
    });
  },
  webUrl({ id, isFolder }) {
    return isFolder
      ? `https://drive.google.com/drive/folders/${id}`
      : `https://drive.google.com/file/d/${id}/view`;
  },
});

// ───────────── 로컬 폴더 (개발용) ─────────────

const MIME_BY_EXT: Record<string, string> = {
  ".md": "text/markdown",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

const localSource = (dir: string): Source => {
  const base = path.resolve(dir);
  // id = 루트 기준 상대경로. 루트 밖으로 나가는 경로는 거부
  const resolve = (id: string) => {
    const p = path.resolve(base, id);
    if (p !== base && !p.startsWith(base + path.sep)) throw new DriveError("잘못된 경로");
    return p;
  };
  return {
    rootId: ".",
    async list(folderId) {
      const entries = await readdir(resolve(folderId), { withFileTypes: true });
      return Promise.all(
        entries.map(async (e) => {
          const id = path.posix.join(folderId, e.name);
          const s = await stat(resolve(id));
          return {
            id,
            name: e.name,
            mimeType: e.isDirectory()
              ? FOLDER_MIME
              : (MIME_BY_EXT[path.extname(e.name).toLowerCase()] ?? "application/octet-stream"),
            modifiedTime: s.mtime.toISOString(),
            size: String(s.size),
          };
        }),
      );
    },
    async download(fileId) {
      const buf = await readFile(resolve(fileId));
      const type = MIME_BY_EXT[path.extname(fileId).toLowerCase()] ?? "application/octet-stream";
      return new Response(buf, { headers: { "Content-Type": type } });
    },
    async checksum(fileId) {
      return md5(await readFile(resolve(fileId)));
    },
    async update(fileId, text) {
      await writeFile(resolve(fileId), text);
      return md5(Buffer.from(text));
    },
    async create(parentId, name, content) {
      const id = path.posix.join(parentId, name);
      await writeFile(resolve(id), content, { flag: "wx" });
      return id;
    },
    async createFolder(parentId, name) {
      const id = path.posix.join(parentId, name);
      await mkdir(resolve(id));
      return id;
    },
    async rename(fileId, name) {
      const id = path.posix.join(path.posix.dirname(fileId), name);
      await rename(resolve(fileId), resolve(id));
      return id;
    },
    async trash(fileId) {
      // 로컬 휴지통: 숨김 폴더라 인덱스에 잡히지 않는다
      await mkdir(resolve(".trash"), { recursive: true });
      await rename(resolve(fileId), resolve(path.posix.join(".trash", `${Date.now()}-${path.posix.basename(fileId)}`)));
    },
    webUrl: () => null,
  };
};

const md5 = (buf: Uint8Array) => createHash("md5").update(buf).digest("hex");

function getSource(): Source {
  const localDir = process.env.NODE_ENV !== "production" ? process.env.DEV_LOCAL_DRIVE_DIR : undefined;
  if (localDir) return localSource(localDir);
  const rootId = env("DRIVE_ROOT_FOLDER_ID");
  if (!rootId) throw new DriveError("DRIVE_ROOT_FOLDER_ID 환경변수가 없습니다.");
  return googleSource(rootId);
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
  /** 이 폴더나 상위 폴더에 .private 표시 파일이 있으면 true → 게스트에게 안 보임 */
  private: boolean;
};
export type FolderEntry = BaseEntry & { kind: "folder"; children: Entry[] };
export type FileEntry = BaseEntry & { kind: "file"; mimeType: string; size: number; isMarkdown: boolean };
export type Entry = FolderEntry | FileEntry;

export type DriveIndex = {
  root: FolderEntry;
  byId: Map<string, Entry>;
  builtAt: number;
};

const isHidden = (name: string) => name.startsWith(".");
/** .private, .private.md, .private.txt … 어떤 형식이든 이 이름으로 시작하는 파일이면 비공개 표시 */
const isPrivateMarker = (item: RawItem) => item.mimeType !== FOLDER_MIME && /^\.private(\.|$)/i.test(item.name);
const isMarkdownName = (name: string) => name.toLowerCase().endsWith(".md");

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

async function buildIndex(): Promise<DriveIndex> {
  const source = getSource();
  const root: FolderEntry = {
    kind: "folder",
    id: source.rootId,
    name: "my-life",
    slug: "",
    slugPath: [],
    modifiedTime: "",
    parent: null,
    private: false,
    children: [],
  };
  const byId = new Map<string, Entry>([[root.id, root]]);

  // 폴더 단위 너비우선 탐색 — 같은 깊이의 폴더는 병렬로 조회
  let level: FolderEntry[] = [root];
  while (level.length) {
    const lists = await Promise.all(level.map((f) => source.list(f.id)));
    const next: FolderEntry[] = [];
    level.forEach((folder, i) => {
      // 비공개는 하위로 상속된다 (부모는 이미 앞 단계에서 확정됨)
      folder.private = (folder.parent?.private ?? false) || lists[i].some(isPrivateMarker);
      for (const item of lists[i]) {
        if (isHidden(item.name)) continue;
        const base = {
          id: item.id,
          name: item.name,
          modifiedTime: item.modifiedTime,
          parent: folder,
          slugPath: [],
          private: folder.private,
        };
        let entry: Entry;
        if (item.mimeType === FOLDER_MIME) {
          entry = { ...base, kind: "folder", slug: item.name, children: [] };
          next.push(entry);
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

  return { root, byId, builtAt: Date.now() };
}

/** 폴더 먼저. 숫자로 시작하는 이름(연도·날짜)은 최신이 위로, 나머지는 가나다순 */
function compareEntries(a: Entry, b: Entry): number {
  if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
  const aDated = /^\d/.test(a.name);
  const bDated = /^\d/.test(b.name);
  if (aDated !== bDated) return aDated ? -1 : 1;
  return aDated ? b.name.localeCompare(a.name, "ko") : a.name.localeCompare(b.name, "ko");
}

let cached: DriveIndex | null = null;
/** 쓰기 직후 호출: 다음 getIndex()가 Drive에서 다시 읽는다 */
export function invalidateIndex() {
  cached = null;
}

let building: Promise<DriveIndex> | null = null;

export async function getIndex(options: { fresh?: boolean } = {}): Promise<DriveIndex> {
  if (!options.fresh && cached && Date.now() - cached.builtAt < INDEX_TTL_MS) return cached;
  building ??= buildIndex()
    .then((idx) => (cached = idx))
    .finally(() => (building = null));
  return building;
}

/**
 * 운영 환경에서는 서버 오류 메시지가 화면에 숨겨지므로,
 * Drive 문제는 던지지 않고 값으로 돌려줘서 페이지가 직접 보여 주게 한다.
 */
export async function loadIndex(): Promise<{ index: DriveIndex; problem?: never } | { index?: never; problem: string }> {
  try {
    return { index: await getIndex() };
  } catch (e) {
    console.error("[drive] index load failed:", e);
    return { problem: e instanceof DriveError ? e.message : "Drive를 불러오는 중 알 수 없는 오류가 났습니다. Vercel 로그를 확인하세요." };
  }
}

/** 소유자는 전부, 게스트는 비공개가 아닌 것만 */
export function canView(entry: Entry, role: Role): boolean {
  return role === "owner" || !entry.private;
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

/**
 * 옵시디언식 첨부 찾기: 노트가 있는 폴더부터 위로 올라가며
 * 같은 폴더 → 그 폴더의 attachments 하위 폴더 순서로 이름을 찾는다.
 */
export function findAttachment(from: FolderEntry, name: string, role: Role): FileEntry | null {
  const target = name.toLowerCase();
  const match = (folder: FolderEntry) =>
    folder.children.find(
      (c): c is FileEntry => c.kind === "file" && c.name.toLowerCase() === target && canView(c, role),
    );

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
export function findNoteByName(index: DriveIndex, name: string, role: Role): FileEntry | null {
  const target = name.toLowerCase().replace(/\.md$/, "");
  for (const entry of index.byId.values()) {
    if (entry.kind === "file" && entry.isMarkdown && entry.slug.toLowerCase() === target && canView(entry, role))
      return entry;
  }
  return null;
}

const fileUrl = (file: FileEntry) => `/api/file/${encodeURIComponent(file.id)}`;

/** 서버 렌더링용 링크 해석기 */
export function linkResolver(index: DriveIndex, folder: FolderEntry, role: Role): LinkResolver {
  return {
    attachment(name) {
      const file = findAttachment(folder, name, role);
      return file && !file.isMarkdown ? fileUrl(file) : null;
    },
    note(name) {
      const note = findNoteByName(index, name, role);
      return note ? hrefFor(note) : null;
    },
  };
}

/** 편집기 미리보기용: 이 폴더에서 보이는 첨부와 전체 노트 링크를 표로 만들어 넘긴다 */
/** 편집기는 소유자만 쓰므로 비공개 파일도 포함한다 */
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

export async function readNote(file: FileEntry): Promise<{ text: string; checksum: string }> {
  const res = await getSource().download(file.id);
  const buf = new Uint8Array(await res.arrayBuffer());
  return { text: new TextDecoder().decode(buf), checksum: md5(buf) };
}

// ───────────── 쓰기 ─────────────

export const fileChecksum = (file: FileEntry) => getSource().checksum(file.id);
export const updateFile = (file: FileEntry, text: string) => getSource().update(file.id, text);
export const createFile = (folder: FolderEntry, name: string, text: string) =>
  getSource().create(folder.id, name, text, "text/markdown");
export const createFolder = (parent: FolderEntry, name: string) => getSource().createFolder(parent.id, name);
export const renameFile = (file: FileEntry, name: string) => getSource().rename(file.id, name);
export const trashFile = (file: FileEntry) => getSource().trash(file.id);

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
  const id = await getSource().createFolder(top.id, ATTACHMENTS);
  return { ...top, id, name: ATTACHMENTS, parent: top, children: [], slug: ATTACHMENTS, slugPath: [...top.slugPath, ATTACHMENTS] };
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
  const id = await getSource().create(folder.id, name, bytes, mimeType);
  const cachedFolder = index.byId.get(folder.id);
  if (cached === index && cachedFolder?.kind === "folder") {
    const entry: FileEntry = {
      kind: "file",
      id,
      name,
      slug: name,
      slugPath: [...cachedFolder.slugPath, name],
      modifiedTime: new Date().toISOString(),
      parent: cachedFolder,
      private: cachedFolder.private,
      mimeType,
      size: bytes.length,
      isMarkdown: false,
    };
    cachedFolder.children.push(entry);
    index.byId.set(id, entry);
  } else {
    invalidateIndex();
  }
  return id;
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

/** _templates/<최상위 폴더 이름>.md → _templates/default.md → 기본값 */
export async function loadTemplate(index: DriveIndex, folder: FolderEntry): Promise<string> {
  const templates = index.root.children.find(
    (c): c is FolderEntry => c.kind === "folder" && c.name === TEMPLATE_FOLDER,
  );
  if (!templates) return DEFAULT_TEMPLATE;
  let top: FolderEntry = folder;
  while (top.parent && top.parent !== index.root) top = top.parent;
  const pick = (name: string) =>
    templates.children.find((c): c is FileEntry => c.kind === "file" && c.name.toLowerCase() === name.toLowerCase());
  const file = (top !== index.root && pick(`${top.name}.md`)) || pick("default.md");
  return file ? (await readNote(file)).text : DEFAULT_TEMPLATE;
}

export function downloadFile(file: FileEntry): Promise<Response> {
  return getSource().download(file.id);
}

export function webUrlFor(entry: Entry): string | null {
  return getSource().webUrl({ id: entry.id, isFolder: entry.kind === "folder" });
}

export function hrefFor(entry: Entry): string {
  return "/" + entry.slugPath.map(encodeURIComponent).join("/");
}

/** attachments(이미지 보관), _templates 폴더는 목록에서 숨긴다 */
export function isListable(entry: Entry): boolean {
  if (entry.kind === "folder") return entry.name.toLowerCase() !== "attachments" && entry.name !== TEMPLATE_FOLDER;
  return entry.isMarkdown;
}

/** 목록에 보여 줄 하위 항목 (숨김 폴더·비공개 제외) */
export function visibleChildren(folder: FolderEntry, role: Role): Entry[] {
  return folder.children.filter((c) => isListable(c) && canView(c, role));
}

export type TreeNode = { name: string; href: string; private: boolean; children: TreeNode[] };

/** 사이드바용: 폴더만, 클라이언트로 넘길 수 있는 순수 객체 */
export function folderTree(folder: FolderEntry, role: Role): TreeNode[] {
  return visibleChildren(folder, role)
    .filter((c): c is FolderEntry => c.kind === "folder")
    // 자물쇠는 비공개가 시작되는 폴더에만 (상속된 하위 폴더에는 표시 안 함)
    .map((c) => ({ name: c.name, href: hrefFor(c), private: c.private && !folder.private, children: folderTree(c, role) }));
}
