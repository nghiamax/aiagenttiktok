import { getDb, parseJson } from '../db/index.js';
import { decrypt, encrypt } from '../db/secret.js';
import { currentShopId } from '../shopContext.js';

/*
 * Kết nối TikTok của shop (bảng tiktok_links): token (mã hoá) + tài khoản quảng cáo / shop TikTok đang chọn.
 * Mọi hàm theo shop đang xử lý (currentShopId). Không bao giờ trả token ra web.
 */

/** Tài khoản quảng cáo + shop TikTok mà shop này đang chạy */
export interface TikTokAccount {
  advertiserId: string;
  advertiserName: string | null;
  storeId: string;
  storeName: string | null;
  currency: string;
}

export class TikTokAccountRequired extends Error {
  constructor(message = 'Chưa chọn tài khoản quảng cáo cho shop — mở Kết nối TikTok → Chọn tài khoản') {
    super(message);
    this.name = 'TikTokAccountRequired';
  }
}

interface LinkRow {
  token_enc: string | null;
  advertiser_id: string | null;
  advertiser_name: string | null;
  store_id: string | null;
  store_name: string | null;
  currency: string | null;
}

function row(shopId: string): LinkRow | null {
  return (
    (getDb()
      .prepare('SELECT token_enc, advertiser_id, advertiser_name, store_id, store_name, currency FROM tiktok_links WHERE shop_id = ?')
      .get(shopId) as LinkRow | undefined) ?? null
  );
}

/** Token đã giải mã (JSON) của shop; không có / sai khoá → null */
export function readTokenJson(shopId = currentShopId()): unknown | null {
  const enc = row(shopId)?.token_enc;
  if (!enc) return null;
  const plain = decrypt(enc);
  return plain ? parseJson(plain, null) : null;
}

/** Ghi token (mã hoá). Giữ nguyên tài khoản đang chọn. */
export function writeTokenJson(token: object, shopId = currentShopId()) {
  getDb()
    .prepare(
      `INSERT INTO tiktok_links (shop_id, token_enc) VALUES (?, ?)
       ON CONFLICT(shop_id) DO UPDATE SET token_enc = excluded.token_enc`,
    )
    .run(shopId, encrypt(JSON.stringify(token)));
}

/** Ngắt kết nối: xoá token + tài khoản đang chọn */
export function clearLink(shopId = currentShopId()) {
  getDb().prepare('DELETE FROM tiktok_links WHERE shop_id = ?').run(shopId);
}

/** Tài khoản đang chọn; null nếu chưa chọn */
export function getAccount(shopId = currentShopId()): TikTokAccount | null {
  const r = row(shopId);
  if (!r?.advertiser_id || !r.store_id) return null;
  return {
    advertiserId: r.advertiser_id,
    advertiserName: r.advertiser_name,
    storeId: r.store_id,
    storeName: r.store_name,
    currency: r.currency || 'VND',
  };
}

/** Tài khoản đang chọn — bắt buộc (gọi TikTok cần biết tài khoản nào) */
export function requireAccount(): TikTokAccount {
  const a = getAccount();
  if (!a) throw new TikTokAccountRequired();
  return a;
}

/** Chọn / bỏ chọn tài khoản (null = bỏ chọn, chờ chọn lại) */
export function setAccount(account: TikTokAccount | null, shopId = currentShopId()) {
  getDb()
    .prepare(
      `INSERT INTO tiktok_links (shop_id, advertiser_id, advertiser_name, store_id, store_name, currency) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(shop_id) DO UPDATE SET advertiser_id = excluded.advertiser_id, advertiser_name = excluded.advertiser_name,
         store_id = excluded.store_id, store_name = excluded.store_name, currency = excluded.currency`,
    )
    .run(
      shopId,
      account?.advertiserId ?? null,
      account?.advertiserName ?? null,
      account?.storeId ?? null,
      account?.storeName ?? null,
      account?.currency ?? null,
    );
}
