import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    // 한 번 본 화면은 30초 동안 다시 받지 않는다 (위로·다시 들어가기가 바로). 저장·새로고침하면 비운다
    staleTimes: { dynamic: 30 },
  },
};

export default nextConfig;
