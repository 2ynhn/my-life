import { getAiCredentials } from "@/lib/ai-settings";
import { AiError } from "@/lib/claude";
import { ANALYZE_KINDS, analyzeImages, type AnalyzeImage, type AnalyzeKind } from "@/lib/analyze";
import { loadLibrary, myLibrary } from "@/lib/library";
import { getUser } from "@/lib/session";

// 공유받은 이미지를 Claude로 읽어 글 칸·본문을 돌려준다. 설정에서 'AI로 정리'를 켠 사람만, 그 사람 자기 키로.
// 꺼져 있거나 키가 없으면 { off: true } (화면은 아무것도 하지 않는다). 이미지는 메모리에서 바로 보내고 저장하지 않는다.

const json = (body: unknown, status = 200) => Response.json(body, { status });
const TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_TOTAL = 4 * 1024 * 1024;
const MAX_IMAGES = 3;

// 비용이 새지 않게: 사람마다 10분에 20번
const WINDOW_MS = 10 * 60 * 1000;
const LIMIT = 20;
const recent = new Map<string, number[]>();
function allow(email: string): boolean {
  const now = Date.now();
  const list = (recent.get(email) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= LIMIT) return false;
  list.push(now);
  recent.set(email, list);
  return true;
}

const todayKST = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return json({ error: "로그인이 필요합니다." }, 401);
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(req.url).host) return json({ error: "잘못된 요청입니다." }, 403);
  if (Number(req.headers.get("content-length") ?? 0) > MAX_TOTAL + 64 * 1024) return json({ error: "이미지가 너무 큽니다." }, 413);

  // 내 키·설정: 내 일기장 _settings/ai.json
  const mine = await myLibrary(user);
  const own = mine.kind === "ok" ? await loadLibrary(user, mine.lib.rootId) : null;
  const creds = own?.kind === "ok" ? await getAiCredentials(own.index) : null;
  if (!creds?.analyze) return json({ off: true });

  const form = await req.formData().catch(() => null);
  const kind = String(form?.get("kind") ?? "") as AnalyzeKind;
  if (!ANALYZE_KINDS.includes(kind)) return json({ error: "알 수 없는 종류입니다." }, 400);
  const files = (form?.getAll("image") ?? []).filter((f): f is File => typeof f !== "string" && TYPES.has(f.type)).slice(0, MAX_IMAGES);
  if (!files.length) return json({ error: "읽을 이미지가 없습니다." }, 400);
  if (files.reduce((n, f) => n + f.size, 0) > MAX_TOTAL) return json({ error: "이미지가 너무 큽니다." }, 413);
  if (!allow(user.email.toLowerCase())) return json({ error: "잠시 뒤 다시 시도하세요. (10분에 20번까지)" }, 429);

  try {
    const images: AnalyzeImage[] = await Promise.all(
      files.map(async (f) => ({ data: new Uint8Array(await f.arrayBuffer()), type: f.type as AnalyzeImage["type"] })),
    );
    return json({ analysis: await analyzeImages(creds.apiKey, creds.model, kind, images, todayKST()) });
  } catch (e) {
    if (e instanceof AiError) return json({ error: e.message }, 502);
    console.error("[analyze]", e);
    return json({ error: "이미지를 읽는 중 알 수 없는 오류가 났습니다." }, 502);
  }
}
