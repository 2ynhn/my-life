import { redirect } from "next/navigation";
import { myLibrary } from "@/lib/library";
import { requireUser } from "@/lib/session";

/** 처음 화면: 내 일기장이 정해져 있으면 바로 열고, 아니면 일기장 목록(만들기·고르기·공유받은 것) */
export default async function Home() {
  const user = await requireUser();
  const mine = await myLibrary(user);
  redirect(mine.kind === "ok" ? mine.lib.base : "/libraries");
}
