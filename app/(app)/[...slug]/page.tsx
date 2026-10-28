import { redirect } from "next/navigation";
import { myLibrary } from "@/lib/library";
import { requireUser } from "@/lib/session";

/** 예전 주소(/daily/2013/…)는 내 일기장의 같은 경로로 보낸다 */
export default async function LegacyPath({ params }: { params: Promise<{ slug: string[] }> }) {
  const user = await requireUser();
  const mine = await myLibrary(user);
  if (mine.kind !== "ok") redirect("/libraries");
  const { slug } = await params;
  redirect([mine.lib.base, ...slug].join("/"));
}
