import Link from "next/link";
import { hrefFor, type DriveIndex, type FileEntry, type FolderEntry } from "@/lib/drive";
import { collectNotes, dateOf } from "@/lib/folder-meta";
import { splitFrontmatter } from "@/lib/markdown";
import { CATEGORIES } from "@/lib/receipt-shape";
import { todayKST } from "@/components/CalendarView";
import { BudgetForm } from "@/components/BudgetForm";
import { readBudget } from "@/lib/budget";

// 지출 기록 폴더 위에 보이는 요약: 이달·올해 합계, 월별 막대, 분류별 막대, 이달 목록.
// 글 앞머리의 amount·category·store·date를 읽는다 (date가 없으면 파일 이름의 날짜).

type Spend = { file: FileEntry; date: string; amount: number; category: string; store: string };

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
/** 막대 위 짧은 표기: 58,400 → 5.8만, 1,234,000 → 123만 */
const short = (n: number) => {
  const man = n / 10000;
  return `${man < 10 ? man.toFixed(1).replace(/\.0$/, "") : Math.round(man).toLocaleString("ko-KR")}만`;
};

function parse(file: FileEntry, text: string): Spend | null {
  const meta = splitFrontmatter(text).meta;
  const amount = typeof meta.amount === "number" ? meta.amount : Number(String(meta.amount ?? "").replace(/[,원\s]/g, ""));
  if (!Number.isFinite(amount) || amount === 0) return null;
  const date = dateOf(meta.date, file);
  if (!date) return null;
  const category = CATEGORIES.includes(String(meta.category) as (typeof CATEGORIES)[number]) ? String(meta.category) : "기타";
  return { file, date, amount: Math.round(amount), category, store: String(meta.store ?? "").trim() || file.slug };
}

const collect = async (index: DriveIndex, folder: FolderEntry) => {
  const { items, read, total } = await collectNotes(index, folder, parse);
  return { spends: items, read, total };
};

const pad = (n: number) => String(n).padStart(2, "0");

export async function SpendingView({ index, folder, month }: { index: DriveIndex; folder: FolderEntry; month?: string }) {
  const [{ spends, read, total }, budget] = await Promise.all([collect(index, folder), readBudget(index)]);
  if (!spends.length) {
    return (
      <section className="spending empty">
        <p className="muted small">
          아직 금액이 적힌 지출 기록이 없어요. <b>새 글</b>에서 영수증 사진으로 채우거나, 앞머리의 <code>amount</code>에 금액을 적으면 여기에
          합계가 나옵니다.
        </p>
      </section>
    );
  }

  const byMonth = new Map<string, number>();
  for (const s of spends) byMonth.set(s.date.slice(0, 7), (byMonth.get(s.date.slice(0, 7)) ?? 0) + s.amount);
  const thisMonth = todayKST().slice(0, 7);
  const latest = [...byMonth.keys()].sort().at(-1)!;
  const ym = month && /^\d{4}-\d{2}$/.test(month) ? month : byMonth.has(thisMonth) ? thisMonth : latest;
  const year = ym.slice(0, 4);
  const href = (to: string) => `${hrefFor(folder)}?spend=${to}`;

  const months = Array.from({ length: 12 }, (_, i) => `${year}-${pad(i + 1)}`);
  const values = months.map((m) => byMonth.get(m) ?? 0);
  const max = Math.max(1, ...values);
  const yearTotal = values.reduce((a, b) => a + b, 0);

  const monthSpends = spends.filter((s) => s.date.startsWith(ym)).sort((a, b) => b.date.localeCompare(a.date));
  const monthTotal = monthSpends.reduce((a, s) => a + s.amount, 0);
  const byCat = new Map<string, number>();
  for (const s of monthSpends) byCat.set(s.category, (byCat.get(s.category) ?? 0) + s.amount);
  const cats = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
  const catMax = Math.max(1, ...cats.map(([, v]) => Math.abs(v)));

  // 막대: 바닥에 붙고 위쪽 모서리만 4px 둥글게, 막대 사이 2px 이상 띄움
  const W = 600;
  const H = 160;
  const colW = W / 12;
  const barW = colW - 10;
  const bar = (x: number, h: number) => {
    const r = Math.min(4, h / 2, barW / 2);
    const y = H - h;
    return `M${x},${H} V${y + r} Q${x},${y} ${x + r},${y} H${x + barW - r} Q${x + barW},${y} ${x + barW},${y + r} V${H} Z`;
  };

  return (
    <section className="spending">
      <div className="spend-head">
        <div className="stat">
          <span className="muted small">{Number(ym.slice(5))}월 지출</span>
          <strong>{won(monthTotal)}</strong>
          <span className="muted small">{monthSpends.length}건</span>
        </div>
        <div className="stat">
          <span className="muted small">{year}년 합계</span>
          <strong>{won(yearTotal)}</strong>
        </div>
        <div className="spend-nav">
          <Link className="btn" href={href(`${Number(year) - 1}-12`)} aria-label="이전 해">
            ‹ {Number(year) - 1}
          </Link>
          <Link className="btn" href={href(`${Number(year) + 1}-01`)} aria-label="다음 해">
            {Number(year) + 1} ›
          </Link>
        </div>
      </div>

      {budget.monthly && (
        <div className="budget-meter">
          <div className="budget-text small">
            <span>
              {Number(ym.slice(5))}월 예산 {won(budget.monthly)} 중 <b>{Math.round((monthTotal / budget.monthly) * 100)}%</b>
            </span>
            <span className={monthTotal > budget.monthly ? "over" : "muted"}>
              {monthTotal > budget.monthly ? `${won(monthTotal - budget.monthly)} 초과` : `${won(budget.monthly - monthTotal)} 남음`}
            </span>
          </div>
          <div className="budget-track" role="meter" aria-valuemin={0} aria-valuemax={budget.monthly} aria-valuenow={monthTotal} aria-label="이달 예산 사용">
            <span
              className={monthTotal > budget.monthly ? "over" : undefined}
              style={{ width: `${Math.min(100, Math.max(1, (monthTotal / budget.monthly) * 100))}%` }}
            />
          </div>
        </div>
      )}

      <figure className="chart">
        <figcaption className="small muted">{year}년 월별 지출 (막대를 누르면 그 달로)</figcaption>
        <svg viewBox={`0 0 ${W} ${H + 22}`} role="img" aria-label={`${year}년 월별 지출`}>
          <line x1="0" x2={W} y1={H} y2={H} className="axis" />
          {months.map((m, i) => {
            const v = Math.max(0, values[i]);
            const h = v ? Math.max(3, (v / max) * (H - 18)) : 0;
            const x = i * colW + 5;
            const selected = m === ym;
            return (
              <a key={m} href={href(m)} className={`col${selected ? " selected" : ""}`}>
                <title>{`${Number(m.slice(5))}월 ${won(values[i])}`}</title>
                {/* 막대보다 넓은 누르기 영역 */}
                <rect x={i * colW} y={0} width={colW} height={H + 22} className="hit" />
                {h > 0 && <path d={bar(x, h)} className="bar" />}
                {selected && v > 0 && (
                  <text x={x + barW / 2} y={H - h - 5} textAnchor="middle" className="val">
                    {short(v)}
                  </text>
                )}
                <text x={x + barW / 2} y={H + 16} textAnchor="middle" className={`lbl${selected ? " on" : ""}`}>
                  {i + 1}월
                </text>
              </a>
            );
          })}
        </svg>
      </figure>

      {cats.length > 0 && (
        <figure className="chart">
          <figcaption className="small muted">{Number(ym.slice(5))}월 분류별</figcaption>
          <ul className="hbars">
            {cats.map(([cat, v]) => (
              <li key={cat}>
                <span className="name">{cat}</span>
                <span className="track">
                  <span className="fill" style={{ width: `${Math.max(2, (Math.abs(v) / catMax) * 100)}%` }} />
                </span>
                <span className="amt">
                  {won(v)}{" "}
                  {budget.categories[cat] ? (
                    <span className={v > budget.categories[cat] ? "over" : "muted"}>/ 예산 {short(budget.categories[cat])}</span>
                  ) : (
                    <span className="muted">· {monthTotal ? Math.round((v / monthTotal) * 100) : 0}%</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </figure>
      )}

      {monthSpends.length > 0 && (
        <table className="spend-table">
          <caption className="small muted">{Number(ym.slice(5))}월 지출 목록</caption>
          <thead>
            <tr>
              <th>날짜</th>
              <th>가게</th>
              <th>분류</th>
              <th className="num">금액</th>
            </tr>
          </thead>
          <tbody>
            {monthSpends.map((s) => (
              <tr key={s.file.id}>
                <td>{s.date.slice(5).replace("-", ".")}</td>
                <td>
                  <Link href={hrefFor(s.file)}>{s.store}</Link>
                </td>
                <td>{s.category}</td>
                <td className="num">{won(s.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {index.root.can.addChildren && (
        <details className="budget-edit">
          <summary className="small">{budget.monthly || Object.keys(budget.categories).length ? "예산 고치기" : "예산 정하기"}</summary>
          <BudgetForm rootId={index.lib.rootId} monthly={budget.monthly} categories={budget.categories} />
        </details>
      )}

      {read < total && (
        <p className="muted small">
          전체 {total}개 중 {read}개를 읽었어요. 새로고침하면 나머지도 합계에 들어갑니다.
        </p>
      )}
    </section>
  );
}
