import "server-only";
import { gunzipSync, gzipSync } from "node:zlib";
import { cachedText, rememberText, type DriveIndex, type FileEntry } from "@/lib/drive";
import { readTexts } from "@/lib/folder-meta";
import { API, driveFetch } from "@/lib/google";

// 묶음 사본(.mymemo): 일기장 글 전체를 압축 파일 하나로 Drive에 둔다.
// 새 기기·다시 로그인한 기기가 글 수백 개를 하나씩 내려받는 대신, 서버가 이 파일 하나를 읽어 한 번에 넘긴다.
// 위치: <일기장>/.mymemo/snapshot.json.gz — .mymemo 폴더는 Drive '접근 제한'이라 일기장을 공유받은 사람도 못 연다
// (사본에는 공유받은 사람이 못 보는 폴더의 글도 들어 있으므로). 내 일기장에만 만든다.
// 사본은 빠르게 하려는 것일 뿐 원본은 늘 각 md 파일이다: 수정 시각이 다르면 사본 대신 원본을 읽는다.

const FOLDER = ".mymemo";
const FILE = "snapshot.json.gz";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const RECHECK_MS = 60_000;

type Snap = { v: 1; at: string; files: Record<string, { m: string; t: string }> };
type Slot = { folderId: string | null; fileId: string | null; modifiedTime: string | null; snap: Snap | null; checkedAt: number };

const slots = new Map<string, Slot>();
const keyOf = (index: DriveIndex) => `${index.user.email.toLowerCase()}\n${index.lib.rootId}`;
const q = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

async function findChild(index: DriveIndex, parentId: string, name: string, folder: boolean) {
  const params = new URLSearchParams({
    q: `'${q(parentId)}' in parents and name = '${q(name)}' and trashed = false and mimeType ${folder ? "=" : "!="} '${FOLDER_MIME}'`,
    fields: "files(id,modifiedTime)",
    pageSize: "1",
  });
  const res = await driveFetch(index.user, `${API.drive}/files?${params}`);
  return ((await res.json()) as { files: { id: string; modifiedTime: string }[] }).files[0] ?? null;
}

async function locate(index: DriveIndex, slot: Slot) {
  const folder = await findChild(index, index.lib.rootId, FOLDER, true);
  slot.folderId = folder?.id ?? null;
  const file = folder ? await findChild(index, folder.id, FILE, false) : null;
  slot.fileId = file?.id ?? null;
  if (file?.modifiedTime !== slot.modifiedTime) slot.snap = null;
  slot.modifiedTime = file?.modifiedTime ?? null;
  slot.checkedAt = Date.now();
}

/** 사본 읽기 (내 일기장만, 없거나 못 읽으면 null). 서버 인스턴스 메모리에 잠깐 기억 */
export async function readSnapshot(index: DriveIndex): Promise<Snap | null> {
  if (!index.lib.ownedByMe) return null;
  const key = keyOf(index);
  const slot = slots.get(key) ?? { folderId: null, fileId: null, modifiedTime: null, snap: null, checkedAt: 0 };
  slots.set(key, slot);
  try {
    if (Date.now() - slot.checkedAt > RECHECK_MS) await locate(index, slot);
    if (!slot.fileId) return null;
    if (!slot.snap) {
      const res = await driveFetch(index.user, `${API.drive}/files/${encodeURIComponent(slot.fileId)}?alt=media`);
      const data = JSON.parse(gunzipSync(Buffer.from(await res.arrayBuffer())).toString("utf8")) as Snap;
      slot.snap = data?.v === 1 && data.files ? data : null;
    }
    return slot.snap;
  } catch (e) {
    console.error("[snapshot] read", e);
    return null;
  }
}

/** 사본 새로 쓰기: 폴더가 없으면 접근 제한 폴더로 만든다 */
export async function writeSnapshot(index: DriveIndex, files: Snap["files"]): Promise<void> {
  if (!index.lib.ownedByMe || !index.root.can.addChildren) return;
  const key = keyOf(index);
  const slot = slots.get(key) ?? { folderId: null, fileId: null, modifiedTime: null, snap: null, checkedAt: 0 };
  slots.set(key, slot);
  await locate(index, slot);
  if (!slot.folderId) {
    const res = await driveFetch(index.user, `${API.drive}/files?fields=id`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: FOLDER, parents: [index.lib.rootId], mimeType: FOLDER_MIME }),
    });
    slot.folderId = ((await res.json()) as { id: string }).id;
    // 일기장을 공유받은 사람(가족·게스트)은 이 폴더를 열 수 없게
    await driveFetch(index.user, `${API.drive}/files/${encodeURIComponent(slot.folderId)}?fields=id`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inheritedPermissionsDisabled: true }),
    });
  }
  const snap: Snap = { v: 1, at: new Date().toISOString(), files };
  const bytes = gzipSync(Buffer.from(JSON.stringify(snap), "utf8"));
  let modifiedTime: string;
  if (slot.fileId) {
    const res = await driveFetch(index.user, `${API.upload}/files/${encodeURIComponent(slot.fileId)}?uploadType=media&fields=modifiedTime`, {
      method: "PATCH",
      headers: { "Content-Type": "application/gzip" },
      body: bytes,
    });
    modifiedTime = ((await res.json()) as { modifiedTime: string }).modifiedTime;
  } else {
    const boundary = `my-life-${crypto.randomUUID()}`;
    const meta = JSON.stringify({ name: FILE, parents: [slot.folderId], mimeType: "application/gzip" });
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/gzip\r\n\r\n`,
      bytes,
      `\r\n--${boundary}--`,
    ]);
    const res = await driveFetch(index.user, `${API.upload}/files?uploadType=multipart&fields=id,modifiedTime`, {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    });
    const created = (await res.json()) as { id: string; modifiedTime: string };
    slot.fileId = created.id;
    modifiedTime = created.modifiedTime;
  }
  slot.modifiedTime = modifiedTime ?? null;
  slot.snap = snap;
  slot.checkedAt = Date.now();
}

export type TextStats = { fromMemory: number; fromSnapshot: number; fromDrive: number; staleInSnapshot: number };

/**
 * 글 내용 모아 오기: 서버 메모리 → 묶음 사본(수정 시각이 같을 때) → Drive에서 하나씩(시간 안에서).
 * 사본으로 얼마나 아꼈는지·사본이 얼마나 낡았는지도 돌려준다 (사본을 새로 쓸지 정하는 데 씀)
 */
export async function gatherTexts(
  index: DriveIndex,
  files: FileEntry[],
  budgetMs: number,
): Promise<{ texts: Map<string, string>; stats: TextStats }> {
  const texts = new Map<string, string>();
  const stats: TextStats = { fromMemory: 0, fromSnapshot: 0, fromDrive: 0, staleInSnapshot: 0 };
  const rest: FileEntry[] = [];
  for (const f of files) {
    const t = cachedText(index, f);
    if (t !== null) {
      texts.set(f.id, t);
      stats.fromMemory++;
    } else rest.push(f);
  }
  const snap = rest.length ? await readSnapshot(index) : null;
  const need: FileEntry[] = [];
  for (const f of rest) {
    const hit = snap?.files[f.id];
    if (hit && hit.m === f.modifiedTime) {
      texts.set(f.id, hit.t);
      rememberText(index, f, hit.t);
      stats.fromSnapshot++;
    } else {
      if (hit) stats.staleInSnapshot++;
      need.push(f);
    }
  }
  if (need.length) {
    const read = await readTexts(index, need, budgetMs);
    for (const [id, t] of read) texts.set(id, t);
    stats.fromDrive = read.size;
  }
  return { texts, stats };
}

/** 사본을 새로 쓸 만한가: Drive에서 하나씩 읽은 글이 많았거나, 사본에 낡은 글이 쌓였을 때 */
export const snapshotWorthWriting = (s: TextStats, missingInSnapshot: number) =>
  s.fromDrive >= 5 || s.staleInSnapshot + missingInSnapshot >= 20;
