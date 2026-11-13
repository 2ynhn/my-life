import type { FeatureKey } from "@/lib/features";
import { topOf, type LocalState } from "@/lib/local-store";
import { metaTags, splitFrontmatter } from "@/lib/markdown";

// 로컬 그래프: 한 글과 이어진 글만 추린다 (기기 사본만 씀, 서버·Drive 호출 없음).
// 이어짐 4가지: 링크([[ ]]로 건 글) · 이 글을 가리킴(백링크) · 같은 태그 · 같은 날.

export type NoteInfo = {
  id: string;
  /** 파일 이름 (.md 뺀 것) */
  name: string;
  href: string;
  kind: FeatureKey | null;
  date: string;
  tags: string[];
  /** 건 링크: 찾은 글 id, 못 찾은 이름은 "?이름" */
  out: string[];
};

export type GraphIndex = {
  notes: Map<string, NoteInfo>;
  /** 받은 링크: 글 id → 그 글을 가리키는 글 id들 */
  backs: Map<string, Set<string>>;
  byTag: Map<string, string[]>;
  byDate: Map<string, string[]>;
};

const LINK = /(?<!!)\[\[([^\]|#\n]+)(?:#[^\]|\n]*)?(?:\|[^\]\n]*)?\]\]/g;
const DATE_META = /^(?:date|start):[ \t]*["']?(\d{4}-\d{2}-\d{2})/m;
const DATE_NAME = /^(\d{4}-\d{2}-\d{2})/;

/** 글 본문에서 링크 이름들 (코드 블록 안은 빼고) */
export function linkNames(text: string): string[] {
  const out: string[] = [];
  const parts = text.split(/(^```[\s\S]*?^```)/m);
  parts.forEach((part, i) => {
    if (i % 2 === 1) return;
    for (const m of part.matchAll(LINK)) {
      const name = m[1].trim().replace(/\.md$/i, "");
      if (name && !out.includes(name)) out.push(name);
    }
  });
  return out;
}

/** 기기 사본 전체로 색인 (글 내용이 바뀔 때마다 다시 만든다. 글 수백 개면 수 밀리초) */
export function buildGraphIndex(local: LocalState): GraphIndex {
  const files = local.tree.entries.filter((e) => e.k === "f" && e.md && e.v);
  const byName = new Map<string, string>();
  for (const e of files) {
    byName.set(e.n.replace(/\.md$/i, "").toLowerCase(), e.id);
    if (!byName.has(e.s.toLowerCase())) byName.set(e.s.toLowerCase(), e.id);
  }
  const notes = new Map<string, NoteInfo>();
  const backs = new Map<string, Set<string>>();
  const byTag = new Map<string, string[]>();
  const byDate = new Map<string, string[]>();
  for (const e of files) {
    const text = local.texts.get(e.id)?.t ?? "";
    const name = e.n.replace(/\.md$/i, "");
    const date = DATE_META.exec(text.slice(0, 800))?.[1] ?? DATE_NAME.exec(name)?.[1] ?? "";
    const tags = text.startsWith("---") ? metaTags(splitFrontmatter(text).meta).map((t) => t.replace(/^#/, "").trim()).filter(Boolean) : [];
    const out = linkNames(text).map((n) => byName.get(n.toLowerCase()) ?? `?${n}`).filter((id) => id !== e.id);
    const kind = (local.tree.kinds[topOf(local, e).id] ?? null) as FeatureKey | null;
    notes.set(e.id, { id: e.id, name, href: e.h, kind, date, tags, out: [...new Set(out)] });
    for (const t of out) if (!t.startsWith("?")) (backs.get(t) ?? backs.set(t, new Set()).get(t)!).add(e.id);
    for (const t of tags) (byTag.get(t) ?? byTag.set(t, []).get(t)!).push(e.id);
    if (date) (byDate.get(date) ?? byDate.set(date, []).get(date)!).push(e.id);
  }
  return { notes, backs, byTag, byDate };
}

export type RelKind = "link" | "back" | "both" | "tag" | "day";
export type GraphNode = {
  id: string;
  label: string;
  href?: string;
  kind: FeatureKey | null | "tag" | "ghost";
  depth: 0 | 1 | 2;
  /** 1단계: 어떻게 이어졌는지 · 태그에 딸린 글: 그 태그 점 id · 2단계: 이어진 1단계 글 id */
  rel?: RelKind;
  parent?: string;
};
export type GraphEdge = { a: string; b: string; type: RelKind | "second" | "tagged" };
export type Shown = { link: boolean; back: boolean; tag: boolean; day: boolean };

export type LocalGraphData = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** 목록용 */
  lists: { links: GraphNode[]; backs: GraphNode[]; tags: { tag: string; notes: GraphNode[] }[]; sameDay: GraphNode[] };
  counts: { link: number; back: number; tag: number; day: number; second: number };
};

const MAX_PER_TAG = 5;
const MAX_SAME_DAY = 8;
const MAX_SECOND = 16;

const noteNode = (n: NoteInfo, depth: 1 | 2, extra: Partial<GraphNode> = {}): GraphNode => ({
  id: n.id,
  label: n.name,
  href: n.href,
  kind: n.kind,
  depth,
  ...extra,
});

/** 한 글 중심의 그래프. depth 2면 1단계 글들의 링크·백링크까지 (태그·같은 날은 1단계만) */
export function localGraph(index: GraphIndex, id: string, depth: 1 | 2, shown: Shown): LocalGraphData | null {
  const me = index.notes.get(id);
  if (!me) return null;
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  nodes.set(id, { id, label: me.name, href: me.href, kind: me.kind, depth: 0 });

  const backs = [...(index.backs.get(id) ?? [])];
  const outs = me.out;
  const links: GraphNode[] = [];
  const backList: GraphNode[] = [];
  for (const t of outs) {
    if (t.startsWith("?")) {
      links.push({ id: t, label: t.slice(1), kind: "ghost", depth: 1, rel: "link" });
      continue;
    }
    const n = index.notes.get(t);
    if (n) links.push(noteNode(n, 1, { rel: backs.includes(t) ? "both" : "link" }));
  }
  for (const b of backs) {
    if (outs.includes(b)) continue;
    const n = index.notes.get(b);
    if (n) backList.push(noteNode(n, 1, { rel: "back" }));
  }
  const tagLists = me.tags.map((tag) => ({
    tag,
    notes: (index.byTag.get(tag) ?? [])
      .filter((x) => x !== id)
      .slice(0, MAX_PER_TAG)
      .map((x) => noteNode(index.notes.get(x)!, 1, { rel: "tag" })),
  }));
  const sameDay = me.date
    ? (index.byDate.get(me.date) ?? [])
        .filter((x) => x !== id)
        .slice(0, MAX_SAME_DAY)
        .map((x) => noteNode(index.notes.get(x)!, 1, { rel: "day" }))
    : [];

  const add = (n: GraphNode) => {
    if (!nodes.has(n.id)) nodes.set(n.id, n);
  };
  if (shown.link)
    for (const n of links) {
      add(n);
      edges.push({ a: id, b: n.id, type: n.rel! });
    }
  if (shown.back)
    for (const n of backList) {
      add(n);
      edges.push({ a: id, b: n.id, type: "back" });
    }
  if (shown.tag)
    for (const t of tagLists) {
      if (!t.notes.length) continue;
      const tagId = `#${t.tag}`;
      add({ id: tagId, label: `#${t.tag}`, kind: "tag", depth: 1, rel: "tag" });
      edges.push({ a: id, b: tagId, type: "tag" });
      for (const n of t.notes) {
        if (!nodes.has(n.id)) nodes.set(n.id, { ...n, parent: tagId });
        edges.push({ a: tagId, b: n.id, type: "tagged" });
      }
    }
  if (shown.day)
    for (const n of sameDay) {
      add(n);
      edges.push({ a: id, b: n.id, type: "day" });
    }

  let second = 0;
  if (depth === 2) {
    const firsts = [...nodes.values()].filter((n) => n.depth === 1 && n.kind !== "tag" && n.kind !== "ghost");
    outer: for (const f of firsts) {
      const info = index.notes.get(f.id);
      if (!info) continue;
      const near = [...info.out.filter((x) => !x.startsWith("?")), ...(index.backs.get(f.id) ?? [])];
      for (const x of near) {
        if (second >= MAX_SECOND) break outer;
        if (x === id) continue;
        if (nodes.has(x)) {
          // 1단계끼리 이어져 있으면 선만
          if (!edges.some((e) => (e.a === f.id && e.b === x) || (e.a === x && e.b === f.id))) edges.push({ a: f.id, b: x, type: "second" });
          continue;
        }
        const n = index.notes.get(x);
        if (!n) continue;
        nodes.set(x, noteNode(n, 2, { parent: f.id }));
        edges.push({ a: f.id, b: x, type: "second" });
        second++;
      }
    }
  }

  return {
    nodes: [...nodes.values()],
    edges,
    lists: { links, backs: backList, tags: tagLists.filter((t) => t.notes.length), sameDay },
    counts: {
      link: links.length,
      back: backList.length,
      tag: tagLists.reduce((a, t) => a + t.notes.length, 0),
      day: sameDay.length,
      second,
    },
  };
}
