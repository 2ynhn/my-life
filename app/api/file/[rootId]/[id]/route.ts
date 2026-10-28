import { DriveError, downloadFile } from "@/lib/drive";
import { findInLibrary } from "@/lib/library";
import { getUser } from "@/lib/session";

/**
 * 첨부(이미지 등)를 Drive에서 받아 전달. 그 일기장 안의 파일만, 요청한 사람 본인의 토큰으로 읽는다
 * → 공유받지 않은 파일은 Drive가 거절한다.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ rootId: string; id: string }> }) {
  const user = await getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { rootId, id } = await params;
  try {
    const loaded = await findInLibrary(user, rootId, id);
    if (loaded.kind !== "ok") return new Response("Not found", { status: 404 });
    const { entry } = loaded;
    if (!entry || entry.kind !== "file") return new Response("Not found", { status: 404 });

    const upstream = await downloadFile(loaded.index, entry);
    return new Response(upstream.body, {
      headers: {
        "Content-Type": upstream.headers.get("Content-Type") ?? entry.mimeType,
        "Cache-Control": "private, max-age=86400",
        "X-Content-Type-Options": "nosniff",
        // svg 등에 들어 있을 수 있는 스크립트 실행 차단
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      },
    });
  } catch (e) {
    console.error("[drive] file proxy failed:", e);
    if (e instanceof DriveError && (e.status === 403 || e.status === 404)) return new Response("Not found", { status: 404 });
    return new Response(e instanceof DriveError ? e.message : "Drive error", { status: 502 });
  }
}
