"use client";

import { ChevronRight, Plane, Receipt, Search, Sparkles, Star, UtensilsCrossed } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { sourceOf } from "@/components/FeatureView";
import { parseMeal, type Meal } from "@/components/FoodView";
import { useLocal, useLocalContext } from "@/components/LocalData";
import { SearchForm } from "@/components/SearchForm";
import { parseSpend, type Spend } from "@/components/SpendingView";
import { TravelMap, type MapPoint } from "@/components/TravelMap";
import { parseTrip, type Trip } from "@/components/TravelView";
import { fetchTexts, type LocalState } from "@/lib/local-store";
import type { LocalEntry } from "@/lib/local-types";
import type { ViewSource } from "@/lib/view-source";

// PC 첫 화면 (보기 위주): 위에 음식 · 구매, 아래에 여행(지도 + 최근 여행).
// 일기·빠른 기록은 휴대폰(쓰기 위주)에서. 기기 사본으로 그리고, 아직 받지 않은 글은 받는 대로 다시 그린다.

const dot = (d: string) => d.slice(5).replace("-", ".");
const won = (n: number) => n.toLocaleString("ko-KR");

function topFolder(local: LocalState, kind: string): LocalEntry | undefined {
  const root = local.tree.entries.find((e) => !e.p);
  return root && (local.children.get(root.id) ?? []).find((c) => c.k === "d" && c.v && local.tree.kinds[c.id] === kind);
}

function Head({ kind, label, href, icon, extra }: { kind: string; label: string; href: string; icon: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <div className="pc-head">
      <span className={`ficon ficon-${kind}`} aria-hidden>
        {icon}
      </span>
      <h2>
        <Link href={href}>{label}</Link>
      </h2>
      {extra}
      <Link className="pc-more" href={href}>
        전체 <ChevronRight size={14} aria-hidden />
      </Link>
    </div>
  );
}

function FoodPanel({ src, href }: { src: ViewSource; href: string }) {
  const meals: Meal[] = src.notes
    .flatMap(({ file, text }) => parseMeal(src, file, text) ?? [])
    .sort((a, b) => b.date.localeCompare(a.date) || b.file.name.localeCompare(a.file.name));
  const counts = new Map<string, number>();
  for (const m of meals) if (m.restaurant) counts.set(m.restaurant, (counts.get(m.restaurant) ?? 0) + 1);
  const favorites = [...counts.entries()].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]).slice(0, 4);
  return (
    <section className="pc-panel" data-feature="food" aria-label="음식">
      <Head kind="food" label="음식" href={href} icon={<UtensilsCrossed size={15} strokeWidth={1.75} />} />
      {favorites.length > 0 && (
        <div className="pc-chips">
          <span className="muted small">자주 간 곳</span>
          {favorites.map(([name, n]) => (
            <span key={name} className="chip">
              {name} · {n}번
            </span>
          ))}
        </div>
      )}
      {meals.length === 0 ? (
        <p className="muted small">아직 음식 기록이 없어요.</p>
      ) : (
        <ul className="pc-list">
          {meals.slice(0, 6).map((m) => (
            <li key={m.file.id}>
              <Link href={m.file.href} className="pc-meal">
                {m.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.photo.url} alt="" loading="lazy" />
                ) : (
                  <span className="pc-thumb" aria-hidden>
                    <UtensilsCrossed size={18} strokeWidth={1.5} />
                  </span>
                )}
                <span className="pc-main">
                  <strong>{m.restaurant || m.geo?.name || m.file.slug}</strong>
                  <span className="muted small">{[m.menu.join(", "), dot(m.date)].filter(Boolean).join(" · ")}</span>
                </span>
                <span className="pc-side">
                  {m.rating > 0 && (
                    <span className="pc-stars" aria-label={`별점 ${m.rating}`}>
                      {"★".repeat(m.rating)}
                    </span>
                  )}
                  {m.price > 0 && <span className="muted small num">{won(m.price)}원</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SpendPanel({ src, href }: { src: ViewSource; href: string }) {
  const [cat, setCat] = useState<string | null>(null);
  const spends: Spend[] = src.notes
    .flatMap(({ file, text }) => parseSpend(file, text) ?? [])
    .sort((a, b) => b.date.localeCompare(a.date) || b.file.name.localeCompare(a.file.name));
  const catCount = new Map<string, number>();
  for (const s of spends) catCount.set(s.category, (catCount.get(s.category) ?? 0) + 1);
  const cats = [...catCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([c]) => c);
  const shown = (cat ? spends.filter((s) => s.category === cat) : spends).slice(0, 8);
  return (
    <section className="pc-panel" data-feature="spending" aria-label="구매">
      <Head kind="spending" label="구매" href={href} icon={<Receipt size={15} strokeWidth={1.75} />} />
      {cats.length > 1 && (
        <div className="pc-chips" role="group" aria-label="분류">
          <button type="button" className={`chip${cat === null ? " on" : ""}`} aria-pressed={cat === null} onClick={() => setCat(null)}>
            전체
          </button>
          {cats.map((c) => (
            <button key={c} type="button" className={`chip${cat === c ? " on" : ""}`} aria-pressed={cat === c} onClick={() => setCat(c)}>
              {c}
            </button>
          ))}
        </div>
      )}
      {spends.length === 0 ? (
        <p className="muted small">아직 금액이 적힌 구매 기록이 없어요.</p>
      ) : (
        <table className="pc-table">
          <thead>
            <tr>
              <th scope="col">날짜</th>
              <th scope="col">품목</th>
              <th scope="col" className="num">
                금액
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((s) => (
              <tr key={s.file.id}>
                <td className="muted num">{dot(s.date)}</td>
                <td>
                  <Link href={s.file.href}>
                    {s.items.length ? s.items.slice(0, 2).join(", ") + (s.items.length > 2 ? ` 외 ${s.items.length - 2}` : "") : s.store}
                  </Link>
                  {s.items.length > 0 && <span className="muted small"> · {s.store}</span>}
                </td>
                <td className="num">{won(s.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function TravelPanel({ src, href }: { src: ViewSource; href: string }) {
  const trips: Trip[] = src.notes.flatMap(({ file, text }) => parseTrip(src, file, text) ?? []).sort((a, b) => b.start.localeCompare(a.start));
  const points: MapPoint[] = trips.flatMap((t) =>
    t.places.map((p) => ({ lat: p.lat, lng: p.lng, name: p.name, sub: `${t.title} · ${(p.date || t.start).replace(/-/g, ".")}`, href: t.file.href })),
  );
  const year = new Date().getFullYear().toString();
  const thisYear = trips.filter((t) => t.start.startsWith(year)).length;
  const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000) + 1;
  return (
    <section className="pc-panel pc-travel" data-feature="travel" aria-label="여행">
      <Head
        kind="travel"
        label="여행"
        href={href}
        icon={<Plane size={15} strokeWidth={1.75} />}
        extra={<span className="muted small">{thisYear ? `올해 ${thisYear}번` : ""}</span>}
      />
      {trips.length === 0 ? (
        <p className="muted small">아직 여행 기록이 없어요.</p>
      ) : (
        <div className="pc-travel-body">
          <div className="pc-map">{points.length > 0 ? <TravelMap points={points} /> : <p className="muted small">장소가 적힌 여행이 아직 없어요.</p>}</div>
          <ul className="pc-list">
            {trips.slice(0, 6).map((t) => {
              const n = days(t.start, t.end);
              const sub = [t.names.slice(0, 3).join(" · "), n > 1 ? `${n - 1}박 ${n}일` : "당일", t.companions.join(", ")].filter(Boolean).join(" · ");
              return (
                <li key={t.file.id}>
                  <Link href={t.file.href} className="pc-trip">
                    <span className="pc-main">
                      <strong>{t.title}</strong>
                      <span className="muted small">{sub}</span>
                    </span>
                    <span className="muted small num">{t.start.slice(0, 4) === year ? dot(t.start) : t.start.replace(/-/g, ".")}</span>
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

export function PcDashboard({ base }: { base: string }) {
  const local = useLocal();
  const ctx = useLocalContext();
  const food = local ? topFolder(local, "food") : undefined;
  const spend = local ? topFolder(local, "spending") : undefined;
  const travel = local ? topFolder(local, "travel") : undefined;
  const built = {
    food: local && food ? sourceOf(local, food) : null,
    spend: local && spend ? sourceOf(local, spend) : null,
    travel: local && travel ? sourceOf(local, travel) : null,
  };
  const missingKey = [built.food, built.spend, built.travel]
    .flatMap((b) => b?.missing ?? [])
    .slice(0, 60)
    .join(",");
  useEffect(() => {
    if (ctx && missingKey) void fetchTexts(ctx.email, ctx.rootId, missingKey.split(","));
  }, [ctx, missingKey]);

  return (
    <div className="pc-dash">
      <SearchForm className="search-form pc-search" action={base}>
        <Search size={16} className="search-icon" aria-hidden />
        <input name="q" placeholder="검색하거나 물어보세요" aria-label="검색어 또는 질문" required />
        {/* 엔터는 첫 버튼(검색) */}
        <button className="btn pc-search-go" type="submit" name="view" value="search">
          검색
        </button>
        <button className="btn btn-ask" type="submit" name="view" value="ask" title="Claude가 일기를 찾아 읽고 답해요">
          <Sparkles size={15} aria-hidden />
          물어보기
        </button>
      </SearchForm>
      {!local ? (
        <span className="sk sk-view" aria-hidden />
      ) : (
        <>
          {(built.food || built.spend) && (
            <div className="pc-row">
              {built.food && food && <FoodPanel src={built.food.src} href={food.h} />}
              {built.spend && spend && <SpendPanel src={built.spend.src} href={spend.h} />}
            </div>
          )}
          {built.travel && travel && <TravelPanel src={built.travel.src} href={travel.h} />}
        </>
      )}
    </div>
  );
}
