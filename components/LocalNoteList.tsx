"use client";

import { NoteList, type NoteItem } from "@/components/FolderList";
import { useEffect } from "react";
import { useLocal, useLocalContext } from "@/components/LocalData";
import { fetchTexts } from "@/lib/local-store";
import type { FolderKind } from "@/lib/drive";
import { noteSummary } from "@/lib/note-summary";

// 글 목록: 오른쪽 한 줄(제목·첫 품목·여행 이름·식당)은 기기에 받아 둔 글로 바로 만든다.
// 아직 받지 않은 글은 받는 대로 채워진다 (서버가 목록을 그리려고 글을 읽지 않아 화면도 빨리 온다).

export function LocalNoteList({ notes, kind, years }: { notes: NoteItem[]; kind: FolderKind | null; years: string[] | null }) {
  const local = useLocal();
  const ctx = useLocalContext();
  const summaries = new Map<string, string>();
  const missing: string[] = [];
  if (local) {
    for (const n of notes) {
      const t = local.texts.get(n.id);
      if (t) summaries.set(n.id, noteSummary(t.t, n.slug, kind));
      else missing.push(n.id);
    }
  }
  // 이 목록에서 아직 없는 글은 먼저 받아 온다
  const missingKey = missing.slice(0, 50).join(",");
  useEffect(() => {
    if (ctx && missingKey) void fetchTexts(ctx.email, ctx.rootId, missingKey.split(","));
  }, [ctx, missingKey]);
  return <NoteList notes={notes} summaries={summaries} years={years} />;
}
