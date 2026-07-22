import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '모심 — 상황 맞춤 식당 추천 AI',
  description: '사업장·출장지별, 상황(임원/캐주얼)·연령·성별 맞춤 식당 추천',
};

export const viewport: Viewport = {
  themeColor: '#E11D48',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <head>
        <meta name="color-scheme" content="light only" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className="bg-slate-100 min-h-screen"
        style={{ fontFamily: "'Noto Sans KR', sans-serif" }}
      >
        <div className="max-w-[480px] mx-auto min-h-screen bg-slate-50 shadow-xl">
          {children}
        </div>
      </body>
    </html>
  );
}
