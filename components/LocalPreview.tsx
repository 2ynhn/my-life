"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { FeatureIcon } from "@/components/FeatureIcon";
import { FeatureView } from "@/components/FeatureView";
import { LocalRootView } from "@/components/LocalRootView";
import { LOCAL_ROOT_VIEWS, type RootViewName } from "@/lib/root-views";
import { FolderList, NoteList, noteYears, type NoteItem } from "@/components/FolderList";
import { Home, type HomeData, type HomeNode } from "@/components/Home";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useLocal } from "@/components/LocalData";
import { TemplateButton } from "@/components/TemplateButton";
import { NewNoteMenu } from "@/components/NewNoteMenu";
import { localOwnTemplate, localTemplateFiles } from "@/components/LocalEditorHost";
import { templateChoices } from "@/lib/template-types";
import { NewFolderButton } from "@/components/NewFolderButton";
import { NoteActions } from "@/components/NoteActions";
import { NoteBody } from "@/components/NoteBody";
import { PageSkeleton } from "@/components/PageSkeleton";
import { normHref, topOf, type LocalState } from "@/lib/local-store";

export { topOf };
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

/** 기기 데이터로 그릴 수 있는 주소인지 (폴더·글 보기만. 첫 화면·편집·검색 등은 서버를 기다린다) */
/** 폴더 요약의 보기 설정(구매 월·건강 기간)만 있는 주소도 사본으로 그린다 */
const VIEW_PARAMS = new Set(["spend", "range"]);

export function canPreview(local: LocalState | null, pathname: string, search: string): boolean {
  if (!local) return false;
  const sp = new URLSearchParams(search);
  const params = [...sp.keys()];
  const entry = local.byHref.get(normHref(pathname));
  if (!entry) return false;
  // 일기장 전체 화면: 검색·캘린더·모아보기
  if (!entry.p && sp.has("view")) return LOCAL_ROOT_VIEWS.has(sp.get("view")!);
  if (params.length) return entry.k === "d" && !!entry.p && params.every((k) => VIEW_PARAMS.has(k));
  return entry.k === "d" || (!!entry.md && local.texts.has(entry.id));
}

export function PreviewFor({ pathname, search }: { pathname: string; search: string }) {
  const local = useLocal();
  if (!local || !canPreview(local, pathname, search)) return <PageSkeleton />;
  const entry = local.byHref.get(normHref(pathname))!;
  const sp = new URLSearchParams(search);
  if (!entry.p && sp.has("view"))
    return (
      <div className="local-preview" aria-busy="true">
        <LocalRootView view={sp.get("view") as RootViewName} search={search} />
      </div>
    );
  if (!entry.p)
    return (
      <div className="local-preview" aria-busy="true">
        <Home data={homeDataOf(local, entry)} />
      </div>
    );
  // 쓰임새마다 강조색 (서버 화면의 feature-scope와 같게)
  const feature = local.tree.kinds[topOf(local, entry).id] ?? undefined;
  if (entry.k === "d")
    return (
      <div className="local-preview feature-scope" data-feature={feature} aria-busy="true">
        <FolderPreview local={local} folder={entry} params={new URLSearchParams(search)} />
      </div>
    );
  const text = local.texts.get(entry.id)!.t;
  return (
    <div className="local-preview feature-scope" data-feature={feature} aria-busy="true">
      {/* 버튼도 서버를 기다리지 않는다 (Drive 권한은 받아 둔 목록 그대로) */}
      {(entry.e || entry.rn || entry.t) && (
        <NoteActions
          rootId={local.tree.rootId}
          fileId={entry.id}
          fileName={entry.n}
          editHref={entry.e ? `${entry.h}?mode=edit` : null}
          canRename={!!entry.rn}
          canTrash={!!entry.t}
        />
      )}
      <NoteBody
        text={text}
        title={entry.s}
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


const visible = (local: LocalState, folderId: string) => (local.children.get(folderId) ?? []).filter((c) => c.v);

/** 서버 정렬과 같게: 폴더 먼저, 숫자로 시작하는 이름(날짜)은 최신이 위로, 나머지는 가나다순 */
function compare(a: LocalEntry, b: LocalEntry) {
  if (a.k !== b.k) return a.k === "d" ? -1 : 1;
  const ad = /^\d/.test(a.n);
  const bd = /^\d/.test(b.n);
  if (ad !== bd) return ad ? -1 : 1;
  return ad ? b.n.localeCompare(a.n, "ko") : a.n.localeCompare(b.n, "ko");
}

function FolderPreview({ local, folder, params }: { local: LocalState; folder: LocalEntry; params: URLSearchParams }) {
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
  // 유형이 정해진 폴더: '서식' 버튼(_templates/<최상위 폴더>.md). 유형이 없는 폴더: 새 글에서 유형 고르기
  const templateFile = feature ? localOwnTemplate(local, folder) : undefined;
  const canMakeTemplate = !!feature && !!local.tree.entries.find((e) => !e.p)?.a;
  const choices = !feature && folder.a ? templateChoices(localTemplateFiles(local)) : null;
  return (
    <>
      <div className="title-row">
        <h1 className="page-title">
          {feature && <FeatureIcon kind={feature} />}
          {folder.n}
        </h1>
        {(folder.a || templateFile?.e || canMakeTemplate) && (
          <div className="title-actions">
            {feature && (
              <TemplateButton
                rootId={local.tree.rootId}
                folderId={folder.id}
                existing={templateFile ? { href: templateFile.h, editable: !!templateFile.e } : null}
                canCreate={canMakeTemplate}
              />
            )}
            {folder.a && <NewFolderButton rootId={local.tree.rootId} folderId={folder.id} />}
            {folder.a && <NewNoteMenu href={folder.h} choices={choices} />}
          </div>
        )}
      </div>
      {/* 구매·여행·건강·음식 요약도 사본으로 */}
      {kind && <FeatureView kind={kind} folderId={folder.id} spend={params.get("spend") ?? undefined} range={params.get("range") ?? undefined} />}
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
export function linkTableFor(local: LocalState, note: Pick<LocalEntry, "p">): LinkTable {
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
