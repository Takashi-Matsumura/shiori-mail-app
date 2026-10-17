// README のスクリーンショット用に、架空のメールを入れたデモ用の DB(data-demo/mailer.db)を作る。
// 本物の DB(data/mailer.db)からは、ログインに使うパスキーの公開鍵と、AI の接続先の設定だけを写す(メールは写さない)。
// 実行: npm run demo:seed → npm run demo:dev(メールサーバには接続しない)
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { SCHEMA } from "../lib/schema.ts";

const require = createRequire(import.meta.url);
const MailComposer = require("nodemailer/lib/mail-composer");

const ACCOUNT = "real";
const MODEL = "gemma-4-12b-it-Q4_K_M.gguf";
const ME = { name: "山田 花子", address: "hanako@example.com" };

const dir = path.join(process.cwd(), "data-demo");
const file = path.join(dir, "mailer.db");
mkdirSync(dir, { recursive: true });
for (const f of [file, `${file}-wal`, `${file}-shm`]) rmSync(f, { force: true });
const db = new DatabaseSync(file);
db.exec("PRAGMA foreign_keys = ON;");
db.exec(SCHEMA);

// --- 本物の DB から、パスキー(公開鍵)と AI の設定だけを写す ---
const realFile = path.join(process.cwd(), "data", "mailer.db");
if (existsSync(realFile)) {
  const real = new DatabaseSync(realFile, { readOnly: true });
  for (const row of real.prepare("SELECT id, public_key, counter, transports, created, last_used FROM passkeys").all() as Record<string, never>[]) {
    db.prepare("INSERT INTO passkeys (id, public_key, counter, transports, created, last_used) VALUES (?, ?, ?, ?, ?, ?)").run(
      row.id, row.public_key, row.counter, row.transports, row.created, row.last_used,
    );
  }
  for (const key of ["passkey_user_id", "ai_base_url", "ai_embed_base_url", "ai_chat_model", "ai_embed_model", "ai_thinking", "ai_classify_knn"]) {
    const v = real.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
    if (v) db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(key, v.value);
  }
  real.close();
}

const setting = (key: string, value: string) =>
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(key, value);
setting("real_email", ME.address);
setting("real_name", ME.name);
setting("real_imap_host", "imap.example.com");
setting("real_imap_port", "993");
setting("real_smtp_host", "smtp.example.com");
setting("real_smtp_port", "465");
setting("real_read_only", "false");
setting("real_append_sent", "false");
setting("compose_signature", `${ME.name}\nさくら企画株式会社 企画部\n${ME.address}`);

// --- 架空のメール ---
const now = Date.now();
const DAY = 86_400_000;
const at = (daysAgo: number, hour: number, minute = 0) => {
  const d = new Date(now - daysAgo * DAY);
  d.setHours(hour, minute, 0, 0);
  return d.getTime();
};
const ymd = (daysFromNow: number) => {
  const d = new Date(now + daysFromNow * DAY);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const md = (daysFromNow: number) => {
  const d = new Date(now + daysFromNow * DAY);
  return `${d.getMonth() + 1}月${d.getDate()}日(${"日月火水木金土"[d.getDay()]})`;
};

type Ai = {
  classify?: { category: string; priority: string; reason: string };
  summary?: string;
  extract?: { type: string; title: string; date: string; time: string; detail: string }[];
  closure?: { status: string; reason: string };
};
type Mail = {
  key: string;
  mailbox: "inbox" | "sent";
  from: { name: string; address: string };
  to?: { name: string; address: string };
  subject: string;
  text: string;
  html?: string;
  date: number;
  seen?: boolean;
  replyTo?: string;
  attachments?: { filename: string; content: string; contentType: string }[];
  ai?: Ai;
  done?: boolean;
};

const tanaka = { name: "田中 一郎", address: "tanaka@sakura-design.example" };
const sato = { name: "佐藤 美咲", address: "sato@kaede-print.example" };
const suzuki = { name: "鈴木 健太", address: "suzuki@minato-books.example" };
const takahashi = { name: "高橋 由美", address: "takahashi@hikari-sys.example" };

const mails: Mail[] = [
  // 日程の相談(要返信・未対応)
  {
    key: "meeting", mailbox: "inbox", from: tanaka, subject: "来週の打ち合わせ日程のご相談", date: at(0, 9, 12), seen: false,
    text: `山田様\n\nいつもお世話になっております。さくらデザインの田中です。\n\n秋のキャンペーンサイトの件で、一度お打ち合わせの時間をいただけないでしょうか。\n下記のいずれかでご都合はいかがでしょうか。\n\n・${md(4)} 14:00〜15:00\n・${md(5)} 10:00〜11:00\n・${md(6)} 16:00〜17:00\n\nオンラインでも対面でも構いません。\nお手数ですが、${md(2)}までにご返信いただけますと幸いです。\n\n田中 一郎`,
    ai: {
      classify: { category: "要返信", priority: "高", reason: "打ち合わせ日程の返事を期限付きで求めている" },
      summary: `・秋のキャンペーンサイトの件で打ち合わせを依頼\n・候補日は ${md(4)}・${md(5)}・${md(6)} の 3 つ\n・オンライン・対面どちらでも可\n対応: ${md(2)}までに候補日から選んで返信する`,
      extract: [
        { type: "締切", title: "打ち合わせ日程の返信", date: ymd(2), time: "", detail: "候補日から選んで田中さんへ返信" },
        { type: "予定", title: "打ち合わせ(候補)", date: ymd(4), time: "14:00", detail: "さくらデザイン 田中さん" },
      ],
      closure: { status: "対応が要りそう", reason: "候補日への返事がまだ必要です" },
    },
  },
  // 資料を送って、お礼が届いた(終わっていそう)
  {
    key: "docs-sent", mailbox: "sent", from: ME, to: sato, subject: "パンフレットの入稿データをお送りします", date: at(2, 15, 40),
    text: `佐藤様\n\nお世話になっております。山田です。\nパンフレットの入稿データをお送りします。ご確認をお願いいたします。\n\n山田 花子`,
  },
  {
    key: "docs-thanks", mailbox: "inbox", from: sato, replyTo: "docs-sent", subject: "Re: パンフレットの入稿データをお送りします", date: at(1, 10, 5), seen: false,
    text: `山田様\n\n入稿データを確かに受け取りました。ありがとうございます。\nこのまま印刷の準備を進めます。\n\n佐藤 美咲`,
    ai: {
      classify: { category: "要返信", priority: "中", reason: "入稿データの受領連絡" },
      summary: "・入稿データの受領を確認\n・このまま印刷の準備を進める\n対応: なし",
      extract: [],
      closure: { status: "終わっていそう", reason: "受領の連絡で締めくくられ、返事は不要そう" },
    },
  },
  // 原稿の確認(添付つき・要返信)
  {
    key: "manuscript", mailbox: "inbox", from: suzuki, subject: "原稿のご確認のお願い", date: at(1, 16, 20), seen: true,
    text: `山田様\n\nみなと書房の鈴木です。\n連載第 3 回の原稿を添付いたします。\n内容をご確認のうえ、修正点があれば ${md(3)} までにお知らせください。\n\n鈴木 健太`,
    attachments: [{ filename: "連載第3回_原稿.txt", content: "(デモ用の架空の原稿です)\n", contentType: "text/plain" }],
    ai: {
      classify: { category: "要返信", priority: "高", reason: "期限付きで原稿の確認を依頼している" },
      summary: `・連載第 3 回の原稿が添付されている\n・修正点があれば知らせてほしい\n対応: ${md(3)}までに原稿を確認して返信する`,
      extract: [{ type: "締切", title: "連載第3回 原稿の確認", date: ymd(3), time: "", detail: "修正点を鈴木さんへ連絡" }],
      closure: { status: "対応が要りそう", reason: "原稿の確認結果をまだ返していません" },
    },
  },
  // 返信済みのやり取り
  {
    key: "estimate", mailbox: "inbox", from: takahashi, subject: "システム改修のお見積もりについて", date: at(3, 11, 0), seen: true,
    text: `山田様\n\nひかりシステムの高橋です。\nご依頼いただいた改修のお見積もりをお送りします。ご不明な点があればお知らせください。\n\n高橋 由美`,
    ai: { classify: { category: "要返信", priority: "中", reason: "見積もりへの返事が想定される" } },
  },
  {
    key: "estimate-reply", mailbox: "sent", from: ME, to: takahashi, replyTo: "estimate", subject: "Re: システム改修のお見積もりについて", date: at(2, 9, 30),
    text: `高橋様\n\nお見積もりありがとうございます。社内で確認のうえ、改めてご連絡いたします。\n\n山田 花子`,
  },
  // 予定
  {
    key: "dentist", mailbox: "inbox", from: { name: "みどり歯科クリニック", address: "info@midori-dental.example" }, subject: `【ご予約確認】${md(7)} 定期検診`, date: at(2, 8, 0), seen: true,
    text: `山田 花子 様\n\nご予約ありがとうございます。\n\n日時: ${md(7)} 18:30\n内容: 定期検診\n\n変更の際はお電話ください。\nみどり歯科クリニック`,
    ai: {
      classify: { category: "予定", priority: "中", reason: "歯科の予約日時の確認" },
      extract: [{ type: "予定", title: "歯科 定期検診", date: ymd(7), time: "18:30", detail: "みどり歯科クリニック" }],
    },
    done: true,
  },
  // 請求・手続き
  {
    key: "bill", mailbox: "inbox", from: { name: "はるかぜ電力", address: "billing@harukaze-power.example" }, subject: "【はるかぜ電力】ご利用料金のお知らせ", date: at(4, 7, 0), seen: true,
    text: `山田 花子 様\n\n今月のご利用料金は 6,820 円です。\nお支払い期限: ${md(10)}\n\nマイページから明細をご確認いただけます。`,
    ai: {
      classify: { category: "請求・手続き", priority: "中", reason: "電気料金の支払い期限の案内" },
      extract: [{ type: "締切", title: "電気料金の支払い", date: ymd(10), time: "", detail: "はるかぜ電力 6,820 円" }],
      closure: { status: "対応が要りそう", reason: "期限までの支払いが残っています" },
    },
  },
  // 情報共有
  {
    key: "newsletter", mailbox: "inbox", from: { name: "さくら企画 総務部", address: "soumu@sakura-kikaku.example" }, subject: "社内報 10月号を公開しました", date: at(5, 12, 0), seen: true,
    text: "社員の皆さま\n\n社内報 10月号を社内ポータルに公開しました。今月は新しいオフィスの特集です。\n\n総務部",
    ai: { classify: { category: "情報共有", priority: "低", reason: "社内報の公開のお知らせ" } },
  },
  // 宣伝
  {
    key: "shop1", mailbox: "inbox", from: { name: "こもれびマーケット", address: "news@komorebi-market.example" }, subject: "【週末限定】秋の新作 20%オフ", date: at(0, 7, 30), seen: false,
    text: "いつもご利用ありがとうございます。週末限定で秋の新作が 20% オフ！",
    html: `<div style="font-family:sans-serif;max-width:560px;margin:auto"><h2 style="color:#b45309">週末限定 秋の新作 20%オフ</h2><p>いつもこもれびマーケットをご利用いただきありがとうございます。</p><p><a href="https://komorebi-market.example/sale">セール会場はこちら</a></p></div>`,
    ai: { classify: { category: "宣伝", priority: "低", reason: "通販のセールの広告" } },
  },
  {
    key: "shop2", mailbox: "inbox", from: { name: "ほしぞら書店", address: "mail@hoshizora-books.example" }, subject: "今月のおすすめ新刊 5 冊", date: at(3, 19, 0), seen: true,
    text: "今月のおすすめ新刊をご紹介します。",
    ai: { classify: { category: "宣伝", priority: "低", reason: "書店のメールマガジン" } },
  },
  // 迷惑
  {
    key: "phish", mailbox: "inbox", from: { name: "あおば銀行", address: "security@aoba-bank-verify.example" }, subject: "【重要】口座の利用を一時停止しました", date: at(1, 3, 12), seen: false,
    text: "お客様の口座で不審な取引を検知したため、利用を一時停止しました。24 時間以内に下記より本人確認を行ってください。",
    ai: { classify: { category: "迷惑", priority: "低", reason: "銀行をかたり急がせる、フィッシングの疑い" } },
  },
];

// --- 組み立てて保存する ---
const ids = new Map<string, { id: number; messageId: string; refs: string[] }>();
const uids = { inbox: 0, sent: 0 };
const insert = db.prepare(`INSERT INTO messages
  (account, mailbox, uid, message_id, in_reply_to, refs, thread_key, subject, from_name, from_addr, to_text, cc_text, date, seen, text, html, raw, structure, has_attachments, size)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?, NULL, ?, ?)`);
const saveAi = db.prepare(
  "INSERT INTO ai_results (message_id, kind, model, result, ms, prompt_tokens, completion_tokens, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
);

for (const m of [...mails].sort((a, b) => a.date - b.date)) {
  const to = m.to ?? ME;
  const messageId = `<${m.key}.${now}@demo.example>`;
  const parent = m.replyTo ? ids.get(m.replyTo) : undefined;
  const refs = parent ? [...parent.refs, parent.messageId] : [];
  const raw: Buffer = await new MailComposer({
    from: m.from,
    to,
    subject: m.subject,
    text: m.text,
    html: m.html,
    date: new Date(m.date),
    messageId,
    inReplyTo: parent?.messageId,
    references: refs.length > 0 ? refs : undefined,
    attachments: m.attachments,
  })
    .compile()
    .build();
  const r = insert.run(
    ACCOUNT, m.mailbox, ++uids[m.mailbox], messageId, parent?.messageId ?? null, JSON.stringify(refs), refs[0] ?? messageId,
    m.subject, m.from.name, m.from.address, `${to.name} <${to.address}>`, m.date, m.seen === false ? 0 : 1, m.text, m.html ?? null,
    raw, m.attachments?.length ? 1 : 0, raw.length,
  );
  const id = Number(r.lastInsertRowid);
  ids.set(m.key, { id, messageId, refs });
  const created = m.date + 60_000;
  if (m.ai?.classify) saveAi.run(id, "classify", MODEL, JSON.stringify(m.ai.classify), 3200, 820, 40, created);
  if (m.ai?.summary) saveAi.run(id, "summary", MODEL, m.ai.summary, 5400, 900, 120, created);
  if (m.ai?.extract) saveAi.run(id, "extract", MODEL, JSON.stringify({ items: m.ai.extract }), 4100, 950, 90, created);
  if (m.ai?.closure) saveAi.run(id, "closure", MODEL, JSON.stringify(m.ai.closure), 3900, 700, 30, created);
  if (m.done) db.prepare("INSERT INTO message_done (message_id, created) VALUES (?, ?)").run(id, created);
}

console.log(`デモ用の DB を作りました: ${path.relative(process.cwd(), file)}(受信 ${uids.inbox} 通・送信 ${uids.sent} 通)`);
console.log("npm run demo:dev で起動します(メールサーバには接続しません)。");
