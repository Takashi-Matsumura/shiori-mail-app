import "server-only";
import { chmodSync, mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { DEMO } from "@/lib/demo";
import { SCHEMA } from "@/lib/schema";


// dev の HMR でモジュールが再評価されても接続を1つに保つ
const globalForDb = globalThis as unknown as { __mailerDb?: DatabaseSync };

export function getDb(): DatabaseSync {
  if (!globalForDb.__mailerDb) {
    // デモ用のデータ(npm run demo:seed で作る架空のメール)は、本物とは別の場所に置く
    const dir = path.join(process.cwd(), DEMO ? "data-demo" : "data");
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "mailer.db");
    const db = new DatabaseSync(file);
    // メールの本文が入るので、このマシンの他の利用者からは読めないようにする(既存のファイルにも掛け直す)
    chmodSync(dir, 0o700);
    chmodSync(file, 0o600);
    db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    db.exec(SCHEMA);
    globalForDb.__mailerDb = db;
  }
  return globalForDb.__mailerDb;
}

export function getSetting(key: string): string | undefined {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value;
}

export function setSetting(key: string, value: string): void {
  getDb()
    .prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value")
    .run(key, value);
}
