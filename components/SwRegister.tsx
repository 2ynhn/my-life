"use client";

import { useEffect } from "react";

/** 공유하기를 받는 서비스 워커 등록 (개발 서버에서도 동작) */
export function SwRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
