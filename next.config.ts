import type { NextConfig } from "next";

// すべての応答に付けるセキュリティヘッダ。
// 枠への埋め込みは同じオリジンだけ許す(添付の PDF を iframe で開くため 'none' にはしない)。
// HSTS は HTTPS で届いたときだけブラウザが受け取る(http://localhost では無視される)。
// 同じドメインの他のサイトに効かないよう includeSubDomains は付けない
const FRAME_AND_HSTS = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Strict-Transport-Security", value: "max-age=15552000" },
];
const SECURITY_HEADERS = [
  ...FRAME_AND_HSTS,
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'; base-uri 'self'; form-action 'self'; object-src 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  poweredByHeader: false,
  async headers() {
    return [
      // ここのヘッダは、ルートが自分で付けた同じ名前のヘッダを上書きする。
      // 添付は sandbox 付きの CSP などを自分で付けているので、それと重ならないものだけにする
      { source: "/:path((?!api/attachments/).*)", headers: SECURITY_HEADERS },
      { source: "/api/attachments/:path*", headers: FRAME_AND_HSTS },
    ];
  },
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
