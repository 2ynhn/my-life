"use server";

import { revalidatePath } from "next/cache";
import { writeBudget } from "@/lib/budget";
import { DriveError } from "@/lib/drive";
import { loadLibrary } from "@/lib/library";
import { CATEGORIES } from "@/lib/receipt-shape";
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
  for (const c of CATEGORIES) {
    const v = toAmount(form.get(`cat:${c}`));
    if (v) categories[c] = v;
  }
  try {
    await writeBudget(loaded.index, { monthly: toAmount(form.get("monthly")), categories });
  } catch (e) {
    console.error("[budget]", e);
    return { ok: false, error: e instanceof DriveError ? e.message : "예산을 저장하지 못했습니다." };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}
