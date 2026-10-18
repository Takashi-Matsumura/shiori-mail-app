import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getSetting, setSetting } from "@/lib/db";

/**
 * メールのリンクを確認ページ(/link)へ渡すときの署名。確認ページはログインなしで開けて、差出人と「迷惑」の判定を URL で受け取る。
 * 署名が無いと、第三者が「警告の出ない確認ページ」へのリンクを作ってメールで送れてしまう。
 * 行き先(u)と表示の文字(t)はもともとメールの送り手が決めるものなので、署名するのはアプリが判断した差出人と迷惑の判定だけ。
 */
const KEY = "link_secret";

function secret(): Buffer {
  let value = getSetting(KEY);
  if (!value) {
    value = randomBytes(32).toString("base64url");
    setSetting(KEY, value);
  }
  return Buffer.from(value, "base64url");
}

export function linkSignature(sender: string, spam: boolean): string {
  return createHmac("sha256", secret()).update(`${sender}\n${spam ? 1 : 0}`).digest("base64url").slice(0, 22);
}

export function isValidLinkSignature(sender: string, spam: boolean, signature: string): boolean {
  const expected = Buffer.from(linkSignature(sender, spam));
  const given = Buffer.from(signature);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
