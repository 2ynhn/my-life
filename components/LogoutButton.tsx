"use client";

import { LogOut } from "lucide-react";
import { logout } from "@/app/(app)/actions";
import { clearLocal } from "@/lib/local-store";
import { getJobs } from "@/lib/save-queue";

// 로그아웃: 기기에 받아 둔 일기장 사본을 지우고 나간다 (같은 기기를 다른 사람이 쓸 수 있으니)
export function LogoutButton() {
  return (
    <button
      className="btn"
      type="button"
      onClick={async () => {
        const unsent = getJobs().length;
        if (unsent && !confirm(`아직 Drive에 올리지 못한 글이 ${unsent}개 있어요. 로그아웃하면 사라집니다. 계속할까요?`)) return;
        try {
          localStorage.removeItem("my-life:save-queue");
        } catch {}
        await clearLocal();
        await logout();
      }}
    >
      <LogOut size={16} aria-hidden />
      로그아웃
    </button>
  );
}
