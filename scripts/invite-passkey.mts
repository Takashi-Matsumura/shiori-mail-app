// パスキーを登録するための、使い捨ての招待リンクを出す。最初の 1 つ(この Mac)も、外で使う端末(iPhone など)の 1 つ目も、これで登録する。
// ログインせずに登録できるのは招待だけなので、この Mac のシェルを使える人がこれで 1 つずつ許可する。
import { issueInvite, openAppDb } from "./passkey-invite.mts";

issueInvite(openAppDb());
