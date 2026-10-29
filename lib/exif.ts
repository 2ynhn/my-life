// JPEG 사진의 EXIF에서 찍은 위치(GPS)와 찍은 시각만 읽는다 (브라우저·서버 공용, 외부 라이브러리 없음).
// 사진을 줄이면 EXIF가 사라지므로, 올리기 전에 원본에서 읽어 둔다.

/** taken: 찍은 곳 시각 "2025-05-04 13:22:11" */
export type ExifPhoto = { lat?: number; lng?: number; taken?: string };

export function readExif(buf: ArrayBuffer): ExifPhoto | null {
  const v = new DataView(buf);
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return null; // JPEG 아님
  let off = 2;
  while (off + 4 <= v.byteLength) {
    if (v.getUint8(off) !== 0xff) return null;
    const marker = v.getUint8(off + 1);
    const len = v.getUint16(off + 2);
    if (marker === 0xe1 && off + 10 <= v.byteLength && v.getUint32(off + 4) === 0x45786966 /* "Exif" */) {
      return parseTiff(v, off + 10, len - 8);
    }
    if (marker === 0xda) return null; // 그림 데이터 시작: EXIF 없음
    off += 2 + len;
  }
  return null;
}

function parseTiff(v: DataView, start: number, length: number): ExifPhoto | null {
  const end = Math.min(v.byteLength, start + length);
  const le = v.getUint16(start) === 0x4949;
  const u16 = (o: number) => (o + 2 <= end ? v.getUint16(o, le) : 0);
  const u32 = (o: number) => (o + 4 <= end ? v.getUint32(o, le) : 0);
  /** IFD의 태그 → 값이 있는 위치(4바이트보다 크면 가리키는 곳) */
  const tags = (ifd: number) => {
    const out = new Map<number, { type: number; count: number; at: number }>();
    const base = start + ifd;
    const n = u16(base);
    for (let i = 0; i < n && i < 200; i++) {
      const e = base + 2 + i * 12;
      const type = u16(e + 2);
      const count = u32(e + 4);
      const size = ({ 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 10: 8 } as Record<number, number>)[type] ?? 1;
      out.set(u16(e), { type, count, at: size * count > 4 ? start + u32(e + 8) : e + 8 });
    }
    return out;
  };
  const ascii = (t?: { count: number; at: number }) => {
    if (!t) return "";
    let s = "";
    for (let i = 0; i < t.count && t.at + i < end; i++) {
      const c = v.getUint8(t.at + i);
      if (!c) break;
      s += String.fromCharCode(c);
    }
    return s;
  };
  const rationals = (t?: { count: number; at: number }) =>
    t ? Array.from({ length: Math.min(t.count, 3) }, (_, i) => u32(t.at + i * 8) / (u32(t.at + i * 8 + 4) || 1)) : [];

  if (u16(start + 2) !== 42) return null;
  const ifd0 = tags(u32(start + 4));
  const out: ExifPhoto = {};

  // 찍은 시각: Exif IFD의 DateTimeOriginal(0x9003) → 없으면 IFD0 DateTime(0x0132). "2025:05:04 13:22:11"
  const exifIfd = ifd0.get(0x8769);
  const raw = (exifIfd ? ascii(tags(u32(exifIfd.at)).get(0x9003)) : "") || ascii(ifd0.get(0x0132));
  const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2})(?::(\d{2}))?/.exec(raw);
  if (m && m[1] !== "0000") out.taken = `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6] ?? "00"}`;

  // 위치: GPS IFD(0x8825)의 위도(2)·경도(4)와 N/S(1)·E/W(3)
  const gpsIfd = ifd0.get(0x8825);
  if (gpsIfd) {
    const g = tags(u32(gpsIfd.at));
    const dms = (d: number[]) => (d.length === 3 ? d[0] + d[1] / 60 + d[2] / 3600 : NaN);
    let lat = dms(rationals(g.get(2)));
    let lng = dms(rationals(g.get(4)));
    if (ascii(g.get(1)) === "S") lat = -lat;
    if (ascii(g.get(3)) === "W") lng = -lng;
    // 0,0 은 위치 없음으로 본다
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && (lat || lng)) {
      out.lat = Math.round(lat * 1e6) / 1e6;
      out.lng = Math.round(lng * 1e6) / 1e6;
    }
  }
  return out.taken || out.lat !== undefined ? out : null;
}
