import "server-only";
import {
  cleanPageTitle,
  coordsFromNaverHtml,
  coordsFromUrl,
  findMapUrl,
  isMapHost,
  nameFromShareText,
  nameFromUrl,
  type PlaceInfo,
} from "@/lib/map-link";

// 서버 전용: 장소 이름 찾기(네이버 → 구글, 키가 있는 것만)와 지도 공유 링크 풀기.
// 키는 이 앱 운영자의 것(Vercel 환경변수)이고 브라우저로 보내지 않는다.
// 링크는 지도 서비스 도메인(https)만 따라간다 — 다른 곳으로 넘어가면 멈춘다.

const dev = process.env.NODE_ENV !== "production";
const NAVER_BASE = (dev && process.env.DEV_NAVER_API_BASE?.trim()) || "https://openapi.naver.com";
const NAVER_HUB_BASE = (dev && process.env.DEV_NAVER_APIHUB_BASE?.trim()) || "https://naverapihub.apigw.ntruss.com";
const GOOGLE_PLACES_BASE = (dev && process.env.DEV_GOOGLE_PLACES_BASE?.trim()) || "https://places.googleapis.com";

// 네이버 검색 키는 두 가지:
//  - NAVER API HUB (네이버 클라우드, 2026-08부터 새로 받는 곳): NAVER_APIHUB_KEY_ID / NAVER_APIHUB_KEY
//  - 예전 개발자센터 (2026-07-31 신규 발급 종료, 2027-06-30 종료): NAVER_SEARCH_CLIENT_ID / NAVER_SEARCH_CLIENT_SECRET
// 둘 다 파라미터·응답은 같고 주소·인증 머리글만 다르다. HUB 키가 있으면 그것부터.
type NaverEndpoint = { url: string; headers: Record<string, string> };

function naverEndpoint(): NaverEndpoint | null {
  const hubId = process.env.NAVER_APIHUB_KEY_ID?.trim();
  const hubKey = process.env.NAVER_APIHUB_KEY?.trim();
  if (hubId && hubKey)
    return { url: `${NAVER_HUB_BASE}/search/v1/local`, headers: { "X-NCP-APIGW-API-KEY-ID": hubId, "X-NCP-APIGW-API-KEY": hubKey } };
  const id = process.env.NAVER_SEARCH_CLIENT_ID?.trim();
  const secret = process.env.NAVER_SEARCH_CLIENT_SECRET?.trim();
  if (id && secret) return { url: `${NAVER_BASE}/v1/search/local.json`, headers: { "X-Naver-Client-Id": id, "X-Naver-Client-Secret": secret } };
  return null;
}

export function hasNaverSearch(): boolean {
  return naverEndpoint() !== null;
}

export function hasGooglePlaces(): boolean {
  return !!process.env.GOOGLE_PLACES_API_KEY?.trim();
}

export type FoundPlace = PlaceInfo & { detail: string };
export type PlaceSource = "naver" | "google";

const stripTags = (s: string) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();

/** 네이버 지역 검색 (최대 5곳). 키가 없으면 null */
export async function naverSearch(q: string): Promise<FoundPlace[] | null> {
  const endpoint = naverEndpoint();
  if (!endpoint) return null;
  const params = new URLSearchParams({ query: q, display: "5", start: "1", sort: "random" });
  const res = await fetch(`${endpoint.url}?${params}`, {
    headers: endpoint.headers,
    signal: AbortSignal.timeout(6000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`naver ${res.status}`);
  const json = (await res.json()) as {
    items?: { title: string; category?: string; address?: string; roadAddress?: string; mapx?: string; mapy?: string }[];
  };
  return (json.items ?? []).flatMap((it): FoundPlace[] => {
    const name = stripTags(it.title);
    if (!name) return [];
    // mapx·mapy: 경도·위도 × 10,000,000 (WGS84)
    const lng = Number(it.mapx) / 1e7;
    const lat = Number(it.mapy) / 1e7;
    const geo = Number.isFinite(lat) && Number.isFinite(lng) && lat > 30 && lat < 45 && lng > 120 && lng < 135 ? { lat, lng } : {};
    const detail = [it.category, it.roadAddress || it.address].filter(Boolean).join(" · ");
    return [{ name, detail, ...geo }];
  });
}

/** 구글 Places 텍스트 검색 (최대 5곳, 한국어). 키가 없으면 null */
export async function googleSearch(q: string): Promise<FoundPlace[] | null> {
  if (!hasGooglePlaces()) return null;
  const res = await fetch(`${GOOGLE_PLACES_BASE}/v1/places:searchText`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": process.env.GOOGLE_PLACES_API_KEY!.trim(),
      // 필요한 칸만 (요금 등급도 이걸로 정해진다)
      "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.location",
    },
    body: JSON.stringify({ textQuery: q, languageCode: "ko", regionCode: "KR", pageSize: 5 }),
    signal: AbortSignal.timeout(6000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`google ${res.status}`);
  const json = (await res.json()) as {
    places?: { displayName?: { text?: string }; formattedAddress?: string; location?: { latitude?: number; longitude?: number } }[];
  };
  return (json.places ?? []).flatMap((p): FoundPlace[] => {
    const name = p.displayName?.text?.trim();
    if (!name) return [];
    const lat = p.location?.latitude;
    const lng = p.location?.longitude;
    const geo = typeof lat === "number" && typeof lng === "number" ? { lat, lng } : {};
    return [{ name, detail: (p.formattedAddress ?? "").replace(/^대한민국\s*/, ""), ...geo }];
  });
}

/** 네이버 → 구글 순서로: 키가 없거나 못 찾거나 오류면 다음으로. 둘 다 없으면 null (브라우저가 OpenStreetMap으로) */
export async function searchPlaces(q: string): Promise<{ source: PlaceSource; results: FoundPlace[] } | null> {
  const steps: [PlaceSource, (q: string) => Promise<FoundPlace[] | null>][] = [
    ["naver", naverSearch],
    ["google", googleSearch],
  ];
  for (const [source, run] of steps) {
    try {
      const results = await run(q);
      if (results?.length) return { source, results };
    } catch {}
  }
  return null;
}

const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

/** 지도 도메인 안에서만 리디렉션을 따라가고, 마지막 문서(HTML 앞부분)까지 */
async function follow(start: URL): Promise<{ urls: string[]; html: string }> {
  const urls: string[] = [start.href];
  let url = start;
  for (let hop = 0; hop < 6; hop++) {
    const res = await fetch(url, { redirect: "manual", headers: { "User-Agent": UA, "Accept-Language": "ko" }, signal: AbortSignal.timeout(5000), cache: "no-store" });
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) {
      const next = new URL(loc, url);
      if (next.protocol !== "https:" || !isMapHost(next.hostname)) break;
      urls.push(next.href);
      url = next;
      continue;
    }
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) return { urls, html: "" };
    return { urls, html: await readHead(res) };
  }
  return { urls, html: "" };
}

/** 문서 앞 512KB만 읽는다 */
async function readHead(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < 512 * 1024) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
  }
  void reader.cancel().catch(() => {});
  return new TextDecoder().decode(Buffer.concat(chunks));
}

const metaContent = (html: string, prop: string) =>
  new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']*)["']`, "i").exec(html)?.[1] ??
  new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${prop}["']`, "i").exec(html)?.[1] ??
  "";

/** 지도 앱 공유 글(또는 링크)에서 장소: 이름은 공유 글 → 문서 제목 → 주소 순, 좌표는 주소 → 문서 → 네이버 검색 */
export async function resolveMapShare(text: string): Promise<PlaceInfo | null> {
  const start = findMapUrl(text);
  if (!start) return null;
  const link = start.href;
  let name = nameFromShareText(text);
  let geo = coordsFromUrl(link);

  try {
    const { urls, html } = await follow(start);
    for (const u of urls) {
      geo ??= coordsFromUrl(u);
      name ||= nameFromUrl(u);
    }
    if (html) {
      name ||= cleanPageTitle(metaContent(html, "og:title") || /<title>([^<]*)<\/title>/i.exec(html)?.[1] || "");
      geo ??= coordsFromUrl(metaContent(html, "og:url")) ?? coordsFromNaverHtml(html);
    }
    // 네이버 지도 장소 주소(…/place/123)는 플레이스 문서에 이름·좌표가 있다
    const placeId = urls.map((u) => /naver\.com\/.*?(?:place|restaurant|cafe|hairshop|hospital|accommodation)\/(\d{3,})/.exec(u)?.[1]).find(Boolean);
    if (placeId && (!name || !geo)) {
      const page = await follow(new URL(`https://m.place.naver.com/place/${placeId}/home`));
      if (page.html) {
        name ||= cleanPageTitle(metaContent(page.html, "og:title"));
        geo ??= coordsFromNaverHtml(page.html);
      }
    }
  } catch {
    // 링크를 못 열어도 공유 글의 이름과 링크만으로 넣는다
  }

  // 좌표가 끝내 없으면 이름으로 찾아(네이버 → 구글) 맨 앞 결과
  if (!geo && name) {
    const first = (await searchPlaces(name))?.results.find((p) => p.lat !== undefined);
    if (first) geo = { lat: first.lat!, lng: first.lng! };
  }
  return { name: name || "공유받은 장소", ...(geo ?? {}), link };
}
