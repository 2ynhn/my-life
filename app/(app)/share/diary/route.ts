import { featureFolders } from "@/lib/collect";
import { hrefFor, visibleChildren, type FileEntry, type FolderEntry } from "@/lib/drive";
import { loadLibrary, myLibrary } from "@/lib/library";
import { getUser } from "@/lib/session";

// 공유받은 사진으로 일기 쓰기: 사진 찍은 날(?date=)의 일기로 보낸다.
// 그날 일기가 있으면 편집(사진을 끝에 붙임), 없으면 그 날짜로 새 일기 (연도 폴더가 없으면 저장할 때 만든다)

const notesIn = (folder: FolderEntry): FileEntry[] =>
  visibleChildren(folder).flatMap((c) => (c.kind === "file" ? (c.isMarkdown ? [c] : []) : notesIn(c)));

export async function GET(req: Request) {
  const url = new URL(req.url);
  const go = (path: string) => Response.redirect(new URL(path, url), 303);
  const user = await getUser();
  if (!user) return go("/login?next=/share");
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());
  const raw = url.searchParams.get("date") ?? "";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) && raw <= today ? raw : today;

  const mine = await myLibrary(user);
  const loaded = mine.kind === "ok" ? await loadLibrary(user, mine.lib.rootId) : null;
  if (loaded?.kind !== "ok") return go("/share");
  const daily = (await featureFolders(loaded.index)).find((f) => f.feature === "diary")?.folder;
  if (!daily) return go("/share");

  const note = notesIn(daily).find((n) => n.name.startsWith(date));
  if (note?.can.edit) return go(`${hrefFor(note)}?mode=edit&shared=photos`);
  const year = daily.children.find((c): c is FolderEntry => c.kind === "folder" && c.name === date.slice(0, 4));
  const q = `date=${date}&shared=photos`;
  if (year?.can.addChildren) return go(`${hrefFor(year)}?mode=new&${q}`);
  if (!year && daily.can.addChildren) return go(`${hrefFor(daily)}?mode=new&sub=${date.slice(0, 4)}&${q}`);
  return go("/share");
}
