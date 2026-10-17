import type { MetadataRoute } from "next";

// ホーム画面に追加したとき、ブラウザの枠なしで開くための設定。
// ログイン前に取りに来られることがあるので、proxy.ts の対象から外してある(メールの内容は含まない)
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Shiori Mail",
    short_name: "Shiori",
    description: "AI の相棒「栞」が、メールの要約・仕分け・予定の抜き出しを手伝う、自分専用のメーラー",
    lang: "ja",
    start_url: "/mail/inbox",
    scope: "/",
    display: "standalone",
    background_color: "#f5f6f2",
    theme_color: "#f5f6f2",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
