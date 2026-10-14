import "server-only";
import { isSameOrigin } from "@/lib/ai/stream";
import { RP_ID } from "@/lib/auth/passkey";

/** パスキーの API を受け付けるか。同一オリジンで、RP ID と同じホスト名(localhost)から開いているものに限る。 */
export function passkeyOrigin(request: Request): string | null {
  if (!isSameOrigin(request)) return null;
  // request.url は待ち受けアドレスで組み立てられることがあるので、ブラウザが開いている名前は Host ヘッダから取る
  const host = request.headers.get("host") ?? "";
  if (!URL.canParse(`http://${host}`)) return null;
  const url = new URL(`${new URL(request.url).protocol}//${host}`);
  return url.hostname === RP_ID ? url.origin : null;
}
