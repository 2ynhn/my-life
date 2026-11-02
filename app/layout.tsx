import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SwRegister } from "@/components/SwRegister";

export const metadata: Metadata = {
  title: { default: "my-life", template: "%s · my-life" },
  description: "Google Drive에 저장한 일기 보기",
  robots: { index: false, follow: false },
  // iOS 홈 화면에 추가했을 때 주소창 없이 열리게
  appleWebApp: { capable: true, title: "my-life", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // 항상 밝은 화면 (기기가 다크 모드여도)
  themeColor: "#f6f7f3",
  // 휴대폰 키보드가 올라오면 화면이 줄어들어, 편집기 아래 도구 막대가 키보드 바로 위에 붙는다
  interactiveWidget: "resizes-content",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        {children}
        <SwRegister />
      </body>
    </html>
  );
}
