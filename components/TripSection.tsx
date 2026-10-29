import Link from "next/link";
import { NotebookPen, Plus } from "lucide-react";
import { TravelMap, type MapPoint } from "@/components/TravelMap";
import { fileUrl, hrefFor, type DriveIndex, type FileEntry, type FolderEntry } from "@/lib/drive";
import { dateOf } from "@/lib/folder-meta";
import { placesOf } from "@/lib/places";
import { diariesBetween, diaryNotes, photosIn } from "@/lib/trip-photos";

// 여행 글 위: 지도(들른 곳 + 위치가 있는 사진), 이 여행의 사진(사진마다 '이 사진으로 일기 쓰기'), 이 여행 동안의 일기

const dot = (d: string) => d.replace(/-/g, ".");

/** 그날 일기 쓰기 주소: 그날 일기가 있으면 거기에 넣고, 없으면 그 날짜로 새 일기 (연도 폴더가 없으면 저장할 때 만든다) */
function diaryHrefFor(daily: FolderEntry | null, all: FileEntry[], date: string, photo: string): { href: string; exists: boolean } | null {
  if (!daily) return null;
  const q = `photo=${encodeURIComponent(photo)}`;
  const existing = all.find((n) => n.name.startsWith(date));
  if (existing) return existing.can.edit ? { href: `${hrefFor(existing)}?mode=edit&${q}`, exists: true } : null;
  const year = daily.children.find((c): c is FolderEntry => c.kind === "folder" && c.name === date.slice(0, 4));
  if (year) return year.can.addChildren ? { href: `${hrefFor(year)}?mode=new&date=${date}&${q}`, exists: false } : null;
  return daily.can.addChildren ? { href: `${hrefFor(daily)}?mode=new&sub=${date.slice(0, 4)}&date=${date}&${q}`, exists: false } : null;
}

export async function TripSection({ index, entry, text, meta }: { index: DriveIndex; entry: FileEntry; text: string; meta: Record<string, unknown> }) {
  const start = dateOf(meta.start ?? meta.date, entry) || entry.modifiedTime.slice(0, 10);
  const end = dateOf(meta.end, entry) || start;
  const { daily, notes: all } = await diaryNotes(index);
  // 여행 사진 날짜: 찍은 날, 모르면 출발일 (올린 날은 여행과 상관없으니 쓰지 않는다)
  const own = photosIn(entry, text).map((file) => ({ file, date: file.photo?.taken?.slice(0, 10) ?? start }));
  const { diaries, photos: diaryPhotos } = await diariesBetween(index, all, start, end);

  const places: MapPoint[] = placesOf(meta).map((p) => ({ ...p, sub: p.date ? dot(p.date) : undefined }));
  const photoPoints: MapPoint[] = [
    ...own.map((p) => ({ ...p, note: entry })),
    ...diaryPhotos.filter((p) => !own.some((o) => o.file.id === p.file.id)),
  ]
    .filter((p) => p.file.photo?.lat !== undefined)
    .map((p) => ({
      lat: p.file.photo!.lat!,
      lng: p.file.photo!.lng!,
      name: p.note === entry ? "사진" : `일기 ${dot(p.note.name.slice(5, 10))}`,
      sub: p.file.photo?.taken ? dot(p.file.photo.taken) : dot(p.date),
      href: p.note === entry ? undefined : hrefFor(p.note),
      image: fileUrl(p.file),
    }));
  const points = [...places, ...photoPoints];
  const noGeo = own.filter((p) => p.file.photo?.lat === undefined).length;

  return (
    <section className="trip-extra">
      {points.length > 0 && <TravelMap points={points} route />}
      {own.length > 0 && (
        <div className="trip-photos">
          <h2>
            이 여행 사진 <span className="muted small">{own.length}장{noGeo > 0 && ` · 위치 정보 없는 ${noGeo}장은 지도에 안 나와요`}</span>
          </h2>
          <ul>
            {own.map(({ file, date }) => {
              const target = diaryHrefFor(daily, all, date, file.name);
              return (
                <li key={file.id}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={fileUrl(file)} alt="" loading="lazy" />
                  <span className="muted small">{dot(date)}</span>
                  {target && (
                    <Link href={target.href} className="btn photo-diary">
                      {target.exists ? <NotebookPen size={14} aria-hidden /> : <Plus size={14} aria-hidden />}
                      {target.exists ? "그날 일기에 넣기" : "사진으로 일기 쓰기"}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {diaries.length > 0 && (
        <div className="trip-diaries">
          <h2>이 여행 동안의 일기</h2>
          <ul className="note-list">
            {diaries.map((d) => {
              const n = diaryPhotos.filter((p) => p.note === d).length;
              return (
                <li key={d.id}>
                  <Link href={hrefFor(d)}>
                    <span className="title">{d.slug}</span>
                    {n > 0 && <span className="muted small">사진 {n}장</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
