/** Dữ liệu mẫu nhỏ cho kiểm thử (KHÔNG dùng trên web, chỉ cho test) */
import type { AdsProduct, AdsSnapshot, AdsVideo, Campaign } from '../shared/adsSnapshot';
import type { AgentGuardrails, AgentRule } from '../shared/agentTypes';
import { normalizeSettings, type AdsSettings } from '../shared/settings';
import defaultsJson from '../src/data/ads-settings.json';

/** Bộ nhóm mặc định đúng như shop mới (Cắt lỗ theo "lần lợi nhuận 1 đơn" — Sếp chốt 26/11) */
export const SHIPPED_SETTINGS: AdsSettings = normalizeSettings(defaultsJson as AdsSettings, defaultsJson as AdsSettings);

/**
 * Bộ nhóm cho phần lớn test = shop đã thiết lập Cắt lỗ / Nhân rộng bằng điều kiện chung (bản lưu trước 26/11 — logic chung
 * vẫn xét điều kiện chung; từ 26/11 giao diện cấp video chỉ thiết lập theo sản phẩm, bản cũ được chuyển ở web).
 * Cắt lỗ ngưỡng cố định 100k để test hành vi khác không phụ thuộc ROI hoà vốn / giá. Ngưỡng "lần lợi nhuận 1 đơn" ở profitThreshold.test.ts.
 */
const n = (v: number) => ({ type: 'number' as const, n: v });
export const DEFAULT_SETTINGS: AdsSettings = {
  ...SHIPPED_SETTINGS,
  groups: SHIPPED_SETTINGS.groups.map((g) =>
    g.id === 'cut'
      ? {
          ...g,
          conditionSets: [
            { clauses: [{ metric: 'cost', op: 'gte', value: n(100_000) }, { metric: 'orders', op: 'eq', value: n(0) }] },
            { clauses: [{ metric: 'cost', op: 'gte', value: n(100_000) }, { metric: 'roi', op: 'lt', value: { type: 'breakEven', k: 1 } }] },
          ],
        }
      : g.id === 'scale'
        ? {
            ...g,
            conditionSets: [{ clauses: [{ metric: 'orders', op: 'gte', value: n(3) }, { metric: 'roi', op: 'gte', value: { type: 'target', k: 1.2 } }] }],
          }
        : g,
  ),
};

export function settingsWith(breakEvenRoi: Record<string, number> = {}): AdsSettings {
  return { ...DEFAULT_SETTINGS, breakEvenRoi };
}

export function campaign(p: Partial<Campaign> & { id: string }): Campaign {
  return {
    name: `Chiến dịch ${p.id}`,
    status: 'running',
    selectedVideos: null,
    budget: 1_000_000,
    cost: 0,
    revenue: 0,
    orders: 0,
    roi: null,
    targetRoi: 5,
    hasSuggestion: false,
    ...p,
  };
}

export function product(p: Partial<AdsProduct> & { id: string; campaignId: string }): AdsProduct {
  return { name: `Sản phẩm ${p.id}`, imageUrl: null, videoCount: null, cost: 0, revenue: 0, orders: 0, roi: null, ...p };
}

export function video(p: Partial<AdsVideo> & { id: string; campaignId: string; productId: string }): AdsVideo {
  const cost = p.cost ?? 0;
  const revenue = p.revenue ?? 0;
  return {
    contentType: 'video',
    title: `Video ${p.id}`,
    thumbnailUrl: null,
    identityName: null,
    authorUsername: null,
    status: 'delivering',
    cost,
    revenue,
    orders: 0,
    roi: cost > 0 ? revenue / cost : null,
    ...p,
  };
}

export function snapshot(p: Partial<AdsSnapshot> = {}): AdsSnapshot {
  return {
    updatedAt: '2026-11-18T00:00:00Z',
    range: { from: '2026-11-11', to: '2026-11-17' },
    advertiser: null,
    summary: {
      totalCost: null,
      totalRevenue: null,
      totalOrders: null,
      roi: null,
      videosWithSpend7d: null,
      boostedVideos: null,
      pendingSuggestions: null,
      activeRules: null,
      totalRules: null,
    },
    campaigns: [],
    products: [],
    videos: [],
    ...p,
  };
}

export const GUARDRAILS: AgentGuardrails = {
  dailyBoostCap: 1_000_000,
  maxActionsPerDay: 20,
  cooldownHours: 24,
  evaluateAfterHours: 24,
  maxBudgetIncreasePct: 30,
  maxBudgetDecreasePct: 30,
};

export function rule(p: Partial<AgentRule> & { id: string; trigger: string }): AgentRule {
  return {
    name: p.id,
    level: 'video',
    actionType: 'remind',
    params: {},
    mode: 'approve',
    cooldownHours: 24,
    campaignIds: null,
    productIds: null,
    ...p,
  };
}
