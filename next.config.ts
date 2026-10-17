import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // トップは受信トレイへ。ページ内の redirect() だと Cache Components の事前検証がエラーになるため、設定側で転送する
  async redirects() {
    return [{ source: "/", destination: "/mail/inbox", permanent: false }];
  },
  // Node の net/tls を直接使うメール系ライブラリはバンドルせず、そのまま require させる
  serverExternalPackages: ["imapflow", "nodemailer", "mailparser"],
  partialPrefetching: true,
  experimental: {
    // 作成画面の添付(lib/mail/limits.ts の上限 18MB)を、サーバアクションで受け取れるようにする。
    // multipart の区切りの分の余裕を見て少し大きくし、proxy が本文を途中で切らないよう同じ値にそろえる
    serverActions: { bodySizeLimit: "20mb" },
    proxyClientMaxBodySize: "20mb",
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
