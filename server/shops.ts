import { getDb } from './db/index.js';

/* Shop của tài khoản khách — kiểm tra quyền truy cập shop ở 1 chỗ */

export interface ShopInfo {
  id: string;
  accountId: string;
  name: string;
  createdAt: string;
}

interface Row {
  id: string;
  account_id: string;
  name: string;
  created_at: string;
}
const toShop = (r: Row): ShopInfo => ({ id: r.id, accountId: r.account_id, name: r.name, createdAt: r.created_at });

/** Shop thuộc tài khoản của người dùng (người dùng bị khoá / không có tài khoản → false) */
export function userCanAccessShop(userId: string, shopId: string): boolean {
  return !!getDb()
    .prepare('SELECT 1 FROM shops s JOIN users u ON u.account_id = s.account_id WHERE u.id = ? AND s.id = ? AND u.disabled = 0')
    .get(userId, shopId);
}

/** Các shop người dùng được mở (theo tài khoản), cũ nhất trước */
export function listShopsOf(userId: string): ShopInfo[] {
  return (
    getDb()
      .prepare('SELECT s.* FROM shops s JOIN users u ON u.account_id = s.account_id WHERE u.id = ? ORDER BY s.created_at')
      .all(userId) as unknown as Row[]
  ).map(toShop);
}

export function findShop(shopId: string): ShopInfo | null {
  const r = getDb().prepare('SELECT * FROM shops WHERE id = ?').get(shopId) as Row | undefined;
  return r ? toShop(r) : null;
}

/** Shop có kết nối TikTok (lịch Agent chạy lần lượt các shop này) */
export function shopsWithTikTok(): string[] {
  return (getDb().prepare('SELECT shop_id FROM tiktok_links WHERE token_enc IS NOT NULL ORDER BY shop_id').all() as { shop_id: string }[]).map(
    (r) => r.shop_id,
  );
}
