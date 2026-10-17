/**
 * デモ用のデータで動かしているか(npm run demo:dev)。README のスクリーンショットを撮るためのもの。
 * このときは data-demo/ の架空のメールを使い、メールサーバには接続せず、キーチェーンのパスワードも読まない。
 */
export const DEMO = process.env.MAILER_DEMO === "1";

export const DEMO_MESSAGE = "デモ用のデータで動かしているので、メールサーバには接続しません";
