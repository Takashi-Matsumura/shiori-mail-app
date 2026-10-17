// 添付ファイルのうち、ブラウザの新しいタブでそのまま開いてよい種類。画面(「開く」を出すか)とサーバ(返し方)の両方で使う。
// HTML・SVG・XML などは、このアプリと同じオリジンで開くとスクリプトが動きうるので、ここに入れない(保存だけにする)。
export const PREVIEWABLE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
]);

export const isPreviewable = (contentType: string) => PREVIEWABLE_TYPES.has(contentType.toLowerCase().split(";")[0].trim());
