"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createMyLibrary, openLibrary } from "@/lib/drive";
import { ROOT_COOKIE } from "@/lib/library";
import { requireUser } from "@/lib/session";

const remember = async (rootId: string) =>
  (await cookies()).set(ROOT_COOKIE, rootId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 365 * 24 * 60 * 60,
  });

/** 내 my-life 폴더가 여러 개일 때 하나를 '내 일기장'으로 고른다 (내 소유인지 Drive로 확인) */
export async function chooseLibrary(rootId: string) {
  const user = await requireUser();
  const lib = await openLibrary(user, String(rootId));
  if (!lib?.ownedByMe) redirect("/libraries");
  await remember(lib.rootId);
  redirect(lib.base);
}

/** 내 Drive에 my-life 폴더를 새로 만든다 */
export async function createLibrary() {
  const user = await requireUser();
  const id = await createMyLibrary(user);
  await remember(id);
  redirect(`/d/${encodeURIComponent(id)}`);
}
