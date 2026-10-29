import Link from "next/link";
import { Star, UtensilsCrossed } from "lucide-react";
import { todayKST } from "@/components/CalendarView";
import { TravelMap, type MapPoint } from "@/components/TravelMap";
import { fileUrl, hrefFor, type DriveIndex, type FileEntry, type FolderEntry } from "@/lib/drive";
import { collectNotes, dateOf } from "@/lib/folder-meta";
import { splitFrontmatter } from "@/lib/markdown";
import { photosIn } from "@/lib/trip-photos";

// 음식 폴더 위 요약: 이번 달 횟수·금액, 자주 간 곳, 먹은 곳 지도(장소나 사진 위치), 최근 기록(사진·메뉴·가격·별점)

type Meal = {
  file: FileEntry;
  date: string;
  restaurant: string;
  menu: string[];
  price: number;
  rating: number;
  geo: { lat: number; lng: number; name: string } | null;
  photo: FileEntry | null;
};

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const dot = (d: string) => d.replace(/-/g, ".");
const num = (v: unknown) => (typeof v === "number" ? v : Number(String(v ?? "").replace(/[,원\s]/g, "")) || 0);

function parse(file: FileEntry, text: string): Meal | null {
  const meta = splitFrontmatter(text).meta as Record<string, unknown>;
  const date = dateOf(meta.date, file);
  if (!date) return null;
  const photos = photosIn(file, text);
  const place = meta.place && typeof meta.place === "object" ? (meta.place as Record<string, unknown>) : null;
  const restaurant = String(meta.restaurant ?? "").trim();
  const lat = num(place?.lat);
  const lng = num(place?.lng);
  // 위치: 적어 둔 장소 → 없으면 위치가 있는 첫 사진
  const withGeo = photos.find((p) => p.photo?.lat !== undefined);
  const geo =
    place && (lat || lng)
      ? { lat, lng, name: String(place.name ?? "") }
      : withGeo
        ? { lat: withGeo.photo!.lat!, lng: withGeo.photo!.lng!, name: "" }
        : null;
  return {
    file,
    date,
    restaurant,
    menu: Array.isArray(meta.menu) ? meta.menu.map((m) => String(m ?? "").trim()).filter(Boolean) : [],
    price: Math.round(num(meta.price)),
    rating: Math.max(0, Math.min(5, Math.round(num(meta.rating)))),
    geo,
    photo: photos[0] ?? null,
  };
}

export async function FoodView({ index, folder }: { index: DriveIndex; folder: FolderEntry }) {
  const { items, read, total } = await collectNotes(index, folder, parse);
  if (!items.length)
    return (
      <section className="food empty">
        <p className="muted small">
          아직 음식 기록이 없어요. <b>새 글</b>에서 식당·메뉴·가격을 적거나, 휴대폰 갤러리에서 음식 사진을 <b>공유 → my-life → 음식</b>으로 보내면 찍은
          날짜와 장소가 자동으로 들어가요.
        </p>
      </section>
    );

  const meals = items.sort((a, b) => b.date.localeCompare(a.date) || b.file.name.localeCompare(a.file.name));
  const month = todayKST().slice(0, 7);
  const thisMonth = meals.filter((m) => m.date.startsWith(month));
  const counts = new Map<string, number>();
  for (const m of meals) if (m.restaurant) counts.set(m.restaurant, (counts.get(m.restaurant) ?? 0) + 1);
  const favorites = [...counts.entries()].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const points: MapPoint[] = meals
    .filter((m) => m.geo)
    .map((m) => ({
      lat: m.geo!.lat,
      lng: m.geo!.lng,
      name: m.restaurant || m.geo!.name || "먹은 곳",
      sub: `${dot(m.date)}${m.menu.length ? ` · ${m.menu.join(", ")}` : ""}`,
      href: hrefFor(m.file),
      image: m.photo ? fileUrl(m.photo) : undefined,
    }));

  return (
    <section className="food">
      <div className="spend-head">
        <div className="stat">
          <span className="muted small">{Number(month.slice(5))}월에 먹은 기록</span>
          <strong>{thisMonth.length}번</strong>
        </div>
        <div className="stat">
          <span className="muted small">{Number(month.slice(5))}월 음식값</span>
          <strong>{won(thisMonth.reduce((a, m) => a + m.price, 0))}</strong>
        </div>
      </div>
      {favorites.length > 0 && (
        <p className="food-favs small">
          <span className="muted">자주 간 곳</span>{" "}
          {favorites.map(([name, n]) => (
            <span key={name} className="chip">
              {name} · {n}번
            </span>
          ))}
        </p>
      )}
      {points.length > 0 && <TravelMap points={points} />}
      <ul className="meals">
        {meals.slice(0, 30).map((m) => (
          <li key={m.file.id}>
            <Link href={hrefFor(m.file)}>
              {m.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={fileUrl(m.photo)} alt="" loading="lazy" />
              ) : (
                <span className="meal-noimg" aria-hidden>
                  <UtensilsCrossed size={22} strokeWidth={1.5} />
                </span>
              )}
              <span className="meal-text">
                <strong>{m.restaurant || m.geo?.name || m.file.slug}</strong>
                {m.menu.length > 0 && <span className="small">{m.menu.join(", ")}</span>}
                <span className="muted small">
                  {dot(m.date)}
                  {m.price > 0 && ` · ${won(m.price)}`}
                  {m.rating > 0 && (
                    <span className="meal-stars" aria-label={`별점 ${m.rating}`}>
                      {" · "}
                      <Star size={12} aria-hidden /> {m.rating}
                    </span>
                  )}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {read < total && (
        <p className="muted small">
          전체 {total}개 중 {read}개를 읽었어요. 새로고침하면 나머지도 나옵니다.
        </p>
      )}
    </section>
  );
}
