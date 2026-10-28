import Link from "next/link";
import { hrefFor, type DriveIndex, type FileEntry, type FolderEntry } from "@/lib/drive";
import { collectNotes, dateOf } from "@/lib/folder-meta";
import { splitFrontmatter } from "@/lib/markdown";
import { todayKST } from "@/components/CalendarView";

// 건강 폴더 위에 보이는 요약: 앞머리의 숫자 항목마다 선 그래프 하나씩 (작은 여러 개 — 축 하나에 한 항목)

type Day = { file: FileEntry; date: string; values: Record<string, number> };

/** 알려진 항목은 한글 이름·단위로. 처음 보는 숫자 항목도 그대로 그래프가 된다 */
const KNOWN: Record<string, { label: string; unit: string; digits: number }> = {
  weight: { label: "체중", unit: "kg", digits: 1 },
  sleep: { label: "수면", unit: "시간", digits: 1 },
  steps: { label: "걸음", unit: "보", digits: 0 },
  bp_sys: { label: "혈압 (수축기)", unit: "mmHg", digits: 0 },
  bp_dia: { label: "혈압 (이완기)", unit: "mmHg", digits: 0 },
  condition: { label: "컨디션", unit: "/5", digits: 0 },
};
const ORDER = Object.keys(KNOWN);
const SKIP = new Set(["date", "year", "month", "day"]);

function parse(file: FileEntry, text: string): Day | null {
  const meta = splitFrontmatter(text).meta;
  const date = dateOf(meta.date, file);
  if (!date) return null;
  const values: Record<string, number> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (SKIP.has(k)) continue;
    const n = typeof v === "number" ? v : typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : NaN;
    if (Number.isFinite(n)) values[k] = n;
  }
  return Object.keys(values).length ? { file, date, values } : null;
}

const RANGES = { "30": 30, "90": 90, "365": 365, all: 0 } as const;
type Range = keyof typeof RANGES;

const fmt = (key: string, n: number) => {
  const d = KNOWN[key]?.digits ?? (Number.isInteger(n) ? 0 : 1);
  return n.toLocaleString("ko-KR", { minimumFractionDigits: d, maximumFractionDigits: d });
};
const unit = (key: string) => KNOWN[key]?.unit ?? "";
const label = (key: string) => KNOWN[key]?.label ?? key;

function Chart({ metric, points, from, to }: { metric: string; points: { date: string; v: number; href: string }[]; from: number; to: number }) {
  const W = 600;
  const H = 120;
  const PAD = 10;
  const vs = points.map((p) => p.v);
  let lo = Math.min(...vs);
  let hi = Math.max(...vs);
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  const pad = (hi - lo) * 0.12;
  lo -= pad;
  hi += pad;
  const x = (d: string) => PAD + ((Date.parse(d) - from) / Math.max(1, to - from)) * (W - PAD * 2);
  const y = (v: number) => PAD + (1 - (v - lo) / (hi - lo)) * (H - PAD * 2);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const last = points.at(-1)!;
  const avg = vs.reduce((a, b) => a + b, 0) / vs.length;
  const r = points.length > 60 ? 2 : 3.5; // 점이 많으면 작게

  return (
    <figure className="chart metric">
      <figcaption>
        <span className="metric-name">{label(metric)}</span>
        <strong>
          {fmt(metric, last.v)}
          <span className="muted small"> {unit(metric)}</span>
        </strong>
        <span className="muted small">
          평균 {fmt(metric, avg)} · {fmt(metric, Math.min(...vs))}~{fmt(metric, Math.max(...vs))} · {points.length}일
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label(metric)} 그래프`}>
        <line x1={PAD} x2={W - PAD} y1={y(avg)} y2={y(avg)} className="avg" />
        {points.length > 1 && <path d={path} className="line" />}
        {points.map((p) => (
          <a key={p.date} href={p.href}>
            <title>{`${p.date.slice(5).replace("-", ".")} ${fmt(metric, p.v)}${unit(metric)}`}</title>
            {/* 점보다 넓은 누르기 영역 */}
            <circle cx={x(p.date)} cy={y(p.v)} r={10} className="hit" />
            <circle cx={x(p.date)} cy={y(p.v)} r={r} className="pt" />
          </a>
        ))}
      </svg>
    </figure>
  );
}

export async function HealthView({ index, folder, range: rawRange }: { index: DriveIndex; folder: FolderEntry; range?: string }) {
  const { items, read, total } = await collectNotes(index, folder, parse);
  if (!items.length) {
    return (
      <section className="health empty">
        <p className="muted small">
          아직 숫자가 적힌 건강 기록이 없어요. <b>새 글</b>에서 체중·수면·걸음 수 같은 칸에 숫자를 적으면 항목마다 그래프가 생깁니다.
        </p>
      </section>
    );
  }
  const range: Range = rawRange && rawRange in RANGES ? (rawRange as Range) : "90";
  const today = todayKST();
  const to = Date.parse(today);
  const days = RANGES[range];
  const sorted = items.sort((a, b) => a.date.localeCompare(b.date));
  const start = days ? to - (days - 1) * 86_400_000 : Date.parse(sorted[0].date);
  const inRange = sorted.filter((d) => Date.parse(d.date) >= start && Date.parse(d.date) <= to);
  // 가로축은 기간 안 첫 기록부터 (기록을 막 시작했으면 오른쪽 끝에 몰리지 않게). 모든 그래프가 같은 축을 쓴다
  const from = inRange.length ? Date.parse(inRange[0].date) : start;

  const keys = [...new Set(inRange.flatMap((d) => Object.keys(d.values)))].sort(
    (a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99) || a.localeCompare(b),
  );
  const href = (r: Range) => `${hrefFor(folder)}?range=${r}`;
  const recent = [...inRange].reverse().slice(0, 14);

  return (
    <section className="health">
      <div className="range-tabs" role="tablist" aria-label="기간">
        {(Object.keys(RANGES) as Range[]).map((r) => (
          <Link key={r} href={href(r)} role="tab" aria-selected={r === range} className={r === range ? "on" : undefined}>
            {r === "all" ? "전체" : r === "365" ? "1년" : `${r}일`}
          </Link>
        ))}
      </div>
      {keys.length === 0 ? (
        <p className="muted small">이 기간에는 기록이 없어요. 기간을 넓혀 보세요.</p>
      ) : (
        <div className="metrics">
          {keys.map((k) => (
            <Chart
              key={k}
              metric={k}
              from={from}
              to={to}
              points={inRange.filter((d) => k in d.values).map((d) => ({ date: d.date, v: d.values[k], href: hrefFor(d.file) }))}
            />
          ))}
        </div>
      )}
      {recent.length > 0 && (
        <details className="health-table">
          <summary className="small">최근 기록 표로 보기</summary>
          <div className="table-wrap">
            <table className="spend-table">
              <thead>
                <tr>
                  <th>날짜</th>
                  {keys.map((k) => (
                    <th key={k} className="num">
                      {label(k)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recent.map((d) => (
                  <tr key={d.file.id}>
                    <td>
                      <Link href={hrefFor(d.file)}>{d.date.slice(5).replace("-", ".")}</Link>
                    </td>
                    {keys.map((k) => (
                      <td key={k} className="num">
                        {k in d.values ? fmt(k, d.values[k]) : ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
      {read < total && (
        <p className="muted small">
          전체 {total}개 중 {read}개를 읽었어요. 새로고침하면 나머지도 나옵니다.
        </p>
      )}
    </section>
  );
}
