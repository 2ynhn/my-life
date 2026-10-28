import type { Metadata } from "next";
import { ShareInbox } from "@/components/ShareInbox";
import { featureFolders } from "@/lib/collect";
import { hrefFor } from "@/lib/drive";
import { loadLibrary, myLibrary } from "@/lib/library";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "공유받은 내용" };

// 휴대폰 '공유하기'로 들어오는 화면. 받은 내용은 브라우저 안에만 있으니 여기서는 어디에 넣을지만 정한다 (내 일기장 기준)
export default async function SharePage({ searchParams }: { searchParams: Promise<{ retry?: string }> }) {
  const user = await requireUser();
  const { retry } = await searchParams;
  const mine = await myLibrary(user);
  const loaded = mine.kind === "ok" ? await loadLibrary(user, mine.lib.rootId) : null;
  let rootId: string | null = null;
  let purchaseHref: string | null = null;
  if (loaded?.kind === "ok") {
    rootId = loaded.index.lib.rootId;
    const spending = (await featureFolders(loaded.index)).find((f) => f.feature === "spending")?.folder;
    if (spending?.can.addChildren) purchaseHref = hrefFor(spending);
  }
  return (
    <div className="share">
      <h1 className="page-title">공유받은 내용</h1>
      <ShareInbox rootId={rootId} purchaseHref={purchaseHref} retry={retry === "1"} />
    </div>
  );
}
