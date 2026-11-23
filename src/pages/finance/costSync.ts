import { api } from '../../lib/api';
import type { Platform } from './pricing/calc';
import { readBulkCosts, replaceBulkCosts } from './pricing/bulk/useBulkStore';

/**
 * Giá vốn theo SKU lưu trên server theo tài khoản (nhớ giữa các lần tải file, mọi máy / trình duyệt).
 * Trình duyệt giữ bản sao (localStorage của Tính hàng loạt) để trang đọc ngay; mỗi lần sửa → đẩy lên server.
 */

const OWNER_KEY = 'finance-costs-owner';
const PLATFORMS: Platform[] = ['tiktok', 'shopee'];
const PUSH_DELAY_MS = 800;

type CostBook = Record<Platform, Record<string, number>>;

function getOwner(): string | null {
  try {
    return localStorage.getItem(OWNER_KEY);
  } catch {
    return null;
  }
}

/**
 * Tải giá vốn của tài khoản về trình duyệt (server là bản chính).
 * Giá vốn chỉ có trên máy này (nhập trước khi có đồng bộ / lúc mất mạng) và máy chưa thuộc người khác → đẩy lên.
 * Máy vừa dùng tài khoản khác → bỏ bản cũ của người đó.
 */
export async function pullCosts(userId: string): Promise<void> {
  const { costs, remember } = await api<{ costs: CostBook; remember: boolean }>('/finance/costs');
  // Gói Miễn phí: không nhớ giá vốn → không đồng bộ (trang dùng giá vốn tạm trong phiên)
  if (!remember) return;
  const owner = getOwner();
  const sameUser = owner === null || owner === userId;
  for (const p of PLATFORMS) {
    const server = costs[p] ?? {};
    const merged = { ...server };
    if (sameUser) {
      const localOnly: Record<string, number> = {};
      for (const [k, v] of Object.entries(readBulkCosts(p))) {
        if (!(k in server) && v > 0) localOnly[k] = merged[k] = v;
      }
      if (Object.keys(localOnly).length)
        await api('/finance/costs', { method: 'PUT', body: { platform: p, costs: localOnly } });
    }
    replaceBulkCosts(p, merged);
  }
  try {
    localStorage.setItem(OWNER_KEY, userId);
  } catch {
    /* bỏ qua */
  }
}

const pending: Record<Platform, Record<string, number>> = { tiktok: {}, shopee: {} };
const timers: Partial<Record<Platform, ReturnType<typeof setTimeout>>> = {};

/** Đẩy giá vốn vừa sửa lên server (gom các lần gõ liên tiếp); giá 0 = xoá */
export function pushCosts(p: Platform, changes: Record<string, number>) {
  if (!Object.keys(changes).length) return;
  Object.assign(pending[p], changes);
  clearTimeout(timers[p]);
  timers[p] = setTimeout(() => {
    const body = pending[p];
    pending[p] = {};
    void api('/finance/costs', { method: 'PUT', body: { platform: p, costs: body } }).catch(() => {
      // Lỗi mạng → giữ lại, lần sửa sau / lần mở trang sau đẩy tiếp
      pending[p] = { ...body, ...pending[p] };
    });
  }, PUSH_DELAY_MS);
}

/** Khác nhau giữa 2 bộ giá vốn → thay đổi cần đẩy (xoá = 0) */
export function diffCosts(prev: Record<string, number>, next: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(next)) if (prev[k] !== v) out[k] = v;
  for (const k of Object.keys(prev)) if (!(k in next)) out[k] = 0;
  return out;
}
