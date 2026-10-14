import "server-only";
import nodemailer from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer";
import type { Account } from "@/lib/accounts";
import { appendToSent } from "@/lib/mail/imap";

export type OutgoingMail = {
  to: string;
  cc?: string;
  subject: string;
  text: string;
  inReplyTo?: string;
  references?: string[];
};

export type SendResult = {
  messageId: string;
  /** サーバが最後に返した応答行(例: 250 OK) */
  response: string;
  accepted: string[];
  rejected: string[];
  /** 送信済みフォルダへ控えを置けたか。null は設定により置いていない */
  appended: boolean | null;
};

function createTransport(account: Account, timeouts: { connectionTimeout?: number; greetingTimeout?: number } = {}) {
  return nodemailer.createTransport({
    ...timeouts,
    host: account.smtp.host,
    port: account.smtp.port,
    secure: account.smtp.secure,
    // STARTTLS を剥がされても、平文のままパスワードを送らない
    requireTLS: !account.smtp.secure,
    auth: { user: account.user, pass: account.pass },
  });
}

/** 認証まで通るかだけを確かめる(メールは送らない)。 */
export async function verifySmtp(account: Account): Promise<void> {
  const transport = createTransport(account, { connectionTimeout: 15_000, greetingTimeout: 15_000 });
  try {
    await transport.verify();
  } finally {
    transport.close();
  }
}

export async function sendMail(account: Account, mail: OutgoingMail): Promise<SendResult> {
  // 画面とサーバアクションでも止めているが、ここでも二重に守る
  if (account.readOnly) throw new Error("読み取り専用モードでは送信しません");
  // 先に RFC 5322 形式へ組み立てる。送信と送信済みへの控えで同じバイト列を使うため。
  const node = new MailComposer({
    from: account.name ? { name: account.name, address: account.email } : account.email,
    to: mail.to,
    cc: mail.cc || undefined,
    subject: mail.subject,
    text: mail.text,
    inReplyTo: mail.inReplyTo,
    references: mail.references,
  }).compile();
  const envelope = node.getEnvelope();
  const messageId = node.messageId();
  const raw = await node.build();

  const transport = createTransport(account);
  let info;
  try {
    info = await transport.sendMail({ envelope, raw });
  } finally {
    transport.close();
  }

  let appended: boolean | null = null;
  if (account.appendSent) {
    appended = await appendToSent(account, raw).then(
      () => true,
      () => false,
    );
  }
  return {
    messageId,
    response: info.response,
    accepted: (info.accepted ?? []).map(String),
    rejected: (info.rejected ?? []).map(String),
    appended,
  };
}
