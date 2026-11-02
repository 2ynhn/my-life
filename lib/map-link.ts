// 지도 링크 (브라우저·서버 공용, 네트워크 없이 글자만 다룬다)
// - 장소 → 지도에서 열 주소: 붙여 넣은 공유 링크가 있으면 그것, 없으면 네이버 지도 검색
// - 지도 앱 '공유' 글에서 링크·이름·좌표 꺼내기

export type PlaceInfo = { name: string; lat?: number; lng?: number; link?: string };

/** 공유 링크로 받는 지도 서비스 (https만, 이 도메인과 그 하위만) */
const MAP_HOSTS = ["naver.me", "naver.com", "kko.to", "kakao.com", "goo.gl", "google.com", "google.co.kr"];

export function isMapHost(host: string): boolean {
  const h = host.toLowerCase();
  return MAP_HOSTS.some((d) => h === d || h.endsWith(`.${d}`));
}

/** 글 안의 첫 번째 지도 링크 (지도 앱 공유 글은 "[네이버 지도]\n가게\n주소\nhttps://naver.me/…" 꼴) */
export function findMapUrl(text: string): URL | null {
  for (const m of text.matchAll(/https?:\/\/[^\s<>"']+/g)) {
    try {
      const u = new URL(m[0]);
      if (u.protocol === "https:" && isMapHost(u.hostname)) return u;
    } catch {}
  }
  return null;
}

export function mapLabel(link: string): string {
  try {
    const h = new URL(link).hostname;
    if (/(^|\.)naver\.(me|com)$/.test(h)) return "네이버 지도";
    if (/(^|\.)(kko\.to|kakao\.com)$/.test(h)) return "카카오맵";
    if (/(^|\.)(goo\.gl|google\.com|google\.co\.kr)$/.test(h)) return "구글 지도";
  } catch {}
  return "지도";
}

/** 지도에서 열 주소: 공유 링크 → 이름으로 네이버 지도 검색 → 좌표로 구글 지도 */
export function mapHref(p: { name?: string; lat?: number; lng?: number; link?: string }): string | null {
  if (p.link && /^https:\/\//.test(p.link)) return p.link;
  const name = p.name?.trim();
  if (name && name !== "장소" && name !== "현재 위치") return `https://map.naver.com/p/search/${encodeURIComponent(name)}`;
  if (Number.isFinite(p.lat) && Number.isFinite(p.lng)) return `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;
  return null;
}

const inKorea = (lat: number, lng: number) => lat > 32 && lat < 39.5 && lng > 124 && lng < 132.5;
const valid = (lat: number, lng: number) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);

/** 주소에 좌표가 적혀 있으면 (구글 @위도,경도 · !3d!4d · lat/lng · q=위도,경도) */
export function coordsFromUrl(raw: string): { lat: number; lng: number } | null {
  let s = raw;
  try {
    s = decodeURIComponent(raw);
  } catch {}
  const pick = (a: string, b: string) => {
    const lat = Number(a);
    const lng = Number(b);
    return valid(lat, lng) ? { lat, lng } : null;
  };
  const d34 = /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/.exec(s);
  if (d34) return pick(d34[1], d34[2]);
  const at = /@(-?\d+\.\d+),(-?\d+\.\d+)/.exec(s);
  if (at) return pick(at[1], at[2]);
  try {
    const u = new URL(raw);
    const q = u.searchParams;
    const lat = q.get("lat") ?? q.get("latitude");
    const lng = q.get("lng") ?? q.get("lon") ?? q.get("longitude");
    if (lat && lng) return pick(lat, lng);
    const ll = /^(-?\d+\.\d+),\s*(-?\d+\.\d+)$/.exec(q.get("q") ?? q.get("query") ?? q.get("ll") ?? "");
    if (ll) return pick(ll[1], ll[2]);
  } catch {}
  return null;
}

/** 구글 지도 주소의 장소 이름: /maps/place/이름/@… */
export function nameFromUrl(raw: string): string {
  try {
    const u = new URL(raw);
    const m = /\/maps\/place\/([^/@]+)/.exec(u.pathname);
    if (m) return decodeURIComponent(m[1]).replace(/\+/g, " ").trim();
  } catch {}
  return "";
}

const REGION = "(?:서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|충청|전북|전남|전라|경북|경남|경상|제주)";
// 한글에는 \b가 안 먹어서 (?:\s|$)로 끝을 본다. "서울숲 카페"처럼 지역 이름으로 시작하는 가게는 남긴다
const ADDRESS_LINE = new RegExp(`^${REGION}\\S*\\s+\\S+(?:구|군|시|읍|면|동|로|길)(?:\\s|$)`);
// 한 줄 입력칸에 붙이면 줄바꿈이 사라져 "가게 이름 서울 중구 …"가 된다 → 주소부터 뒤를 자른다
const ADDRESS_TAIL = new RegExp(`\\s+${REGION}\\S*\\s+\\S+(?:구|군|시|읍|면|동|로|길)(?:\\s.*)?$`);

/** 지도 앱 공유 글에서 장소 이름: 링크·[네이버 지도] 같은 머리말·주소처럼 보이는 줄을 뺀 첫 줄 */
export function nameFromShareText(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/https?:\/\/\S+/g, "").trim())
    .filter(Boolean);
  for (const line of lines) {
    // "[카카오맵] 가게 이름" 처럼 머리말 뒤에 이름이 붙기도 한다
    const rest = line.replace(/^\[[^\]]*\]\s*/, "").trim();
    if (!rest) continue;
    if (ADDRESS_LINE.test(rest)) continue; // 주소
    if (/^(네이버\s*지도|카카오맵|Google\s*지도|Google\s*Maps)$/i.test(rest)) continue;
    return (rest.replace(ADDRESS_TAIL, "").trim() || rest).slice(0, 80);
  }
  return "";
}

/** 웹 문서 제목에서 서비스 이름 떼기: "을지면옥 : 네이버" · "을지면옥 | 카카오맵" · "을지면옥 - Google 지도" */
export function cleanPageTitle(title: string): string {
  const t = title
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s*[:|·\-–]\s*(네이버\s*(지도|플레이스)?|NAVER(\s*Map)?|카카오맵|Kakao\s*Map|Google\s*(지도|Maps))\s*$/i, "")
    .trim();
  return /^(네이버\s*(지도|플레이스)?|NAVER(\s*Map)?|카카오맵|Kakao\s*Map|Google\s*(지도|Maps))$/i.test(t) ? "" : t;
}

/** 네이버 플레이스 문서 안의 좌표 ("x":"127.0","y":"37.5"), 한국 안일 때만 */
export function coordsFromNaverHtml(html: string): { lat: number; lng: number } | null {
  const m = /"x"\s*:\s*"?(1[23]\d\.\d+)"?\s*,\s*"y"\s*:\s*"?(3\d\.\d+)"?/.exec(html);
  if (!m) return null;
  const lng = Number(m[1]);
  const lat = Number(m[2]);
  return inKorea(lat, lng) ? { lat, lng } : null;
}
