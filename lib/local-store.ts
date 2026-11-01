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

export const getLocal = (email: string, rootId: string): LocalState | null => states.get(keyOf(email, rootId)) ?? null;

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
      if (tree) states.set(key, build(tree, texts));
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
  const t: LocalText = { id, m: entry.m, t: text };
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
