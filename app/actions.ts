"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { REAL_SETTING_KEYS, SIGNATURE_KEY, buildRealAccount, getAccount, getRealAccountFields, getRealPassword } from "@/lib/accounts";
import { USER_LABEL_MODEL } from "@/lib/ai/knn";
import { saveAiResult } from "@/lib/ai/ops";
import { CATEGORIES, PRIORITIES } from "@/lib/ai/prompts";
import { requireSession } from "@/lib/auth/session";
import { getDb, setSetting } from "@/lib/db";
import { deleteDraft, saveDraft } from "@/lib/drafts";
import { findHandledUids, getMessageById } from "@/lib/queries";
import { deletePassword, isStorablePassword, keychainAvailable, writePassword } from "@/lib/keychain";
import { TrashError, importOlder, moveToTrash, setSeenFlag, syncAccount, verifyImap, type MailboxSlug } from "@/lib/mail/imap";
import { ATTACH_MAX_FILES, ATTACH_MAX_TOTAL } from "@/lib/mail/limits";
import { extractAttachments, type AttachmentContent } from "@/lib/mail/parse";
import { sendMail, verifySmtp, type SendResult } from "@/lib/mail/smtp";

/** section は、入力の誤りがどの欄のものか(設定画面で、その欄を開いて見せるため) */
export type ActionState = { ok: boolean; message: string; section?: "account" | "ai" } | null;

const NO_ACCOUNT = "メールアカウントが未設定です。設定画面で登録してください。";

function describeError(e: unknown, target: string): string {
  const code = (e as { code?: string })?.code;
  if (code === "ECONNREFUSED" || code === "NoConnection" || code === "ESOCKET") {
    return `${target}に接続できません。設定画面のホスト名とポート、ネットワークの状態を確認してください。`;
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
  return `${target}との通信でエラーが発生しました。開発サーバのログを確認してください。`;
}

export async function syncAction(): Promise<ActionState> {
  await requireSession();
  const account = getAccount();
  if (!account) return { ok: false, message: NO_ACCOUNT };
  try {
    const count = await syncAccount(account);
    refresh();
    return { ok: true, message: count > 0 ? `${count} 通を取り込みました` : "新着はありません" };
  } catch (e) {
    return { ok: false, message: describeError(e, "IMAP サーバ") };
  }
}

/** 手元の最も古いメールより前のメールを、もう少し取り込む(一覧の下の「古いメールを取り込む」) */
export async function importOlderAction(mailbox: MailboxSlug): Promise<ActionState> {
  await requireSession();
  if (mailbox !== "inbox" && mailbox !== "sent") return { ok: false, message: "不正な指定です" };
  const account = getAccount();
  if (!account) return { ok: false, message: NO_ACCOUNT };
  try {
    const { imported, remaining } = await importOlder(account, mailbox);
    refresh();
    if (imported === 0) return { ok: true, message: "取り込める古いメールはありませんでした" };
    return { ok: true, message: `${imported} 通を取り込みました${remaining > 0 ? `(サーバにはまだ ${remaining} 通あります)` : ""}` };
  } catch (e) {
    return { ok: false, message: describeError(e, "IMAP サーバ") };
  }
}

export async function setSeenAction(mailbox: MailboxSlug, uid: number, seen: boolean): Promise<ActionState> {
  await requireSession();
  if ((mailbox !== "inbox" && mailbox !== "sent") || !Number.isInteger(uid)) return { ok: false, message: "不正な指定です" };
  const account = getAccount();
  if (!account) return { ok: false, message: NO_ACCOUNT };
  try {
    await setSeenFlag(account, mailbox, uid, seen);
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
  await requireSession();
  const field = (name: string) => String(formData.get(name) ?? "");
  const to = parseAddressList(field("to"));
  const cc = parseAddressList(field("cc"));
  const bcc = parseAddressList(field("bcc"));
  const subject = field("subject").trim();
  // 引用(返信)と転送するメールは本文欄の外にあるので、ここで本文の末尾へ付ける
  const quote = field("quote").replace(/\r\n?/g, "\n");
  const body = field("body").replace(/\s+$/, "");
  const text = [body.trim() ? body : "", quote].filter(Boolean).join("\n\n");
  if (!to || to.length === 0) return { ok: false, message: "宛先のメールアドレスを確認してください(複数ならカンマ区切り)。" };
  if (!cc) return { ok: false, message: "Cc のメールアドレスを確認してください。" };
  if (!bcc) return { ok: false, message: "Bcc のメールアドレスを確認してください。" };
  if (!subject || /[\r\n]/.test(subject)) return { ok: false, message: "件名を入力してください。" };
  if (!text.trim()) return { ok: false, message: "本文を入力してください。" };

  const account = getAccount();
  if (!account) return { ok: false, message: NO_ACCOUNT };
  if (account.readOnly) {
    return { ok: false, message: "読み取り専用モードなので送信しません。送るときは設定画面でモードを外してください。" };
  }
  // 送ると本当に相手へ届く。画面の確認チェックをサーバ側でも必須にする。
  if (field("confirmSend") !== "yes") {
    return { ok: false, message: "送信するには、確認のチェックを入れてください。" };
  }

  let references: string[] = [];
  try {
    const parsed: unknown = JSON.parse(field("references") || "[]");
    if (Array.isArray(parsed)) references = parsed.filter((r): r is string => typeof r === "string" && !/[\r\n]/.test(r));
  } catch {}
  const inReplyTo = field("inReplyTo");

  // 転送: 画面から受け取るのはメールの番号と添付の番号だけ。中身は、このアカウントのメールからサーバが取り出す
  let attachments: AttachmentContent[] = [];
  const forwardOf = field("forwardOf");
  if (forwardOf) {
    const original = /^\d+$/.test(forwardOf) ? await getMessageById(account.id, Number(forwardOf)) : null;
    if (!original) return { ok: false, message: "転送するメールが見つかりません。一覧から開き直してください。" };
    const chosen = new Set(formData.getAll("forwardAttachment").map(String).filter((v) => /^\d+$/.test(v)).map(Number));
    if (chosen.size > 0) {
      attachments = (await extractAttachments(Buffer.from(original.raw))).filter((_, i) => chosen.has(i));
    }
  }

  // 自分で付けたファイル。転送の添付と合わせて、上限を超えていたら送らない
  const uploads = formData.getAll("attachment").filter((v): v is File => v instanceof File && v.size > 0);
  if (uploads.length + attachments.length > ATTACH_MAX_FILES) {
    return { ok: false, message: `添付できるのは ${ATTACH_MAX_FILES} 個までです。` };
  }
  const total = uploads.reduce((sum, f) => sum + f.size, 0) + attachments.reduce((sum, a) => sum + a.content.length, 0);
  if (total > ATTACH_MAX_TOTAL) {
    return { ok: false, message: `添付の合計が大きすぎます(${Math.ceil(ATTACH_MAX_TOTAL / 1024 / 1024)}MB まで)。` };
  }
  for (const f of uploads) {
    attachments.push({
      // ファイル名はヘッダに入るので、改行と、パスの区切りに見える文字を落とす
      filename: f.name.replace(/[\r\n\\/]/g, "_").slice(0, 200) || "file",
      contentType: f.type || "application/octet-stream",
      content: Buffer.from(await f.arrayBuffer()),
    });
  }

  let result: SendResult;
  try {
    result = await sendMail(account, {
      to: to.join(", "),
      cc: cc.join(", "),
      bcc: bcc.join(", "),
      subject,
      text,
      inReplyTo: inReplyTo && !/[\r\n]/.test(inReplyTo) ? inReplyTo : undefined,
      references,
      attachments,
    });
  } catch (e) {
    return { ok: false, message: describeError(e, "SMTP サーバ") };
  }
  // 送れたら書きかけは要らない
  deleteDraft(field("draftKind"));
  // 自分宛のメールや送信済みの控えをすぐ一覧に出す
  await syncAccount(account).catch(() => {});
  refresh();
  return { ok: true, result, to: to.join(", ") };
}

export async function saveSettingsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSession();
  const field = (name: string) => String(formData.get(name) ?? "").trim();
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
    if (!valid) return { ok: false, section: "ai", message: "AI のベース URL は http:// か https:// で始まる URL にしてください。" };
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
  setSetting("ai_base_url", baseUrl);
  setSetting("ai_embed_base_url", embedBaseUrl);
  setSetting("ai_thinking", field("aiThinking") === "on" ? "on" : "off");
  setSetting("ai_classify_knn", field("aiClassifyKnn") === "on" ? "on" : "off");
  setSetting("ai_chat_model", field("aiChatModel"));
  setSetting("ai_embed_model", field("aiEmbedModel"));
  // 署名は行頭の空白や途中の空行も意味があるので、末尾の空白・改行だけを落とす
  setSetting(SIGNATURE_KEY, String(formData.get("signature") ?? "").replace(/\r\n?/g, "\n").replace(/\s+$/, "").slice(0, 2000));
  refresh();
  if (!getAccount()) {
    return { ok: true, message: "保存しました。メールを使うには、アドレス・パスワード・IMAP / SMTP のサーバをすべて入力してください。" };
  }
  return { ok: true, message: "保存しました" };
}

/** 画面の入力値(保存前)で、IMAP と SMTP にログインできるかを確かめる。設定は保存しない。 */
export async function testRealAccountAction(formData: FormData): Promise<ActionState> {
  await requireSession();
  const real = parseRealAccountForm(formData);
  if (typeof real === "string") return { ok: false, message: real };
  // 入力が無ければ保存済みのものを使う。接続先を変えていれば parseRealAccountForm が入れ直しを求めている
  const account = buildRealAccount(real.fields, real.password || (real.forgetPassword ? "" : (getRealPassword() ?? "")));
  if (!account) return { ok: false, message: "アドレス・パスワード・IMAP / SMTP のホスト名を入れてから確かめてください。" };
  const check = (target: string, run: Promise<void>) =>
    run.then(
      () => ({ ok: true, line: `${target}: ログインできました` }),
      (e: unknown) => ({ ok: false, line: describeError(e, target) }),
    );
  const results = await Promise.all([check("IMAP サーバ", verifyImap(account)), check("SMTP サーバ", verifySmtp(account))]);
  return { ok: results.every((r) => r.ok), message: results.map((r) => r.line).join("\n") };
}

const HOST_PATTERN = /^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)*$/;

/** 設定画面のメールアカウント欄を読み、確かめる。おかしければ利用者向けの文面を返す。 */
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
    return "接続先かログイン名を変えたときは、パスワードも入れ直してください(入れ直すまで、設定は保存されません)。";
  }
  return { fields, password, forgetPassword };
}

/** 仕分けを確定する(直した場合も、AI の判定をそのまま認めた場合も)。以後の AI の処理では上書きしない。 */
export async function labelClassificationAction(messageId: number, category: string, priority: string): Promise<ActionState> {
  await requireSession();
  if (!Number.isInteger(messageId)) return { ok: false, message: "不正な指定です" };
  if (!(CATEGORIES as readonly string[]).includes(category) || !(PRIORITIES as readonly string[]).includes(priority)) {
    return { ok: false, message: "カテゴリか優先度の値が正しくありません。" };
  }
  const db = getDb();
  // ほかのアカウントのメールは触らない
  const account = getAccount();
  if (!account) return { ok: false, message: NO_ACCOUNT };
  const owned = db.prepare("SELECT 1 FROM messages WHERE id = ? AND account = ?").get(messageId, account.id);
  if (!owned) return { ok: false, message: "メールが見つかりません。" };
  confirmLabel(messageId, category, priority);
  refresh();
  return { ok: true, message: "確定しました" };
}

/**
 * 仕分けを「あなたが確定した」ものとして記録する(近傍法の手本で重く数え、AI に上書きさせない)。
 * 呼ぶ側で、メールがこのアカウントのものか、値が正しいかを確かめておく。
 */
function confirmLabel(messageId: number, category: string, priority: string): void {
  const db = getDb();
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
}

/** 確定を外し、まだ仕分けていない状態に戻す(次の自動処理か「実行する」で、改めて AI が仕分ける)。 */
export async function clearClassificationLabelAction(messageId: number): Promise<ActionState> {
  await requireSession();
  if (!Number.isInteger(messageId)) return { ok: false, message: "不正な指定です" };
  const db = getDb();
  const owned = db
    .prepare("SELECT 1 FROM classify_labels l JOIN messages m ON m.id = l.message_id WHERE l.message_id = ? AND m.account = ?")
    .get(messageId, getAccount()?.id ?? "");
  if (!owned) return { ok: false, message: "確定した仕分けが見つかりません。" };
  db.prepare("DELETE FROM classify_labels WHERE message_id = ?").run(messageId);
  db.prepare("DELETE FROM ai_results WHERE message_id = ? AND kind = 'classify'").run(messageId);
  refresh();
  return { ok: true, message: "確定を外しました" };
}

/**
 * メールを「完了」にする/外す。サーバ(IMAP)には送らず、アプリの中だけで記録する。
 * 外すときは、このメールを完了扱いにしている記録(同じスレッドでこれ以降のメールのもの)をまとめて消す。
 */
export async function setDoneAction(messageId: number, done: boolean): Promise<ActionState> {
  await requireSession();
  if (!Number.isInteger(messageId)) return { ok: false, message: "不正な指定です" };
  const account = getAccount();
  if (!account) return { ok: false, message: NO_ACCOUNT };
  const db = getDb();
  // ほかのアカウントのメールは触らない
  const message = db.prepare("SELECT id, thread_key, date FROM messages WHERE id = ? AND account = ?").get(messageId, account.id) as
    | { id: number; thread_key: string | null; date: number }
    | undefined;
  if (!message) return { ok: false, message: "メールが見つかりません。" };
  // 完了にしたら、そのときの仕分けも確定する。メールを開いて仕分けを見たうえで対応したので、仕分けにも異議はないとみなす
  // (まだ確定していないメールだけ。完了を外しても、確定は残す)
  let confirmed: { category: string; priority: string } | null = null;
  if (done) {
    db.prepare("INSERT OR IGNORE INTO message_done (message_id, created) VALUES (?, ?)").run(messageId, Date.now());
    const labeled = db.prepare("SELECT 1 FROM classify_labels WHERE message_id = ?").get(messageId);
    const row = db.prepare("SELECT result FROM ai_results WHERE message_id = ? AND kind = 'classify'").get(messageId) as
      | { result: string }
      | undefined;
    let value: { category?: unknown; priority?: unknown } = {};
    try {
      value = row ? JSON.parse(row.result) : {};
    } catch {}
    if (
      !labeled &&
      typeof value.category === "string" &&
      typeof value.priority === "string" &&
      (CATEGORIES as readonly string[]).includes(value.category) &&
      (PRIORITIES as readonly string[]).includes(value.priority)
    ) {
      confirmLabel(messageId, value.category, value.priority);
      confirmed = { category: value.category, priority: value.priority };
    }
  } else {
    db.prepare(
      `DELETE FROM message_done WHERE message_id = ? OR message_id IN (
         SELECT id FROM messages WHERE ? IS NOT NULL AND account = ? AND thread_key = ? AND date >= ?)`,
    ).run(messageId, message.thread_key, account.id, message.thread_key, message.date);
  }
  refresh();
  if (confirmed) {
    return {
      ok: true,
      message: `完了にしました。仕分け「${confirmed.category}・優先度 ${confirmed.priority}」も確定しました(違っていれば「アシスト」で直せます)`,
    };
  }
  return { ok: true, message: done ? "完了にしました" : "完了を外しました" };
}

/** 一度にゴミ箱へ移せる通数。押し間違いで受信トレイが丸ごと消えないよう、上限を置く */
const TRASH_LIMIT = 500;

/**
 * 受信トレイのメールをまとめてサーバのゴミ箱へ移す。uids は一覧に表示していたメール。
 * 手元に控えのあるメールだけを対象にし、画面で見ていない UID は受け付けない。
 * 返信済み・完了にしたメールは、表示されていても移さない(画面の内訳と同じ決まりを、サーバでも守る)。
 */
export async function trashMessagesAction(uids: number[]): Promise<ActionState> {
  return trashUids(uids, { excludeHandled: true });
}

async function trashUids(uids: number[], { excludeHandled }: { excludeHandled: boolean }): Promise<ActionState> {
  await requireSession();
  if (!Array.isArray(uids) || uids.length === 0 || !uids.every((u) => Number.isInteger(u) && u > 0)) {
    return { ok: false, message: "不正な指定です" };
  }
  const unique = [...new Set(uids)];
  if (unique.length > TRASH_LIMIT) return { ok: false, message: `一度に移せるのは ${TRASH_LIMIT} 通までです。` };
  const account = getAccount();
  if (!account) return { ok: false, message: NO_ACCOUNT };
  if (account.readOnly) {
    return { ok: false, message: "読み取り専用モードなので削除しません。削除するときは設定画面でモードを外してください。" };
  }
  const exists = getDb().prepare("SELECT 1 FROM messages WHERE account = ? AND mailbox = 'inbox' AND uid = ?");
  if (!unique.every((uid) => exists.get(account.id, uid))) {
    return { ok: false, message: "一覧が古くなっています。再読み込みしてから、もう一度選んでください。" };
  }
  const handled = excludeHandled ? findHandledUids(account.id, "inbox", unique) : new Set<number>();
  const targets = unique.filter((uid) => !handled.has(uid));
  const skipped = handled.size > 0 ? `(返信済み・完了の ${handled.size} 通は移していません)` : "";
  if (targets.length === 0) return { ok: false, message: `移すメールがありません${skipped}` };
  try {
    await moveToTrash(account, "inbox", targets);
  } catch (e) {
    return { ok: false, message: e instanceof TrashError ? e.message : describeError(e, "IMAP サーバ") };
  }
  refresh();
  return { ok: true, message: `${targets.length} 通をゴミ箱へ移しました${skipped}` };
}

/**
 * 開いているメールを 1 通だけゴミ箱へ移し、メールを選んでいない受信トレイへ移る。
 * 移したメールの画面を描き直すと「見つからない」になるので、画面の移動もサーバ側でまとめて行う。
 */
export async function trashOneAction(uid: number): Promise<ActionState> {
  // 開いて選んだ 1 通なので、返信済み・完了でも移す
  const result = await trashUids([uid], { excludeHandled: false });
  if (result?.ok) redirect("/mail/inbox");
  return result;
}

/** 作成画面の書きかけを保存する(画面から、手が止まるたびに呼ばれる)。サーバに置くので、ロック中やログアウト後は読めない */
export async function saveDraftAction(kind: string, fields: unknown): Promise<boolean> {
  await requireSession();
  return saveDraft(kind, fields);
}

export async function discardDraftAction(kind: string): Promise<void> {
  await requireSession();
  deleteDraft(kind);
  // 下書きの一覧と、左のパネルの件数を描き直す
  refresh();
}
