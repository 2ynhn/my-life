import "server-only";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const FOLDER_MIME = "application/vnd.google-apps.folder";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
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

async function driveFetch(url: string): Promise<Response> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${await accessToken()}` },
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
    webUrl: () => null,
  };
};

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
    children: [],
  };
  const byId = new Map<string, Entry>([[root.id, root]]);

  // 폴더 단위 너비우선 탐색 — 같은 깊이의 폴더는 병렬로 조회
  let level: FolderEntry[] = [root];
  while (level.length) {
    const lists = await Promise.all(level.map((f) => source.list(f.id)));
    const next: FolderEntry[] = [];
    level.forEach((folder, i) => {
      for (const item of lists[i]) {
        if (isHidden(item.name)) continue;
        const base = { id: item.id, name: item.name, modifiedTime: item.modifiedTime, parent: folder, slugPath: [] };
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

export async function readText(file: FileEntry): Promise<string> {
  const res = await getSource().download(file.id);
  return res.text();
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

/** attachments 폴더는 목록에서 숨긴다 (이미지 보관용) */
export function isListable(entry: Entry): boolean {
  if (entry.kind === "folder") return entry.name.toLowerCase() !== "attachments";
  return entry.isMarkdown;
}

export type TreeNode = { name: string; href: string; children: TreeNode[] };

/** 사이드바용: 폴더만, 클라이언트로 넘길 수 있는 순수 객체 */
export function folderTree(folder: FolderEntry): TreeNode[] {
  return folder.children
    .filter((c): c is FolderEntry => c.kind === "folder" && isListable(c))
    .map((c) => ({ name: c.name, href: hrefFor(c), children: folderTree(c) }));
}
