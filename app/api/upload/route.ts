import { DriveError, attachmentFolderFor, uniqueName, uploadFile } from "@/lib/drive";
import { findInLibrary, markWritten } from "@/lib/library";
import { getUser } from "@/lib/session";

// Vercel 함수 요청 한도(4.5MB) 아래. 큰 사진은 브라우저에서 줄여서 보낸다
const MAX_BYTES = 4 * 1024 * 1024;
const EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

const json = (body: unknown, status = 200) => Response.json(body, { status });

/** 편집기에서 붙인 사진을 가까운 attachments 폴더에 올린다. 본문은 이미지 바이트 그대로 */
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return json({ error: "로그인이 필요합니다." }, 401);
  // 다른 사이트에서 몰래 보내는 요청 차단 (쿠키가 SameSite=Lax라 이미 막히지만 한 번 더)
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(req.url).host) return json({ error: "잘못된 요청입니다." }, 403);

  const type = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const ext = EXT[type];
  if (!ext) return json({ error: "JPG, PNG, WEBP, GIF 이미지만 올릴 수 있습니다." }, 415);
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BYTES) return json({ error: "사진이 너무 큽니다 (4MB 이하)." }, 413);

  const url = new URL(req.url);
  const rootId = url.searchParams.get("root") ?? "";
  const folderId = url.searchParams.get("folder") ?? "";
  try {
    const loaded = await findInLibrary(user, rootId, folderId);
    if (loaded.kind === "problem") return json({ error: loaded.problem }, 502);
    if (loaded.kind !== "ok") return json({ error: "일기장을 찾을 수 없습니다." }, 404);
    const { index, entry: folder } = loaded;
    if (folder?.kind !== "folder") return json({ error: "폴더를 찾을 수 없습니다." }, 404);
    // 권한은 Drive가 최종 판단하지만, 쓸 수 없는 일기장이면 미리 알려 준다
    if (!folder.can.addChildren && !folder.can.edit) return json({ error: "이 일기장에 사진을 올릴 권한이 없습니다." }, 403);

    const bytes = new Uint8Array(await req.arrayBuffer());
    if (!bytes.length) return json({ error: "빈 파일입니다." }, 400);
    if (bytes.length > MAX_BYTES) return json({ error: "사진이 너무 큽니다 (4MB 이하)." }, 413);

    const target = await attachmentFolderFor(index, folder);
    // 기존 사진 이름 형식과 같게: 2026-10-27 21.58.33.jpg (한국 시간)
    const stamp = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Seoul",
      dateStyle: "short",
      timeStyle: "medium",
    })
      .format(new Date())
      .replaceAll(":", ".");
    const name = uniqueName(target, stamp, ext);
    const id = await uploadFile(index, target, name, bytes, type);
    await markWritten();
    return json({ id, name, url: `/api/file/${encodeURIComponent(index.lib.rootId)}/${encodeURIComponent(id)}` });
  } catch (e) {
    console.error("[upload]", e);
    if (e instanceof DriveError && e.status === 403) return json({ error: "이 일기장에 사진을 올릴 권한이 없습니다." }, 403);
    return json({ error: e instanceof DriveError ? e.message : "업로드 중 알 수 없는 오류가 났습니다." }, 502);
  }
}
