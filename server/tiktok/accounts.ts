import { getAgentConfig, saveAgentConfig, updateRuntime } from '../store.js';
import { getDb } from '../db/index.js';
import { currentShopId } from '../shopContext.js';
import { callReadTool } from './mcpClient.js';
import { getAccount, setAccount, type TikTokAccount } from './link.js';

/*
 * Chọn tài khoản quảng cáo + shop TikTok cho shop (sửa lỗi 23/11: Kết nối tài khoản khác mà server vẫn gọi ID NECOTECH).
 * CHỈ ĐỌC TikTok: auth_advertiser_get (tài khoản token được quyền) + gmv_max_store_list_get (shop GMV Max của từng tài khoản).
 */

export interface StoreOption {
  storeId: string;
  storeName: string | null;
  /** Shop đã cấp quyền GMV Max độc quyền cho đúng tài khoản này (cần để đổi ngân sách / ROI / sản phẩm) */
  exclusive: boolean;
  /** Tài khoản quảng cáo đang giữ quyền GMV Max độc quyền của shop (null = chưa cấp cho ai) */
  exclusiveAdvertiserId: string | null;
}

export interface AdvertiserOption {
  advertiserId: string;
  advertiserName: string | null;
  currency: string | null;
  stores: StoreOption[];
  /** Không đọc được danh sách shop của tài khoản này (thiếu quyền…) */
  error?: string;
}

interface AdvertiserListData {
  list?: { advertiser_id?: string | number; advertiser_name?: string; currency?: string }[];
}
interface StoreListData {
  store_list?: {
    store_id?: string;
    store_name?: string;
    exclusive_authorized_advertiser_info?: { advertiser_id?: string };
  }[];
}

/**
 * TikTok có thể trả cùng 1 shop nhiều lần cho 1 tài khoản (shop có nhiều vai trò trong Business Center — thấy 23/11)
 * → gộp theo store_id, giữ thông tin quyền độc quyền nếu dòng nào có.
 */
export function dedupeStores(list: StoreOption[]): StoreOption[] {
  const by = new Map<string, StoreOption>();
  for (const s of list) {
    const prev = by.get(s.storeId);
    by.set(
      s.storeId,
      prev
        ? {
            storeId: s.storeId,
            storeName: prev.storeName ?? s.storeName,
            exclusive: prev.exclusive || s.exclusive,
            exclusiveAdvertiserId: prev.exclusiveAdvertiserId ?? s.exclusiveAdvertiserId,
          }
        : s,
    );
  }
  return [...by.values()];
}

/** Đọc các tài khoản quảng cáo token được quyền + shop GMV Max của từng tài khoản */
export async function listAccounts(): Promise<AdvertiserOption[]> {
  const data = await callReadTool<AdvertiserListData>('auth_advertiser_get', {});
  const advertisers = (data.list ?? [])
    .filter((a) => a.advertiser_id !== undefined && a.advertiser_id !== null)
    .map((a) => ({ advertiserId: String(a.advertiser_id), advertiserName: a.advertiser_name ?? null, currency: a.currency ?? null }));
  const out: AdvertiserOption[] = [];
  for (const a of advertisers) {
    try {
      const s = await callReadTool<StoreListData>('gmv_max_store_list_get', { advertiser_id: a.advertiserId });
      out.push({
        ...a,
        stores: dedupeStores(
          (s.store_list ?? [])
            .filter((x) => x.store_id)
            .map((x) => ({
              storeId: String(x.store_id),
              storeName: x.store_name ?? null,
              exclusive: x.exclusive_authorized_advertiser_info?.advertiser_id === a.advertiserId,
              exclusiveAdvertiserId: x.exclusive_authorized_advertiser_info?.advertiser_id ?? null,
            })),
        ),
      });
    } catch (e) {
      out.push({ ...a, stores: [], error: (e as Error).message.slice(0, 200) });
    }
  }
  return out;
}

const toAccount = (a: AdvertiserOption, s: StoreOption): TikTokAccount => ({
  advertiserId: a.advertiserId,
  advertiserName: a.advertiserName,
  storeId: s.storeId,
  storeName: s.storeName,
  currency: a.currency || 'VND',
});

/**
 * Sau khi Kết nối: tài khoản đang chọn còn trong danh sách → giữ (cập nhật tên); chỉ có đúng 1 cặp (tài khoản, shop)
 * hoặc đúng 1 cặp có quyền GMV Max độc quyền → tự chọn;
 * còn lại → bỏ chọn để chủ shop chọn trên web. Trả tài khoản đang dùng (null = cần chọn).
 */
export function pickAccount(options: AdvertiserOption[], current: TikTokAccount | null): TikTokAccount | null {
  const pairs = options.flatMap((a) => a.stores.map((s) => ({ a, s })));
  if (current) {
    const same = pairs.find((p) => p.a.advertiserId === current.advertiserId && p.s.storeId === current.storeId);
    if (same) return toAccount(same.a, same.s);
  }
  if (pairs.length === 1) return toAccount(pairs[0].a, pairs[0].s);
  // Mỗi shop chỉ cấp quyền GMV Max độc quyền cho 1 tài khoản → cặp có quyền đó là cặp đang chạy quảng cáo
  const exclusive = pairs.filter((p) => p.s.exclusive);
  return exclusive.length === 1 ? toAccount(exclusive[0].a, exclusive[0].s) : null;
}

/** Chạy sau khi lưu token mới: liệt kê + tự chọn. Lỗi đọc TikTok → giữ nguyên, web sẽ cho chọn lại. */
export async function autoSelectAccount(): Promise<TikTokAccount | null> {
  const current = getAccount();
  try {
    const options = await listAccounts();
    // TikTok không trả tài khoản / shop nào (trả lạ, đang trục trặc) → không đoán, giữ nguyên tài khoản đang dùng
    if (!options.some((a) => a.stores.length > 0)) return current;
    const next = pickAccount(options, current);
    applyAccount(next);
    return next;
  } catch (e) {
    console.warn('[tiktok] Không đọc được danh sách tài khoản quảng cáo:', (e as Error).message.slice(0, 200));
    return current;
  }
}

/** Chủ shop chọn trên web: chỉ nhận cặp (tài khoản, shop) có trong danh sách TikTok trả về */
export async function chooseAccount(advertiserId: string, storeId: string): Promise<TikTokAccount | null> {
  const options = await listAccounts();
  const a = options.find((x) => x.advertiserId === advertiserId);
  const s = a?.stores.find((x) => x.storeId === storeId);
  if (!a || !s) return null;
  const next = toAccount(a, s);
  applyAccount(next);
  return next;
}

/**
 * Lưu tài khoản. Đổi sang tài khoản / shop TikTok KHÁC: đề xuất đang chờ → không còn khớp, Agent tạm dừng
 * (chủ shop xem lại quy tắc rồi bật) — tránh duyệt nhầm việc của tài khoản cũ trên tài khoản mới.
 */
export function applyAccount(next: TikTokAccount | null) {
  const prev = getAccount();
  setAccount(next);
  // Tên shop trên web = tên shop TikTok (hoặc tài khoản quảng cáo) đang chạy — không bắt nhập tên
  const label = next?.storeName ?? next?.advertiserName;
  if (label) getDb().prepare('UPDATE shops SET name = ? WHERE id = ?').run(label.slice(0, 60), currentShopId());
  const changed = !!prev && (!next || prev.advertiserId !== next.advertiserId || prev.storeId !== next.storeId);
  if (!changed) return;
  const now = new Date().toISOString();
  updateRuntime((rt) => {
    for (const p of rt.proposals) {
      if (p.status !== 'pending') continue;
      p.status = 'outdated';
      p.decidedAt = now;
      p.note = 'Đã đổi tài khoản quảng cáo';
    }
  });
  if (!getAgentConfig().paused) saveAgentConfig({ paused: true });
  console.log(`[tiktok] Đổi tài khoản quảng cáo ${prev.advertiserId}/${prev.storeId} → ${next ? `${next.advertiserId}/${next.storeId}` : '(chưa chọn)'}: Agent tạm dừng`);
}
