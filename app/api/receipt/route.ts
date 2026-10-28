import { getAiCredentials } from "@/lib/ai-settings";
import { DriveError, downloadFile } from "@/lib/drive";
import { findInLibrary, loadLibrary, myLibrary } from "@/lib/library";
import { ReceiptError, readReceipt } from "@/lib/receipt";
import { getUser } from "@/lib/session";

// 일기장에 올린 영수증 이미지를 Claude로 읽어 지출 항목을 돌려준다.
// 이미지는 요청한 사람 권한으로 Drive에서 읽고, API 키는 그 사람 '자기' 일기장 설정의 키를 쓴다.

const json = (body: unknown, status = 200) => Response.json(body, { status });
const TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

// 실수로 반복 호출해 비용이 새지 않게: 사람마다 10분에 30장
const WINDOW_MS = 10 * 60 * 1000;
const LIMIT = 30;
const recent = new Map<string, number[]>();
function allow(email: string): boolean {
  const now = Date.now();
  const list = (recent.get(email) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= LIMIT) return false;
  list.push(now);
  recent.set(email, list);
  return true;
}

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return json({ error: "로그인이 필요합니다." }, 401);
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(req.url).host) return json({ error: "잘못된 요청입니다." }, 403);

  const body = (await req.json().catch(() => ({}))) as { root?: unknown; fileId?: unknown };
  if (typeof body.root !== "string" || typeof body.fileId !== "string") return json({ error: "잘못된 요청입니다." }, 400);

  // 내 키: 내 일기장 설정에서
  const mine = await myLibrary(user);
  const own = mine.kind === "ok" ? await loadLibrary(user, mine.lib.rootId) : null;
  const creds = own?.kind === "ok" ? await getAiCredentials(own.index) : null;
  if (!creds) return json({ error: "설정에서 Anthropic API 키를 먼저 입력하세요.", needsKey: true }, 400);

  if (!allow(user.email.toLowerCase())) return json({ error: "잠시 뒤 다시 시도하세요. (10분에 30장까지)" }, 429);

  try {
    const loaded = await findInLibrary(user, body.root, body.fileId);
    if (loaded.kind !== "ok" || loaded.entry?.kind !== "file") return json({ error: "이미지를 찾을 수 없습니다." }, 404);
    const file = loaded.entry;
    if (!TYPES.has(file.mimeType)) return json({ error: "JPG, PNG, WEBP, GIF 이미지만 읽을 수 있습니다." }, 415);
    const bytes = new Uint8Array(await (await downloadFile(loaded.index, file)).arrayBuffer());
    if (bytes.length > 5 * 1024 * 1024) return json({ error: "이미지가 너무 큽니다." }, 413);

    const receipt = await readReceipt(creds.apiKey, creds.model, bytes, file.mimeType as "image/jpeg");
    return json({ receipt });
  } catch (e) {
    if (e instanceof ReceiptError) return json({ error: e.message }, 502);
    console.error("[receipt]", e);
    return json({ error: e instanceof DriveError ? e.message : "영수증을 읽는 중 알 수 없는 오류가 났습니다." }, 502);
  }
}
