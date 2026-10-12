// TypeSafe AI の Jev(System One)による仕分け。文章は生成せず、選択肢ごとの確率だけを返すモデル。
// 比較スクリプト(scripts/compare-classify.mts)からも読み込むので、server-only や "@/" の実体 import を持たせない。
import type { Classification } from "@/lib/ai/prompts";

export class JevError extends Error {}

export const JEV_BASE_URL = "https://api.typesafe.ai";
const JEV_MODEL = "jev-latest";
const BODY_LIMIT = 6000;
const TIMEOUT_MS = 30_000;
const RETRIES = 3;

type MailForJev = { subject: string; from_name: string; from_addr: string; to_text: string; date: number; text: string };

// Jev は英語を主に学習しているので、選択肢の名前と説明は英語で渡し、結果を画面用の日本語に戻す。
const CATEGORY_CRITERIA = {
  reply_needed: "The sender asks the recipient for a reply, a decision, or a piece of work",
  information: "Only informs the recipient; reading it is enough and no action is requested",
  schedule: "Notifies a meeting, appointment, reservation or event whose date and time are already fixed",
  billing: "Payment, invoice, renewal, expense claim or other administrative procedure",
  promotion: "Advertisement, newsletter, sale, or a suspicious solicitation such as phishing",
} as const;

const CATEGORY_LABEL: Record<keyof typeof CATEGORY_CRITERIA, Classification["category"]> = {
  reply_needed: "要返信",
  information: "情報共有",
  schedule: "予定",
  billing: "請求・手続き",
  promotion: "宣伝",
};

// 「至急」「48時間限定」のような文面の勢いではなく、受信者が実際に何をする必要があるかで決めさせる。
const PRIORITY_CRITERIA = {
  high: "A genuine email from a colleague, customer or service the recipient uses, asking the recipient to reply, decide, pay, submit or do work soon (a deadline or expected answer within about a week)",
  medium: "A genuine email to keep in mind: a meeting, appointment or event the recipient will attend, or a request with no deadline or a distant one",
  low: "Nothing to do (reports, announcements, newsletters), and every advertisement, sale, coupon, and suspicious or phishing email no matter how urgent it claims to be",
} as const;

const PRIORITY_LABEL: Record<keyof typeof PRIORITY_CRITERIA, Classification["priority"]> = { high: "高", medium: "中", low: "低" };

type ChoiceAnswer = { choice?: string; confidence?: number };
type JevResponse = { model?: string; answers?: Record<string, ChoiceAnswer>; usage?: { input_tokens?: number; output_tokens?: number } };

export type JevClassification = {
  value: Classification;
  model: string;
  ms: number;
  usage: { promptTokens: number | null; completionTokens: number | null };
};

function ymd(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function post(apiKey: string, body: string): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${JEV_BASE_URL}/v1/systemone`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body,
        // リダイレクトで別のホストへキーや本文が送られないようにする
        redirect: "error",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (e) {
      const timedOut = e instanceof Error && e.name === "TimeoutError";
      throw new JevError(timedOut ? "Jev の応答が時間内に返りませんでした。" : "Jev (api.typesafe.ai) に接続できません。");
    }
    // 429(レート制限)と 529(過負荷)は、間隔を空けて再試行するよう案内されている
    if ((res.status === 429 || res.status === 529) && attempt < RETRIES) {
      await wait(500 * 2 ** (attempt - 1));
      continue;
    }
    return res;
  }
}

/** メール 1 通を Jev で仕分ける。カテゴリと優先度の 2 問を 1 回のリクエストで尋ねる。 */
export async function classifyWithJev(m: MailForJev, apiKey: string): Promise<JevClassification> {
  if (!apiKey) throw new JevError("TYPESAFE_API_KEY が設定されていません。");
  const started = Date.now();
  const res = await post(
    apiKey,
    JSON.stringify({
      model: JEV_MODEL,
      state: {
        from: `${m.from_name} <${m.from_addr}>`.slice(0, 300),
        to: m.to_text.slice(0, 300),
        received: ymd(m.date),
        subject: m.subject.slice(0, 300),
        body: m.text.slice(0, BODY_LIMIT),
      },
      questions: {
        category: {
          type: "choice",
          instructions: "This is an email in the recipient's inbox. From the recipient's point of view, which kind of email is it?",
          criteria: CATEGORY_CRITERIA,
        },
        priority: {
          type: "choice",
          instructions:
            "How much of the recipient's attention does this email deserve? Judge by what the recipient really has to do, not by urgent wording in the email.",
          criteria: PRIORITY_CRITERIA,
        },
      },
    }),
  );
  if (!res.ok) {
    if (res.status === 401) throw new JevError("Jev が API キーを受け付けませんでした (HTTP 401)。");
    const body = (await res.text().catch(() => "")).slice(0, 300);
    throw new JevError(`Jev がエラーを返しました (HTTP ${res.status}) ${body}`);
  }
  const json = (await res.json()) as JevResponse;
  const category = json.answers?.category;
  const priority = json.answers?.priority;
  const c = CATEGORY_LABEL[category?.choice as keyof typeof CATEGORY_LABEL];
  const p = PRIORITY_LABEL[priority?.choice as keyof typeof PRIORITY_LABEL];
  if (!c || !p) throw new JevError("Jev の応答が想定した形ではありませんでした。");
  const percent = (n: number | undefined) => (typeof n === "number" ? `${Math.round(n * 100)}%` : "不明");
  return {
    // Jev は理由の文章を書けないので、代わりに確信度を載せる
    value: { category: c, priority: p, reason: `確信度: 分類 ${percent(category?.confidence)} / 優先度 ${percent(priority?.confidence)}` },
    model: json.model ?? JEV_MODEL,
    ms: Date.now() - started,
    usage: { promptTokens: json.usage?.input_tokens ?? null, completionTokens: json.usage?.output_tokens ?? null },
  };
}
