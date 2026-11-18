import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdsSnapshot } from '../shared/adsSnapshot';
import type { AgentConfig, AgentRuntime } from '../shared/agentTypes';
import { campaign, GUARDRAILS, product, rule, settingsWith, snapshot, video } from './fixtures';

/* Bộ máy Agent chạy trên dữ liệu giả: không gọi TikTok, không đọc / ghi file thật */
const mock = vi.hoisted(() => ({
  snapshot: null as unknown as AdsSnapshot,
  config: null as unknown as AgentConfig,
  runtime: null as unknown as AgentRuntime,
  settings: null as unknown,
}));

vi.mock('../server/ads/cache', () => ({
  todayVN: () => '2026-11-18',
  getSnapshot: vi.fn(async () => ({ snapshot: mock.snapshot, cached: true })),
}));
vi.mock('../server/store', () => ({
  getAgentConfig: () => mock.config,
  getSettings: () => mock.settings,
  updateRuntime: (fn: (r: AgentRuntime) => AgentRuntime | void) => {
    mock.runtime = fn(mock.runtime) ?? mock.runtime;
    return mock.runtime;
  },
}));

const { runAgent } = await import('../server/agent/engine');
const cache = await import('../server/ads/cache');

/** 3 video lỗ (chi ≥ 100k, 0 đơn), 1 video tốt, 1 video cần ủy quyền có doanh thu */
function shop(): AdsSnapshot {
  return snapshot({
    campaigns: [campaign({ id: 'c1', targetRoi: 5, budget: 1_000_000 })],
    products: [product({ id: 'p1', campaignId: 'c1' })],
    videos: [
      video({ id: 'v1', campaignId: 'c1', productId: 'p1', cost: 200_000 }),
      video({ id: 'v2', campaignId: 'c1', productId: 'p1', cost: 150_000 }),
      video({ id: 'v3', campaignId: 'c1', productId: 'p1', cost: 120_000 }),
      video({ id: 'v4', campaignId: 'c1', productId: 'p1', cost: 300_000, revenue: 3_000_000, orders: 6 }),
      video({ id: 'v5', campaignId: 'c1', productId: 'p1', status: 'authorization_needed', revenue: 500_000, orders: 1 }),
    ],
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-18T05:00:00Z')); // 12:00 giờ VN
  mock.snapshot = shop();
  mock.settings = settingsWith();
  mock.runtime = { lastRunAt: null, lastRunError: null, proposals: [], actions: [] };
  mock.config = {
    paused: false,
    guardrails: { ...GUARDRAILS },
    rules: [
      rule({ id: 'cut', trigger: 'cut', actionType: 'remove_creative' }),
      rule({ id: 'remind', trigger: 'authorize', actionType: 'remind' }),
    ],
  };
});
afterEach(() => vi.useRealTimers());

describe('runAgent (giai đoạn B: chỉ đề xuất)', () => {
  it('tạm dừng → không làm gì', async () => {
    mock.config.paused = true;
    const s = await runAgent();
    expect(s.skipped).toBe('paused');
    expect(mock.runtime.proposals).toHaveLength(0);
  });

  it('tạo đề xuất gỡ cho 3 video lỗ + nhắc việc cho video cần ủy quyền', async () => {
    const s = await runAgent();
    expect(s.proposals).toBe(3);
    expect(s.reminders).toBe(1);
    expect(mock.runtime.proposals.every((p) => p.status === 'pending' && p.actionType === 'remove_creative')).toBe(true);
    expect(mock.runtime.actions[0]).toMatchObject({ actionType: 'remind', actor: 'agent' });
    // hạn 24 giờ
    const p = mock.runtime.proposals[0];
    expect(Date.parse(p.expiresAt) - Date.parse(p.createdAt)).toBe(24 * 3_600_000);
  });

  it('chạy lại ngay → không tạo trùng', async () => {
    await runAgent();
    const s = await runAgent();
    expect(s.proposals).toBe(0);
    expect(s.reminders).toBe(0);
    expect(mock.runtime.proposals).toHaveLength(3);
  });

  it('đề xuất bị bỏ qua vẫn tính thời gian chờ; quá thời gian chờ thì đề xuất lại', async () => {
    await runAgent();
    for (const p of mock.runtime.proposals) p.status = 'rejected';
    expect((await runAgent()).proposals).toBe(0);
    vi.setSystemTime(new Date('2026-11-19T06:00:00Z')); // +25 giờ
    expect((await runAgent()).proposals).toBe(3);
  });

  it('đề xuất quá hạn → expired', async () => {
    await runAgent();
    vi.setSystemTime(new Date('2026-11-19T06:00:00Z'));
    const s = await runAgent();
    expect(s.expired).toBe(3);
  });

  it('tôn trọng số thao tác tối đa / ngày', async () => {
    mock.config.guardrails.maxActionsPerDay = 2;
    const s = await runAgent();
    expect(s.proposals).toBe(2);
    expect(s.skippedTargets['Đủ số thao tác tối đa hôm nay']).toBe(1);
  });

  it('chiến dịch đang tắt → không đề xuất gỡ video', async () => {
    mock.snapshot.campaigns[0].status = 'paused';
    const s = await runAgent();
    expect(s.proposals).toBe(0);
    expect(s.skippedTargets['Chiến dịch đang tắt']).toBe(3);
  });

  it('tăng cường: vượt trần ngày thì dừng; video cần ủy quyền không được tăng cường', async () => {
    mock.config.rules = [rule({ id: 'boost', trigger: 'scale', actionType: 'boost_creative', params: { boostBudget: 300_000, boostDays: 1 } })];
    mock.config.guardrails.dailyBoostCap = 200_000;
    const s = await runAgent();
    expect(s.proposals).toBe(0);
    expect(s.skippedTargets['Vượt trần tăng cường hôm nay']).toBe(1);
  });

  it('đổi ngân sách vượt giới hạn % → đề xuất đúng mức giới hạn', async () => {
    mock.snapshot.campaigns[0] = campaign({ id: 'c1', budget: 1_000_000, cost: 7_000_000, revenue: 42_000_000, orders: 40, roi: 6, targetRoi: 5 });
    mock.config.rules = [rule({ id: 'up', level: 'campaign', trigger: 'c-scale', actionType: 'update_budget', params: { budgetChangePct: 80 } })];
    await runAgent();
    expect(mock.runtime.proposals[0].params.budgetChangePct).toBe(GUARDRAILS.maxBudgetIncreasePct);
  });

  it('quy tắc Tắt không chạy', async () => {
    mock.config.rules = mock.config.rules.map((r) => ({ ...r, mode: 'off' as const }));
    const s = await runAgent();
    expect(s.proposals + s.reminders).toBe(0);
  });

  it('Quét ngay (fresh) lấy số liệu mới, lịch tự động dùng cache', async () => {
    await runAgent({ fresh: true });
    expect(cache.getSnapshot).toHaveBeenLastCalledWith({ from: '2026-11-11', to: '2026-11-17' }, true);
    await runAgent();
    expect(cache.getSnapshot).toHaveBeenLastCalledWith({ from: '2026-11-11', to: '2026-11-17' }, false);
  });
});
