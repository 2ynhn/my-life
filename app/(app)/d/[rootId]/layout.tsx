import { Suspense } from "react";
import { Sidebar } from "@/components/Sidebar";
import { TabBar } from "@/components/TabBar";
import { folderTree } from "@/lib/drive";
import { libraryTitle } from "@/lib/labels";
import { loadLibrary } from "@/lib/library";
import { requireUser } from "@/lib/session";

/** 일기장 하나: 왼쪽 폴더 트리 + 본문. 열지 못하면 트리 없이 본문(페이지가 안내)만 */
export default async function LibraryLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ rootId: string }>;
}) {
  const user = await requireUser();
  const rootId = decodeURIComponent((await params).rootId);
  const loaded = await loadLibrary(user, rootId);
  if (loaded.kind !== "ok") return children;
  const { index } = loaded;

  return (
    <>
      <Sidebar tree={folderTree(index.root)} title={libraryTitle(index.lib)} homeHref={index.lib.base} />
      <div className="with-sidebar">{children}</div>
      <Suspense fallback={null}>
        <TabBar base={index.lib.base} />
      </Suspense>
    </>
  );
}
