import "server-only";
import { readSettingsJson, writeSettingsJson, type DriveIndex } from "@/lib/drive";
import { parseBudget, type Budget } from "@/lib/view-source";

export type { Budget };

// 한 달 예산: 일기장의 _settings/budget.json (Drive에 저장, 편집 권한이 있는 사람만 바꿀 수 있음)

const FILE = "budget.json";
export async function readBudget(index: DriveIndex): Promise<Budget> {
  return parseBudget(await readSettingsJson<Partial<Budget>>(index, FILE).catch(() => null));
}

export async function writeBudget(index: DriveIndex, budget: Budget) {
  await writeSettingsJson(index, FILE, { version: 1, ...budget });
}
