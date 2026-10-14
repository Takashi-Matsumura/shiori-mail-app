import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import { AiInsights } from "@/components/ai-insights";
import { AiRail } from "@/components/ai-rail";
import { AppHeader } from "@/components/app-header";
import { SidePanel } from "@/components/side-panel";
import { Sidebar } from "@/components/sidebar";
import { SidebarRail } from "@/components/sidebar-rail";
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
  title: "学習用メーラー",
  description: "メールの仕組みとローカル AI の使いどころを確かめるための学習用メーラー",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex h-full flex-col text-sm">
        <NoticeProvider>
          <AppHeader />
          <div className="flex min-h-0 flex-1">
            <SidePanel
              side="left"
              label="メニュー"
              rail={
                <Suspense fallback={null}>
                  <SidebarRail />
                </Suspense>
              }
            >
              <Suspense fallback={null}>
                <Sidebar />
              </Suspense>
            </SidePanel>
            <main className="min-w-0 flex-1 overflow-hidden">{children}</main>
            <SidePanel
              side="right"
              label="AI の働き"
              rail={
                <Suspense fallback={null}>
                  <AiRail />
                </Suspense>
              }
            >
              <Suspense fallback={null}>
                <AiInsights />
              </Suspense>
            </SidePanel>
          </div>
        </NoticeProvider>
      </body>
    </html>
  );
}
