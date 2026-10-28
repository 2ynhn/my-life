"use client";

import { LocateFixed } from "lucide-react";
import { useState } from "react";

// 여행 글에 장소 넣기: 이름으로 찾기(OpenStreetMap 검색) 또는 지금 있는 곳(GPS)
// 검색은 브라우저에서 OpenStreetMap에 바로 묻는다 — 이 앱 서버를 거치지 않는다.

type Found = { name: string; detail: string; lat: number; lng: number };
type Props = { onPick: (p: { name: string; lat: number; lng: number }) => void; onClose: () => void };

const NOMINATIM = "https://nominatim.openstreetmap.org";

export function PlacePicker({ onPick, onClose }: Props) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Found[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [here, setHere] = useState<{ lat: number; lng: number; name: string } | null>(null);

  const search = async () => {
    if (!q.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams({ q, format: "jsonv2", limit: "8", "accept-language": "ko" });
      const res = await fetch(`${NOMINATIM}/search?${params}`);
      if (!res.ok) throw new Error();
      const json = (await res.json()) as { name?: string; display_name: string; lat: string; lon: string }[];
      setResults(
        json.map((r) => ({
          name: r.name || r.display_name.split(",")[0],
          detail: r.display_name,
          lat: Number(r.lat),
          lng: Number(r.lon),
        })),
      );
    } catch {
      setError("장소를 찾지 못했습니다. 잠시 뒤 다시 시도하세요.");
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
        setHere({ lat: coords.latitude, lng: coords.longitude, name });
        setBusy(false);
      },
      (e) => {
        setBusy(false);
        setError(e.code === e.PERMISSION_DENIED ? "위치 권한이 막혀 있습니다. 브라우저 설정에서 허용해 주세요." : "위치를 알 수 없습니다.");
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
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
          <input name="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="장소 이름 (예: 성산일출봉)" autoFocus />
          <button className="btn btn-save" type="submit" disabled={busy}>
            찾기
          </button>
        </form>
        <button className="btn here" onClick={useHere} disabled={busy}>
          <LocateFixed size={16} aria-hidden />
          지금 있는 곳
        </button>
        {error && <p className="status small error">{error}</p>}
        {busy && <p className="small muted">찾는 중…</p>}

        {here && (
          <div className="here-confirm">
            <label className="small muted">
              이름
              <input value={here.name} onChange={(e) => setHere({ ...here, name: e.target.value })} />
            </label>
            <button className="btn btn-save" onClick={() => onPick(here)}>
              넣기
            </button>
          </div>
        )}
        {results && (
          <ul className="picker-results">
            {results.length === 0 && <li className="muted small">찾은 장소가 없어요. 다른 이름으로 찾아보세요.</li>}
            {results.map((r, i) => (
              <li key={i}>
                <button onClick={() => onPick(r)}>
                  <span>{r.name}</span>
                  <span className="muted small">{r.detail}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="small muted">검색: © OpenStreetMap 기여자</p>
      </div>
    </div>
  );
}
