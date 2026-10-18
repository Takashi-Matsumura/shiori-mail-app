import "server-only";
import { getAccount } from "@/lib/accounts";
import { DEMO } from "@/lib/demo";
import { syncAccount } from "@/lib/mail/imap";
import { hasSubscriptions, notifyNewMail } from "@/lib/push";

/** 画面を閉じていても新着を通知できるよう、サーバが自分で同期する間隔 */
const INTERVAL_MS = 3 * 60_000;

// 本番サーバ(next start)の中で 1 つだけ動かす。HMR などで二重に始めないよう globalThis に印を置く
const g = globalThis as unknown as { __mailerBackgroundSync?: NodeJS.Timeout };

/**
 * 通知を受け取る端末が登録されている間だけ、定期的にサーバと同期し、新着を栞に仕分けさせて「要返信」を通知する。
 * 仕分け以外の AI の処理(予定の抜き出しなど)はここではしない(画面を開いたときに、いつもの自動処理が行う)。
 */
export function startBackgroundSync(): void {
  if (DEMO || g.__mailerBackgroundSync) return;
  let busy = false;
  let lastError = "";
  g.__mailerBackgroundSync = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      // DB の読み出しも try の中で行う(例外が unhandledRejection として 3 分ごとにログへ出ないように)
      if (!hasSubscriptions()) return;
      const account = getAccount();
      if (!account) return;
      await syncAccount(account);
      await notifyNewMail(account);
      lastError = "";
    } catch (e) {
      // 回線が切れている間などに同じ失敗を 3 分ごとに書き続けないよう、変わったときだけ残す
      const message = e instanceof Error ? e.message : String(e);
      if (message !== lastError) console.error(`裏の同期に失敗しました: ${message}`);
      lastError = message;
    } finally {
      busy = false;
    }
  }, INTERVAL_MS);
}
