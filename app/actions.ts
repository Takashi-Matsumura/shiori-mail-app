"use server";

import { refresh } from "next/cache";
import { REAL_SETTING_KEYS, buildRealAccount, getActiveAccount, getRealAccount, getRealAccountFields, getRealPassword } from "@/lib/accounts";
import { USER_LABEL_MODEL } from "@/lib/ai/knn";
import { saveAiResult } from "@/lib/ai/ops";
import { CATEGORIES, PRIORITIES } from "@/lib/ai/prompts";
import { getDb, setSetting } from "@/lib/db";
import { deletePassword, isStorablePassword, keychainAvailable, writePassword } from "@/lib/keychain";
import { setSeenFlag, syncAccount, verifyImap, type MailboxSlug } from "@/lib/mail/imap";
import { sendMail, verifySmtp, type SendResult } from "@/lib/mail/smtp";

export type ActionState = { ok: boolean; message: string } | null;

function describeError(e: unknown, target: string, isLocal: boolean): string {
  const code = (e as { code?: string })?.code;
  if (code === "ECONNREFUSED" || code === "NoConnection" || code === "ESOCKET") {
    return isLocal
      ? `${target}に接続できません。「npm run mail:up」でテストサーバを起動してください。`
      : `${target}に接続できません。設定画面のホスト名とポート、ネットワークの状態を確認してください。`;
  }
  if (code === "EAUTH" || (e as { authenticationFailed?: boolean })?.authenticationFailed) {
    return `${target}の認証に失敗しました。ユーザ名とパスワードを確認してください。`;
  }
  if (code === "ENOTFOUND" || code === "EDNS") return `${target}のホスト名が見つかりません。綴りを確認してください。`;
  if (code === "ETIMEDOUT" || code === "ETIMEOUT" || code === "CONNECT_TIMEOUT" || code === "GREETING_TIMEOUT") {
    return `${target}から応答がありません。ポート番号(暗号化の方式)とネットワークの状態を確認してください。`;
  }
  if (code === "ETLS" || code === "EREQUIRETLS" || (e as { tlsFailed?: boolean })?.tlsFailed) {
    return `${target}と暗号化した接続を確立できなかったので、パスワードを送らずに止めました。ポート番号を確認してください。`;
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
    return { ok: false, message: describeError(e, "IMAP サーバ", account.isLocal) };
  }
}

export async function setSeenAction(mailbox: MailboxSlug, uid: number, seen: boolean): Promise<ActionState> {
  if ((mailbox !== "inbox" && mailbox !== "sent") || !Number.isInteger(uid)) return { ok: false, message: "不正な指定です" };
  const account = getActiveAccount();
  try {
    await setSeenFlag(account, mailbox, uid, seen);
    refresh();
    return { ok: true, message: seen ? "既読にしました" : "未読に戻しました" };
  } catch (e) {
    return { ok: false, message: describeError(e, "IMAP サーバ", account.isLocal) };
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
  if (account.readOnly) {
    return { ok: false, message: "読み取り専用モードなので送信しません。送るときは設定画面でモードを外してください。" };
  }
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
    return { ok: false, message: describeError(e, "SMTP サーバ", account.isLocal) };
  }
  // 自分宛のメールや送信済みの控えをすぐ一覧に出す
  await syncAccount(account).catch(() => {});
  refresh();
  return { ok: true, result, to: to.join(", ") };
}

export async function saveSettingsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const field = (name: string) => String(formData.get(name) ?? "").trim();
  const accountId = field("account");
  const real = parseRealAccountForm(formData);
  if (typeof real === "string") return { ok: false, message: real };
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
  if (real.password) {
    if (!keychainAvailable) return { ok: false, message: "パスワードの保存先(キーチェーン)は macOS でだけ使えます。" };
    try {
      writePassword(real.password);
    } catch {
      return { ok: false, message: "キーチェーンにパスワードを保存できませんでした。" };
    }
  } else if (real.forgetPassword) {
    deletePassword();
  }
  // 読み取り専用を外したら、アプリの中だけで付けていた既読・未読は捨て、次の同期でサーバの状態に戻す
  if (getRealAccountFields().readOnly && !real.fields.readOnly) {
    getDb().prepare("DELETE FROM local_seen WHERE message_id IN (SELECT id FROM messages WHERE account = 'real')").run();
  }
  for (const [key, settingKey] of Object.entries(REAL_SETTING_KEYS)) {
    setSetting(settingKey, String(real.fields[key as keyof typeof real.fields]));
  }
  if (accountId === "real" && !getRealAccount()) {
    setSetting("active_account", "local");
    return { ok: false, message: "実アカウントの設定は保存しましたが、アドレス・パスワード・IMAP / SMTP のホスト名がそろっていないので、テストサーバのままにしました。" };
  }
  setSetting("active_account", accountId === "real" ? "real" : "local");
  setSetting("ai_base_url", baseUrl);
  setSetting("ai_embed_base_url", embedBaseUrl);
  setSetting("ai_thinking", field("aiThinking") === "on" ? "on" : "off");
  setSetting("ai_classify_knn", field("aiClassifyKnn") === "on" ? "on" : "off");
  setSetting("ai_chat_model", field("aiChatModel"));
  setSetting("ai_embed_model", field("aiEmbedModel"));
  refresh();
  return { ok: true, message: "保存しました" };
}

/** 画面の入力値(保存前)で、IMAP と SMTP にログインできるかを確かめる。設定は保存しない。 */
export async function testRealAccountAction(formData: FormData): Promise<ActionState> {
  const real = parseRealAccountForm(formData);
  if (typeof real === "string") return { ok: false, message: real };
  // 入力が無ければ保存済みのものを使う。接続先を変えていれば parseRealAccountForm が入れ直しを求めている
  const account = buildRealAccount(real.fields, real.password || (real.forgetPassword ? "" : (getRealPassword() ?? "")));
  if (!account) return { ok: false, message: "アドレス・パスワード・IMAP / SMTP のホスト名を入れてから確かめてください。" };
  const check = (target: string, run: Promise<void>) =>
    run.then(
      () => ({ ok: true, line: `${target}: ログインできました` }),
      (e: unknown) => ({ ok: false, line: describeError(e, target, false) }),
    );
  const results = await Promise.all([check("IMAP サーバ", verifyImap(account)), check("SMTP サーバ", verifySmtp(account))]);
  return { ok: results.every((r) => r.ok), message: results.map((r) => r.line).join("\n") };
}

const HOST_PATTERN = /^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)*$/;

/** 設定画面の実アカウント欄を読み、確かめる。おかしければ利用者向けの文面を返す。 */
function parseRealAccountForm(formData: FormData) {
  const field = (name: string) => String(formData.get(name) ?? "").trim();
  const port = (name: string, fallback: number) => {
    const v = field(name);
    return v === "" ? fallback : /^\d{1,5}$/.test(v) && Number(v) >= 1 && Number(v) <= 65535 ? Number(v) : NaN;
  };
  const fields = {
    email: field("realEmail"),
    name: field("realName"),
    user: field("realUser"),
    imapHost: field("realImapHost").toLowerCase(),
    imapPort: port("realImapPort", 993),
    smtpHost: field("realSmtpHost").toLowerCase(),
    smtpPort: port("realSmtpPort", 465),
    sentMailbox: field("realSentMailbox"),
    appendSent: field("realAppendSent") === "on",
    readOnly: field("realReadOnly") === "on",
  };
  // パスワードは前後の空白も含めてそのまま使う
  const password = String(formData.get("realPassword") ?? "");
  const forgetPassword = field("realForgetPassword") === "on";

  if (fields.email && !/^[^\s@]+@[^\s@]+$/.test(fields.email)) return "メールアドレスの形が正しくありません。";
  for (const host of [fields.imapHost, fields.smtpHost]) {
    if (host && (host.length > 253 || !HOST_PATTERN.test(host))) return "ホスト名は imap.example.com のような形で入力してください(http:// などは不要です)。";
  }
  if (Number.isNaN(fields.imapPort) || Number.isNaN(fields.smtpPort)) return "ポートは 1〜65535 の数字で入力してください。";
  if (password && !isStorablePassword(password)) return "パスワードには半角の英数字・記号だけが使えます(日本語や改行は使えません)。";
  if (/[\r\n]/.test(fields.name + fields.sentMailbox)) return "改行を含む値は使えません。";

  // 保存済みのパスワードを、知らないうちに別のサーバや別のログイン名へ送らないようにする
  const saved = getRealAccountFields();
  const login = (f: { email: string; user: string }) => f.user || f.email;
  const destinationChanged =
    fields.imapHost !== saved.imapHost.toLowerCase() ||
    fields.imapPort !== saved.imapPort ||
    fields.smtpHost !== saved.smtpHost.toLowerCase() ||
    fields.smtpPort !== saved.smtpPort ||
    login(fields) !== login(saved);
  if (!password && !forgetPassword && destinationChanged && getRealPassword()) {
    return "接続先かログイン名を変えたときは、パスワードも入れ直してください。";
  }
  return { fields, password, forgetPassword };
}

/** 仕分けを確定する(直した場合も、AI の判定をそのまま認めた場合も)。以後の AI の処理では上書きしない。 */
export async function labelClassificationAction(messageId: number, category: string, priority: string): Promise<ActionState> {
  if (!Number.isInteger(messageId)) return { ok: false, message: "不正な指定です" };
  if (!(CATEGORIES as readonly string[]).includes(category) || !(PRIORITIES as readonly string[]).includes(priority)) {
    return { ok: false, message: "カテゴリか優先度の値が正しくありません。" };
  }
  const db = getDb();
  // ほかのアカウントのメールは触らない
  const owned = db.prepare("SELECT 1 FROM messages WHERE id = ? AND account = ?").get(messageId, getActiveAccount().id);
  if (!owned) return { ok: false, message: "メールが見つかりません。" };
  const ai = db.prepare("SELECT model, result FROM ai_results WHERE message_id = ? AND kind = 'classify'").get(messageId) as
    | { model: string; result: string }
    | undefined;
  const existing = db.prepare("SELECT 1 FROM classify_labels WHERE message_id = ?").get(messageId);
  // 確定し直すときは、最初に確定したときの AI の判定を残す(2 回目以降は「あなた」の結果しか残っていないため)
  if (!existing) {
    let aiValue: { category?: string; priority?: string } = {};
    try {
      if (ai && ai.model !== USER_LABEL_MODEL) aiValue = JSON.parse(ai.result);
    } catch {}
    db.prepare(
      "INSERT INTO classify_labels (message_id, category, priority, ai_model, ai_category, ai_priority, created) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(messageId, category, priority, ai && ai.model !== USER_LABEL_MODEL ? ai.model : null, aiValue.category ?? null, aiValue.priority ?? null, Date.now());
  } else {
    db.prepare("UPDATE classify_labels SET category = ?, priority = ? WHERE message_id = ?").run(category, priority, messageId);
  }
  saveAiResult(messageId, "classify", USER_LABEL_MODEL, JSON.stringify({ category, priority, reason: "あなたが確定" }), 0, {
    promptTokens: null,
    completionTokens: null,
  });
  refresh();
  return { ok: true, message: "確定しました" };
}

/** 確定を外し、まだ仕分けていない状態に戻す(次の自動処理か「実行する」で、改めて AI が仕分ける)。 */
export async function clearClassificationLabelAction(messageId: number): Promise<ActionState> {
  if (!Number.isInteger(messageId)) return { ok: false, message: "不正な指定です" };
  const db = getDb();
  const owned = db
    .prepare("SELECT 1 FROM classify_labels l JOIN messages m ON m.id = l.message_id WHERE l.message_id = ? AND m.account = ?")
    .get(messageId, getActiveAccount().id);
  if (!owned) return { ok: false, message: "確定した仕分けが見つかりません。" };
  db.prepare("DELETE FROM classify_labels WHERE message_id = ?").run(messageId);
  db.prepare("DELETE FROM ai_results WHERE message_id = ? AND kind = 'classify'").run(messageId);
  refresh();
  return { ok: true, message: "確定を外しました" };
}

export async function clearLogAction(): Promise<void> {
  getDb().exec("DELETE FROM protocol_log");
  refresh();
}
