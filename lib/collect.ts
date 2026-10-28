import "server-only";
import { folderKind, visibleChildren, type DriveIndex, type FileEntry, type FolderEntry } from "@/lib/drive";
import { featureByName, type FeatureKey } from "@/lib/features";
import { collectNotes, dateOf } from "@/lib/folder-meta";
import { metaTags, splitFrontmatter } from "@/lib/markdown";

// 쓰임새 폴더(일기·구매·여행·건강) 글들의 앞머리를 한꺼번에 모은다.
// 입력 폼 자동 완성과 '모아보기'(사람·가게·장소·반복 구매)가 쓴다. 한 번 읽은 글은 기억해 두어 다음엔 빠르다.

export type Record_ = { file: FileEntry; feature: FeatureKey; date: string; meta: Record<string, unknown>; heading: string };

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
      collectNotes(index, folder, (file, text): Record_ => {
        const { meta, body } = splitFrontmatter(text) as { meta: Record<string, unknown>; body: string };
        const heading = /^#[ \t]+(.+)$/m.exec(body)?.[1].trim() ?? "";
        return { file, feature, meta, heading, date: dateOf(meta.date ?? meta.start, file) };
      }),
    ),
  );
  return {
    records: parts.flatMap((p) => p.items),
    read: parts.reduce((a, p) => a + p.read, 0),
    total: parts.reduce((a, p) => a + p.total, 0),
  };
}

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => String(x ?? "").trim()).filter(Boolean) : typeof v === "string" && v.trim() ? [v.trim()] : [];

/** 일기 people + 여행 companions */
export const peopleOf = (r: Record_) => [...new Set([...strings(r.meta.people), ...strings(r.meta.companions)])];
export const tagsOf = (r: Record_) => metaTags(r.meta as never).map((t) => t.replace(/^#/, "").trim()).filter(Boolean);

/** 많이 나온 순 */
export function topCounts(values: string[], limit = 30): string[] {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko")).slice(0, limit).map(([v]) => v);
}
