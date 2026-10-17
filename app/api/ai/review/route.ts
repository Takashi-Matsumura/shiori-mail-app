import { isAuthenticated } from "@/lib/auth/session";
import { getAccount } from "@/lib/accounts";
import { AiError, chatJson } from "@/lib/ai/client";
import { getAiConfig } from "@/lib/ai/config";
import { normalizeReviewIssues, reviewPrompt, reviewSchema, type ReviewIssue, type ReviewResponse } from "@/lib/ai/prompts";
import { isSameOrigin } from "@/lib/ai/stream";
import { getMessageById } from "@/lib/queries";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

/**
 * 「10月20日(火)」「2026/10/20（火）」のような日付と曜日の食い違い。小さいモデルは曜日の計算を誤るので、AI ではなくここで確かめる。
 * 年が書かれていなければ、今日に最も近い年の日付とみなす。
 */
function weekdayChecks(text: string, now: Date): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  const pattern = /(?:(\d{4})\s*[年/.-]\s*)?(\d{1,2})\s*[月/.-]\s*(\d{1,2})\s*日?\s*[(（]\s*([日月火水木金土])(?:曜日?)?\s*[)）]/g;
  for (const m of text.matchAll(pattern)) {
    const month = Number(m[2]);
    const day = Number(m[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) continue;
    const years = m[1] ? [Number(m[1])] : [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];
    const candidates = years
      .map((y) => new Date(y, month - 1, day))
      // 2 月 30 日のような、存在しない日付は除く
      .filter((d) => d.getMonth() === month - 1 && d.getDate() === day);
    if (candidates.length === 0) continue;
    const date = candidates.reduce((a, b) => (Math.abs(a.getTime() - now.getTime()) <= Math.abs(b.getTime() - now.getTime()) ? a : b));
    const actual = WEEKDAYS[date.getDay()];
    if (actual === m[4]) continue;
    issues.push({
      severity: "要修正",
      message: `${date.getFullYear()}年${month}月${day}日は${actual}曜日です(「${m[4]}」と書かれています)。`,
      quote: m[0].slice(0, 60),
    });
    if (issues.length >= 5) break;
  }
  return issues;
}

/** AI に頼まなくても分かる見落とし。AI が動いていなくても返す。 */
function ruleChecks(text: string, now: Date, attachments: number): ReviewIssue[] {
  const own = text
    .split("\n")
    .filter((l) => !l.startsWith(">"))
    .join("\n");
  const issues: ReviewIssue[] = weekdayChecks(own, now);
  const todo = own.match(/【要確認[^】]*】/);
  if (todo) issues.push({ severity: "要修正", message: "栞の下書きの【要確認】が残っています。中身を書き入れてください。", quote: todo[0].slice(0, 60) });
  if (/添付/.test(own) && attachments === 0) {
    issues.push({ severity: "確認", message: "本文に「添付」とありますが、ファイルが添付されていません。", quote: "添付" });
  }
  return issues;
}

/** 送信前の見直し。結果は画面に出すだけで、送るかどうかは利用者が決める。 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return new Response("Forbidden", { status: 403 });
  if (!(await isAuthenticated())) return new Response("Unauthorized", { status: 401 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const field = (name: string, max: number) => (typeof body?.[name] === "string" ? (body[name] as string).slice(0, max) : "");
  const draft = { to: field("to", 1000), cc: field("cc", 1000), subject: field("subject", 500), text: field("text", 20_000) };
  if (!draft.text.trim()) return new Response("Bad Request", { status: 400 });

  const account = getAccount();
  if (!account) return new Response("アカウントが未設定です", { status: 409 });
  const replyTo = Number(body?.replyTo);
  const original = Number.isInteger(replyTo) ? await getMessageById(account.id, replyTo) : null;

  const now = new Date();
  const attachments = Number.isInteger(body?.attachments) ? Number(body?.attachments) : 0;
  const rules = ruleChecks(draft.text, now, attachments);
  const from = account.name ? `${account.name} <${account.email}>` : account.email;
  try {
    const r = await chatJson(getAiConfig(), reviewPrompt({ draft: { from, ...draft }, original: original ?? undefined, now: now.getTime() }), "mail_review", reviewSchema);
    const summary = (r.value as { summary?: unknown })?.summary;
    return Response.json({
      issues: [...rules, ...normalizeReviewIssues(r.value)],
      summary: typeof summary === "string" ? summary.slice(0, 200) : "",
      meta: { ms: r.ms, model: r.model, ...r.usage },
    } satisfies ReviewResponse);
  } catch (e) {
    if (!(e instanceof AiError)) throw e;
    return Response.json({ issues: rules, summary: "", error: e.message } satisfies ReviewResponse);
  }
}
