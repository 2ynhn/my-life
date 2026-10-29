import Link from "next/link";
import { CalendarClock, MapPin, Repeat, Store, Users } from "lucide-react";
import { todayKST } from "@/components/CalendarView";
import { FeatureIcon } from "@/components/FeatureIcon";
import { gatherRecords, peopleOf, type Record_ } from "@/lib/collect";
import { hrefFor, type DriveIndex } from "@/lib/drive";
import { placeNames } from "@/lib/places";

// 모아보기: 흩어진 기록을 사람·가게·장소·반복 구매로 묶어 본다. 앞머리만 읽는다.

type Tab = "people" | "places" | "repeat";
const TABS: { key: Tab; label: string }[] = [
  { key: "people", label: "사람" },
  { key: "places", label: "가게·장소" },
  { key: "repeat", label: "반복 구매" },
];

const DAY = 86_400_000;
const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const dot = (d: string) => d.replace(/-/g, ".");
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);
const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * DAY).toISOString().slice(0, 10);
const titleOf = (r: Record_) =>
  String(r.meta.title ?? "").trim() || String(r.meta.store ?? "").trim() || r.heading || r.file.slug;
const amountOf = (r: Record_) => {
  const n = typeof r.meta.amount === "number" ? r.meta.amount : Number(String(r.meta.amount ?? "").replace(/[,원\s]/g, ""));
  return Number.isFinite(n) ? Math.round(n) : 0;
};
const byDateDesc = (a: Record_, b: Record_) => b.date.localeCompare(a.date);

function RecordList({ records }: { records: Record_[] }) {
  return (
    <ul className="note-list collect-list">
      {records.sort(byDateDesc).map((r) => (
        <li key={r.file.id}>
          <Link href={hrefFor(r.file)}>
            <span className="title">
              <FeatureIcon kind={r.feature} size="sm" />
              {titleOf(r)}
            </span>
            <span className="muted small">
              {r.feature === "spending" && amountOf(r) ? `${won(amountOf(r))} · ` : ""}
              {r.date ? dot(r.date) : ""}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function People({ records, who, base }: { records: Record_[]; who?: string; base: string }) {
  const map = new Map<string, Record_[]>();
  for (const r of records) for (const p of peopleOf(r)) map.set(p, [...(map.get(p) ?? []), r]);
  if (who) {
    const list = map.get(who) ?? [];
    const trips = list.filter((r) => r.feature === "travel").length;
    return (
      <section>
        <h2 className="collect-h">
          <Users size={18} aria-hidden /> {who}
          <span className="muted small">
            기록 {list.length}개{trips ? ` · 여행 ${trips}번` : ""}
          </span>
        </h2>
        {list.length ? <RecordList records={list} /> : <p className="muted">이 사람이 적힌 기록이 없어요.</p>}
        <Link className="btn" href={`${base}&tab=people`}>
          모든 사람
        </Link>
      </section>
    );
  }
  const people = [...map.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "ko"));
  if (!people.length)
    return (
      <p className="muted">
        아직 사람이 적힌 기록이 없어요. 일기 쓰기에서 <b>함께한 사람</b>, 여행의 <b>함께 간 사람</b>을 넣으면 여기에 모여요.
      </p>
    );
  return (
    <ul className="collect-cards">
      {people.map(([name, list]) => {
        const last = list.map((r) => r.date).sort().at(-1);
        const kinds = (["diary", "travel", "food", "spending", "health"] as const)
          .map((k) => [k, list.filter((r) => r.feature === k).length] as const)
          .filter(([, n]) => n);
        return (
          <li key={name}>
            <Link href={`${base}&tab=people&who=${encodeURIComponent(name)}`}>
              <strong>{name}</strong>
              <span className="muted small">
                {kinds.map(([k, n]) => `${{ diary: "일기", travel: "여행", food: "음식", spending: "구매", health: "건강" }[k]} ${n}`).join(" · ")}
              </span>
              {last && <span className="muted small">마지막 {dot(last)}</span>}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function Places({ records, store, base, today }: { records: Record_[]; store?: string; base: string; today: string }) {
  const spends = records.filter((r) => r.feature === "spending" && String(r.meta.store ?? "").trim());
  const stores = new Map<string, Record_[]>();
  for (const r of spends) {
    const s = String(r.meta.store).trim();
    stores.set(s, [...(stores.get(s) ?? []), r]);
  }
  if (store) {
    const list = stores.get(store) ?? [];
    const total = list.reduce((a, r) => a + amountOf(r), 0);
    return (
      <section>
        <h2 className="collect-h">
          <Store size={18} aria-hidden /> {store}
          <span className="muted small">
            {list.length}번 · {won(total)}
          </span>
        </h2>
        <RecordList records={list} />
        <Link className="btn" href={`${base}&tab=places`}>
          모든 가게
        </Link>
      </section>
    );
  }
  const year = today.slice(0, 4);
  const rows = [...stores.entries()]
    .map(([name, list]) => ({
      name,
      count: list.length,
      total: list.reduce((a, r) => a + amountOf(r), 0),
      yearTotal: list.filter((r) => r.date.startsWith(year)).reduce((a, r) => a + amountOf(r), 0),
      last: list.map((r) => r.date).sort().at(-1) ?? "",
    }))
    .sort((a, b) => b.total - a.total);

  const trips = records.filter((r) => r.feature === "travel");
  const places = new Map<string, Record_[]>();
  for (const t of trips) for (const p of new Set(placeNames(t.meta))) places.set(p, [...(places.get(p) ?? []), t]);
  const placeRows = [...places.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "ko"));

  return (
    <>
      <section>
        <h2 className="collect-h">
          <Store size={18} aria-hidden /> 가게
        </h2>
        {rows.length ? (
          <div className="table-wrap">
            <table className="spend-table">
              <thead>
                <tr>
                  <th>가게</th>
                  <th className="num">횟수</th>
                  <th className="num">{year}년</th>
                  <th className="num">전체</th>
                  <th className="num">마지막</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.name}>
                    <td>
                      <Link href={`${base}&tab=places&store=${encodeURIComponent(r.name)}`}>{r.name}</Link>
                    </td>
                    <td className="num">{r.count}</td>
                    <td className="num">{won(r.yearTotal)}</td>
                    <td className="num">{won(r.total)}</td>
                    <td className="num">{r.last ? dot(r.last.slice(2)) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted small">가게 이름이 적힌 구매 기록이 아직 없어요.</p>
        )}
      </section>
      <section>
        <h2 className="collect-h">
          <MapPin size={18} aria-hidden /> 여행에서 들른 곳
        </h2>
        {placeRows.length ? (
          <ul className="collect-cards">
            {placeRows.map(([name, list]) => (
              <li key={name}>
                <Link href={hrefFor(list.sort(byDateDesc)[0].file)}>
                  <strong>{name}</strong>
                  <span className="muted small">
                    {list.length > 1 ? `${list.length}번 · ` : ""}
                    {titleOf(list[0])}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted small">여행 기록에 장소가 아직 없어요.</p>
        )}
      </section>
    </>
  );
}

type RepeatItem = { name: string; count: number; every: number; last: string; since: number; next: string; due: boolean; href: string };
type Subscription = { store: string; amount: number; count: number; next: string; href: string };

/** 품목: 3번 이상 산 것의 평균 주기. 정기 결제: 같은 가게·비슷한 금액이 한 달 간격으로 3번 이상 */
export function findRepeats(records: Record_[], today: string): { items: RepeatItem[]; subs: Subscription[] } {
  const spends = records.filter((r) => r.feature === "spending" && r.date).sort((a, b) => a.date.localeCompare(b.date));
  const byItem = new Map<string, Record_[]>();
  for (const r of spends) {
    const names = new Set(
      (Array.isArray(r.meta.items) ? r.meta.items : [])
        .map((it) => String((it as { name?: unknown })?.name ?? "").replace(/\s+/g, " ").trim())
        .filter(Boolean),
    );
    for (const n of names) byItem.set(n, [...(byItem.get(n) ?? []), r]);
  }
  const items: RepeatItem[] = [];
  for (const [name, list] of byItem) {
    const dates = [...new Set(list.map((r) => r.date))];
    if (dates.length < 3) continue;
    const gaps = dates.slice(1).map((d, i) => daysBetween(dates[i], d));
    const every = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
    if (every < 3) continue;
    const last = dates.at(-1)!;
    const since = daysBetween(last, today);
    items.push({ name, count: dates.length, every, last, since, next: addDays(last, every), due: since >= every * 0.85, href: hrefFor(list.at(-1)!.file) });
  }
  items.sort((a, b) => b.since / b.every - a.since / a.every);

  const byStore = new Map<string, Record_[]>();
  for (const r of spends) {
    const s = String(r.meta.store ?? "").trim();
    if (s) byStore.set(s, [...(byStore.get(s) ?? []), r]);
  }
  const subs: Subscription[] = [];
  for (const [store, list] of byStore) {
    if (list.length < 3) continue;
    const recent = list.slice(-4);
    const gaps = recent.slice(1).map((r, i) => daysBetween(recent[i].date, r.date));
    const amounts = recent.map(amountOf).filter((a) => a > 0);
    if (amounts.length !== recent.length) continue;
    const monthly = gaps.every((g) => g >= 26 && g <= 35);
    const steady = Math.max(...amounts) <= Math.min(...amounts) * 1.1;
    if (!monthly || !steady) continue;
    const last = recent.at(-1)!;
    const d = new Date(Date.parse(last.date));
    d.setUTCMonth(d.getUTCMonth() + 1);
    subs.push({ store, amount: amountOf(last), count: list.length, next: d.toISOString().slice(0, 10), href: hrefFor(last.file) });
  }
  subs.sort((a, b) => a.next.localeCompare(b.next));
  return { items, subs };
}

function Repeats({ records, today }: { records: Record_[]; today: string }) {
  const { items, subs } = findRepeats(records, today);
  return (
    <>
      <section>
        <h2 className="collect-h">
          <Repeat size={18} aria-hidden /> 자주 사는 것
        </h2>
        {items.length ? (
          <ul className="collect-cards">
            {items.map((it) => (
              <li key={it.name} className={it.due ? "due" : undefined}>
                <Link href={it.href}>
                  <strong>
                    {it.name}
                    {it.due && <span className="due-badge">곧 살 때</span>}
                  </strong>
                  <span className="muted small">
                    보통 {it.every}일마다 · {it.count}번 샀어요
                  </span>
                  <span className="muted small">
                    마지막 {dot(it.last)} ({it.since}일 전) · 다음 {dot(it.next.slice(5))}쯤
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted small">같은 품목을 3번 이상 산 기록이 아직 없어요. 구매 기록의 품목을 적어 두면 주기를 알려 드려요.</p>
        )}
      </section>
      <section>
        <h2 className="collect-h">
          <CalendarClock size={18} aria-hidden /> 정기 결제로 보이는 것
        </h2>
        {subs.length ? (
          <ul className="collect-cards">
            {subs.map((s) => (
              <li key={s.store}>
                <Link href={s.href}>
                  <strong>{s.store}</strong>
                  <span className="muted small">
                    매달 {won(s.amount)} · {s.count}번
                  </span>
                  <span className="muted small">다음 결제 {dot(s.next.slice(5))}쯤</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted small">한 달 간격으로 같은 금액이 나간 가게가 아직 없어요.</p>
        )}
      </section>
    </>
  );
}

export async function CollectView({
  index,
  tab: rawTab,
  who,
  store,
}: {
  index: DriveIndex;
  tab?: string;
  who?: string;
  store?: string;
}) {
  const tab: Tab = TABS.some((t) => t.key === rawTab) ? (rawTab as Tab) : "people";
  const base = `${index.lib.base}?view=collect`;
  const today = todayKST();
  const { records, read, total } = await gatherRecords(index);
  return (
    <div className="collect">
      <h1 className="page-title">모아보기</h1>
      <nav className="range-tabs" aria-label="모아보기 종류">
        {TABS.map((t) => (
          <Link key={t.key} href={`${base}&tab=${t.key}`} className={t.key === tab ? "on" : undefined} aria-current={t.key === tab ? "page" : undefined}>
            {t.label}
          </Link>
        ))}
      </nav>
      {tab === "people" && <People records={records} who={who} base={base} />}
      {tab === "places" && <Places records={records} store={store} base={base} today={today} />}
      {tab === "repeat" && <Repeats records={records} today={today} />}
      {read < total && (
        <p className="muted small">
          전체 {total}개 중 {read}개를 읽었어요. 새로고침하면 나머지도 들어갑니다.
        </p>
      )}
    </div>
  );
}
