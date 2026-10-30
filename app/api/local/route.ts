import { fileUrl, hrefFor, isListable, type Entry, type FileEntry } from "@/lib/drive";
import { readTexts } from "@/lib/folder-meta";
import { homeKinds } from "@/lib/home-data";
import { loadLibrary } from "@/lib/library";
import type { LocalEntry, LocalText, LocalTree } from "@/lib/local-types";
import { getUser } from "@/lib/session";

// 기기에 받아 둘 일기장 목록(GET)과 글 내용(POST). 로그인한 사람 토큰으로 본 것만 돌려준다 (Drive 권한 그대로).

const MAX_IDS = 60;
const headers = { "Cache-Control": "private, no-store" };

async function open(req: Request, root: string) {
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) return { error: Response.json({ error: "잘못된 요청입니다." }, { status: 403 }) };
  const user = await getUser();
  if (!user) return { error: Response.json({ error: "로그인이 필요합니다." }, { status: 401 }) };
  const loaded = await loadLibrary(user, root);
  if (loaded.kind !== "ok") return { error: Response.json({ error: "일기장을 열 수 없습니다." }, { status: 404 }) };
  return { index: loaded.index };
}

export async function GET(req: Request) {
  const opened = await open(req, new URL(req.url).searchParams.get("root") ?? "");
  if (opened.error) return opened.error;
  const { index } = opened;

  const entries: LocalEntry[] = [];
  const walk = (e: Entry) => {
    const item: LocalEntry = { id: e.id, p: e.parent?.id ?? null, n: e.name, s: e.slug, k: e.kind === "folder" ? "d" : "f", m: e.modifiedTime, h: hrefFor(e) };
    if (e.parent && isListable(e)) item.v = 1;
    if (e.can.edit) item.e = 1;
    if (e.can.addChildren) item.a = 1;
    if (e.kind === "folder") {
      if (e.restricted) item.r = 1;
      entries.push(item);
      for (const c of e.children) walk(c);
    } else {
      if (e.isMarkdown) item.md = 1;
      else item.u = fileUrl(e);
      entries.push(item);
    }
  };
  walk(index.root);
  const tree: LocalTree = {
    rootId: index.lib.rootId,
    name: index.lib.name,
    base: index.lib.base,
    own: index.lib.ownedByMe,
    owner: index.lib.ownerName,
    kinds: await homeKinds(index),
    entries,
  };
  return Response.json(tree, { headers });
}

export async function POST(req: Request) {
  let body: { root?: unknown; ids?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const opened = await open(req, typeof body.root === "string" ? body.root : "");
  if (opened.error) return opened.error;
  const { index } = opened;
  const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === "string").slice(0, MAX_IDS) : [];
  const files = ids.flatMap((id) => {
    const e = index.byId.get(id);
    return e?.kind === "file" && e.isMarkdown ? [e as FileEntry] : [];
  });
  const texts = await readTexts(index, files, 8_000);
  const out: LocalText[] = files.flatMap((f) => (texts.has(f.id) ? [{ id: f.id, m: f.modifiedTime, t: texts.get(f.id)! }] : []));
  return Response.json({ texts: out }, { headers });
}
