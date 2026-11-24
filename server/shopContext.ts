import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Shop đang xử lý (mỗi khách có 1 hoặc nhiều shop — Sếp chốt 23/11). Đặt 1 lần ở điểm vào
 * (request: middleware `requireShop`; lịch Agent: vòng lặp từng shop) rồi mọi hàm dữ liệu bên dưới
 * (thiết lập, Agent, theo dõi, số liệu, token TikTok) tự đọc qua `currentShopId()` — kể cả sau await / setTimeout.
 * Không có shop → lỗi ngay (không bao giờ rơi về dữ liệu shop khác).
 */

const als = new AsyncLocalStorage<{ shopId: string }>();

export class NoShopError extends Error {
  constructor() {
    super('Chưa chọn shop');
    this.name = 'NoShopError';
  }
}

export function withShop<T>(shopId: string, fn: () => T): T {
  return als.run({ shopId }, fn);
}

/** Chỉ cho test (VITEST): shop mặc định khi test gọi thẳng hàm, không qua withShop */
let testShop: string | null = null;
export function setTestShop(id: string | null) {
  if (!process.env.VITEST) throw new Error('setTestShop chỉ dùng trong test');
  testShop = id;
}

export function currentShopId(): string {
  const s = als.getStore();
  if (s) return s.shopId;
  if (testShop && process.env.VITEST) return testShop;
  throw new NoShopError();
}

/** null khi không ở trong shop nào (vd việc chung của hệ thống) */
export const maybeShopId = (): string | null => als.getStore()?.shopId ?? (process.env.VITEST ? testShop : null);
