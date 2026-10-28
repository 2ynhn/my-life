import { getAiCredentials } from "@/lib/ai-settings";
import { loadLibrary, myLibrary } from "@/lib/library";
import { ReceiptError, readReceipt } from "@/lib/receipt";
import { getUser } from "@/lib/session";

// 카메라로 찍은 장면이나 고른 이미지를 받아 Claude로 읽고 지출 항목만 돌려준다.
// 이미지는 메모리에서 바로 보내고 어디에도 저장하지 않는다 (Drive·서버 모두).
// API 키는 요청한 사람 '자기' 일기장 설정의 키를 쓴다.

const json = (body: unknown, status = 200) => Response.json(body, { status });
const TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_BYTES = 4 * 1024 * 1024;

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

  const type = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!TYPES.has(type)) return json({ error: "JPG, PNG, WEBP, GIF 이미지만 읽을 수 있습니다." }, 415);
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BYTES) return json({ error: "이미지가 너무 큽니다 (4MB 이하)." }, 413);

  // 내 키: 내 일기장 설정에서
  const mine = await myLibrary(user);
  const own = mine.kind === "ok" ? await loadLibrary(user, mine.lib.rootId) : null;
  const creds = own?.kind === "ok" ? await getAiCredentials(own.index) : null;
  if (!creds) return json({ error: "설정에서 Anthropic API 키를 먼저 입력하세요.", needsKey: true }, 400);

  const bytes = new Uint8Array(await req.arrayBuffer());
  if (!bytes.length) return json({ error: "빈 이미지입니다." }, 400);
  if (bytes.length > MAX_BYTES) return json({ error: "이미지가 너무 큽니다 (4MB 이하)." }, 413);
  if (!allow(user.email.toLowerCase())) return json({ error: "잠시 뒤 다시 시도하세요. (10분에 30장까지)" }, 429);

  try {
    const receipt = await readReceipt(creds.apiKey, creds.model, bytes, type as "image/jpeg");
    return json({ receipt });
  } catch (e) {
    if (e instanceof ReceiptError) return json({ error: e.message }, 502);
    console.error("[receipt]", e);
    return json({ error: "영수증을 읽는 중 알 수 없는 오류가 났습니다." }, 502);
  }
}
