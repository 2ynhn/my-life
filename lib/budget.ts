import "server-only";
import { readSettingsJson, writeSettingsJson, type DriveIndex } from "@/lib/drive";
import { CATEGORIES } from "@/lib/receipt-shape";

// 한 달 예산: 일기장의 _settings/budget.json (Drive에 저장, 편집 권한이 있는 사람만 바꿀 수 있음)

export type Budget = { monthly: number | null; categories: Record<string, number> };

const FILE = "budget.json";
const amount = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : null);

export async function readBudget(index: DriveIndex): Promise<Budget> {
  const raw = await readSettingsJson<Partial<Budget>>(index, FILE).catch(() => null);
  const categories: Record<string, number> = {};
  for (const c of CATEGORIES) {
    const v = amount(raw?.categories?.[c]);
    if (v) categories[c] = v;
  }
  return { monthly: amount(raw?.monthly), categories };
}

export async function writeBudget(index: DriveIndex, budget: Budget) {
  await writeSettingsJson(index, FILE, { version: 1, ...budget });
}
