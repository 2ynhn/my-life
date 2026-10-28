"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { DriveError, addShare, invalidateIndex, removeShare, setRestricted } from "@/lib/drive";
import { AI_MODELS, DEFAULT_MODEL, saveAiSettings, type AiModel } from "@/lib/ai-settings";
import { checkApiKey } from "@/lib/receipt";
import { loadLibrary, myLibrary, markWritten } from "@/lib/library";
import { getUser } from "@/lib/session";

// 모든 동작은 로그인한 사람 본인의 토큰으로 Drive에 요청한다.
// 공유·제한을 바꿀 수 있는지는 Drive가 판단하므로, 남의 일기장을 바꾸려 해도 Drive가 거절한다.

export type Result = { ok: true } | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function withMyIndex(run: (ctx: NonNullable<Awaited<ReturnType<typeof myIndex>>>) => Promise<Result>): Promise<Result> {
  const ctx = await myIndex();
  if (!ctx) return { ok: false, error: "내 일기장을 찾을 수 없습니다." };
  try {
    const res = await run(ctx);
    if (res.ok) revalidatePath("/settings");
    return res;
  } catch (e) {
    console.error("[settings]", e);
    return { ok: false, error: e instanceof DriveError ? e.message : "Drive 요청 중 알 수 없는 오류가 났습니다." };
  }
}

async function myIndex() {
  const user = await getUser();
  if (!user) return null;
  const mine = await myLibrary(user);
  if (mine.kind !== "ok") return null;
  const loaded = await loadLibrary(user, mine.lib.rootId);
  return loaded.kind === "ok" ? { user, index: loaded.index } : null;
}

async function inviteLink(rootId: string) {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}/d/${encodeURIComponent(rootId)}`;
}

/** 일기장 폴더를 공유한다 = 초대. Drive가 초대 메일을 보낸다 */
export async function inviteAction(rawEmail: string, rawRole: string): Promise<Result> {
  const email = String(rawEmail ?? "").trim().toLowerCase();
  const role = rawRole === "writer" ? "writer" : "reader";
  if (!EMAIL_RE.test(email) || email.length > 254) return { ok: false, error: "이메일 형식이 올바르지 않습니다." };
  return withMyIndex(async ({ user, index }) => {
    if (email === user.email.toLowerCase()) return { ok: false, error: "본인은 초대할 수 없습니다." };
    const link = await inviteLink(index.lib.rootId);
    await addShare(
      index,
      email,
      role,
      `${user.name ?? user.email}님이 일기장을 공유했습니다. 이 주소에서 구글 계정으로 로그인해 보세요: ${link}`,
    );
    return { ok: true };
  });
}

export async function revokeAction(permissionId: string): Promise<Result> {
  return withMyIndex(async ({ index }) => {
    await removeShare(index, String(permissionId));
    return { ok: true };
  });
}

/** 폴더의 Drive '접근 제한'을 켜고 끈다 (켜면 일기장을 공유받은 사람도 이 폴더는 못 봄) */
export async function restrictAction(folderId: string, on: boolean): Promise<Result> {
  return withMyIndex(async ({ index }) => {
    const folder = index.byId.get(String(folderId));
    if (folder?.kind !== "folder" || !folder.parent) return { ok: false, error: "폴더를 찾을 수 없습니다." };
    await setRestricted(index, folder, !!on);
    invalidateIndex(index);
    await markWritten();
    return { ok: true };
  });
}

/** 영수증 자동 입력용 Anthropic API 키·모델 (내 일기장 _settings/ai.json에 암호화해서 저장) */
export async function saveAiAction(rawKey: string, rawModel: string, remove = false): Promise<Result> {
  const model = rawModel in AI_MODELS ? (rawModel as AiModel) : DEFAULT_MODEL;
  const apiKey = String(rawKey ?? "").trim();
  if (apiKey && !/^sk-ant-[\w-]{10,}$/.test(apiKey)) return { ok: false, error: "Anthropic API 키 형식이 아닙니다 (sk-ant-로 시작)." };
  return withMyIndex(async ({ index }) => {
    if (remove) {
      await saveAiSettings(index, { apiKey: null, model });
      return { ok: true };
    }
    if (apiKey) {
      const problem = await checkApiKey(apiKey, model);
      if (problem) return { ok: false, error: problem };
    }
    await saveAiSettings(index, { apiKey: apiKey || undefined, model });
    return { ok: true };
  });
}
