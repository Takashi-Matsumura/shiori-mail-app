import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NoticeProvider } from "@/lib/client/notices";
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
    <html lang="ja" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex h-full flex-col text-sm">
        <NoticeProvider>{children}</NoticeProvider>
      </body>
    </html>
  );
}
