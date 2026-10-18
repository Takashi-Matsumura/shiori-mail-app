import { isAuthenticated } from "@/lib/auth/session";
import { getAccount } from "@/lib/accounts";
import { isPreviewable } from "@/lib/mail/attachment-types";
import { extractAttachments } from "@/lib/mail/parse";
import { getMessageById } from "@/lib/queries";

/** Content-Disposition のファイル名。ASCII だけの予備の名前と、UTF-8 の本来の名前(RFC 5987)を両方付ける */
function disposition(type: "inline" | "attachment", filename: string): string {
  const clean = filename.replace(/[\r\n"\\/]/g, "_");
  const ascii = clean.replace(/[^\x20-\x7e]/g, "_") || "file";
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(clean)}`;
}

/**
 * 受信したメールの添付ファイルを返す。中身はサーバに保存してあるメールの生データから、その場で取り出す。
 * 画像・PDF・テキストは新しいタブでそのまま開き(?download=1 なら保存)、それ以外は必ず保存させる。
 */
export async function GET(request: Request, ctx: RouteContext<"/api/attachments/[id]/[index]">) {
  if (!(await isAuthenticated())) return new Response("Unauthorized", { status: 401 });
  // ほかのサイトから、ログイン中のこのアプリの添付を開かせない。同じドメインの別のサイト(same-site)も含めて断り、
  // このアプリの画面から(same-origin)と、URL を直接開いたとき(none)だけ通す
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite !== null && fetchSite !== "same-origin" && fetchSite !== "none") return new Response("Forbidden", { status: 403 });
  const { id, index } = await ctx.params;
  if (!/^\d+$/.test(id) || !/^\d+$/.test(index)) return new Response("Bad Request", { status: 400 });

  const account = getAccount();
  if (!account) return new Response("アカウントが未設定です", { status: 409 });
  // このアカウントのメールだけ
  const message = await getMessageById(account.id, Number(id));
  if (!message) return new Response("Not Found", { status: 404 });
  const attachment = (await extractAttachments(Buffer.from(message.raw)))[Number(index)];
  if (!attachment) return new Response("Not Found", { status: 404 });

  const type = attachment.contentType.toLowerCase().split(";")[0].trim();
  const inline = isPreviewable(type) && new URL(request.url).searchParams.get("download") !== "1";
  const headers = new Headers({
    "Content-Disposition": disposition(inline ? "inline" : "attachment", attachment.filename),
    // 保存させるものは中身を問わず「ただのバイト列」として返し、ブラウザに種類を推測させない
    "Content-Type": inline ? (type === "text/plain" ? "text/plain; charset=utf-8" : type) : "application/octet-stream",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, no-store",
    "Referrer-Policy": "no-referrer",
  });
  // 画像とテキストは、念のためスクリプトも通信も禁じた状態で開く。
  // PDF は Chrome の PDF 表示が sandbox 付きの CSP だと開けないので外す(PDF は種類を偽れないよう nosniff で守る)
  if (inline && type !== "application/pdf") {
    headers.set("Content-Security-Policy", "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'");
  }
  return new Response(new Uint8Array(attachment.content), { headers });
}
