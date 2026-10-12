import "server-only";
import { getSetting } from "@/lib/db";

export type AccountId = "local" | "real";

export type Account = {
  id: AccountId;
  label: string;
  /** 外部へ配送されないテストサーバなら true */
  isLocal: boolean;
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
};

const LOCAL: Account = {
  id: "local",
  label: "ローカル テストサーバ",
  isLocal: true,
  name: "松村",
  email: "me@example.test",
  user: "me@example.test",
  pass: "password",
  imap: { host: "127.0.0.1", port: 3143, secure: false },
  smtp: { host: "127.0.0.1", port: 3025, secure: false },
  sentMailbox: "Sent",
  appendSent: true,
};

/** .env.local の REAL_* から実アカウントを組み立てる。必須項目が欠けていれば null。 */
export function getRealAccount(): Account | null {
  const env = process.env;
  const email = env.REAL_MAIL_ADDRESS;
  const pass = env.REAL_MAIL_PASSWORD;
  const imapHost = env.REAL_IMAP_HOST;
  const smtpHost = env.REAL_SMTP_HOST;
  if (!email || !pass || !imapHost || !smtpHost) return null;
  const imapPort = Number(env.REAL_IMAP_PORT ?? 993);
  const smtpPort = Number(env.REAL_SMTP_PORT ?? 465);
  return {
    id: "real",
    label: `実アカウント (${email})`,
    isLocal: false,
    name: env.REAL_MAIL_NAME ?? "",
    email,
    user: env.REAL_MAIL_USER ?? email,
    pass,
    imap: { host: imapHost, port: imapPort, secure: imapPort === 993 },
    // 465 は最初から TLS、587 は STARTTLS で途中から暗号化する
    smtp: { host: smtpHost, port: smtpPort, secure: smtpPort === 465 },
    sentMailbox: env.REAL_SENT_MAILBOX || undefined,
    appendSent: env.REAL_APPEND_SENT !== "false",
  };
}

export function getLocalAccount(): Account {
  return LOCAL;
}

export function getActiveAccount(): Account {
  if (getSetting("active_account") === "real") {
    const real = getRealAccount();
    if (real) return real;
  }
  return LOCAL;
}
