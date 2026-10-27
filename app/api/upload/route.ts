import { DriveError, attachmentFolderFor, getIndex, uniqueName, uploadFile } from "@/lib/drive";
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
  if (user.role !== "owner") return json({ error: "업로드 권한이 없습니다." }, 403);

  const type = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const ext = EXT[type];
  if (!ext) return json({ error: "JPG, PNG, WEBP, GIF 이미지만 올릴 수 있습니다." }, 415);
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BYTES) return json({ error: "사진이 너무 큽니다 (4MB 이하)." }, 413);

  const folderId = new URL(req.url).searchParams.get("folder") ?? "";
  try {
    const index = await getIndex();
    const folder = index.byId.get(folderId);
    if (folder?.kind !== "folder") return json({ error: "폴더를 찾을 수 없습니다." }, 404);

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
    return json({ name, url: `/api/file/${encodeURIComponent(id)}` });
  } catch (e) {
    console.error("[upload]", e);
    return json({ error: e instanceof DriveError ? e.message : "업로드 중 알 수 없는 오류가 났습니다." }, 502);
  }
}
