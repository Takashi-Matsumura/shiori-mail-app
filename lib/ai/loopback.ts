// 設定画面(ブラウザ)とサーバの両方で使うので、server-only を付けない。

/** 接続先がこのマシン自身かどうか。そうでなければメール本文がマシンの外へ出る。 */
export function isLoopbackUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^\[|\]$/g, "");
    // 127. で始まるだけの名前(127.example.com など)を通さないよう、IPv4 の形まで確かめる
    return host === "localhost" || host === "::1" || /^127(\.\d{1,3}){3}$/.test(host);
  } catch {
    return false;
  }
}

/**
 * 入力した AI の URL が、いま使っている URL から「このマシンの外」へ新しく切り替えるものか。
 * そのときだけ、メールの本文が外へ送られることへの同意を求める(使い続けている外部の URL は聞き直さない)。
 * 空欄は「既定のまま」なので対象にしない。末尾の / は保存のときに落とすので比べない。
 */
export function isNewExternalUrl(input: string, current: string): boolean {
  const url = input.trim();
  return url !== "" && URL.canParse(url) && !isLoopbackUrl(url) && url.replace(/\/+$/, "") !== current;
}
