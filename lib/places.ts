// 여행 글 앞머리의 places 목록을 지도용 좌표로 (브라우저·서버 공용)

export type Place = { name: string; date: string; lat: number; lng: number };

const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN);
const dateStr = (v: unknown) =>
  v instanceof Date ? v.toISOString().slice(0, 10) : /^\d{4}-\d{2}-\d{2}/.test(String(v ?? "")) ? String(v).slice(0, 10) : "";

/** 좌표가 올바른 장소만 (위도 -90~90, 경도 -180~180) */
export function placesOf(meta: Record<string, unknown>): Place[] {
  const list = Array.isArray(meta.places) ? meta.places : [];
  return list.flatMap((p): Place[] => {
    if (!p || typeof p !== "object") return [];
    const o = p as Record<string, unknown>;
    const lat = num(o.lat);
    const lng = num(o.lng ?? o.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return [];
    return [{ name: String(o.name ?? "").trim() || "장소", date: dateStr(o.date), lat, lng }];
  });
}

/** 좌표 없이 이름만 적힌 장소도 목록에는 보여 준다 */
export function placeNames(meta: Record<string, unknown>): string[] {
  const list = Array.isArray(meta.places) ? meta.places : [];
  return list
    .map((p) => (p && typeof p === "object" ? String((p as Record<string, unknown>).name ?? "") : String(p ?? "")).trim())
    .filter(Boolean);
}
