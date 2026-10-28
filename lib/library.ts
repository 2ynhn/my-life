import "server-only";
import { cookies } from "next/headers";
import {
  DriveError,
  ReauthError,
  findMyLibraries,
  getIndex,
  openLibrary,
  type DriveIndex,
  type DriveUser,
  type Entry,
  type Library,
} from "@/lib/drive";

/** 내 my-life 폴더가 여러 개일 때 고른 것 (폴더 id라 비밀이 아니고, 쓸 때마다 Drive로 다시 확인한다) */
export const ROOT_COOKIE = "ml-root";

export type MyLibrary =
  | { kind: "ok"; lib: Library }
  | { kind: "choose"; options: Library[] }
  | { kind: "none" }
  | { kind: "problem"; problem: string; reauth?: boolean };

const problemOf = (e: unknown): { problem: string; reauth?: boolean } => {
  console.error("[library]", e);
  if (e instanceof ReauthError) return { problem: e.message, reauth: true };
  return { problem: e instanceof DriveError ? e.message : "Drive를 불러오는 중 알 수 없는 오류가 났습니다." };
};

/** 내 일기장: 고른 폴더 → 이름이 my-life인 내 폴더 하나 → 여러 개면 선택, 없으면 만들기 */
export async function myLibrary(user: DriveUser): Promise<MyLibrary> {
  try {
    const pref = (await cookies()).get(ROOT_COOKIE)?.value;
    if (pref) {
      const lib = await openLibrary(user, pref);
      if (lib?.ownedByMe) return { kind: "ok", lib };
    }
    const found = await findMyLibraries(user);
    if (found.length === 1) return { kind: "ok", lib: found[0] };
    return found.length ? { kind: "choose", options: found } : { kind: "none" };
  } catch (e) {
    return { kind: "problem", ...problemOf(e) };
  }
}

// 레이아웃과 페이지가 같은 요청에서 각각 일기장을 여는데, Drive를 두 번 부르지 않게 잠깐 기억한다.
// (실제 내용 읽기·쓰기는 매번 그 사람 토큰으로 Drive가 다시 확인하므로, 공유를 끊으면 바로 막힌다)
const opened = new Map<string, { lib: Library | null; at: number }>();
const OPEN_TTL_MS = 30 * 1000;

async function openCached(user: DriveUser, rootId: string, fresh?: boolean): Promise<Library | null> {
  const key = `${user.email.toLowerCase()}\n${rootId}`;
  const hit = opened.get(key);
  if (!fresh && hit && Date.now() - hit.at < OPEN_TTL_MS) return hit.lib;
  const lib = await openLibrary(user, rootId);
  if (opened.size > 500) opened.clear();
  opened.set(key, { lib, at: Date.now() });
  return lib;
}

export type LoadedLibrary =
  | { kind: "ok"; index: DriveIndex }
  | { kind: "missing" }
  | { kind: "problem"; problem: string; reauth?: boolean };

/**
 * 주소의 일기장 id를 이 사람 권한으로 연다. 열 수 없으면(공유 안 됨·삭제됨) missing.
 * 운영 환경에서는 서버 오류 메시지가 숨겨지므로 문제는 값으로 돌려줘서 페이지가 보여 주게 한다.
 */
export async function loadLibrary(user: DriveUser, rootId: string, options: { fresh?: boolean } = {}): Promise<LoadedLibrary> {
  try {
    const lib = await openCached(user, rootId, options.fresh);
    if (!lib) return { kind: "missing" };
    return { kind: "ok", index: await getIndex(user, lib, options) };
  } catch (e) {
    return { kind: "problem", ...problemOf(e) };
  }
}

/**
 * 일기장에서 id로 항목을 찾는다. API 라우트는 페이지와 다른 인스턴스라 캐시가 늦을 수 있어,
 * 못 찾으면(방금 만든 폴더·파일) 시간과 상관없이 한 번 새로 읽어 본다.
 */
export async function findInLibrary(
  user: DriveUser,
  rootId: string,
  id: string,
): Promise<LoadedLibrary & { entry?: Entry }> {
  let loaded = await loadLibrary(user, rootId);
  if (loaded.kind !== "ok") return loaded;
  let entry = loaded.index.byId.get(id);
  if (!entry) {
    loaded = await loadLibrary(user, rootId, { fresh: true });
    if (loaded.kind !== "ok") return loaded;
    entry = loaded.index.byId.get(id);
  }
  return { ...loaded, entry };
}
