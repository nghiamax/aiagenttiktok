import type { Role } from './permissions.js';

/**
 * Gói dùng mục Tài chính (dùng chung web + server).
 *  - Miễn phí: Tính giá bán tối đa FREE_PRICING_CALCS lượt, Tính lợi nhuận tối đa FREE_PROFIT_ORDERS đơn (cả đời tài khoản,
 *    mỗi mã đơn tính 1 lần), không có Tính hàng loạt.
 *  - Pro: không giới hạn + Tính hàng loạt.
 * Chủ shop luôn như Pro. Server đếm lượt (server-data/usage.json) — web chỉ hiển thị.
 */

export type Plan = 'free' | 'pro';

export const PLANS: Plan[] = ['free', 'pro'];
export const PLAN_LABEL: Record<Plan, string> = { free: 'Miễn phí', pro: 'Pro' };
export const isPlan = (v: unknown): v is Plan => v === 'free' || v === 'pro';

/** Số lượt Tính giá bán miễn phí */
export const FREE_PRICING_CALCS = 100;

/** Số đơn hàng Tính lợi nhuận miễn phí (đếm theo mã đơn khác nhau) */
export const FREE_PROFIT_ORDERS = 100;

export interface PlanHolder {
  role: Role;
  plan?: Plan;
  proUntil?: string | null;
}

/** Gói đang có hiệu lực: Chủ shop = Pro; Pro hết hạn = Miễn phí */
export function effectivePlan(u: PlanHolder, now = Date.now()): Plan {
  if (u.role === 'owner') return 'pro';
  if (u.plan !== 'pro') return 'free';
  return !u.proUntil || Date.parse(u.proUntil) > now ? 'pro' : 'free';
}

export interface FinanceQuota {
  plan: Plan;
  proUntil: string | null;
  /** Không giới hạn lượt (Pro) */
  unlimited: boolean;
  used: number;
  limit: number | null;
  remaining: number | null;
  /** Được dùng Tính hàng loạt */
  bulk: boolean;
  /** Nhớ giá vốn theo SKU giữa các lần tải file (chỉ Pro) */
  rememberCosts: boolean;
  /** Tính lợi nhuận: số đơn đã dùng / giới hạn (Pro: limit null) */
  profitUsed: number;
  profitLimit: number | null;
  profitRemaining: number | null;
}

export function quotaOf(u: PlanHolder, used: number, now = Date.now(), profitUsed = 0): FinanceQuota {
  const plan = effectivePlan(u, now);
  const pro = plan === 'pro';
  return {
    plan,
    proUntil: u.role === 'owner' ? null : (u.proUntil ?? null),
    unlimited: pro,
    used,
    limit: pro ? null : FREE_PRICING_CALCS,
    remaining: pro ? null : Math.max(0, FREE_PRICING_CALCS - used),
    bulk: pro,
    rememberCosts: pro,
    profitUsed,
    profitLimit: pro ? null : FREE_PROFIT_ORDERS,
    profitRemaining: pro ? null : Math.max(0, FREE_PROFIT_ORDERS - profitUsed),
  };
}

/**
 * Cấp phép đơn cho Tính lợi nhuận (gói Miễn phí): đơn đã đếm luôn được tính lại; đơn mới được thêm tới khi đủ `limit`.
 * Trả { allowed, counted } — counted = danh sách đã đếm sau khi thêm.
 */
export function grantOrders(counted: string[], requested: string[], limit: number): { allowed: string[]; counted: string[] } {
  const seen = new Set(counted);
  const next = [...counted];
  const allowed: string[] = [];
  for (const id of new Set(requested)) {
    if (seen.has(id)) allowed.push(id);
    else if (next.length < limit) {
      seen.add(id);
      next.push(id);
      allowed.push(id);
    }
  }
  return { allowed, counted: next };
}
