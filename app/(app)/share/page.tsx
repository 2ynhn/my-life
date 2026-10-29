import type { Metadata } from "next";
import { ShareInbox, type ShareTargets } from "@/components/ShareInbox";
import { featureFolders } from "@/lib/collect";
import { hrefFor, readText, visibleChildren, type FileEntry, type FolderEntry } from "@/lib/drive";
import { splitFrontmatter } from "@/lib/markdown";
import { loadLibrary, myLibrary } from "@/lib/library";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "공유받은 내용" };

const notesIn = (folder: FolderEntry): FileEntry[] =>
  visibleChildren(folder).flatMap((c) => (c.kind === "file" ? [c] : notesIn(c)));

// 휴대폰 '공유하기'로 들어오는 화면. 받은 내용은 브라우저 안에만 있으니 여기서는 어디에 넣을지만 고르게 한다 (내 일기장 기준)
export default async function SharePage({ searchParams }: { searchParams: Promise<{ retry?: string }> }) {
  const user = await requireUser();
  const { retry } = await searchParams;
  const mine = await myLibrary(user);
  const loaded = mine.kind === "ok" ? await loadLibrary(user, mine.lib.rootId) : null;
  let rootId: string | null = null;
  const targets: ShareTargets = { purchase: null, diary: null, travelNew: null, trips: [] };

  if (loaded?.kind === "ok") {
    const index = loaded.index;
    rootId = index.lib.rootId;
    const folders = await featureFolders(index);
    const of = (k: string) => folders.find((f) => f.feature === k)?.folder;

    const spending = of("spending");
    if (spending?.can.addChildren) targets.purchase = `${hrefFor(spending)}?mode=new&shared=1`;

    // 오늘 일기: 있으면 편집, 없으면 새로 (연도 폴더가 없으면 저장할 때 만든다)
    const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());
    const daily = of("diary");
    if (daily) {
      const year = daily.children.find((c): c is FolderEntry => c.kind === "folder" && c.name === today.slice(0, 4));
      const note = year?.children.find((c): c is FileEntry => c.kind === "file" && c.isMarkdown && c.slug.startsWith(today));
      if (note?.can.edit) targets.diary = { href: `${hrefFor(note)}?mode=edit&shared=photos`, exists: true };
      else if (year?.can.addChildren) targets.diary = { href: `${hrefFor(year)}?mode=new&shared=photos`, exists: false };
      else if (!year && daily.can.addChildren)
        targets.diary = { href: `${hrefFor(daily)}?mode=new&sub=${today.slice(0, 4)}&shared=photos`, exists: false };
    }

    // 여행: 새 여행, 또는 최근에 고친 여행 글 5개
    const travel = of("travel");
    if (travel) {
      if (travel.can.addChildren) targets.travelNew = `${hrefFor(travel)}?mode=new&shared=photos`;
      const recent = notesIn(travel)
        .filter((n) => n.can.edit)
        .sort((a, b) => b.modifiedTime.localeCompare(a.modifiedTime))
        .slice(0, 5);
      // 버튼에는 여행 이름(앞머리 title)을, 없으면 파일 이름
      const titles = await Promise.all(
        recent.map((n) =>
          readText(index, n)
            .then((t) => String(splitFrontmatter(t).meta.title ?? "").trim())
            .catch(() => ""),
        ),
      );
      targets.trips = recent.map((n, i) => ({
        title: titles[i] || n.slug,
        path: titles[i] ? n.slug : n.slugPath.slice(1, -1).join(" / "),
        href: `${hrefFor(n)}?mode=edit&shared=photos`,
      }));
    }
  }
  return (
    <div className="share">
      <h1 className="page-title">공유받은 내용</h1>
      <ShareInbox rootId={rootId} targets={targets} retry={retry === "1"} />
    </div>
  );
}
