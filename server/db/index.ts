import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite';
import { config } from '../config.js';
import { MIGRATIONS } from './schema.js';

/*
 * Database SQLite (server-data/app.db, không commit) — dùng node:sqlite có sẵn trong Node (≥ 22.13), không cần cài thêm.
 * Nhiều tiến trình Passenger cùng mở: WAL + busy_timeout để chờ thay vì báo "database is locked".
 */

// Nạp lúc chạy (vite / vitest 5 chưa biết node:sqlite là module có sẵn → import tĩnh bị lỗi khi test)
const { DatabaseSync } = (() => {
  try {
    return createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
  } catch {
    throw new Error(`Node ${process.version} chưa có SQLite sẵn — cần Node 22.13 trở lên (cPanel: Setup Node.js App → chọn bản Node mới hơn)`);
  }
})();
type DatabaseSync = DatabaseSyncType;

export type Db = DatabaseSync;

let db: DatabaseSync | null = null;

export const dbFile = () => path.join(config.dataDir, 'app.db');

/** Mở (lần đầu thì tạo + chạy migration). Dùng chung 1 kết nối cho cả tiến trình. */
export function getDb(): DatabaseSync {
  if (db) return db;
  fs.mkdirSync(config.dataDir, { recursive: true });
  const conn = new DatabaseSync(dbFile());
  conn.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON; PRAGMA synchronous = NORMAL;');
  migrate(conn);
  db = conn;
  // File DB chứa token (đã mã hoá) + mật khẩu băm → chỉ chủ tiến trình đọc được
  try {
    fs.chmodSync(dbFile(), 0o600);
  } catch {
    /* Windows bỏ qua */
  }
  return db;
}

/** Chạy các phiên bản lược đồ chưa chạy, mỗi phiên bản 1 transaction */
export function migrate(conn: DatabaseSync) {
  conn.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
  const done = new Set(
    (conn.prepare('SELECT version FROM schema_version').all() as { version: number }[]).map((r) => r.version),
  );
  for (const m of MIGRATIONS) {
    if (done.has(m.version)) continue;
    tx(conn, () => {
      conn.exec(m.sql);
      conn.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)').run(m.version, new Date().toISOString());
    });
  }
}

/** Chạy fn trong 1 transaction (IMMEDIATE: giữ quyền ghi ngay từ đầu, tránh 2 tiến trình đọc-rồi-ghi đè nhau) */
export function tx<T>(conn: DatabaseSync, fn: () => T): T {
  conn.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    conn.exec('COMMIT');
    return out;
  } catch (e) {
    conn.exec('ROLLBACK');
    throw e;
  }
}

/** Đóng kết nối (test / tắt server) */
export function closeDb() {
  db?.close();
  db = null;
}

/** Đọc cột JSON an toàn */
export function parseJson<T>(text: unknown, fallback: T): T {
  if (typeof text !== 'string') return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

/** Chỉ dùng trong test: xoá sạch dữ liệu (giữ bảng) */
export function clearAllForTests() {
  const conn = getDb();
  conn.exec('PRAGMA foreign_keys = OFF');
  for (const t of ['sessions', 'watchlist', 'actions', 'proposals', 'agent_runtime', 'agent_config', 'shop_settings', 'tiktok_links', 'shops', 'users', 'accounts', 'meta']) {
    conn.exec(`DELETE FROM ${t}`);
  }
  conn.exec('PRAGMA foreign_keys = ON');
}
