import type { MetadataRoute } from "next";

/** 휴대폰 홈 화면에 앱으로 설치하기 위한 정보 (로그인 없이 읽을 수 있어야 함) */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "my-life",
    short_name: "my-life",
    description: "Google Drive에 저장한 일기장",
    lang: "ko",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#faf8f5",
    theme_color: "#faf8f5",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
