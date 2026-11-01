import "server-only";
import { readSettingsJson, writeSettingsJson, type DriveIndex } from "@/lib/drive";
import { parseCategories } from "@/lib/view-source";

// 구매 분류 목록: 일기장의 _settings/categories.json. 없으면 기본 목록

const FILE = "categories.json";

export async function readCategories(index: DriveIndex): Promise<string[]> {
  return parseCategories(await readSettingsJson<{ categories?: unknown }>(index, FILE).catch(() => null));
}

export async function writeCategories(index: DriveIndex, categories: string[]) {
  await writeSettingsJson(index, FILE, { version: 1, categories });
}
