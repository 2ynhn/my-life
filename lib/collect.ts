import "server-only";
import { folderKind, visibleChildren, type DriveIndex, type FileEntry, type FolderEntry } from "@/lib/drive";
import { featureByName, type FeatureKey } from "@/lib/features";
import { collectNotes } from "@/lib/folder-meta";
import { recordOf, type Record_ as Rec } from "@/lib/records";

export { peopleOf, tagsOf, topCounts, suggestionsOf } from "@/lib/records";

// 쓰임새 폴더(일기·구매·여행·건강) 글들의 앞머리를 한꺼번에 모은다.
// 입력 폼 자동 완성과 '모아보기'(사람·가게·장소·반복 구매)가 쓴다. 한 번 읽은 글은 기억해 두어 다음엔 빠르다.

export type Record_ = Rec<FileEntry>;

/** 최상위 폴더 → 쓰임새 (구매·여행·건강은 템플릿, 일기는 이름) */
export async function featureFolders(index: DriveIndex): Promise<{ folder: FolderEntry; feature: FeatureKey }[]> {
  const tops = visibleChildren(index.root).filter((c): c is FolderEntry => c.kind === "folder");
  const kinds = await Promise.all(
    tops.map(async (f) => (featureByName(f.name) === "diary" ? "diary" : ((await folderKind(index, f).catch(() => null)) ?? null))),
  );
  return tops.flatMap((folder, i) => (kinds[i] ? [{ folder, feature: kinds[i] as FeatureKey }] : []));
}

export async function gatherRecords(
  index: DriveIndex,
  only?: FeatureKey[],
): Promise<{ records: Record_[]; read: number; total: number }> {
  const folders = (await featureFolders(index)).filter((f) => !only || only.includes(f.feature));
  const parts = await Promise.all(
    folders.map(({ folder, feature }) =>
      collectNotes(index, folder, (file, text): Record_ => recordOf(file, feature, text)),
    ),
  );
  return {
    records: parts.flatMap((p) => p.items),
    read: parts.reduce((a, p) => a + p.read, 0),
    total: parts.reduce((a, p) => a + p.total, 0),
  };
}
