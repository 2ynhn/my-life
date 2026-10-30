import "server-only";
import type { HomeData, HomeNode } from "@/components/Home";
import { folderKind, hrefFor, isListable, visibleChildren, type DriveIndex, type Entry, type FolderEntry } from "@/lib/drive";
import { featureByName, type FeatureKey } from "@/lib/features";

// 첫 화면 데이터를 Drive 목록(서버 캐시)에서 만든다. 기기용 목록(/api/local)도 같은 쓰임새 판단을 쓴다.

/** 맨 위 폴더의 쓰임새: 일기는 이름으로, 나머지는 템플릿으로 (없으면 이름) */
export async function homeKinds(index: DriveIndex): Promise<Record<string, FeatureKey | null>> {
  const folders = visibleChildren(index.root).filter((c): c is FolderEntry => c.kind === "folder");
  const kinds = await Promise.all(
    folders.map(
      async (f): Promise<FeatureKey | null> =>
        featureByName(f.name) === "diary" ? "diary" : ((await folderKind(index, f).catch(() => null)) ?? featureByName(f.name)),
    ),
  );
  return Object.fromEntries(folders.map((f, i) => [f.id, kinds[i]]));
}

function node(e: Entry): HomeNode {
  return {
    kind: e.kind,
    id: e.id,
    name: e.name,
    slug: e.slug,
    href: hrefFor(e),
    modifiedTime: e.modifiedTime,
    isMarkdown: e.kind === "file" && e.isMarkdown,
    listable: !!e.parent && isListable(e),
    restricted: e.kind === "folder" && e.restricted,
    can: { addChildren: e.can.addChildren, edit: e.can.edit },
    path: e.slugPath.slice(0, -1),
    children: e.kind === "folder" ? e.children.map(node) : [],
  };
}

export async function homeData(index: DriveIndex): Promise<HomeData> {
  return {
    root: node(index.root),
    base: index.lib.base,
    rootId: index.lib.rootId,
    ownedByMe: index.lib.ownedByMe,
    ownerName: index.lib.ownerName,
    kinds: await homeKinds(index),
  };
}
