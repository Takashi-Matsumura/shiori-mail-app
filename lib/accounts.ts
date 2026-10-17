import "server-only";
import { redirect } from "next/navigation";
import { getSetting } from "@/lib/db";
import { DEMO } from "@/lib/demo";
import { readPassword } from "@/lib/keychain";

/** DB 上の識別子。以前はテストサーバ("local")と区別していた名残で "real" のまま */
export type AccountId = "real";

export type Account = {
  id: AccountId;
  label: string;
  name: string;
  email: string;
  user: string;
  pass: string;
  imap: { host: string; port: number; secure: boolean };
  smtp: { host: string; port: number; secure: boolean };
  /** 送信済みフォルダ名。未指定なら IMAP の \Sent 属性から探す */
  sentMailbox?: string;
  /** 送信後に控えを送信済みフォルダへ IMAP APPEND するか(Gmail はサーバが自動保存するので false) */
  appendSent: boolean;
  /** サーバのメールボックスに一切書き込まない(既読フラグ・送信済みへの控え・送信を止める) */
  readOnly: boolean;
};

/** アカウントの、パスワード以外の設定。画面で入力したもの(DB)を優先し、無ければ .env.local の REAL_* を使う。 */
export type RealAccountFields = {
  email: string;
  name: string;
  /** ログイン名。空ならアドレスを使う */
  user: string;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  sentMailbox: string;
  appendSent: boolean;
  readOnly: boolean;
};

export const REAL_SETTING_KEYS = {
  email: "real_email",
  name: "real_name",
  user: "real_user",
  imapHost: "real_imap_host",
  imapPort: "real_imap_port",
  smtpHost: "real_smtp_host",
  smtpPort: "real_smtp_port",
  sentMailbox: "real_sent_mailbox",
  appendSent: "real_append_sent",
  readOnly: "real_read_only",
} as const;

export function getRealAccountFields(): RealAccountFields {
  const env = process.env;
  const pick = (key: string, envValue: string | undefined) => getSetting(key) ?? envValue ?? "";
  return {
    email: pick(REAL_SETTING_KEYS.email, env.REAL_MAIL_ADDRESS),
    name: pick(REAL_SETTING_KEYS.name, env.REAL_MAIL_NAME),
    user: pick(REAL_SETTING_KEYS.user, env.REAL_MAIL_USER),
    imapHost: pick(REAL_SETTING_KEYS.imapHost, env.REAL_IMAP_HOST),
    imapPort: Number(pick(REAL_SETTING_KEYS.imapPort, env.REAL_IMAP_PORT) || 993),
    smtpHost: pick(REAL_SETTING_KEYS.smtpHost, env.REAL_SMTP_HOST),
    smtpPort: Number(pick(REAL_SETTING_KEYS.smtpPort, env.REAL_SMTP_PORT) || 465),
    sentMailbox: pick(REAL_SETTING_KEYS.sentMailbox, env.REAL_SENT_MAILBOX),
    appendSent: pick(REAL_SETTING_KEYS.appendSent, env.REAL_APPEND_SENT) !== "false",
    // 検証のあいだ実メールボックスを変えないよう、明示的に外すまでは読み取り専用にする
    readOnly: pick(REAL_SETTING_KEYS.readOnly, env.REAL_READ_ONLY) !== "false",
  };
}

/** パスワードはキーチェーンを優先し、無ければ .env.local の REAL_MAIL_PASSWORD を使う。 */
export function getRealPassword(): string | null {
  // デモ用のデータで動かしているときは、本物のパスワード(キーチェーン)を読まない
  if (DEMO) return "demo";
  return readPassword() ?? (process.env.REAL_MAIL_PASSWORD || null);
}

/** アカウントを組み立てる。必須項目が欠けていれば null。 */
export function getRealAccount(): Account | null {
  const pass = getRealPassword();
  return pass ? buildRealAccount(getRealAccountFields(), pass) : null;
}

/** 保存前の入力値からも組み立てられるよう、設定の読み出しとは分けておく(接続の確認で使う)。 */
export function buildRealAccount(f: RealAccountFields, pass: string): Account | null {
  if (!f.email || !pass || !f.imapHost || !f.smtpHost) return null;
  return {
    id: "real",
    label: f.email,
    name: f.name,
    email: f.email,
    user: f.user || f.email,
    pass,
    imap: { host: f.imapHost, port: f.imapPort, secure: f.imapPort === 993 },
    // 465 は最初から TLS、587 は STARTTLS で途中から暗号化する
    smtp: { host: f.smtpHost, port: f.smtpPort, secure: f.smtpPort === 465 },
    sentMailbox: f.sentMailbox || undefined,
    appendSent: f.appendSent,
    readOnly: f.readOnly,
  };
}

export const SIGNATURE_KEY = "compose_signature";

/** 作成画面で本文の末尾に入れる署名。未設定なら空文字 */
export function getSignature(): string {
  return getSetting(SIGNATURE_KEY) ?? "";
}

/** 設定済みのアカウント。未設定なら null。 */
export function getAccount(): Account | null {
  return getRealAccount();
}

/** 画面用。アカウントが未設定なら設定画面へ案内する。 */
export function requireAccount(): Account {
  const account = getAccount();
  if (!account) redirect("/settings");
  return account;
}
