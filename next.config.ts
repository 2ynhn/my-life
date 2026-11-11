import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // 개발 모드 표시(N)는 끈다: 어느 구석에 두어도 휴대폰 화면의 메뉴·도구 막대를 가린다 (오류 표시는 그대로, 운영 빌드에는 원래 없음)
  devIndicators: false,
  experimental: {
    // 한 번 본 화면은 30초 동안 다시 받지 않는다 (위로·다시 들어가기가 바로). 저장·새로고침하면 비운다
    staleTimes: { dynamic: 30 },
  },
};

export default nextConfig;
