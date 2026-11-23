import { getDb } from '../server/db/index';

/** Chỉ cho test: tạo 1 tài khoản khách + 1 shop trong database (thư mục tạm của test) → id shop */
export function makeShop(id = 'shop-1', accountId = `acc-${id}`): string {
  const db = getDb();
  db.prepare('INSERT OR IGNORE INTO accounts (id, name, plan, created_at) VALUES (?, ?, ?, ?)').run(accountId, accountId, 'free', '2026-01-01T00:00:00Z');
  db.prepare('INSERT OR IGNORE INTO shops (id, account_id, name, created_at) VALUES (?, ?, ?, ?)').run(id, accountId, id, '2026-01-01T00:00:00Z');
  return id;
}
