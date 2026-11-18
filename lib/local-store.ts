import type { LocalEntry, LocalText, LocalTree } from "@/lib/local-types";

// 기기에 받아 둔 일기장 (브라우저용): 목록과 글 내용을 IndexedDB에 두고, 화면을 누르자마자 여기서 그린다.
// 서버(/api/local)에서 바뀐 것만 받아 온다. 사람(이메일)마다 따로 두고, 로그아웃하면 통째로 지운다.
// 저장소가 막힌 브라우저(사생활 보호 모드 등)에서는 메모리에만 둔다.

const DB_NAME = "my-life-local";
const STORE = "kv";
const BATCH = 50;

export type LocalState = {
  tree: LocalTree;
  byId: Map<string, LocalEntry>;
  byHref: Map<string, LocalEntry>;
  children: Map<string, LocalEntry[]>;
  texts: Map<string, LocalText>;
};

// ───────────── IndexedDB (작은 래퍼) ─────────────

let dbPromise: Promise<IDBDatabase | null> | null = null;

function db(): Promise<IDBDatabase | null> {
  dbPromise ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const d = await db();
  if (!d) return undefined;
  return new Promise((resolve) => {
    try {
      const t = d.transaction(STORE, mode);
      const req = run(t.objectStore(STORE));
      t.oncomplete = () => resolve(req ? req.result : undefined);
      t.onerror = () => resolve(undefined);
      t.onabort = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

const treeKey = (email: string, rootId: string) => `tree\n${email}\n${rootId}`;
const textPrefix = (email: string) => `text\n${email}\n`;

/** 로그아웃·다른 사람 로그인: 기기에 받아 둔 것을 모두 지운다 */
export async function clearLocal(): Promise<void> {
  states.clear();
  const d = await db().catch(() => null);
  d?.close();
  dbPromise = null;
  await new Promise<void>((resolve) => {
    try {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
}

// ───────────── 메모리 상태 ─────────────

const states = new Map<string, LocalState>();
const listeners = new Set<() => void>();
let version = 0;
const keyOf = (email: string, rootId: string) => `${email}\n${rootId}`;

export const subscribeLocal = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export const localVersion = () => version;
const notify = () => {
  version++;
  for (const l of listeners) l();
};

export const getLocal = (email: string, rootId: string): LocalState | null => {
  const key = keyOf(email, rootId);
  const base = states.get(key) ?? null;
  return base ? withPending(key, base) : null;
};

// ───────────── 저장 중인 새 글 (기기에 먼저) ─────────────
// 새 글은 저장을 누르자마자 사본에 '임시 항목'으로 넣어 목록·요약·캘린더에 바로 보인다 (id가 pending:으로 시작).
// Drive 저장이 끝나 다음 동기화가 진짜 항목을 가져오면 뺀다. 실패하면 바로 뺀다 (내용은 임시본에 남아 있음).

export type PendingJob = { id: string; at: number; rootId: string; folderId: string; subfolder?: string; name: string; text: string; failed: boolean };
type Pending = { entries: LocalEntry[]; text: LocalText; at: number; done?: number };
const pendings = new Map<string, Map<string, Pending>>();
const merged = new Map<string, { base: LocalState; stamp: number; state: LocalState }>();
let pendingStamp = 0;

export const isPendingId = (id: string) => id.startsWith("pending:") || id.startsWith("pending-d:");

function withPending(key: string, base: LocalState): LocalState {
  const list = pendings.get(key);
  if (!list?.size) return base;
  const hit = merged.get(key);
  if (hit && hit.base === base && hit.stamp === pendingStamp) return hit.state;
  const entries = [...base.tree.entries];
  const texts = new Map(base.texts);
  const taken = new Set(base.tree.entries.map((e) => `${e.p}\n${e.n.toLowerCase()}`));
  for (const pend of list.values()) {
    const file = pend.entries.at(-1)!;
    // 진짜 항목이 이미 왔으면 (같은 폴더·같은 이름, 그 뒤에 바뀐 것) 임시 항목은 뺀다
    const real = base.tree.entries.find((e) => e.p === file.p && e.n.toLowerCase() === file.n.toLowerCase());
    if (real && real.m >= new Date(pend.at - 60_000).toISOString()) continue;
    for (const e of pend.entries) {
      const k = `${e.p}\n${e.n.toLowerCase()}`;
      if (e.k === "d" && taken.has(k)) continue;
      taken.add(k);
      entries.push(e);
    }
    texts.set(file.id, pend.text);
  }
  const state = build({ ...base.tree, entries }, texts);
  merged.set(key, { base, stamp: pendingStamp, state });
  return state;
}

function pendingFor(base: LocalState, job: PendingJob): Pending | null {
  let parent = base.byId.get(job.folderId);
  if (!parent || parent.k !== "d") return null;
  const m = new Date(job.at).toISOString();
  const entries: LocalEntry[] = [];
  if (job.subfolder) {
    // 저장할 때 만들 하위 폴더 (오늘 일기의 연도 폴더)
    const existing = (base.children.get(parent.id) ?? []).find((e) => e.k === "d" && e.n === job.subfolder);
    if (existing) parent = existing;
    else {
      const folder: LocalEntry = { id: `pending-d:${job.id}`, p: parent.id, n: job.subfolder, s: job.subfolder, k: "d", m, h: `${parent.h}/${encodeURIComponent(job.subfolder)}`, v: 1 };
      entries.push(folder);
      parent = folder;
    }
  }
  const id = `pending:${job.id}`;
  // 권한 표시는 없음: 저장이 끝나기 전에는 편집·이름 바꾸기·삭제를 못 한다
  entries.push({ id, p: parent.id, n: `${job.name}.md`, s: job.name, k: "f", m, h: `${parent.h}/${encodeURIComponent(job.name)}`, v: 1, md: 1 });
  return { entries, text: { id, m, t: job.text }, at: job.at };
}

/** 저장 대기열의 새 글들로 임시 항목을 맞춘다. 대기열에서 빠진 것(저장 끝)은 다음 동기화까지 둔다 */
export function setPendingJobs(email: string, rootId: string, jobs: PendingJob[]) {
  const key = keyOf(email, rootId);
  const base = states.get(key);
  const list = pendings.get(key) ?? new Map<string, Pending>();
  let changed = false;
  const now = Date.now();
  const active = new Set<string>();
  for (const job of jobs) {
    if (job.rootId !== rootId) continue;
    if (job.failed) {
      if (list.delete(job.id)) changed = true;
      continue;
    }
    active.add(job.id);
    const had = list.get(job.id);
    if (had && had.text.t === job.text) continue;
    const pend = base ? pendingFor(base, job) : null;
    if (pend) {
      list.set(job.id, pend);
      changed = true;
    }
  }
  for (const [id, pend] of list) {
    if (active.has(id)) continue;
    if (!pend.done) {
      pend.done = now;
      changed = true;
    } else if (now - pend.done > 120_000) {
      list.delete(id);
      changed = true;
    }
  }
  pendings.set(key, list);
  if (changed) {
    pendingStamp++;
    notify();
  }
}

/** 동기화로 진짜 목록을 받았으면 저장이 끝난 임시 항목은 뺀다 */
function dropDonePending(key: string) {
  const list = pendings.get(key);
  if (!list) return;
  let changed = false;
  for (const [id, pend] of list)
    if (pend.done) {
      list.delete(id);
      changed = true;
    }
  if (changed) pendingStamp++;
}

/** 주소 비교용: 퍼센트 인코딩을 풀고 끝의 / 를 뗀다 */
export const normHref = (h: string) => {
  try {
    return decodeURI(h).replace(/\/+$/, "");
  } catch {
    return h.replace(/\/+$/, "");
  }
};

function build(tree: LocalTree, texts: Map<string, LocalText>): LocalState {
  const byId = new Map<string, LocalEntry>();
  const byHref = new Map<string, LocalEntry>();
  const children = new Map<string, LocalEntry[]>();
  for (const e of tree.entries) {
    byId.set(e.id, e);
    byHref.set(normHref(e.h), e);
    if (e.p) {
      const list = children.get(e.p) ?? [];
      list.push(e);
      children.set(e.p, list);
    }
  }
  return { tree, byId, byHref, children, texts };
}

// ───────────── 불러오기 · 동기화 ─────────────

async function loadSaved(email: string, rootId: string): Promise<LocalState | null> {
  const tree = await tx<LocalTree>("readonly", (s) => s.get(treeKey(email, rootId)) as IDBRequest<LocalTree>);
  if (!tree) return null;
  const prefix = textPrefix(email);
  const all = await tx<LocalText[]>("readonly", (s) => s.getAll(IDBKeyRange.bound(prefix, `${prefix}￿`)) as IDBRequest<LocalText[]>);
  const texts = new Map<string, LocalText>();
  for (const t of all ?? []) texts.set(t.id, t);
  return build(tree, texts);
}

const running = new Map<string, Promise<void>>();
const opening = new Map<string, Promise<void>>();

/** 기기에 둔 사본만 꺼낸다 (서버에 묻지 않음). 첫 화면을 서버보다 먼저 그릴 때 */
export function openLocal(email: string, rootId: string): Promise<void> {
  const key = keyOf(email, rootId);
  if (states.has(key)) return Promise.resolve();
  const current = opening.get(key) ?? running.get(key);
  if (current) return current;
  const job = loadSaved(email, rootId)
    .then((saved) => {
      if (saved && !states.has(key)) {
        states.set(key, saved);
        notify();
      }
    })
    .catch(() => {})
    .finally(() => opening.delete(key));
  opening.set(key, job);
  return job;
}

/** 기기에 둔 것을 먼저 꺼내 보여 주고, 서버에서 바뀐 것만 받아 온다 (같은 일기장은 한 번에 하나만) */
export function syncLocal(email: string, rootId: string): Promise<void> {
  const key = keyOf(email, rootId);
  const current = running.get(key);
  if (current) return current;
  const job = (async () => {
    if (!states.has(key)) {
      const saved = await loadSaved(email, rootId);
      if (saved && !states.has(key)) {
        states.set(key, saved);
        notify();
      }
    }
    // 묶음 동기화: 가진 글의 버전을 한 번에 보내고, 바뀐 목록·글을 한 응답으로 받는다 (많으면 이어 받기)
    const texts = states.get(key)?.texts ?? new Map<string, LocalText>();
    for (let round = 0; round < 20; round++) {
      const have: Record<string, string> = {};
      for (const t of texts.values()) if (t.c) have[t.id] = t.m; // 체크섬 없는 옛 사본은 다시 받는다
      const res = await fetch("/api/local/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ root: rootId, have, tree: round === 0 }),
      });
      if (!res.ok) return;
      const { tree, texts: got, more } = (await res.json()) as { tree: LocalTree | null; texts: LocalText[]; more: boolean };
      let gone: string[] = [];
      if (tree) {
        // 없어진 글은 지운다
        const alive = new Set(tree.entries.map((e) => e.id));
        gone = [...texts.keys()].filter((id) => !alive.has(id));
        for (const id of gone) texts.delete(id);
      }
      for (const t of got) texts.set(t.id, t);
      if (tree) {
        states.set(key, build(tree, texts));
        dropDonePending(key);
      }
      notify();
      await tx("readwrite", (s) => {
        if (tree) s.put(tree, treeKey(email, rootId));
        for (const id of gone) s.delete(`${textPrefix(email)}${id}`);
        for (const t of got) s.put(t, `${textPrefix(email)}${t.id}`);
      });
      if (!more || !got.length) break;
    }
  })()
    .catch((e) => console.warn("[local] sync", e))
    .finally(() => running.delete(key));
  running.set(key, job);
  return job;
}

const asked = new Set<string>();

/** 지금 화면에 필요한 글을 먼저 받아 온다 (전체 동기화 순서를 기다리지 않게) */
export async function fetchTexts(email: string, rootId: string, ids: string[]): Promise<void> {
  const state = states.get(keyOf(email, rootId));
  const want = ids.filter((id) => !asked.has(id) && !state?.texts.has(id)).slice(0, BATCH);
  if (!state || !want.length) return;
  for (const id of want) asked.add(id);
  try {
    const r = await fetch("/api/local", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ root: rootId, ids: want }),
    });
    if (!r.ok) return;
    const { texts: got } = (await r.json()) as { texts: LocalText[] };
    for (const t of got) state.texts.set(t.id, t);
    await tx("readwrite", (s) => {
      for (const t of got) s.put(t, `${textPrefix(email)}${t.id}`);
    });
    notify();
  } catch {
  } finally {
    for (const id of want) asked.delete(id);
  }
}

/** 저장이 끝나 Drive가 돌려준 체크섬을 사본에 적는다 (다음에 사본으로 편집기를 열 때 충돌 확인용) */
export function setLocalChecksum(email: string, rootId: string, id: string, checksum: string) {
  const state = states.get(keyOf(email, rootId));
  const t = state?.texts.get(id);
  if (!state || !t) return;
  const next: LocalText = { ...t, c: checksum };
  state.texts.set(id, next);
  void tx("readwrite", (s) => void s.put(next, `${textPrefix(email)}${id}`));
}

/** 방금 저장한 글은 서버를 기다리지 않고 기기에도 바로 반영 */
export function putLocalText(email: string, rootId: string, id: string, text: string) {
  const state = states.get(keyOf(email, rootId));
  const entry = state?.byId.get(id);
  if (!state || !entry) return;
  const t: LocalText = { id, m: entry.m, t: text, w: Date.now() };
  state.texts.set(id, t);
  notify();
  void tx("readwrite", (s) => void s.put(t, `${textPrefix(email)}${id}`));
}

/** 맨 위 폴더 (쓰임새를 정하는 폴더) */
export function topOf(local: LocalState, e: LocalEntry): LocalEntry {
  let top = e;
  while (top.p) {
    const parent = local.byId.get(top.p);
    if (!parent?.p) break;
    top = parent;
  }
  return top;
}

/** 폴더 아래(하위 폴더 포함) 목록에 보이는 md 글 */
export function notesUnder(local: LocalState, folderId: string): LocalEntry[] {
  const out: LocalEntry[] = [];
  const walk = (id: string) => {
    for (const c of local.children.get(id) ?? []) {
      if (!c.v) continue;
      if (c.k === "f") {
        if (c.md) out.push(c);
      } else walk(c.id);
    }
  };
  walk(folderId);
  return out;
}

/** 일기장 맨 위부터 부모까지의 이름 (목록 오른쪽 위치 표시) */
export function pathOf(local: LocalState, e: LocalEntry): string[] {
  const out: string[] = [];
  for (let p = e.p ? local.byId.get(e.p) : undefined; p?.p; p = p.p ? local.byId.get(p.p) : undefined) out.unshift(p.s);
  return out;
}

export const rootOf = (local: LocalState) => local.tree.entries.find((e) => !e.p)!;
