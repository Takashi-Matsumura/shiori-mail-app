import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import { Sidebar } from "@/components/sidebar";
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
      <body className="flex h-full text-sm">
        <Suspense fallback={<aside className="w-52 shrink-0 border-r border-line bg-panel" />}>
          <Sidebar />
        </Suspense>
        <main className="min-w-0 flex-1 overflow-hidden">{children}</main>
      </body>
    </html>
  );
}
