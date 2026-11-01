import { after } from "next/server";
import { cachedText, type FileEntry } from "@/lib/drive";
import { buildLocalTree, isSyncedText, localText, noStore, openForLocal } from "@/lib/local-tree";
import type { LocalText, LocalTree } from "@/lib/local-types";
import { gatherTexts, readSnapshot, snapshotWorthWriting, writeSnapshot } from "@/lib/snapshot";

// 묶음 동기화: 기기가 가진 글의 버전(수정 시각)을 한 번에 보내면, 바뀐 목록과 바뀐 글을 한 응답에 묶어 돌려준다.
// 글은 서버 메모리 → 묶음 사본(.mymemo) → Drive 하나씩 순서로 모은다. Drive에서 많이 읽었으면 응답 뒤에 사본을 새로 쓴다.

export const maxDuration = 60;

/** 한 응답에 담는 글자 수 (넘으면 more로 이어 받기) */
const MAX_CHARS = 3_000_000;

type Body = { root?: unknown; have?: unknown; tree?: unknown };

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const opened = await openForLocal(req, typeof body.root === "string" ? body.root : "");
  if (opened.error) return opened.error;
  const { index } = opened;
  const have = body.have && typeof body.have === "object" ? (body.have as Record<string, unknown>) : {};

  const all = [...index.byId.values()].filter(isSyncedText);
  // 기기에 없거나 바뀐 글 (최근 것부터)
  const wanted = all.filter((f) => have[f.id] !== f.modifiedTime).sort((a, b) => b.modifiedTime.localeCompare(a.modifiedTime));
  const { texts, stats } = await gatherTexts(index, wanted, 8_000);

  const out: LocalText[] = [];
  let chars = 0;
  let more = false;
  for (const f of wanted) {
    const t = texts.get(f.id);
    if (t === undefined) {
      more = true;
      continue;
    }
    if (chars + t.length > MAX_CHARS && out.length) {
      more = true;
      break;
    }
    chars += t.length;
    out.push(localText(f, t));
  }
  const tree: LocalTree | null = body.tree === false ? null : await buildLocalTree(index);

  // 사본 새로 쓰기 (응답을 기다리게 하지 않는다): 지금 서버가 아는 글로
  if (index.lib.ownedByMe) {
    after(async () => {
      try {
        const snap = await readSnapshot(index);
        const missing = all.filter((f) => !snap?.files[f.id]).length;
        if (!snapshotWorthWriting(stats, snap ? missing : all.length)) return;
        const files: Record<string, { m: string; t: string }> = {};
        const known = (f: FileEntry) => cachedText(index, f) ?? (snap?.files[f.id]?.m === f.modifiedTime ? snap.files[f.id].t : null);
        for (const f of all) {
          const t = known(f);
          if (t !== null) files[f.id] = { m: f.modifiedTime, t };
        }
        await writeSnapshot(index, files);
        console.log(`[snapshot] wrote ${Object.keys(files).length}/${all.length} (drive ${stats.fromDrive}, stale ${stats.staleInSnapshot})`);
      } catch (e) {
        console.error("[snapshot] write", e);
      }
    });
  }

  return Response.json({ tree, texts: out, more, stats }, { headers: noStore });
}
