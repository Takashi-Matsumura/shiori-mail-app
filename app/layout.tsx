import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { InlineScript } from "@/components/inline-script";
import { PortraitOnly } from "@/components/portrait-only";
import { NoticeProvider } from "@/lib/client/notices";
import { PaletteSync } from "@/lib/client/use-palette";
import { DEFAULT_PALETTE, PALETTE_INIT_SCRIPT } from "@/lib/palette";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Shiori Mail",
  description: "AI の相棒「栞」が、メールの要約・仕分け・予定の抜き出しを手伝う、自分専用のメーラー",
};

// 画面下のタブを iPhone のホームバーの上に置けるよう、画面の端まで描く(余白は safe-area-inset で取る)
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // data-palette は <head> のスクリプトが保存値へ書き換えるので、食い違いの警告を抑える
    <html
      lang="ja"
      data-palette={DEFAULT_PALETTE}
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <InlineScript html={PALETTE_INIT_SCRIPT} />
      </head>
      <body className="flex h-dvh flex-col text-sm">
        <PaletteSync />
        <NoticeProvider>{children}</NoticeProvider>
        <PortraitOnly />
      </body>
    </html>
  );
}
