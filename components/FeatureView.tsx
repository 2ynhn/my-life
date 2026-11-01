"use client";

import { useEffect } from "react";
import { FoodView } from "@/components/FoodView";
import { HealthView } from "@/components/HealthView";
import { useLocal, useLocalContext } from "@/components/LocalData";
import { SpendingView } from "@/components/SpendingView";
import { TravelView } from "@/components/TravelView";
import type { FolderKind } from "@/lib/drive";
import { fetchTexts, topOf, type LocalState } from "@/lib/local-store";
import type { LocalEntry } from "@/lib/local-types";
import { parseBudget, parseCategories, type VFile, type ViewSource } from "@/lib/view-source";

// 구매·여행·건강·음식 폴더 위 요약을 기기 사본으로 그린다 (서버는 이 화면 때문에 Drive를 읽지 않는다).
// 아직 받지 않은 글은 이 폴더 것부터 먼저 받아 오고, 받는 대로 다시 그린다.

const vfile = (e: LocalEntry): VFile => ({ id: e.id, name: e.n, slug: e.s, href: e.h, url: e.u, photo: e.ph });

/** 폴더 아래(하위 폴더 포함) 목록에 보이는 md 글 */
function notesUnder(local: LocalState, folderId: string): LocalEntry[] {
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

function json<T>(local: LocalState, settings: LocalEntry | undefined, name: string): T | null {
  const file = settings && (local.children.get(settings.id) ?? []).find((c) => c.n === name);
  const text = file && local.texts.get(file.id)?.t;
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function sourceOf(local: LocalState, folder: LocalEntry): { src: ViewSource; missing: string[] } {
  const all = notesUnder(local, folder.id);
  const notes = all.flatMap((e) => {
    const t = local.texts.get(e.id);
    return t ? [{ file: vfile(e), text: t.t }] : [];
  });
  const root = local.tree.entries.find((e) => !e.p)!;
  const settings = (local.children.get(root.id) ?? []).find((c) => c.k === "d" && c.n === "_settings");
  const daily = (local.children.get(root.id) ?? []).find((c) => c.k === "d" && local.tree.kinds[c.id] === "diary");
  const diaries = daily ? notesUnder(local, daily.id).filter((e) => /^\d{4}-\d{2}-\d{2}/.test(e.n)) : [];

  // 사진 찾기: 서버 findAttachment와 같은 순서 (글 폴더부터 위로, 각 폴더의 attachments) → 일기장 전체
  const findAttachment = (from: LocalEntry, name: string): LocalEntry | null => {
    const target = name.toLowerCase();
    const match = (folderId: string) => (local.children.get(folderId) ?? []).find((c) => c.k === "f" && c.n.toLowerCase() === target);
    for (let f = from.p ? local.byId.get(from.p) : undefined; f; f = f.p ? local.byId.get(f.p) : undefined) {
      const direct = match(f.id);
      if (direct) return direct;
      for (const c of local.children.get(f.id) ?? []) {
        if (c.k === "d" && c.n.toLowerCase() === "attachments") {
          const found = match(c.id);
          if (found) return found;
        }
      }
    }
    return local.tree.entries.find((e) => e.k === "f" && e.n.toLowerCase() === target) ?? null;
  };
  const IMAGE = /!\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g;

  const src: ViewSource = {
    rootId: local.tree.rootId,
    folderHref: folder.h,
    canManage: !!root.a,
    notes,
    total: all.length,
    photosIn(file, text) {
      const note = local.byId.get(file.id);
      if (!note) return [];
      const out: VFile[] = [];
      for (const m of text.matchAll(IMAGE)) {
        const name = m[1].trim();
        if (!/\.(jpe?g|png|webp|gif|heic)$/i.test(name)) continue;
        const f = findAttachment(note, name);
        if (f?.u && !out.some((o) => o.id === f.id)) out.push(vfile(f));
      }
      return out;
    },
    diaries: diaries.map(vfile),
    diaryText: (id) => local.texts.get(id)?.t,
    budget: parseBudget(json(local, settings, "budget.json")),
    categories: parseCategories(json(local, settings, "categories.json")),
  };
  // 여행은 기간 안 일기의 사진도 쓰니 일기도 받아 둔다
  const missing = [...all, ...(local.tree.kinds[topOf(local, folder).id] === "travel" ? diaries : [])]
    .filter((e) => !local.texts.has(e.id))
    .map((e) => e.id);
  return { src, missing };
}

export function FeatureView({
  kind,
  folderId,
  spend,
  range,
}: {
  kind: FolderKind;
  folderId: string;
  spend?: string;
  range?: string;
}) {
  const local = useLocal();
  const ctx = useLocalContext();
  const folder = local?.byId.get(folderId);
  // 사본은 글이 들어올 때마다 같은 객체 안이 바뀌므로 매번 새로 만든다 (useLocal이 바뀔 때마다 다시 그림)
  const built = local && folder ? sourceOf(local, folder) : null;
  const missingKey = built?.missing.slice(0, 50).join(",") ?? "";
  useEffect(() => {
    if (ctx && missingKey) void fetchTexts(ctx.email, ctx.rootId, missingKey.split(","));
  }, [ctx, missingKey]);

  // 기기 사본이 준비되기 전(앱을 처음 연 순간 등)
  if (!built) return <span className="sk sk-view" aria-hidden />;
  const { src } = built;
  if (kind === "spending") return <SpendingView src={src} month={spend} />;
  if (kind === "travel") return <TravelView src={src} />;
  if (kind === "health") return <HealthView src={src} range={range} />;
  return <FoodView src={src} />;
}
