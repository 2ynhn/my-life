import { MapPin } from "lucide-react";
import Link from "next/link";
import { TravelMap, type MapPoint } from "@/components/TravelMap";
import { hrefFor, type DriveIndex, type FileEntry, type FolderEntry } from "@/lib/drive";
import { collectNotes, dateOf } from "@/lib/folder-meta";
import { splitFrontmatter } from "@/lib/markdown";
import { placeNames, placesOf, type Place } from "@/lib/places";

// 여행 폴더 위에 보이는 요약: 모든 여행의 장소 지도 + 해마다 묶은 여행 타임라인

type Trip = { file: FileEntry; title: string; start: string; end: string; places: Place[]; names: string[]; companions: string[] };

function parse(file: FileEntry, text: string): Trip | null {
  const meta = splitFrontmatter(text).meta;
  const start = dateOf(meta.start ?? meta.date, file);
  if (!start) return null;
  const end = dateOf(meta.end, file) || start;
  const companions = Array.isArray(meta.companions) ? meta.companions.map(String).filter(Boolean) : [];
  return {
    file,
    title: String(meta.title ?? "").trim() || file.slug,
    start,
    end: end < start ? start : end,
    places: placesOf(meta),
    names: placeNames(meta),
    companions,
  };
}

const dot = (d: string) => d.replace(/-/g, ".");
const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000) + 1;

export async function TravelView({ index, folder }: { index: DriveIndex; folder: FolderEntry }) {
  const { items, read, total } = await collectNotes(index, folder, parse);
  if (!items.length) {
    return (
      <section className="trips empty">
        <p className="muted small">
          아직 여행 기록이 없어요. <b>새 글</b>로 여행 하나를 시작하고, 편집기의 <b>장소 추가</b>로 들른 곳을 넣으면 지도와
          타임라인이 생깁니다.
        </p>
      </section>
    );
  }
  const trips = items.sort((a, b) => b.start.localeCompare(a.start));
  const points: MapPoint[] = trips.flatMap((t) =>
    t.places.map((p) => ({ lat: p.lat, lng: p.lng, name: p.name, sub: `${t.title} · ${dot(p.date || t.start)}`, href: hrefFor(t.file) })),
  );
  const years = [...new Set(trips.map((t) => t.start.slice(0, 4)))];

  return (
    <section className="trips">
      <p className="muted small">
        여행 {trips.length}번 · 지도에 표시된 장소 {points.length}곳
      </p>
      {points.length > 0 ? (
        <TravelMap points={points} />
      ) : (
        <p className="muted small">좌표가 있는 장소가 아직 없어요. 편집기의 장소 추가로 넣어 보세요.</p>
      )}
      {years.map((y) => (
        <div key={y} className="trip-year">
          <h2>{y}</h2>
          <ol className="timeline">
            {trips
              .filter((t) => t.start.startsWith(y))
              .map((t) => (
                <li key={t.file.id}>
                  <Link href={hrefFor(t.file)} className="trip">
                    <span className="trip-title">{t.title}</span>
                    <span className="muted small">
                      {dot(t.start)}
                      {t.end !== t.start && ` – ${t.end.slice(0, 4) === t.start.slice(0, 4) ? dot(t.end.slice(5)) : dot(t.end)}`} ·{" "}
                      {days(t.start, t.end)}일{t.companions.length > 0 && ` · ${t.companions.join(", ")}`}
                    </span>
                    {t.names.length > 0 && <span className="trip-places small">
                        <MapPin size={14} aria-hidden /> {t.names.join(" → ")}
                      </span>}
                  </Link>
                </li>
              ))}
          </ol>
        </div>
      ))}
      {read < total && (
        <p className="muted small">
          전체 {total}개 중 {read}개를 읽었어요. 새로고침하면 나머지도 나옵니다.
        </p>
      )}
    </section>
  );
}
