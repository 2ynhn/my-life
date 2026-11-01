import { readTexts } from "@/lib/folder-meta";
import { buildLocalTree, isSyncedText, localText, noStore, openForLocal } from "@/lib/local-tree";
import type { LocalText } from "@/lib/local-types";

// 기기에 받아 둘 일기장 목록(GET)과 몇몇 글 내용(POST: 지금 화면에 필요한 것 먼저). 한꺼번에 맞추기는 /api/local/sync

const MAX_IDS = 60;

export async function GET(req: Request) {
  const opened = await openForLocal(req, new URL(req.url).searchParams.get("root") ?? "");
  if (opened.error) return opened.error;
  return Response.json(await buildLocalTree(opened.index), { headers: noStore });
}

export async function POST(req: Request) {
  let body: { root?: unknown; ids?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const opened = await openForLocal(req, typeof body.root === "string" ? body.root : "");
  if (opened.error) return opened.error;
  const { index } = opened;
  const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === "string").slice(0, MAX_IDS) : [];
  const files = ids.flatMap((id) => {
    const e = index.byId.get(id);
    return e && isSyncedText(e) ? [e] : [];
  });
  const texts = await readTexts(index, files, 8_000);
  const out: LocalText[] = files.flatMap((f) => (texts.has(f.id) ? [localText(f, texts.get(f.id)!)] : []));
  return Response.json({ texts: out }, { headers: noStore });
}
