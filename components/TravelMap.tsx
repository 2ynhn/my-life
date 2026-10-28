"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";

// 여행 지도: OpenStreetMap 타일 + 동그라미 표시(이미지 파일 없이). 브라우저에서만 불러온다.

export type MapPoint = { lat: number; lng: number; name: string; sub?: string; href?: string };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function TravelMap({ points, route = false }: { points: MapPoint[]; route?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current || !points.length) return;
    let map: import("leaflet").Map | null = null;
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !ref.current) return;
      const color = getComputedStyle(ref.current).getPropertyValue("--chart").trim() || "#b5562f";
      map = L.map(ref.current, { scrollWheelZoom: false, attributionControl: true });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
      const latlngs = points.map((p) => L.latLng(p.lat, p.lng));
      if (route && latlngs.length > 1) L.polyline(latlngs, { color, weight: 2, opacity: 0.8, dashArray: "4 6" }).addTo(map);
      points.forEach((p, i) => {
        const label = `<b>${esc(p.name)}</b>${p.sub ? `<br><span>${esc(p.sub)}</span>` : ""}${
          p.href ? `<br><a href="${esc(p.href)}">글 보기</a>` : ""
        }`;
        L.circleMarker(latlngs[i], { radius: 7, color: "#fff", weight: 2, fillColor: color, fillOpacity: 1 })
          .addTo(map!)
          .bindPopup(label)
          .bindTooltip(esc(p.name));
      });
      if (latlngs.length === 1) map.setView(latlngs[0], 13);
      else map.fitBounds(L.latLngBounds(latlngs), { padding: [28, 28], maxZoom: 14 });
    })();
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [points, route]);

  if (!points.length) return null;
  return <div ref={ref} className="travel-map" role="region" aria-label="지도" />;
}
