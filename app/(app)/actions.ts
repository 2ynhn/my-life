"use server";

import { revalidatePath } from "next/cache";
import { signOut } from "@/auth";
import { loadLibrary } from "@/lib/library";
import { requireUser } from "@/lib/session";

/** Drive에서 방금 바꾼 내용을 바로 보고 싶을 때 */
export async function refreshLibrary(rootId: string) {
  const user = await requireUser();
  await loadLibrary(user, String(rootId), { fresh: true });
  revalidatePath("/", "layout");
}

export async function logout() {
  await signOut({ redirectTo: "/login" });
}
