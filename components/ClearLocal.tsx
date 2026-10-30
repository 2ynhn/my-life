"use client";

import { useEffect } from "react";
import { clearLocal } from "@/lib/local-store";

/** 로그인 화면: 전에 이 기기를 쓴 사람의 일기장 사본이 남아 있으면 지운다 */
export function ClearLocal() {
  useEffect(() => {
    void clearLocal();
  }, []);
  return null;
}
