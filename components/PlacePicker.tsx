"use client";

import { Link2, LocateFixed } from "lucide-react";
import { useState } from "react";
import { findMapUrl, mapLabel, type PlaceInfo } from "@/lib/map-link";

// 여행·음식 글에 장소 넣기: 한 칸에 이름을 적으면 찾고, 지도 앱 공유 링크를 붙이면 그 장소를 넣는다.
// - 이름 찾기: 네이버 → 구글(운영자가 키를 넣은 것만, 앱 서버 경유) → 그래도 없으면 OpenStreetMap(브라우저가 바로)
// - 링크: 네이버 지도·카카오맵·구글 지도 '공유' 링크 → 앱 서버가 이름·좌표를 꺼내고 링크도 같이 저장
// - 지금 있는 곳(GPS)

type Found = PlaceInfo & { detail: string };
type Props = { onPick: (p: PlaceInfo) => void; onClose: () => void };

const NOMINATIM = "https://nominatim.openstreetmap.org";

async function searchOsm(q: string): Promise<Found[]> {
  const params = new URLSearchParams({ q, format: "jsonv2", limit: "8", "accept-language": "ko", countrycodes: "kr" });
  let res = await fetch(`${NOMINATIM}/search?${params}`);
  if (!res.ok) throw new Error();
  let json = (await res.json()) as { name?: string; display_name: string; lat: string; lon: string }[];
  // 국내에서 못 찾으면 전 세계에서
  if (!json.length) {
    params.delete("countrycodes");
    res = await fetch(`${NOMINATIM}/search?${params}`);
    if (!res.ok) throw new Error();
    json = await res.json();
  }
  return json.map((r) => ({ name: r.name || r.display_name.split(",")[0], detail: r.display_name, lat: Number(r.lat), lng: Number(r.lon) }));
}

export function PlacePicker({ onPick, onClose }: Props) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Found[] | null>(null);
  const [source, setSource] = useState<"naver" | "google" | "osm" | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 넣기 전에 이름을 고칠 수 있게 (지금 있는 곳·공유 링크)
  const [pending, setPending] = useState<PlaceInfo | null>(null);

  const fromLink = async (text: string) => {
    const res = await fetch("/api/places", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
    const j = (await res.json().catch(() => ({}))) as { place?: PlaceInfo; error?: string };
    if (!res.ok || !j.place) throw new Error(j.error || "링크에서 장소를 꺼내지 못했습니다.");
    setResults(null);
    setPending(j.place);
  };

  const fromName = async (name: string) => {
    const res = await fetch(`/api/places?${new URLSearchParams({ q: name })}`);
    if (res.ok) {
      const j = (await res.json()) as { source: "naver" | "google"; results: Found[] };
      if (j.results.length) {
        setSource(j.source);
        return setResults(j.results);
      }
    }
    // 키가 없거나(501) 네이버·구글 모두 못 찾았거나 오류면 OpenStreetMap으로
    setSource("osm");
    setResults(await searchOsm(name));
  };

  const search = async () => {
    const text = q.trim();
    if (!text) return;
    setBusy(true);
    setError(null);
    setPending(null);
    try {
      if (findMapUrl(text)) await fromLink(text);
      else await fromName(text);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "장소를 찾지 못했습니다. 잠시 뒤 다시 시도하세요.");
    } finally {
      setBusy(false);
    }
  };

  const useHere = () => {
    if (!navigator.geolocation) return setError("이 기기에서는 위치를 알 수 없습니다.");
    setBusy(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        let name = "현재 위치";
        try {
          // 좌표 → 장소 이름 (실패해도 '현재 위치'로)
          const params = new URLSearchParams({ lat: String(coords.latitude), lon: String(coords.longitude), format: "jsonv2", "accept-language": "ko", zoom: "16" });
          const res = await fetch(`${NOMINATIM}/reverse?${params}`);
          const json = (await res.json()) as { name?: string; display_name?: string };
          name = json.name || json.display_name?.split(",")[0] || name;
        } catch {}
        setResults(null);
        setPending({ lat: coords.latitude, lng: coords.longitude, name });
        setBusy(false);
      },
      (e) => {
        setBusy(false);
        setError(e.code === e.PERMISSION_DENIED ? "위치 권한이 막혀 있습니다. 브라우저 설정에서 허용해 주세요." : "위치를 알 수 없습니다.");
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  };

  const pasteLink = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!findMapUrl(text)) return setError("복사한 내용에 지도 링크가 없어요. 지도 앱에서 '공유 → 링크 복사' 해 주세요.");
      setQ(text.trim());
      setBusy(true);
      setError(null);
      await fromLink(text);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "붙여 넣지 못했습니다. 칸에 직접 붙여 넣어 주세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="picker-backdrop" role="dialog" aria-modal="true" aria-label="장소 추가" onClick={onClose}>
      <div className="picker" onClick={(e) => e.stopPropagation()}>
        <div className="picker-head">
          <strong>장소 추가</strong>
          <button className="btn" onClick={onClose}>
            닫기
          </button>
        </div>
        <form
          className="search-form"
          onSubmit={(e) => {
            e.preventDefault();
            void search();
          }}
        >
          <input name="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="장소 이름 또는 지도 공유 링크" autoFocus />
          <button className="btn btn-save" type="submit" disabled={busy}>
            찾기
          </button>
        </form>
        <div className="picker-quick">
          <button className="btn here" onClick={useHere} disabled={busy}>
            <LocateFixed size={16} aria-hidden />
            지금 있는 곳
          </button>
          {typeof navigator !== "undefined" && !!navigator.clipboard && (
            <button className="btn here" onClick={() => void pasteLink()} disabled={busy}>
              <Link2 size={16} aria-hidden />
              복사한 지도 링크
            </button>
          )}
        </div>
        {error && <p className="status small error">{error}</p>}
        {busy && <p className="small muted">찾는 중…</p>}

        {pending && (
          <div className="here-confirm">
            <label className="small muted">
              이름
              <input value={pending.name} onChange={(e) => setPending({ ...pending, name: e.target.value })} />
            </label>
            {pending.link && (
              <p className="small muted">
                {mapLabel(pending.link)} 링크를 같이 넣어요{pending.lat === undefined ? " · 좌표를 못 찾아 지도에는 안 나와요" : ""}
              </p>
            )}
            <button className="btn btn-save" onClick={() => onPick(pending)}>
              넣기
            </button>
          </div>
        )}
        {results && (
          <ul className="picker-results">
            {results.length === 0 && <li className="muted small">찾은 장소가 없어요. 다른 이름으로 찾거나, 지도 앱의 공유 링크를 붙여 넣어 보세요.</li>}
            {results.map((r, i) => (
              <li key={i}>
                <button onClick={() => onPick({ name: r.name, lat: r.lat, lng: r.lng })}>
                  <span>{r.name}</span>
                  <span className="muted small">{r.detail}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {(source || !pending) && <p className="small muted">{source === "naver" ? "검색: 네이버" : source === "google" ? "검색: Google" : source === "osm" ? "검색: © OpenStreetMap 기여자" : "네이버 지도·카카오맵·구글 지도에서 '공유 → 링크 복사' 한 것도 넣을 수 있어요"}</p>}
      </div>
    </div>
  );
}
