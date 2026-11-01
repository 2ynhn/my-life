"use client";

import { useEffect } from "react";
import { CalendarView } from "@/components/CalendarView";
import { CollectView } from "@/components/CollectView";
import { json, vfile } from "@/components/FeatureView";
import { useLocal, useLocalContext } from "@/components/LocalData";
import { PageSkeleton } from "@/components/PageSkeleton";
import { SearchView } from "@/components/SearchView";
import { fetchTexts, notesUnder, pathOf, rootOf, type LocalState } from "@/lib/local-store";
import { recordOf, suggestionsOf, type Record_, type Suggestions } from "@/lib/records";
import { parseCategories } from "@/lib/view-source";

// 일기장 전체 화면(검색·캘린더·모아보기)을 기기 사본으로 그린다. 서버는 이 화면 때문에 Drive를 읽지 않는다.
// 검색·모아보기는 글 내용이 필요해, 아직 받지 않은 글을 차례로 받아 오며 결과를 늘린다.

import type { RootViewName } from "@/lib/root-views";

function allNotes(local: LocalState) {
  return notesUnder(local, rootOf(local).id).map((e) => ({ e, path: pathOf(local, e) }));
}

function records(local: LocalState): { records: Record_[]; read: number; total: number; missing: string[] } {
  const out: Record_[] = [];
  let total = 0;
  const missing: string[] = [];
  for (const folder of local.children.get(rootOf(local).id) ?? []) {
    const feature = local.tree.kinds[folder.id];
    if (folder.k !== "d" || !folder.v || !feature) continue;
    for (const e of notesUnder(local, folder.id)) {
      total++;
      const t = local.texts.get(e.id);
      if (t) out.push(recordOf({ ...vfile(e), path: pathOf(local, e) }, feature, t.t));
      else missing.push(e.id);
    }
  }
  return { records: out, read: out.length, total, missing };
}

/** 입력 폼 자동 완성을 기기 사본으로 (서버 /api/suggest 대신) */
export function localSuggestions(local: LocalState): Suggestions {
  const settings = (local.children.get(rootOf(local).id) ?? []).find((c) => c.k === "d" && c.n === "_settings");
  return suggestionsOf(records(local).records, parseCategories(json(local, settings, "categories.json")));
}

/** search: 주소의 ?뒤 (서버에서도 넘기므로 글자로) */
export function LocalRootView({ view, search }: { view: RootViewName; search: string }) {
  const params = new URLSearchParams(search);
  const local = useLocal();
  const ctx = useLocalContext();
  let body: React.ReactNode = <PageSkeleton />;
  let missing: string[] = [];
  if (local) {
    const base = local.tree.base;
    if (view === "calendar") {
      const notes = allNotes(local).map(({ e, path }) => ({ id: e.id, name: e.n, slug: e.s, href: e.h, path }));
      body = <CalendarView base={base} notes={notes} month={params.get("month") ?? undefined} day={params.get("day") ?? undefined} />;
    } else if (view === "search") {
      const notes = allNotes(local).map(({ e, path }) => ({ id: e.id, name: e.n, slug: e.s, href: e.h, path, text: local.texts.get(e.id)?.t }));
      missing = notes.filter((n) => n.text === undefined).map((n) => n.id);
      body = <SearchView base={base} notes={notes} q={params.get("q") ?? ""} tag={params.get("tag") ?? ""} />;
    } else {
      const r = records(local);
      missing = r.missing;
      body = (
        <CollectView
          libBase={base}
          records={r.records}
          read={r.read}
          total={r.total}
          tab={params.get("tab") ?? undefined}
          who={params.get("who") ?? undefined}
          store={params.get("store") ?? undefined}
        />
      );
    }
  }
  const missingKey = missing.slice(0, 50).join(",");
  useEffect(() => {
    if (ctx && missingKey) void fetchTexts(ctx.email, ctx.rootId, missingKey.split(","));
  }, [ctx, missingKey]);
  return body;
}
