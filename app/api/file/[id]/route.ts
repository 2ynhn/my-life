import { DriveError, canView, downloadFile, getIndex } from "@/lib/drive";
import { getUser } from "@/lib/session";

/** 첨부(이미지 등)를 Drive에서 받아 전달. my-life 폴더 안의 파일만 허용 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  let upstream: Response;
  let mimeType: string;
  try {
    const entry = (await getIndex()).byId.get(id);
    // 비공개 파일은 게스트에게 존재 자체를 알리지 않는다
    if (!entry || entry.kind !== "file" || !canView(entry, user.role)) return new Response("Not found", { status: 404 });
    mimeType = entry.mimeType;
    upstream = await downloadFile(entry);
  } catch (e) {
    console.error("[drive] file proxy failed:", e);
    return new Response(e instanceof DriveError ? e.message : "Drive error", { status: 502 });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") ?? mimeType,
      "Cache-Control": "private, max-age=86400",
      "X-Content-Type-Options": "nosniff",
      // svg 등에 들어 있을 수 있는 스크립트 실행 차단
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
