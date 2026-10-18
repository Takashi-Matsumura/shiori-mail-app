import "server-only";
import webpush from "web-push";
import type { Account } from "@/lib/accounts";
import { getDb, getSetting, setSetting } from "@/lib/db";

// 新着メールの通知(Web Push)。送り先はブラウザのプッシュサーバ(Apple など)で、そこから端末へ届く。
// 中身は端末の鍵で暗号化されるので、プッシュサーバには読めない。

const VAPID_PUBLIC = "push_vapid_public";
const VAPID_PRIVATE = "push_vapid_private";
/** 通知済みの受信トレイのメールの、最大の messages.id */
const LAST_NOTIFIED = "push_last_notified_id";
/** これより多く届いたら、1 通ずつではなく「新着 N 通」の 1 件にまとめる */
const MAX_SEPARATE = 3;

export type PushSubscriptionJSON = { endpoint: string; keys: { p256dh: string; auth: string } };

/** 送信用の鍵(VAPID)。無ければ作って DB に置く。公開鍵は端末の登録に使う */
function vapidKeys(): { publicKey: string; privateKey: string } {
  const publicKey = getSetting(VAPID_PUBLIC);
  const privateKey = getSetting(VAPID_PRIVATE);
  if (publicKey && privateKey) return { publicKey, privateKey };
  const keys = webpush.generateVAPIDKeys();
  setSetting(VAPID_PUBLIC, keys.publicKey);
  setSetting(VAPID_PRIVATE, keys.privateKey);
  return keys;
}

export function vapidPublicKey(): string {
  return vapidKeys().publicKey;
}

// 送り先の URL は端末(ブラウザ)が決めるが、サーバから任意の宛先へ POST させないよう、既知のプッシュサーバに限る
const PUSH_HOSTS = [/\.push\.apple\.com$/, /^fcm\.googleapis\.com$/, /\.push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/];

export function isAllowedEndpoint(endpoint: string): boolean {
  if (!URL.canParse(endpoint)) return false;
  const url = new URL(endpoint);
  return url.protocol === "https:" && url.port === "" && PUSH_HOSTS.some((re) => re.test(url.hostname));
}

export function hasSubscriptions(): boolean {
  return Boolean(getDb().prepare("SELECT 1 FROM push_subscriptions LIMIT 1").get());
}

export function saveSubscription(sub: PushSubscriptionJSON): void {
  getDb()
    .prepare(
      `INSERT INTO push_subscriptions (endpoint, p256dh, auth, created) VALUES (?, ?, ?, ?)
       ON CONFLICT (endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth`,
    )
    .run(sub.endpoint, sub.keys.p256dh, sub.keys.auth, Date.now());
  // 初めて登録したときは、いま手元にあるメールを通知済みにする(過去のメールをまとめて通知しない)
  if (getSetting(LAST_NOTIFIED) === undefined) setSetting(LAST_NOTIFIED, String(maxInboxId()));
}

export function isSubscribed(endpoint: string): boolean {
  return Boolean(getDb().prepare("SELECT 1 FROM push_subscriptions WHERE endpoint = ?").get(endpoint));
}

export function deleteSubscription(endpoint: string): void {
  getDb().prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").run(endpoint);
}

function maxInboxId(): number {
  const row = getDb().prepare("SELECT MAX(id) AS id FROM messages WHERE mailbox = 'inbox'").get() as { id: number | null };
  return row.id ?? 0;
}

type Payload = { title: string; body: string; url: string; tag: string };

/** 登録してあるすべての端末へ送る。端末側で登録が消えていたら(404・410)、こちらの登録も消す */
async function sendToAll(payloads: Payload[]): Promise<void> {
  const subs = getDb().prepare("SELECT endpoint, p256dh, auth FROM push_subscriptions").all() as {
    endpoint: string;
    p256dh: string;
    auth: string;
  }[];
  if (subs.length === 0 || payloads.length === 0) return;
  const { publicKey, privateKey } = vapidKeys();
  // 送り主の連絡先(Apple などが問題のある送信者に連絡するため)。公開ホストがあればその URL にする
  const host = process.env.MAILER_PUBLIC_HOST?.trim();
  const subject = host ? `https://${host}` : "https://github.com/Takashi-Matsumura/shiori-mail-app";
  for (const sub of subs) {
    if (!isAllowedEndpoint(sub.endpoint)) {
      deleteSubscription(sub.endpoint);
      continue;
    }
    for (const payload of payloads) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
          { vapidDetails: { subject, publicKey, privateKey }, TTL: 24 * 60 * 60, timeout: 10_000 },
        );
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          deleteSubscription(sub.endpoint);
          break;
        }
        console.error(`通知を送れませんでした(${status ?? "接続エラー"})`);
      }
    }
  }
}

/**
 * まだ通知していない受信トレイの未読を通知する。同期のあと(画面からでも、裏の定期同期からでも)に呼ぶ。
 * 通知済みの印は送る前に進めるので、同期が重なっても同じメールを 2 回通知しない(node:sqlite は同期的に動く)。
 */
export async function notifyNewMail(account: Account): Promise<void> {
  const last = getSetting(LAST_NOTIFIED);
  if (last === undefined) return; // まだ 1 台も登録していない
  const rows = getDb()
    .prepare(
      `SELECT id, uid, seen, from_name, from_addr, subject FROM messages
       WHERE account = ? AND mailbox = 'inbox' AND id > ? ORDER BY id`,
    )
    .all(account.id, Number(last)) as {
    id: number;
    uid: number;
    seen: number;
    from_name: string | null;
    from_addr: string | null;
    subject: string | null;
  }[];
  if (rows.length === 0) return;
  setSetting(LAST_NOTIFIED, String(rows[rows.length - 1].id));
  // 他のメーラーで既に読んだものは知らせない
  const unseen = rows.filter((r) => !r.seen);
  if (unseen.length === 0 || !hasSubscriptions()) return;

  const sender = (r: (typeof unseen)[number]) => r.from_name || r.from_addr || "(差出人なし)";
  const payloads: Payload[] =
    unseen.length <= MAX_SEPARATE
      ? unseen.map((r) => ({
          title: sender(r),
          body: r.subject || "(件名なし)",
          url: `/mail/inbox/${r.uid}`,
          tag: `mail-${r.id}`,
        }))
      : [
          {
            title: `新着 ${unseen.length} 通`,
            body: unseen
              .slice(-MAX_SEPARATE)
              .reverse()
              .map((r) => `${sender(r)}: ${r.subject || "(件名なし)"}`)
              .join("\n"),
            url: "/mail/inbox",
            tag: "mail-summary",
          },
        ];
  await sendToAll(payloads);
}

/** 設定画面の「テスト通知」 */
export async function sendTestNotification(): Promise<void> {
  await sendToAll([{ title: "Shiori Mail", body: "通知を受け取れるようになりました。", url: "/mail/inbox", tag: "test" }]);
}
