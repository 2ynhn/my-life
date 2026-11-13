"use client";

import { Maximize2, Minimize2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useLocal } from "@/components/LocalData";
import { buildGraphIndex, localGraph, type GraphEdge, type GraphNode, type Shown } from "@/lib/local-graph";

// 로컬 그래프: 지금 글과 이어진 글(링크·이 글을 가리킴·같은 태그·같은 날)만 작은 그래프와 목록으로.
// 휴대폰: 본문 아래 '연결된 글' · PC(넓은 화면): 본문 오른쪽에 붙어 있는 판 (globals.css .note-layout)

const W = 380;
const H = 320;
const KIND_LABEL: Record<string, string> = { diary: "일기", spending: "구매", travel: "여행", health: "건강", food: "음식" };
const ALL: Shown = { link: true, back: true, tag: true, day: true };
const TYPES = [
  ["link", "링크"],
  ["back", "이 글을 가리킴"],
  ["tag", "태그"],
  ["day", "같은 날"],
] as const;

const colorOf = (kind: GraphNode["kind"]) =>
  kind === "tag" || kind === "ghost" || !kind ? "var(--c-folder)" : `var(--c-${kind})`;

const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

type Pos = Record<string, { x: number; y: number }>;

/** 정해진 자리(같은 글이면 늘 같은 모양): 1단계는 종류별로 모아 원 둘레에, 딸린 점은 부모 바깥쪽에. 겹치면 조금씩 밀어낸다 */
function layout(nodes: GraphNode[], center: string): Pos {
  const pos: Pos = {};
  const cx = W / 2;
  const cy = H / 2;
  pos[center] = { x: cx, y: cy };
  const order = { both: 0, link: 1, back: 2, tag: 3, day: 4 } as const;
  const firsts = nodes
    .filter((n) => n.depth === 1 && !n.parent)
    .sort((a, b) => order[a.rel ?? "day"] - order[b.rel ?? "day"]);
  const r1 = Math.min(W, H) * (firsts.length > 6 ? 0.38 : 0.33);
  firsts.forEach((n, i) => {
    const a = -Math.PI * 0.75 + (i / Math.max(firsts.length, 1)) * Math.PI * 2;
    pos[n.id] = { x: cx + Math.cos(a) * r1 * 1.3, y: cy + Math.sin(a) * r1 };
  });
  // 딸린 점(태그의 글, 2단계)은 부모 바깥쪽 부채꼴
  const kids = new Map<string, GraphNode[]>();
  for (const n of nodes) if (n.parent) (kids.get(n.parent!) ?? kids.set(n.parent!, []).get(n.parent!)!).push(n);
  const placeKids = (parent: string) => {
    const list = kids.get(parent);
    if (!list) return;
    const p = pos[parent];
    const base = Math.atan2(p.y - cy, p.x - cx);
    list.forEach((n, i) => {
      if (pos[n.id]) return;
      const spread = Math.min(1.4, 0.45 * list.length);
      const a = base + (list.length > 1 ? (i / (list.length - 1) - 0.5) * spread : 0);
      const d = n.depth === 2 ? 58 : 62;
      pos[n.id] = { x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d };
      placeKids(n.id);
    });
  };
  for (const f of firsts) placeKids(f.id);
  for (const n of nodes) if (!pos[n.id]) pos[n.id] = { x: cx, y: cy + 40 };

  // 겹침 풀기 (가운데는 고정)
  const ids = nodes.map((n) => n.id).filter((id) => id !== center);
  const minGap = (id: string) => (nodes.find((n) => n.id === id)?.depth === 2 ? 30 : 46);
  for (let step = 0; step < 60; step++) {
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) {
        const a = pos[ids[i]];
        const b = pos[ids[j]];
        const dx = b.x - a.x || 0.01 * (j - i);
        const dy = b.y - a.y || 0.01;
        const d = Math.hypot(dx, dy);
        const gap = Math.max(minGap(ids[i]), minGap(ids[j]));
        if (d < gap) {
          const push = (gap - d) / 2;
          a.x -= (dx / d) * push;
          a.y -= (dy / d) * push;
          b.x += (dx / d) * push;
          b.y += (dy / d) * push;
        }
      }
    for (const id of ids) {
      const p = pos[id];
      const dc = Math.hypot(p.x - cx, p.y - cy);
      if (dc < 56) {
        p.x = cx + ((p.x - cx) / (dc || 1)) * 56;
        p.y = cy + ((p.y - cy) / (dc || 1)) * 56;
      }
      p.x = Math.min(W - 34, Math.max(34, p.x));
      p.y = Math.min(H - 28, Math.max(16, p.y));
    }
  }
  return pos;
}

function edgeStyle(e: GraphEdge, target: GraphNode | undefined) {
  switch (e.type) {
    case "both":
      return { stroke: colorOf(target?.kind ?? null), strokeWidth: 2.5 };
    case "link":
      return { stroke: colorOf(target?.kind ?? null), strokeWidth: 1.5 };
    case "back":
      return { stroke: colorOf(target?.kind ?? null), strokeWidth: 1.5, strokeDasharray: "5 4" };
    case "day":
      return { stroke: "#9aa093", strokeWidth: 1.3, strokeDasharray: "2 4" };
    case "tag":
    case "tagged":
      return { stroke: "#9aa093", strokeWidth: 1.2 };
    default:
      return { stroke: "#c9cdc2", strokeWidth: 1 };
  }
}

export function LocalGraph({ id }: { id: string }) {
  const local = useLocal();
  const router = useRouter();
  const [depth, setDepth] = useState<1 | 2>(1);
  const [shown, setShown] = useState<Shown>(ALL);
  const [hideGhost, setHideGhost] = useState(false);
  const [full, setFull] = useState(false);
  const [moved, setMoved] = useState<Pos>({});
  const drag = useRef<{ id: string; x: number; y: number; moved: boolean } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const index = useMemo(() => (local ? buildGraphIndex(local) : null), [local]);
  const data = useMemo(() => {
    if (!index) return null;
    const g = localGraph(index, id, depth, shown);
    if (!g || !hideGhost) return g;
    const keep = g.nodes.filter((n) => n.kind !== "ghost");
    const ids = new Set(keep.map((n) => n.id));
    return { ...g, nodes: keep, edges: g.edges.filter((e) => ids.has(e.a) && ids.has(e.b)) };
  }, [index, id, depth, shown, hideGhost]);
  const base = useMemo(() => (data ? layout(data.nodes, id) : {}), [data, id]);

  if (!local || !data) return null;
  const entry = local.byId.get(id);
  const folder = entry?.p ? local.byId.get(entry.p) : undefined;
  const newHref = (name: string) => (folder?.a ? `${folder.h}?mode=new&name=${encodeURIComponent(name)}` : undefined);

  const firstIds = new Set<string>();
  for (const n of [...data.lists.links, ...data.lists.backs, ...data.lists.tags.flatMap((t) => t.notes), ...data.lists.sameDay]) firstIds.add(n.id);
  const total = firstIds.size;
  const pos: Pos = { ...base, ...moved };
  const byId = new Map(data.nodes.map((n) => [n.id, n]));
  const onlyOne = (k: keyof Shown) => TYPES.every(([t]) => shown[t] === (t === k));
  const all = TYPES.every(([t]) => shown[t]);
  const counts = data.counts;

  const point = (e: ReactPointerEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };
  const down = (n: GraphNode) => (e: ReactPointerEvent<SVGGElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = point(e);
    drag.current = { id: n.id, x: p.x, y: p.y, moved: false };
  };
  const move = (e: ReactPointerEvent<SVGGElement>) => {
    const d = drag.current;
    if (!d) return;
    const p = point(e);
    if (!d.moved && Math.hypot(p.x - d.x, p.y - d.y) < 4) return;
    d.moved = true;
    setMoved((m) => ({ ...m, [d.id]: { x: Math.min(W - 8, Math.max(8, p.x)), y: Math.min(H - 8, Math.max(8, p.y)) } }));
  };
  const up = (n: GraphNode) => () => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved || n.id === id) return;
    const href = n.kind === "ghost" ? newHref(n.label) : n.kind === "tag" ? `${local.tree.base}?view=search&tag=${encodeURIComponent(n.label.slice(1))}` : n.href;
    if (href) router.push(href);
  };

  const row = (n: GraphNode, note?: string) =>
    n.kind === "ghost" ? (
      newHref(n.label) ? (
        <Link key={n.id} className="graph-row ghost" href={newHref(n.label)!}>
          <span className="graph-dot hollow" aria-hidden />
          <span className="graph-row-name">{n.label}</span>
          <span className="graph-row-note accent">+ 새 글</span>
        </Link>
      ) : (
        <span key={n.id} className="graph-row ghost">
          <span className="graph-dot hollow" aria-hidden />
          <span className="graph-row-name">{n.label}</span>
          <span className="graph-row-note">없는 글</span>
        </span>
      )
    ) : (
      <Link key={`${n.id}-${note ?? ""}`} className="graph-row" href={n.href!}>
        <span className="graph-dot" style={{ background: colorOf(n.kind) }} aria-hidden />
        <span className="graph-row-name">{n.label}</span>
        <span className="graph-row-note">{note ?? (n.kind ? KIND_LABEL[n.kind] : "")}</span>
      </Link>
    );

  const tagRows = shown.tag ? data.lists.tags.flatMap((t) => t.notes.map((n) => row(n, `#${t.tag}`))) : [];
  const dayRows = shown.day ? data.lists.sameDay.map((n) => row(n, "같은 날")) : [];
  const linkRows = shown.link ? data.lists.links.filter((n) => !(hideGhost && n.kind === "ghost")).map((n) => row(n, n.rel === "both" ? "서로" : undefined)) : [];
  const backRows = shown.back ? data.lists.backs.map((n) => row(n)) : [];

  return (
    <aside id="graph" className="local-graph" aria-label="연결된 글">
      <div className="graph-head">
        <h2>
          연결된 글 <span className="graph-count">{total}</span>
          {depth === 2 && counts.second > 0 && <span className="graph-count"> · 2단계 {counts.second}</span>}
        </h2>
        <button type="button" className="graph-depth-toggle" aria-pressed={depth === 2} onClick={() => setDepth(depth === 2 ? 1 : 2)}>
          2단계까지
        </button>
        <div className="graph-seg" role="group" aria-label="깊이">
          {([1, 2] as const).map((d) => (
            <button type="button" key={d} className={depth === d ? "on" : undefined} aria-pressed={depth === d} onClick={() => setDepth(d)}>
              {d}단계
            </button>
          ))}
        </div>
      </div>

      {total === 0 ? (
        <p className="muted small graph-empty">
          아직 이어진 글이 없어요. 글에 <code>[[</code>를 쳐서 다른 글을 링크하거나, 태그·날짜가 같은 글이 생기면 여기에 보여요.
        </p>
      ) : (
        <>
          <div className="graph-chips" role="group" aria-label="보기 고르기">
            <button type="button" className={all ? "on" : undefined} aria-pressed={all} onClick={() => setShown(ALL)}>
              전체
            </button>
            {TYPES.map(([k, label]) => (
              <button
                type="button"
                key={k}
                className={onlyOne(k) ? "on" : undefined}
                aria-pressed={onlyOne(k)}
                disabled={!counts[k]}
                onClick={() => setShown({ link: false, back: false, tag: false, day: false, [k]: true })}
              >
                {label} {counts[k]}
              </button>
            ))}
          </div>

          <div className={full ? "graph-card full" : "graph-card"} role="img" aria-label={`${entry?.n.replace(/\.md$/i, "") ?? "이 글"}을 가운데 두고 연결된 글 ${total}개를 그린 그래프`}>
            <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
              {data.edges.map((e, i) => {
                const a = pos[e.a];
                const b = pos[e.b];
                if (!a || !b) return null;
                return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} style={edgeStyle(e, byId.get(e.b))} />;
              })}
              {data.nodes.map((n) => {
                const p = pos[n.id];
                const center = n.id === id;
                const r = center ? 16 : n.depth === 2 ? 5.5 : n.kind === "tag" ? 0 : n.rel === "both" ? 10 : 8.5;
                const label = center ? short(n.label, 18) : short(n.label, n.depth === 2 ? 10 : 13);
                return (
                  <g
                    key={n.id}
                    className={`graph-node${center ? " center" : ""}${n.depth === 2 ? " far" : ""}`}
                    data-id={n.id}
                    onPointerDown={down(n)}
                    onPointerMove={move}
                    onPointerUp={up(n)}
                    onPointerCancel={() => (drag.current = null)}
                  >
                    <title>{n.kind === "ghost" ? `${n.label} (없는 글)` : n.label}</title>
                    {center && <circle cx={p.x} cy={p.y} r={22} style={{ fill: "none", stroke: "var(--fc-soft, var(--accent-soft))", strokeWidth: 6 }} />}
                    {n.kind === "tag" ? (
                      <>
                        <rect x={p.x - 26} y={p.y - 10} width={52} height={20} rx={10} style={{ fill: "var(--panel)" }} />
                        <text x={p.x} y={p.y + 3.5} textAnchor="middle" className="graph-label tag">
                          {short(n.label, 8)}
                        </text>
                      </>
                    ) : (
                      <>
                        <circle
                          cx={p.x}
                          cy={p.y}
                          r={r}
                          style={
                            n.kind === "ghost"
                              ? { fill: "var(--surface)", stroke: "var(--fc, var(--accent))", strokeWidth: 2 }
                              : { fill: colorOf(n.kind), opacity: n.depth === 2 ? 0.45 : 1 }
                          }
                        />
                        <text
                          x={p.x < 80 ? p.x - 12 : p.x > W - 80 ? p.x + 12 : p.x}
                          y={p.y + r + 13}
                          textAnchor={center ? "middle" : p.x < 80 ? "start" : p.x > W - 80 ? "end" : "middle"}
                          className={`graph-label${center ? " strong" : ""}${n.depth === 2 ? " far" : ""}${n.kind === "ghost" ? " muted" : ""}`}>
                          {label}
                        </text>
                      </>
                    )}
                  </g>
                );
              })}
            </svg>
            <button type="button" className="graph-full-btn" aria-label={full ? "작게 보기" : "크게 보기"} title={full ? "작게 보기" : "크게 보기"} onClick={() => setFull(!full)}>
              {full ? <Minimize2 size={15} aria-hidden /> : <Maximize2 size={15} aria-hidden />}
            </button>
          </div>

          <div className="graph-toggles">
            {TYPES.map(([k, label]) => (
              <label key={k}>
                <input type="checkbox" checked={shown[k]} onChange={(e) => setShown({ ...shown, [k]: e.target.checked })} /> {label}
              </label>
            ))}
            <label>
              <input type="checkbox" checked={hideGhost} onChange={(e) => setHideGhost(e.target.checked)} /> 없는 글 숨기기
            </label>
          </div>
          <p className="graph-legend">
            실선: 이 글이 건 링크 · 점선: 이 글을 가리킴 · 굵은 선: 서로 · 점선(잘게): 같은 날 · 점 색은 쓰임새
            <span className="graph-legend-pc"> · 점을 누르면 그 글로, 끌어서 옮기기</span>
          </p>

          <div className="graph-list">
            {linkRows.length > 0 && <span className="graph-group">이 글이 건 링크</span>}
            {linkRows}
            {backRows.length > 0 && <span className="graph-group">이 글을 가리키는 글</span>}
            {backRows}
            {tagRows.length + dayRows.length > 0 && <span className="graph-group">같은 태그 · 같은 날</span>}
            {tagRows}
            {dayRows}
          </div>
        </>
      )}
    </aside>
  );
}

/** 휴대폰 글 머리의 '연결된 글로' 버튼 (아래 '연결된 글'로 내려간다) */
export function GraphJump({ id }: { id: string }) {
  const local = useLocal();
  if (!local || !local.byId.get(id)) return null;
  return (
    <a className="btn graph-jump" href="#graph" aria-label="연결된 글로" title="연결된 글">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden>
        <circle cx="12" cy="12" r="3" />
        <circle cx="5" cy="5" r="2" />
        <circle cx="19" cy="6" r="2" />
        <circle cx="18" cy="19" r="2" />
        <path d="m7 7 3 3M17 7.5l-3 2.5M16.5 17.5l-2.5-3.5" />
      </svg>
    </a>
  );
}
