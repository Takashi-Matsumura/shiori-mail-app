import "server-only";
import { format } from "node:util";
import nodemailer from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer";
import type { Account } from "@/lib/accounts";
import { appendToSent } from "@/lib/mail/imap";
import { recordProtocol } from "@/lib/mail/protocol-log";

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

let connSeq = 0;

/** nodemailer のログを通信ログへ流すロガー。AUTH の中身は nodemailer 側でも伏せられる。 */
function protocolLogger(accountId: string, conn: string) {
  const write = (entry: { tnx?: string }, message?: unknown, ...args: unknown[]) => {
    if (typeof message !== "string") return;
    // tnx: "message" は DATA のあとにクライアントが送るメール本体
    const dir = entry?.tnx === "client" || entry?.tnx === "message" ? "C" : entry?.tnx === "server" ? "S" : "-";
    recordProtocol(accountId, "smtp", conn, dir, format(message, ...args));
  };
  const noop = () => {};
  return { level: noop, trace: noop, debug: write, info: write, warn: write, error: write, fatal: write };
}

export async function sendMail(account: Account, mail: OutgoingMail): Promise<SendResult> {
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

  const transport = nodemailer.createTransport({
    host: account.smtp.host,
    port: account.smtp.port,
    secure: account.smtp.secure,
    // テストサーバは認証なしで受け付ける
    auth: account.isLocal ? undefined : { user: account.user, pass: account.pass },
    logger: protocolLogger(account.id, `smtp-${++connSeq}`),
    debug: true,
  });
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
