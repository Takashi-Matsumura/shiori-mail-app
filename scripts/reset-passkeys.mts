// パスキーを失くしたときの復旧用。登録済みのパスキーとログイン中のセッションをすべて消し、登録し直すための招待リンクを出す。
// この Mac のシェルを使える人だけが実行できる、という前提の逃げ道。
import { issueInvite, openAppDb } from "./passkey-invite.mts";

const db = openAppDb();
const keys = db.prepare("DELETE FROM passkeys").run().changes;
const sessions = db.prepare("DELETE FROM sessions").run().changes;
db.prepare("DELETE FROM auth_challenges").run();
console.log(`パスキー ${keys} 件とセッション ${sessions} 件を消しました。`);
issueInvite(db);
