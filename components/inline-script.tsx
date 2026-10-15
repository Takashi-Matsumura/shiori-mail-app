"use client";

/**
 * 最初の描画の前に実行したいインラインスクリプト。
 * ブラウザ側で React が <script> を描くと開発時に警告が出るので、ブラウザでは実行しない type にする(実行はサーバの HTML の時点で済んでいる)。
 * 食い違う type は suppressHydrationWarning で受け流す(node_modules/next/dist/docs の preventing-flash-before-hydration を参照)。
 */
export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
