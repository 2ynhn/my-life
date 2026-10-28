"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  DriveError,
  checkNoteName,
  createFile,
  createFolder,
  fileChecksum,
  getIndex,
  hrefFor,
  invalidateIndex,
  loadTemplate,
  readNote,
  renameFile,
  trashFile,
  updateFile,
  type DriveIndex,
  type FileEntry,
  type FolderEntry,
} from "@/lib/drive";
import { FEATURES, featureByName } from "@/lib/features";
import { loadLibrary } from "@/lib/library";
import { getUser } from "@/lib/session";

// 모든 쓰기는 로그인한 사람 본인의 토큰으로 Drive에 요청한다 → 권한은 Drive가 최종 판단.
// 앱은 Drive가 알려 준 capabilities로 먼저 걸러서 알기 쉬운 오류를 돌려줄 뿐이다.
// 운영 환경에서는 던진 오류 메시지가 숨겨지므로, 실패는 값으로 돌려준다.

export type ActionResult = { ok: true; href: string } | { ok: false; error: string };
export type SaveResult =
  | { ok: true; checksum: string }
  | { ok: false; error: string; conflict?: { text: string; checksum: string } };

const MAX_TEXT = 900_000; // 서버 액션 요청 한도(1MB) 아래로
const NO_PERMISSION = "이 일기장에서 이 작업을 할 권한이 없습니다. (Drive 공유 권한 확인)";

async function libraryIndex(rootId: unknown): Promise<DriveIndex | string> {
  const user = await getUser();
  if (!user) return "로그인이 필요합니다.";
  if (typeof rootId !== "string") return "일기장을 찾을 수 없습니다.";
  const loaded = await loadLibrary(user, rootId);
  if (loaded.kind === "missing") return "일기장을 찾을 수 없습니다.";
  if (loaded.kind === "problem") return loaded.problem;
  return loaded.index;
}

function noteById(index: DriveIndex, id: unknown): FileEntry | null {
  const e = typeof id === "string" ? index.byId.get(id) : undefined;
  return e?.kind === "file" && e.isMarkdown ? e : null;
}

function folderById(index: DriveIndex, id: unknown): FolderEntry | null {
  const e = typeof id === "string" ? index.byId.get(id) : undefined;
  return e?.kind === "folder" ? e : null;
}

function failure(e: unknown): { ok: false; error: string } {
  console.error("[note-actions]", e);
  if (e instanceof DriveError && e.status === 403) return { ok: false, error: NO_PERMISSION };
  return { ok: false, error: e instanceof DriveError ? e.message : "저장 중 알 수 없는 오류가 났습니다." };
}

/** 같은 id로 다시 찾아서 주소를 만든다 (이름이 바뀌면 주소도 바뀜) */
async function freshHref(index: DriveIndex, id: string, fallback: string): Promise<string> {
  const entry = (await getIndex(index.user, index.lib, { fresh: true })).byId.get(id);
  return entry ? hrefFor(entry) : fallback;
}

export async function saveNote(
  rootId: string,
  id: string,
  baseChecksum: string,
  text: string,
  force = false,
): Promise<SaveResult> {
  const index = await libraryIndex(rootId);
  if (typeof index === "string") return { ok: false, error: index };
  const file = noteById(index, id);
  if (!file) return { ok: false, error: "파일을 찾을 수 없습니다. 이름이 바뀌었거나 삭제되었을 수 있어요." };
  if (!file.can.edit) return { ok: false, error: NO_PERMISSION };
  if (typeof text !== "string" || text.length > MAX_TEXT) return { ok: false, error: "내용이 너무 깁니다." };

  try {
    if (!force) {
      const current = await fileChecksum(index, file);
      if (current !== baseChecksum) {
        const latest = await readNote(index, file);
        return {
          ok: false,
          error: "편집하는 동안 다른 곳에서 이 파일이 바뀌었습니다.",
          conflict: { text: latest.text, checksum: latest.checksum },
        };
      }
    }
    const checksum = await updateFile(index, file, text);
    // 페이지를 다시 그리지 않는다: 편집기가 새로 만들어지면 커서·되돌리기 기록이 사라진다.
    // 보기 화면은 매번 Drive에서 내용을 읽으므로 목록(수정 시각)만 갱신하면 된다.
    invalidateIndex(index);
    return { ok: true, checksum };
  } catch (e) {
    return failure(e);
  }
}

/** subfolder: 없으면 만들고 그 안에 저장 (오늘 일기 쓰기의 연도 폴더, 숫자 4자리만) */
export async function createNote(
  rootId: string,
  folderId: string,
  rawName: string,
  text: string,
  subfolder?: string,
): Promise<ActionResult> {
  const index = await libraryIndex(rootId);
  if (typeof index === "string") return { ok: false, error: index };
  const folder = folderById(index, folderId);
  if (!folder) return { ok: false, error: "폴더를 찾을 수 없습니다." };
  if (!folder.can.addChildren) return { ok: false, error: NO_PERMISSION };
  if (typeof text !== "string" || text.length > MAX_TEXT) return { ok: false, error: "내용이 너무 깁니다." };
  if (subfolder !== undefined && (typeof subfolder !== "string" || !/^\d{4}$/.test(subfolder)))
    return { ok: false, error: "잘못된 폴더 이름입니다." };

  let target = folder;
  let needFolder = false;
  if (subfolder) {
    const existing = folder.children.find((c): c is FolderEntry => c.kind === "folder" && c.name === subfolder);
    if (existing) target = existing;
    else needFolder = true;
  }
  // 이름 검사를 먼저 해서, 실패할 때 빈 폴더만 남는 일이 없게 한다 (새 폴더는 비어 있으니 겹칠 이름도 없다)
  const checked = checkNoteName(String(rawName ?? ""), needFolder ? { ...folder, children: [] } : target);
  if ("error" in checked) return { ok: false, error: checked.error };

  try {
    if (needFolder) {
      const newId = await createFolder(index, folder, subfolder!);
      target = { ...folder, id: newId, name: subfolder!, children: [] };
    }
    const id = await createFile(index, target, checked.name, text);
    invalidateIndex(index);
    revalidatePath("/", "layout");
    return { ok: true, href: await freshHref(index, id, hrefFor(folder)) };
  } catch (e) {
    return failure(e);
  }
}

export async function renameNote(rootId: string, id: string, rawName: string): Promise<ActionResult> {
  const index = await libraryIndex(rootId);
  if (typeof index === "string") return { ok: false, error: index };
  const file = noteById(index, id);
  if (!file?.parent) return { ok: false, error: "파일을 찾을 수 없습니다." };
  if (!file.can.rename) return { ok: false, error: NO_PERMISSION };
  const checked = checkNoteName(String(rawName ?? ""), file.parent, file);
  if ("error" in checked) return { ok: false, error: checked.error };
  if (checked.name === file.name) return { ok: true, href: hrefFor(file) };

  try {
    const newId = await renameFile(index, file, checked.name);
    invalidateIndex(index);
    revalidatePath("/", "layout");
    return { ok: true, href: await freshHref(index, newId, hrefFor(file.parent)) };
  } catch (e) {
    return failure(e);
  }
}

export async function trashNote(rootId: string, id: string): Promise<ActionResult> {
  const index = await libraryIndex(rootId);
  if (typeof index === "string") return { ok: false, error: index };
  const file = noteById(index, id);
  if (!file?.parent) return { ok: false, error: "파일을 찾을 수 없습니다." };
  if (!file.can.trash) return { ok: false, error: NO_PERMISSION };

  try {
    await trashFile(index, file);
    invalidateIndex(index);
    revalidatePath("/", "layout");
    return { ok: true, href: hrefFor(file.parent) };
  } catch (e) {
    return failure(e);
  }
}

/** 첫 화면 '시작하기': 쓰임새 폴더(daily·purchase·travel·health)를 만들고 바로 새 글로 */
export async function startFeature(rootId: string, key: string): Promise<void> {
  const index = await libraryIndex(rootId);
  if (typeof index === "string") redirect("/");
  const feature = FEATURES.find((f) => f.key === key);
  const root = index.root;
  if (!feature || !root.can.addChildren) redirect(root.lib.base);
  const year = new Intl.DateTimeFormat("en", { timeZone: "Asia/Seoul", year: "numeric" }).format(new Date());
  const next = `${root.lib.base}/${encodeURIComponent(feature.folder)}?mode=new${feature.key === "diary" ? `&sub=${year}` : ""}`;
  // 같은 이름 폴더가 이미 있으면(다른 기기에서 방금 만듦 등) 그대로 쓴다
  if (root.children.some((c) => c.kind === "folder" && c.name === feature.folder)) redirect(next);
  try {
    await createFolder(index, root, feature.folder);
  } catch (e) {
    console.error("[note-actions] startFeature", e);
    redirect(root.lib.base);
  }
  invalidateIndex(index);
  revalidatePath("/", "layout");
  redirect(next);
}

const kstNow = () => {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date()); // 2026-10-28 14:32
  return { date: parts.slice(0, 10), time: parts.slice(11, 16), year: parts.slice(0, 4) };
};

/**
 * 빠른 한 줄 기록: 오늘 일기 끝에 '- 14:32 내용'을 붙인다.
 * 일기 폴더·연도 폴더·오늘 일기가 없으면 만든다 (오늘 일기는 템플릿으로 시작).
 */
export async function quickNote(rootId: string, raw: string): Promise<ActionResult> {
  const line = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!line) return { ok: false, error: "내용을 입력하세요." };
  if (line.length > 2000) return { ok: false, error: "한 줄 기록은 2000자까지예요." };
  const index = await libraryIndex(rootId);
  if (typeof index === "string") return { ok: false, error: index };
  const { date, time, year } = kstNow();
  const entry = `- ${time} ${line}`;

  try {
    const root = index.root;
    let daily = root.children.find((c): c is FolderEntry => c.kind === "folder" && featureByName(c.name) === "diary");
    if (!daily) {
      if (!root.can.addChildren) return { ok: false, error: NO_PERMISSION };
      const id = await createFolder(index, root, "daily");
      daily = { ...root, id, name: "daily", parent: root, children: [] };
    }
    let target = daily.children.find((c): c is FolderEntry => c.kind === "folder" && c.name === year);
    if (!target) {
      if (!daily.can.addChildren) return { ok: false, error: NO_PERMISSION };
      const id = await createFolder(index, daily, year);
      target = { ...daily, id, name: year, parent: daily, children: [] };
    }
    const notes = target.children.filter((c): c is FileEntry => c.kind === "file" && c.isMarkdown);
    const today = notes.find((n) => n.name === `${date}.md`) ?? notes.find((n) => n.slug.startsWith(date));

    let id: string;
    if (today) {
      if (!today.can.edit) return { ok: false, error: NO_PERMISSION };
      const { text } = await readNote(index, today); // 저장 직전의 최신 내용에 붙인다
      await updateFile(index, today, `${text.replace(/\s*$/, "")}\n${entry}\n`);
      id = today.id;
    } else {
      if (!target.can.addChildren) return { ok: false, error: NO_PERMISSION };
      const template = (await loadTemplate(index, daily)).replaceAll("{{date}}", date).replaceAll("{{title}}", "");
      id = await createFile(index, target, `${date}.md`, `${template.replace(/\s*$/, "")}\n\n${entry}\n`);
    }
    invalidateIndex(index);
    revalidatePath("/", "layout");
    return { ok: true, href: await freshHref(index, id, hrefFor(target)) };
  } catch (e) {
    return failure(e);
  }
}
