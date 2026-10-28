import Link from "next/link";
import { hrefFor, type DriveIndex, type FileEntry } from "@/lib/drive";
import { listableNotes } from "@/lib/search";

// 파일 이름이 2013-12-30… 처럼 날짜로 시작하는 글을 달력에 놓는다

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})/;
const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

export function notesByDate(index: DriveIndex): Map<string, FileEntry[]> {
  const map = new Map<string, FileEntry[]>();
  for (const n of listableNotes(index)) {
    const m = DATE_RE.exec(n.name);
    if (!m) continue;
    const key = `${m[1]}-${m[2]}-${m[3]}`;
    map.set(key, [...(map.get(key) ?? []), n]);
  }
  return map;
}

export const todayKST = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());

const pad = (n: number) => String(n).padStart(2, "0");
const shift = (ym: string, by: number) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
};

export function CalendarView({ index, month, day }: { index: DriveIndex; month?: string; day?: string }) {
  const base = index.lib.base;
  const byDate = notesByDate(index);
  const months = new Map<string, number>();
  for (const [date, list] of byDate) months.set(date.slice(0, 7), (months.get(date.slice(0, 7)) ?? 0) + list.length);

  // 기본: 이번 달에 글이 있으면 이번 달, 아니면 글이 있는 가장 최근 달
  const thisMonth = todayKST().slice(0, 7);
  const latest = [...months.keys()].sort().at(-1);
  const ym = month && /^\d{4}-\d{2}$/.test(month) ? month : months.has(thisMonth) || !latest ? thisMonth : latest;
  const [y, m] = ym.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const href = (to: string, d?: string) => `${base}?view=calendar&month=${to}${d ? `&day=${d}` : ""}`;

  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const selected = day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? (byDate.get(day) ?? []) : [];

  const years = [...new Set([...months.keys()].map((k) => k.slice(0, 4)))].sort().reverse();
  const today = todayKST();

  return (
    <div className="calendar">
      <div className="cal-head">
        <Link className="btn" href={href(shift(ym, -1))} aria-label="이전 달">
          ‹
        </Link>
        <h1 className="page-title">
          {y}년 {m}월
        </h1>
        <Link className="btn" href={href(shift(ym, 1))} aria-label="다음 달">
          ›
        </Link>
        <Link className="btn" href={href(thisMonth)}>
          이번 달
        </Link>
      </div>

      <div className="cal-grid" role="grid">
        {WEEK.map((w) => (
          <div key={w} className="cal-week" role="columnheader">
            {w}
          </div>
        ))}
        {cells.map((d, i) => {
          if (d === null) return <div key={`e${i}`} className="cal-cell empty" />;
          const key = `${ym}-${pad(d)}`;
          const list = byDate.get(key) ?? [];
          const cls = `cal-cell${list.length ? " has" : ""}${key === today ? " today" : ""}${key === day ? " selected" : ""}`;
          if (!list.length)
            return (
              <div key={key} className={cls}>
                <span className="num">{d}</span>
              </div>
            );
          // 하루에 글이 하나면 바로 그 글로, 여러 개면 아래에 목록
          return (
            <Link key={key} className={cls} href={list.length === 1 ? hrefFor(list[0]) : href(ym, key)} title={list.map((n) => n.slug).join(", ")}>
              <span className="num">{d}</span>
              <span className="dot">{list.length > 1 ? list.length : ""}</span>
            </Link>
          );
        })}
      </div>

      {selected.length > 0 && (
        <ul className="note-list">
          {selected.map((n) => (
            <li key={n.id}>
              <Link href={hrefFor(n)}>
                <span className="title">{n.slug}</span>
                <span className="muted small">{n.slugPath.slice(0, -1).join(" / ")}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {years.length > 0 && (
        <section className="cal-years">
          <h2>글이 있는 달</h2>
          {years.map((yr) => (
            <div key={yr} className="cal-year">
              <span className="yr">{yr}</span>
              {Array.from({ length: 12 }, (_, i) => `${yr}-${pad(i + 1)}`).map((k) =>
                months.has(k) ? (
                  <Link key={k} href={href(k)} className={`chip${k === ym ? " current" : ""}`} title={`${months.get(k)}개`}>
                    {Number(k.slice(5))}월
                  </Link>
                ) : (
                  <span key={k} className="chip off">
                    {Number(k.slice(5))}월
                  </span>
                ),
              )}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

/** N년 전 오늘: 같은 월-일에 쓴 지난 글 */
export function onThisDay(index: DriveIndex): { years: number; note: FileEntry }[] {
  const today = todayKST();
  const out: { years: number; note: FileEntry }[] = [];
  for (const [date, list] of notesByDate(index)) {
    if (date.slice(5) !== today.slice(5) || date >= today) continue;
    const years = Number(today.slice(0, 4)) - Number(date.slice(0, 4));
    for (const note of list) out.push({ years, note });
  }
  return out.sort((a, b) => a.years - b.years);
}
