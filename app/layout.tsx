import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
        <script dangerouslySetInnerHTML={{ __html: PALETTE_INIT_SCRIPT }} />
      </head>
      <body className="flex h-full flex-col text-sm">
        <PaletteSync />
        <NoticeProvider>{children}</NoticeProvider>
      </body>
    </html>
  );
}
