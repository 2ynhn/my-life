import "server-only";
import { createHash } from "node:crypto";
import { fileUrl, hrefFor, isListable, type DriveIndex, type Entry, type FileEntry } from "@/lib/drive";
import { homeKinds } from "@/lib/home-data";
import { loadLibrary } from "@/lib/library";
import type { LocalEntry, LocalText, LocalTree } from "@/lib/local-types";
import { getUser } from "@/lib/session";

// 기기 사본용 목록·글 (서버). /api/local(낱개)과 /api/local/sync(묶음)가 같이 쓴다.
// 로그인한 사람 토큰으로 본 것만 돌려준다 (Drive 권한 그대로).

/** 기기에도 받아 두는 설정 파일 (ai.json처럼 비밀이 든 것은 빼고) */
const SHARED_SETTINGS = new Set(["budget.json", "categories.json"]);
export const isSharedSetting = (e: Entry) =>
  e.kind === "file" && e.parent?.name === "_settings" && !e.parent.parent?.parent && SHARED_SETTINGS.has(e.name);

/** 기기에 받아 두는 글 (md + 공용 설정) */
export const isSyncedText = (e: Entry): e is FileEntry => e.kind === "file" && (e.isMarkdown || isSharedSetting(e));

export const noStore = { "Cache-Control": "private, no-store" };

export async function openForLocal(req: Request, root: string) {
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) return { error: Response.json({ error: "잘못된 요청입니다." }, { status: 403 }) };
  const user = await getUser();
  if (!user) return { error: Response.json({ error: "로그인이 필요합니다." }, { status: 401 }) };
  const loaded = await loadLibrary(user, root);
  if (loaded.kind !== "ok") return { error: Response.json({ error: "일기장을 열 수 없습니다." }, { status: 404 }) };
  return { index: loaded.index };
}

export async function buildLocalTree(index: DriveIndex): Promise<LocalTree> {
  const entries: LocalEntry[] = [];
  const walk = (e: Entry) => {
    const item: LocalEntry = { id: e.id, p: e.parent?.id ?? null, n: e.name, s: e.slug, k: e.kind === "folder" ? "d" : "f", m: e.modifiedTime, h: hrefFor(e) };
    if (e.parent && isListable(e)) item.v = 1;
    if (e.can.edit) item.e = 1;
    if (e.can.addChildren) item.a = 1;
    if (e.can.rename) item.rn = 1;
    if (e.can.trash) item.t = 1;
    if (e.kind === "folder") {
      if (e.restricted) item.r = 1;
      entries.push(item);
      for (const c of e.children) walk(c);
    } else {
      if (e.isMarkdown) item.md = 1;
      else item.u = fileUrl(e);
      if (e.photo) item.ph = e.photo;
      if (isSharedSetting(e)) item.j = 1;
      entries.push(item);
    }
  };
  walk(index.root);
  return {
    rootId: index.lib.rootId,
    name: index.lib.name,
    base: index.lib.base,
    own: index.lib.ownedByMe,
    owner: index.lib.ownerName,
    kinds: await homeKinds(index),
    entries,
  };
}

const md5 = (t: string) => createHash("md5").update(Buffer.from(t, "utf8")).digest("hex");
export const localText = (f: FileEntry, t: string): LocalText => ({ id: f.id, m: f.modifiedTime, t, c: md5(t) });
