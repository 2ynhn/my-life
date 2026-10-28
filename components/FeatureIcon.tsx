import { Folder, FolderLock, HeartPulse, NotebookPen, Plane, Receipt, type LucideIcon } from "lucide-react";
import type { FeatureKey } from "@/lib/features";

// 쓰임새마다 아이콘 + 색 타일. 일반 폴더는 폴더 아이콘

const ICONS: Record<FeatureKey, LucideIcon> = {
  diary: NotebookPen,
  spending: Receipt,
  travel: Plane,
  health: HeartPulse,
};

export function FeatureIcon({
  kind,
  restricted = false,
  size = "md",
}: {
  kind: FeatureKey | null;
  restricted?: boolean;
  size?: "sm" | "md" | "lg";
}) {
  const Icon = kind ? ICONS[kind] : restricted ? FolderLock : Folder;
  const px = size === "lg" ? 24 : size === "md" ? 20 : 16;
  return (
    <span className={`ficon ficon-${size} ficon-${kind ?? "folder"}`} aria-hidden>
      <Icon size={px} strokeWidth={1.75} />
    </span>
  );
}
