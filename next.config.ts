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
