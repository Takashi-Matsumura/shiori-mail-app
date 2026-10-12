import { Suspense } from "react";
import { clearLogAction } from "@/app/actions";
import { ProtocolLog } from "@/components/protocol-log";
import { timeOfDay } from "@/lib/format";
import { listProtocolLog } from "@/lib/queries";

export default function InspectorPage() {
  return (
    <div className="flex h-full flex-col gap-3 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">通信ログ</h1>
          <p className="text-muted">
            このアプリとメールサーバが交わした行をそのまま並べています。<b>C</b> がアプリ(クライアント)、<b>S</b> がサーバの発言です。
            同期すると IMAP、送信すると SMTP のやり取りが増えます。パスワードは伏せています。
          </p>
        </div>
        <form action={clearLogAction}>
          <button className="shrink-0 rounded-md border border-line px-3 py-1.5 hover:bg-panel">ログを消去</button>
        </form>
      </div>
      <Suspense fallback={<p className="text-muted">読み込み中…</p>}>
        <Log />
      </Suspense>
    </div>
  );
}

async function Log() {
  const rows = await listProtocolLog();
  return <ProtocolLog rows={rows.map((r) => ({ id: r.id, time: timeOfDay(r.ts), proto: r.proto, conn: r.conn, dir: r.dir, line: r.line }))} />;
}
