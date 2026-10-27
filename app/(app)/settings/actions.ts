"use server";

import { revalidatePath } from "next/cache";
import { DriveError } from "@/lib/drive";
import { addGuest, removeGuest, type GuestChange } from "@/lib/guests";
import { getUser } from "@/lib/session";

// 서버 액션은 화면 밖에서도 부를 수 있으므로 매번 소유자인지 확인한다

async function asOwner(run: () => Promise<GuestChange>): Promise<GuestChange> {
  const user = await getUser();
  if (user?.role !== "owner") return { ok: false, error: "권한이 없습니다." };
  try {
    const res = await run();
    if (res.ok) revalidatePath("/settings");
    return res;
  } catch (e) {
    console.error("[settings]", e);
    return { ok: false, error: e instanceof DriveError ? e.message : "저장 중 알 수 없는 오류가 났습니다." };
  }
}

export async function addGuestAction(email: string): Promise<GuestChange> {
  return asOwner(() => addGuest(String(email ?? "")));
}

export async function removeGuestAction(email: string): Promise<GuestChange> {
  return asOwner(() => removeGuest(String(email ?? "")));
}
