import "server-only";
import { readSettingsJson, writeSettingsJson, type DriveIndex } from "@/lib/drive";
import { CATEGORIES, cleanCategories } from "@/lib/receipt-shape";

// 구매 분류 목록: 일기장의 _settings/categories.json. 없으면 기본 목록

const FILE = "categories.json";

export async function readCategories(index: DriveIndex): Promise<string[]> {
  const raw = await readSettingsJson<{ categories?: unknown }>(index, FILE).catch(() => null);
  const list = cleanCategories(raw?.categories);
  return list.length ? list : [...CATEGORIES];
}

export async function writeCategories(index: DriveIndex, categories: string[]) {
  await writeSettingsJson(index, FILE, { version: 1, categories });
}
