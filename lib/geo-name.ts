// 브라우저 전용: 좌표 → 장소 이름 (OpenStreetMap Nominatim, 앱 서버를 거치지 않음). 실패하면 null

export type GeoName = { name: string; isEatery: boolean };

const EATERY = new Set(["restaurant", "cafe", "fast_food", "food_court", "bar", "pub", "ice_cream", "bakery"]);

export async function reverseName(lat: number, lng: number, zoom = 18): Promise<GeoName | null> {
  try {
    const params = new URLSearchParams({ lat: String(lat), lon: String(lng), format: "jsonv2", "accept-language": "ko", zoom: String(zoom) });
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`);
    if (!res.ok) return null;
    const j = (await res.json()) as { name?: string; display_name?: string; type?: string };
    const name = j.name || j.display_name?.split(",")[0]?.trim();
    return name ? { name, isEatery: EATERY.has(j.type ?? "") } : null;
  } catch {
    return null;
  }
}
