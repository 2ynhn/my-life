"use server";

import { revalidatePath } from "next/cache";
import {
  DriveError,
  checkNoteName,
  createFile,
  createFolder,
  fileChecksum,
  getIndex,
  hrefFor,
  invalidateIndex,
  readNote,
  renameFile,
  trashFile,
  updateFile,
  type DriveIndex,
  type FileEntry,
  type FolderEntry,
} from "@/lib/drive";
import { getUser } from "@/lib/session";

// 서버 액션은 화면 밖에서 POST로도 부를 수 있으므로 매번 권한을 확인한다.
// 운영 환경에서는 던진 오류 메시지가 숨겨지므로, 실패는 값으로 돌려준다.

export type ActionResult = { ok: true; href: string } | { ok: false; error: string };
export type SaveResult =
  | { ok: true; checksum: string }
  | { ok: false; error: string; conflict?: { text: string; checksum: string } };

const MAX_TEXT = 900_000; // 서버 액션 요청 한도(1MB) 아래로

async function ownerIndex(): Promise<DriveIndex | string> {
  const user = await getUser();
  if (!user) return "로그인이 필요합니다.";
  if (user.role !== "owner") return "편집 권한이 없습니다.";
  return getIndex();
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
  return { ok: false, error: e instanceof DriveError ? e.message : "저장 중 알 수 없는 오류가 났습니다." };
}

/** 같은 id로 다시 찾아서 주소를 만든다 (이름이 바뀌면 주소도 바뀜) */
async function freshHref(id: string, fallback: string): Promise<string> {
  const entry = (await getIndex({ fresh: true })).byId.get(id);
  return entry ? hrefFor(entry) : fallback;
}

export async function saveNote(id: string, baseChecksum: string, text: string, force = false): Promise<SaveResult> {
  const index = await ownerIndex();
  if (typeof index === "string") return { ok: false, error: index };
  const file = noteById(index, id);
  if (!file) return { ok: false, error: "파일을 찾을 수 없습니다. 이름이 바뀌었거나 삭제되었을 수 있어요." };
  if (typeof text !== "string" || text.length > MAX_TEXT) return { ok: false, error: "내용이 너무 깁니다." };

  try {
    if (!force) {
      const current = await fileChecksum(file);
      if (current !== baseChecksum) {
        const latest = await readNote(file);
        return {
          ok: false,
          error: "편집하는 동안 다른 곳에서 이 파일이 바뀌었습니다.",
          conflict: { text: latest.text, checksum: latest.checksum },
        };
      }
    }
    const checksum = await updateFile(file, text);
    // 페이지를 다시 그리지 않는다: 편집기가 새로 만들어지면 커서·되돌리기 기록이 사라진다.
    // 보기 화면은 매번 Drive에서 내용을 읽으므로 목록(수정 시각)만 갱신하면 된다.
    invalidateIndex();
    return { ok: true, checksum };
  } catch (e) {
    return failure(e);
  }
}

/** subfolder: 없으면 만들고 그 안에 저장 (오늘 일기 쓰기의 연도 폴더, 숫자 4자리만) */
export async function createNote(
  folderId: string,
  rawName: string,
  text: string,
  subfolder?: string,
): Promise<ActionResult> {
  const index = await ownerIndex();
  if (typeof index === "string") return { ok: false, error: index };
  const folder = folderById(index, folderId);
  if (!folder) return { ok: false, error: "폴더를 찾을 수 없습니다." };
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
      const newId = await createFolder(folder, subfolder!);
      target = { ...folder, id: newId, name: subfolder!, children: [] };
    }
    const id = await createFile(target, checked.name, text);
    invalidateIndex();
    revalidatePath("/", "layout");
    return { ok: true, href: await freshHref(id, hrefFor(folder)) };
  } catch (e) {
    return failure(e);
  }
}

export async function renameNote(id: string, rawName: string): Promise<ActionResult> {
  const index = await ownerIndex();
  if (typeof index === "string") return { ok: false, error: index };
  const file = noteById(index, id);
  if (!file?.parent) return { ok: false, error: "파일을 찾을 수 없습니다." };
  const checked = checkNoteName(String(rawName ?? ""), file.parent, file);
  if ("error" in checked) return { ok: false, error: checked.error };
  if (checked.name === file.name) return { ok: true, href: hrefFor(file) };

  try {
    const newId = await renameFile(file, checked.name);
    invalidateIndex();
    revalidatePath("/", "layout");
    return { ok: true, href: await freshHref(newId, hrefFor(file.parent)) };
  } catch (e) {
    return failure(e);
  }
}

export async function trashNote(id: string): Promise<ActionResult> {
  const index = await ownerIndex();
  if (typeof index === "string") return { ok: false, error: index };
  const file = noteById(index, id);
  if (!file?.parent) return { ok: false, error: "파일을 찾을 수 없습니다." };

  try {
    await trashFile(file);
    invalidateIndex();
    revalidatePath("/", "layout");
    return { ok: true, href: hrefFor(file.parent) };
  } catch (e) {
    return failure(e);
  }
}
