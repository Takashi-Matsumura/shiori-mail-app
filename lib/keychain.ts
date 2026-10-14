import "server-only";
import { execFileSync } from "node:child_process";

// 実アカウントのパスワードは DB にも .env.local にも置かず、macOS のキーチェーンに預ける。
// security コマンドを使う。書き込みは -i(標準入力)で渡し、パスワードがプロセス一覧(ps)に出ないようにする。

const SERVICE = "mailer-app";
const ACCOUNT = "real";

export const keychainAvailable = process.platform === "darwin";

const globalForKeychain = globalThis as unknown as { __mailerPassword?: string | null };

/** 保存済みのパスワード。未保存・macOS 以外なら null。毎回プロセスを起こさないよう、結果を覚えておく。 */
export function readPassword(): string | null {
  if (!keychainAvailable) return null;
  if (globalForKeychain.__mailerPassword !== undefined) return globalForKeychain.__mailerPassword;
  let pass: string | null = null;
  try {
    pass = execFileSync("/usr/bin/security", ["find-generic-password", "-s", SERVICE, "-a", ACCOUNT, "-w"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).replace(/\n$/, "");
  } catch {
    // 見つからないときは終了コード 44 で失敗する
  }
  globalForKeychain.__mailerPassword = pass || null;
  return globalForKeychain.__mailerPassword;
}

/**
 * 保存できるパスワードか。security は ASCII 以外を含む値を 16 進で返し、元の文字列と区別できないので、
 * 表示できる ASCII 文字だけに限る(アプリ用パスワードはこの範囲に収まる)。
 */
export function isStorablePassword(pass: string): boolean {
  return /^[\x20-\x7e]+$/.test(pass);
}

export function writePassword(pass: string): void {
  if (!keychainAvailable) throw new Error("キーチェーンは macOS でだけ使えます");
  if (!isStorablePassword(pass)) throw new Error("キーチェーンに保存できない文字が含まれています");
  // -X は 16 進で受け取るので、引用符や空白を含むパスワードでも -i の解釈で崩れない
  const hex = Buffer.from(pass, "utf8").toString("hex");
  execFileSync("/usr/bin/security", ["-i"], {
    input: `add-generic-password -U -s ${SERVICE} -a ${ACCOUNT} -X ${hex}\n`,
    stdio: ["pipe", "ignore", "pipe"],
  });
  globalForKeychain.__mailerPassword = pass;
}

export function deletePassword(): void {
  if (!keychainAvailable) return;
  try {
    execFileSync("/usr/bin/security", ["delete-generic-password", "-s", SERVICE, "-a", ACCOUNT], { stdio: "ignore" });
  } catch {
    // 元から無ければ何もしない
  }
  globalForKeychain.__mailerPassword = null;
}
