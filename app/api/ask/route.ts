import { getAiCredentials } from "@/lib/ai-settings";
import { ask } from "@/lib/ask";
import { AiError } from "@/lib/claude";
import { loadLibrary, myLibrary } from "@/lib/library";
import { getUser } from "@/lib/session";

// 물어보기: 묻는 사람의 토큰으로 일기장을 읽고, 묻는 사람 '자기' 키로 Claude에 묻는다. 아무것도 저장하지 않는다.

export const maxDuration = 60;

const json = (body: unknown, status = 200) => Response.json(body, { status });

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

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return json({ error: "로그인이 필요합니다." }, 401);
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(req.url).host) return json({ error: "잘못된 요청입니다." }, 403);

  const body = (await req.json().catch(() => ({}))) as { root?: unknown; q?: unknown };
  const question = String(body.q ?? "").trim();
  if (!question) return json({ error: "질문을 입력하세요." }, 400);
  if (question.length > 500) return json({ error: "질문은 500자까지예요." }, 400);

  const loaded = await loadLibrary(user, String(body.root ?? ""));
  if (loaded.kind !== "ok") return json({ error: "일기장을 열 수 없습니다." }, 404);

  // 키: 내 일기장 설정에서 (공유받은 일기장에 물어도 비용은 묻는 사람 키로)
  const mine = await myLibrary(user);
  const own = mine.kind === "ok" ? (mine.lib.rootId === loaded.index.lib.rootId ? loaded : await loadLibrary(user, mine.lib.rootId)) : null;
  const creds = own?.kind === "ok" ? await getAiCredentials(own.index) : null;
  if (!creds) return json({ error: "설정에서 Anthropic API 키를 먼저 입력하세요.", needsKey: true }, 400);
  if (!allow(user.email.toLowerCase())) return json({ error: "잠시 뒤 다시 물어보세요. (10분에 20번까지)" }, 429);

  try {
    return json(await ask(loaded.index, creds.apiKey, creds.model, question));
  } catch (e) {
    if (e instanceof AiError) return json({ error: e.message }, 502);
    console.error("[ask]", e);
    return json({ error: "답을 만드는 중 알 수 없는 오류가 났습니다." }, 502);
  }
}
