import { hasGooglePlaces, hasNaverSearch, resolveMapShare, searchPlaces } from "@/lib/place-search";
import { getUser } from "@/lib/session";

// 장소 찾기: GET ?q= 네이버 → 구글 (키가 없거나 둘 다 못 찾으면 501 → 브라우저가 OpenStreetMap으로)
//            POST { text } 지도 앱 공유 글·링크 → 이름·좌표·링크
// 로그인한 사람만. 결과는 저장하지 않는다.

const json = (body: unknown, status = 200) => Response.json(body, { status });

// 실수로 반복 호출하지 않게: 사람마다 10분에 120번
const WINDOW_MS = 10 * 60 * 1000;
const LIMIT = 120;
const recent = new Map<string, number[]>();
function allow(email: string): boolean {
  const now = Date.now();
  const list = (recent.get(email) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= LIMIT) return false;
  list.push(now);
  recent.set(email, list);
  return true;
}

export async function GET(req: Request) {
  const user = await getUser();
  if (!user) return json({ error: "로그인이 필요합니다." }, 401);
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 100);
  if (!q) return json({ results: [] });
  if (!hasNaverSearch() && !hasGooglePlaces()) return json({ error: "no-key" }, 501);
  if (!allow(user.email)) return json({ error: "잠시 뒤 다시 찾아 주세요." }, 429);
  const found = await searchPlaces(q);
  return found ? json(found) : json({ error: "not-found" }, 501);
}

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return json({ error: "로그인이 필요합니다." }, 401);
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(req.url).host) return json({ error: "잘못된 요청입니다." }, 403);
  if (!allow(user.email)) return json({ error: "잠시 뒤 다시 시도해 주세요." }, 429);
  const body = (await req.json().catch(() => null)) as { text?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.slice(0, 2000) : "";
  const place = await resolveMapShare(text);
  if (!place) return json({ error: "네이버 지도·카카오맵·구글 지도 공유 링크가 아니에요." }, 400);
  return json({ place });
}
