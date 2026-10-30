"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { FeatureIcon } from "@/components/FeatureIcon";
import { FolderList, NoteList, noteYears, type NoteItem } from "@/components/FolderList";
import { Home, type HomeData, type HomeNode } from "@/components/Home";
import { useLocal } from "@/components/LocalData";
import { NoteBody } from "@/components/NoteBody";
import { PageSkeleton } from "@/components/PageSkeleton";
import { normHref, type LocalState } from "@/lib/local-store";
import type { LocalEntry } from "@/lib/local-types";
import { tableResolver, type LinkTable } from "@/lib/markdown";
import { noteSummary } from "@/lib/note-summary";

// 화면을 누르자마자: 서버가 Drive에서 읽어 오는 동안 기기에 받아 둔 목록·글로 바로 그린다 (loading.tsx).
// 서버 화면이 오면 그대로 바뀐다. 받아 둔 게 없거나 편집·검색 같은 화면이면 자리표시만.

export function LocalPreview() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Preview />
    </Suspense>
  );
}

function Preview() {
  const pathname = usePathname();
  const params = useSearchParams();
  return <PreviewFor pathname={pathname} search={params.toString()} />;
}

const webUrl = (e: LocalEntry) =>
  e.k === "d" ? `https://drive.google.com/drive/folders/${e.id}` : `https://drive.google.com/file/d/${e.id}/view`;

/** 기기 데이터로 그릴 수 있는 주소인지 (폴더·글 보기만. 첫 화면·편집·검색 등은 서버를 기다린다) */
export function canPreview(local: LocalState | null, pathname: string, search: string): boolean {
  if (!local || search) return false;
  const entry = local.byHref.get(normHref(pathname));
  if (!entry) return false;
  return entry.k === "d" || (!!entry.md && local.texts.has(entry.id));
}

export function PreviewFor({ pathname, search }: { pathname: string; search: string }) {
  const local = useLocal();
  if (!local || !canPreview(local, pathname, search)) return <PageSkeleton />;
  const entry = local.byHref.get(normHref(pathname))!;
  if (!entry.p)
    return (
      <div className="local-preview" aria-busy="true">
        <Home data={homeDataOf(local, entry)} />
      </div>
    );
  const head = (
    <div className="entry-head">
      <a className="small muted" href={webUrl(entry)} target="_blank" rel="noopener noreferrer">
        Drive에서 열기 ↗
      </a>
    </div>
  );
  if (entry.k === "d")
    return (
      <div className="local-preview" aria-busy="true">
        {head}
        <FolderPreview local={local} folder={entry} />
      </div>
    );
  const text = local.texts.get(entry.id)!.t;
  return (
    <div className="local-preview" aria-busy="true">
      {head}
      {entry.e && <div className="note-actions sk-actions" aria-hidden />}
      <NoteBody
        text={text}
        links={tableResolver(linkTableFor(local, entry))}
        tagHref={(t) => `${local.tree.base}?view=search&tag=${encodeURIComponent(t)}`}
      />
    </div>
  );
}

/** 첫 화면: 서버와 같은 Home을 기기 목록으로 */
function homeDataOf(local: LocalState, root: LocalEntry): HomeData {
  const node = (e: LocalEntry, path: string[]): HomeNode => ({
    kind: e.k === "d" ? "folder" : "file",
    id: e.id,
    name: e.n,
    slug: e.s,
    href: e.h,
    modifiedTime: e.m,
    isMarkdown: !!e.md,
    listable: !!e.v,
    restricted: !!e.r,
    can: { addChildren: !!e.a, edit: !!e.e },
    path,
    children: (local.children.get(e.id) ?? []).sort(compare).map((c) => node(c, e.p ? [...path, e.s] : [])),
  });
  return {
    root: node(root, []),
    base: local.tree.base,
    rootId: local.tree.rootId,
    ownedByMe: local.tree.own,
    ownerName: local.tree.owner,
    kinds: local.tree.kinds,
  };
}

/** 맨 위 폴더 (쓰임새를 정하는 폴더) */
function topOf(local: LocalState, e: LocalEntry): LocalEntry {
  let top = e;
  while (top.p) {
    const parent = local.byId.get(top.p);
    if (!parent?.p) break;
    top = parent;
  }
  return top;
}

const visible = (local: LocalState, folderId: string) => (local.children.get(folderId) ?? []).filter((c) => c.v);

/** 서버 정렬과 같게: 폴더 먼저, 숫자로 시작하는 이름(날짜)은 최신이 위로, 나머지는 가나다순 */
function compare(a: LocalEntry, b: LocalEntry) {
  if (a.k !== b.k) return a.k === "d" ? -1 : 1;
  const ad = /^\d/.test(a.n);
  const bd = /^\d/.test(b.n);
  if (ad !== bd) return ad ? -1 : 1;
  return ad ? b.n.localeCompare(a.n, "ko") : a.n.localeCompare(b.n, "ko");
}

function FolderPreview({ local, folder }: { local: LocalState; folder: LocalEntry }) {
  const feature = local.tree.kinds[topOf(local, folder).id] ?? null;
  const kind = feature === "diary" ? null : feature;
  const items = visible(local, folder.id).sort(compare);
  const notes: NoteItem[] = items.filter((e) => e.k === "f").map((e) => ({ id: e.id, href: e.h, slug: e.s }));
  const summaries = new Map<string, string>();
  for (const n of notes) {
    const t = local.texts.get(n.id);
    if (t) summaries.set(n.id, noteSummary(t.t, n.slug, kind));
  }
  const years = noteYears(notes);
  return (
    <>
      <div className="title-row">
        <h1 className="page-title">
          {feature && <FeatureIcon kind={feature} />}
          {folder.n}
        </h1>
      </div>
      {/* 구매·여행·건강·음식 요약은 서버 화면이 채운다 */}
      {kind && <span className="sk sk-view" aria-hidden />}
      <FolderList
        folderId={folder.id}
        folders={items
          .filter((e) => e.k === "d")
          .map((e) => ({ id: e.id, href: e.h, name: e.n, restricted: !!e.r, count: visible(local, e.id).length }))}
        notes={notes}
        years={years}
        showJump={kind !== "travel"}
        list={<NoteList notes={notes} summaries={summaries} years={years} />}
      />
    </>
  );
}

/** 글 안 링크(사진·다른 글): 가까운 폴더의 첨부가 먼저, 그다음 일기장 전체 (서버 linkTable과 같은 순서) */
function linkTableFor(local: LocalState, note: LocalEntry): LinkTable {
  const attachments: Record<string, string> = {};
  const add = (folderId: string) => {
    for (const c of local.children.get(folderId) ?? []) if (c.u) attachments[c.n.toLowerCase()] ??= c.u;
  };
  for (let f = note.p ? local.byId.get(note.p) : undefined; f; f = f.p ? local.byId.get(f.p) : undefined) {
    add(f.id);
    for (const c of local.children.get(f.id) ?? []) if (c.k === "d" && c.n.toLowerCase() === "attachments") add(c.id);
  }
  const notes: Record<string, string> = {};
  for (const e of local.tree.entries) {
    if (e.u) attachments[e.n.toLowerCase()] ??= e.u;
    else if (e.md) notes[e.s.toLowerCase()] ??= e.h;
  }
  return { attachments, notes };
}
