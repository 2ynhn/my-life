"use client";

import { Map as MapIcon, X } from "lucide-react";
import { useState } from "react";
import { TravelMap, type MapPoint } from "@/components/TravelMap";

// 지도는 화면을 많이 차지하니 버튼을 눌렀을 때만 연다 (휴대폰에서 목록이 바로 보이게)

export function MapToggle({ points, label }: { points: MapPoint[]; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="map-toggle">
      <button type="button" className="btn" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? <X size={16} aria-hidden /> : <MapIcon size={16} aria-hidden />}
        {open ? "지도 닫기" : label}
      </button>
      {open && <TravelMap points={points} />}
    </div>
  );
}
