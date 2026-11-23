import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

/* Số lượt đã dùng ở mục Tài chính, theo tài khoản: server-data/usage.json (không commit) */

interface UsageEntry {
  pricingCalcs: number;
  lastCalcAt: string | null;
  /** Mã đơn đã tính ở Tính lợi nhuận (gói Miễn phí, tối đa FREE_PROFIT_ORDERS) */
  profitOrders?: string[];
}

const usageFile = () => path.join(config.dataDir, 'usage.json');

function readAll(): Record<string, UsageEntry> {
  try {
    const v = JSON.parse(fs.readFileSync(usageFile(), 'utf8')) as Record<string, UsageEntry>;
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

function writeAll(data: Record<string, UsageEntry>) {
  const p = usageFile();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, p);
}

export function pricingUsed(userId: string): number {
  return readAll()[userId]?.pricingCalcs ?? 0;
}

export function allPricingUsage(): Record<string, number> {
  return Object.fromEntries(Object.entries(readAll()).map(([id, e]) => [id, e.pricingCalcs ?? 0]));
}

export function profitOrdersUsed(userId: string): string[] {
  return readAll()[userId]?.profitOrders ?? [];
}

export function allProfitUsage(): Record<string, number> {
  return Object.fromEntries(Object.entries(readAll()).map(([id, e]) => [id, e.profitOrders?.length ?? 0]));
}

export function setProfitOrders(userId: string, ids: string[]) {
  const all = readAll();
  const cur = all[userId] ?? { pricingCalcs: 0, lastCalcAt: null };
  all[userId] = { ...cur, profitOrders: ids };
  writeAll(all);
}

/** +1 lượt Tính giá bán → số lượt sau khi cộng */
export function addPricingCalc(userId: string, now = new Date()): number {
  const all = readAll();
  const e = all[userId] ?? { pricingCalcs: 0, lastCalcAt: null };
  e.pricingCalcs += 1;
  e.lastCalcAt = now.toISOString();
  all[userId] = e;
  writeAll(all);
  return e.pricingCalcs;
}

export function resetPricingUsage(userId: string) {
  const all = readAll();
  delete all[userId];
  writeAll(all);
}
