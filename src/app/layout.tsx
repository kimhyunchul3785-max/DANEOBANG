import type { Metadata } from "next";
import "./globals.css";
import { ClientLogger } from "@/components/ClientLogger";
import { Toaster } from "@/components/Toaster";
import { FontSwap } from "@/components/FontSwap";

export const metadata: Metadata = {
  title: "단어방 — 학원 단어 테스트 관리",
  description: "학원·선생님·학생을 위한 단어 테스트 운영 플랫폼",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* 웹폰트: media="print" 로 먼저 받아 렌더·하이드레이션을 막지 않고, 로드 후 FontSwap 이 media 를 all 로 바꾼다 */}
        <link data-font href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=Inter+Tight:wght@200;300;400&family=DotGothic16&family=Noto+Sans+KR:wght@400;500;600;700&display=swap" rel="stylesheet" media="print" />
        <link data-font href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css" rel="stylesheet" media="print" />
      </head>
      <body>
        <FontSwap />
        <ClientLogger />
        <Toaster />
        {children}
      </body>
    </html>
  );
}
