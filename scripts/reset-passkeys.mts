// パスキーを失くしたときの復旧用。登録済みのパスキーとログイン中のセッションをすべて消す。
// 次にアプリを開くと、パスキーの登録からやり直しになる。この Mac のシェルを使える人だけが実行できる、という前提の逃げ道。
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(path.join(process.cwd(), "data", "mailer.db"));
const keys = db.prepare("DELETE FROM passkeys").run().changes;
const sessions = db.prepare("DELETE FROM sessions").run().changes;
db.prepare("DELETE FROM auth_challenges").run();
db.prepare("DELETE FROM settings WHERE key = 'passkey_invite'").run();
console.log(`パスキー ${keys} 件とセッション ${sessions} 件を消しました。アプリを開くと、パスキーの登録からやり直せます。`);
