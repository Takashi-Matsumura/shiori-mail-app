// 受信トレイのメールを Jev で仕分け、保存済みのローカルモデルの結果と見比べる。DB には書き込まない。
// 実行: npm run ai:compare (.env.local の TYPESAFE_API_KEY を使う。メールの本文が api.typesafe.ai へ送られる)
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { classifyWithJev } from "../lib/ai/jev.ts";

const apiKey = process.env.TYPESAFE_API_KEY ?? "";
if (!apiKey) {
  console.error("TYPESAFE_API_KEY が設定されていません。.env.local に追記してください。");
  process.exit(1);
}

type Row = {
  id: number;
  subject: string;
  from_name: string;
  from_addr: string;
  to_text: string;
  date: number;
  text: string;
  model: string | null;
  result: string | null;
  ms: number | null;
};

const db = new DatabaseSync(path.join(process.cwd(), "data", "mailer.db"), { readOnly: true });
const account = process.argv[2] ?? "local";
const rows = db
  .prepare(
    `SELECT m.id, m.subject, m.from_name, m.from_addr, m.to_text, m.date, m.text, a.model, a.result, a.ms
     FROM messages m LEFT JOIN ai_results a ON a.message_id = m.id AND a.kind = 'classify'
     WHERE m.account = ? AND m.mailbox = 'inbox' ORDER BY m.date DESC`,
  )
  .all(account) as Row[];

const seconds = (ms: number) => `${(ms / 1000).toFixed(2)} 秒`;
let compared = 0;
let sameCategory = 0;
let samePriority = 0;
let localMs = 0;
let jevMs = 0;
let tokens = 0;
let failed = 0;

for (const r of rows) {
  const local = r.result ? (JSON.parse(r.result) as { category: string; priority: string }) : null;
  try {
    const jev = await classifyWithJev(r, apiKey);
    jevMs += jev.ms;
    tokens += jev.usage.promptTokens ?? 0;
    const mark = (a: string | undefined, b: string) => (a === undefined ? "—" : a === b ? "一致" : "相違");
    if (local && r.ms !== null) {
      compared++;
      localMs += r.ms;
      if (local.category === jev.value.category) sameCategory++;
      if (local.priority === jev.value.priority) samePriority++;
    }
    console.log(
      [
        r.subject.slice(0, 28).padEnd(28, " "),
        `ローカル ${local ? `${local.category}/${local.priority}` : "未処理"}`,
        `Jev ${jev.value.category}/${jev.value.priority}`,
        `${mark(local?.category, jev.value.category)}・${mark(local?.priority, jev.value.priority)}`,
        jev.value.reason,
        seconds(jev.ms),
      ].join(" | "),
    );
  } catch (e) {
    failed++;
    console.log(`${r.subject.slice(0, 28)} | 失敗: ${e instanceof Error ? e.message : String(e)}`);
  }
}

const ok = rows.length - failed;
console.log("\n--- まとめ ---");
console.log(`対象 ${rows.length} 通(成功 ${ok} / 失敗 ${failed})`);
if (ok > 0) console.log(`Jev: 1 通あたり ${seconds(jevMs / ok)} / 入力 ${tokens} トークン`);
if (compared > 0) {
  console.log(`ローカル(${rows.find((r) => r.model)?.model}): 1 通あたり ${seconds(localMs / compared)}(保存済みの記録)`);
  console.log(`カテゴリの一致 ${sameCategory}/${compared} / 優先度の一致 ${samePriority}/${compared}`);
}
