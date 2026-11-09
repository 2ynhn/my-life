import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // 개발 모드 표시(N)는 왼쪽 위로: 휴대폰 편집기의 아래 도구 막대를 가리지 않게 (운영 빌드에는 없음)
  devIndicators: { position: "top-left" },
  experimental: {
    // 한 번 본 화면은 30초 동안 다시 받지 않는다 (위로·다시 들어가기가 바로). 저장·새로고침하면 비운다
    staleTimes: { dynamic: 30 },
  },
};

export default nextConfig;
