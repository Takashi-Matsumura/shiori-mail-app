"use server";

import { refresh } from "next/cache";
import { getActiveAccount, getRealAccount } from "@/lib/accounts";
import { getDb, setSetting } from "@/lib/db";
import { setSeenFlag, syncAccount, type MailboxSlug } from "@/lib/mail/imap";
import { sendMail, type SendResult } from "@/lib/mail/smtp";

export type ActionState = { ok: boolean; message: string } | null;

function describeError(e: unknown, target: string): string {
  const code = (e as { code?: string })?.code;
  if (code === "ECONNREFUSED" || code === "NoConnection" || code === "ESOCKET") {
    return `${target}に接続できません。テストサーバなら「npm run mail:up」で起動してください。`;
  }
  if (code === "EAUTH" || (e as { authenticationFailed?: boolean })?.authenticationFailed) {
    return `${target}の認証に失敗しました。ユーザ名とパスワードを確認してください。`;
  }
  console.error(e);
  return `${target}との通信でエラーが発生しました。通信ログを確認してください。`;
}

export async function syncAction(): Promise<ActionState> {
  const account = getActiveAccount();
  try {
    const count = await syncAccount(account);
    refresh();
    return { ok: true, message: count > 0 ? `${count} 通を取り込みました` : "新着はありません" };
  } catch (e) {
    return { ok: false, message: describeError(e, "IMAP サーバ") };
  }
}

export async function setSeenAction(mailbox: MailboxSlug, uid: number, seen: boolean): Promise<ActionState> {
  if ((mailbox !== "inbox" && mailbox !== "sent") || !Number.isInteger(uid)) return { ok: false, message: "不正な指定です" };
  try {
    await setSeenFlag(getActiveAccount(), mailbox, uid, seen);
    refresh();
    return { ok: true, message: seen ? "既読にしました" : "未読に戻しました" };
  } catch (e) {
    return { ok: false, message: describeError(e, "IMAP サーバ") };
  }
}

export type SendState = { ok: true; result: SendResult; to: string } | { ok: false; message: string } | null;

const ADDRESS = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/;

function parseAddressList(value: string): string[] | null {
  const list = value.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  return list.every((a) => ADDRESS.test(a)) ? list : null;
}

export async function sendAction(_prev: SendState, formData: FormData): Promise<SendState> {
  const field = (name: string) => String(formData.get(name) ?? "");
  const to = parseAddressList(field("to"));
  const cc = parseAddressList(field("cc"));
  const subject = field("subject").trim();
  const text = field("body");
  if (!to || to.length === 0) return { ok: false, message: "宛先のメールアドレスを確認してください(複数ならカンマ区切り)。" };
  if (!cc) return { ok: false, message: "Cc のメールアドレスを確認してください。" };
  if (!subject || /[\r\n]/.test(subject)) return { ok: false, message: "件名を入力してください。" };
  if (!text.trim()) return { ok: false, message: "本文を入力してください。" };

  const account = getActiveAccount();
  // 実アカウントからは本当に相手へ届く。画面の確認チェックをサーバ側でも必須にする。
  if (!account.isLocal && field("confirmReal") !== "yes") {
    return { ok: false, message: "実アカウントから送信するには、確認のチェックを入れてください。" };
  }

  let references: string[] = [];
  try {
    const parsed: unknown = JSON.parse(field("references") || "[]");
    if (Array.isArray(parsed)) references = parsed.filter((r): r is string => typeof r === "string" && !/[\r\n]/.test(r));
  } catch {}
  const inReplyTo = field("inReplyTo");

  let result: SendResult;
  try {
    result = await sendMail(account, {
      to: to.join(", "),
      cc: cc.join(", "),
      subject,
      text,
      inReplyTo: inReplyTo && !/[\r\n]/.test(inReplyTo) ? inReplyTo : undefined,
      references,
    });
  } catch (e) {
    return { ok: false, message: describeError(e, "SMTP サーバ") };
  }
  // 自分宛のメールや送信済みの控えをすぐ一覧に出す
  await syncAccount(account).catch(() => {});
  refresh();
  return { ok: true, result, to: to.join(", ") };
}

export async function saveSettingsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const field = (name: string) => String(formData.get(name) ?? "").trim();
  const accountId = field("account");
  if (accountId === "real" && !getRealAccount()) {
    return { ok: false, message: "実アカウントは .env.local に設定してから選んでください。" };
  }
  const baseUrl = field("aiBaseUrl");
  const embedBaseUrl = field("aiEmbedBaseUrl");
  for (const url of [baseUrl, embedBaseUrl]) {
    if (!url) continue;
    let valid = false;
    try {
      const u = new URL(url);
      // URL に埋め込んだ認証情報(user:pass@)は保存も送信もしない
      valid = ["http:", "https:"].includes(u.protocol) && !u.username && !u.password;
    } catch {}
    if (!valid) return { ok: false, message: "AI のベース URL は http:// か https:// で始まる URL にしてください。" };
  }
  setSetting("active_account", accountId === "real" ? "real" : "local");
  setSetting("ai_base_url", baseUrl);
  setSetting("ai_embed_base_url", embedBaseUrl);
  setSetting("ai_thinking", field("aiThinking") === "on" ? "on" : "off");
  setSetting("ai_chat_model", field("aiChatModel"));
  setSetting("ai_embed_model", field("aiEmbedModel"));
  refresh();
  return { ok: true, message: "保存しました" };
}

export async function clearLogAction(): Promise<void> {
  getDb().exec("DELETE FROM protocol_log");
  refresh();
}
