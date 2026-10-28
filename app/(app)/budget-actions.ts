"use server";

import { revalidatePath } from "next/cache";
import { writeBudget } from "@/lib/budget";
import { DriveError } from "@/lib/drive";
import { loadLibrary, markWritten } from "@/lib/library";
import { readCategories, writeCategories } from "@/lib/categories";
import { cleanCategories } from "@/lib/receipt-shape";
import { getUser } from "@/lib/session";

// 예산 저장. 쓰기는 로그인한 사람 토큰으로 → Drive가 권한을 판단한다.

const toAmount = (v: FormDataEntryValue | null) => {
  const n = Number(String(v ?? "").replace(/[,원\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};

export async function saveBudget(rootId: string, form: FormData): Promise<{ ok: boolean; error?: string }> {
  const user = await getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };
  const loaded = await loadLibrary(user, String(rootId));
  if (loaded.kind !== "ok") return { ok: false, error: "일기장을 열 수 없습니다." };
  if (!loaded.index.root.can.addChildren) return { ok: false, error: "이 일기장의 설정을 바꿀 권한이 없습니다." };
  const categories: Record<string, number> = {};
  for (const c of await readCategories(loaded.index)) {
    const v = toAmount(form.get(`cat:${c}`));
    if (v) categories[c] = v;
  }
  try {
    await writeBudget(loaded.index, { monthly: toAmount(form.get("monthly")), categories });
  } catch (e) {
    console.error("[budget]", e);
    return { ok: false, error: e instanceof DriveError ? e.message : "예산을 저장하지 못했습니다." };
  }
  await markWritten();
  revalidatePath("/", "layout");
  return { ok: true };
}

/** 구매 분류 목록 저장 (분류 관리). 이미 쓴 글의 분류는 바꾸지 않는다 */
export async function saveCategories(rootId: string, list: string[]): Promise<{ ok: boolean; error?: string }> {
  const user = await getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };
  const loaded = await loadLibrary(user, String(rootId));
  if (loaded.kind !== "ok") return { ok: false, error: "일기장을 열 수 없습니다." };
  if (!loaded.index.root.can.addChildren) return { ok: false, error: "이 일기장의 설정을 바꿀 권한이 없습니다." };
  const categories = cleanCategories(list);
  if (!categories.length) return { ok: false, error: "분류가 하나 이상 있어야 해요." };
  try {
    await writeCategories(loaded.index, categories);
  } catch (e) {
    console.error("[categories]", e);
    return { ok: false, error: e instanceof DriveError ? e.message : "분류를 저장하지 못했습니다." };
  }
  await markWritten();
  revalidatePath("/", "layout");
  return { ok: true };
}

/** 입력 폼의 '+ 분류 추가': Drive의 지금 목록 끝에 하나 더한다 (이미 있으면 그대로). 바뀐 목록을 돌려준다 */
export async function addCategory(rootId: string, name: string): Promise<{ ok: true; categories: string[] } | { ok: false; error: string }> {
  const user = await getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };
  const loaded = await loadLibrary(user, String(rootId));
  if (loaded.kind !== "ok") return { ok: false, error: "일기장을 열 수 없습니다." };
  if (!loaded.index.root.can.addChildren) return { ok: false, error: "이 일기장의 설정을 바꿀 권한이 없습니다." };
  const [clean] = cleanCategories([name]);
  if (!clean) return { ok: false, error: "분류 이름을 확인해 주세요 (# : [ ] { } 는 쓸 수 없어요)." };
  const current = await readCategories(loaded.index);
  if (current.includes(clean)) return { ok: true, categories: current };
  const categories = [...current, clean];
  try {
    await writeCategories(loaded.index, categories);
  } catch (e) {
    console.error("[categories]", e);
    return { ok: false, error: e instanceof DriveError ? e.message : "분류를 저장하지 못했습니다." };
  }
  await markWritten();
  return { ok: true, categories };
}
