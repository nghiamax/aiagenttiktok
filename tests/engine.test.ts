import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdsSnapshot } from '../shared/adsSnapshot';
import type { AgentActionLog, AgentConfig, AgentRuntime } from '../shared/agentTypes';
import { campaign, GUARDRAILS, product, rule, settingsWith, snapshot, video } from './fixtures';

/* Bộ máy Agent chạy trên dữ liệu giả: không gọi TikTok, không đọc / ghi file thật */
const mock = vi.hoisted(() => ({
  snapshot: null as unknown as AdsSnapshot,
  config: null as unknown as AgentConfig,
  runtime: null as unknown as AgentRuntime,
  settings: null as unknown,
  /** Snapshot riêng theo ngày bắt đầu (khung 14 / 30 ngày); thiếu → dùng snapshot chung */
  byFrom: {} as Record<string, AdsSnapshot>,
}));

vi.mock('../server/ads/cache', () => ({
  todayVN: () => '2026-11-18',
  getSnapshot: vi.fn(async (r: { from: string }) => ({ snapshot: mock.byFrom[r.from] ?? mock.snapshot, cached: true })),
}));
vi.mock('../server/store', () => ({
  getAgentConfig: () => mock.config,
  getSettings: () => mock.settings,
  getRuntime: () => mock.runtime,
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
  mock.byFrom = {};
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

  it('ghi lượt gần nhất là tự quét / Quét ngay + phiên bản code (phát hiện tiến trình cũ — lỗi 27/11)', async () => {
    await runAgent();
    expect(mock.runtime.lastRunTrigger).toBe('schedule');
    expect(mock.runtime).toHaveProperty('lastRunVersion');
    await runAgent({ fresh: true });
    expect(mock.runtime.lastRunTrigger).toBe('manual');
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

  it('quy tắc BOT chạy → đề xuất vào autoIds (scheduler thực thi); Cần duyệt → không', async () => {
    expect((await runAgent()).autoIds).toEqual([]);
    mock.runtime = { lastRunAt: null, lastRunError: null, proposals: [], actions: [] };
    mock.config.rules[0] = { ...mock.config.rules[0], mode: 'auto' };
    const s = await runAgent();
    expect(s.autoIds).toHaveLength(3);
    expect(s.autoIds.sort()).toEqual(mock.runtime.proposals.map((p) => p.id).sort());
    expect(mock.runtime.proposals.every((p) => p.ruleMode === 'auto' && !p.note)).toBe(true);
  });

  it('đề xuất đang chờ của quy tắc BOT chạy (lần trước BOT chưa chạy được) → lượt sau vào lại autoIds (lỗi hosting 27/11)', async () => {
    mock.config.rules[0] = { ...mock.config.rules[0], mode: 'auto' };
    const first = await runAgent();
    expect(first.autoIds).toHaveLength(3);
    // BOT chưa chạy được (vd đủ thao tác hôm qua) → vẫn pending; lượt sau thử lại, không tạo trùng
    vi.setSystemTime(new Date('2026-11-18T06:00:00Z'));
    const next = await runAgent();
    expect(next.proposals).toBe(0);
    expect(next.autoIds.sort()).toEqual(first.autoIds.sort());
    // Đổi quy tắc về Cần duyệt → không tự chạy nữa
    mock.config.rules[0] = { ...mock.config.rules[0], mode: 'approve' };
    expect((await runAgent()).autoIds).toEqual([]);
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

  it('đề xuất đang chờ mà số liệu mới không còn khớp → Không còn khớp (kèm lý do); còn khớp → cập nhật số', async () => {
    await runAgent();
    // v1 có lãi trở lại, v2 chi thêm
    mock.snapshot.videos[0] = video({ id: 'v1', campaignId: 'c1', productId: 'p1', cost: 200_000, revenue: 3_000_000, orders: 6 });
    mock.snapshot.videos[1] = video({ id: 'v2', campaignId: 'c1', productId: 'p1', cost: 180_000 });
    const s = await runAgent();
    expect(s.outdated).toBe(1);
    const byVideo = (id: string) => mock.runtime.proposals.find((p) => p.target.videoId === id)!;
    expect(byVideo('v1').status).toBe('outdated');
    expect(byVideo('v1').note).toMatch(/ROI 15,00 — không còn khớp quy tắc/);
    expect(byVideo('v2')).toMatchObject({ status: 'pending', before: { cost: 180_000 } });
    // không còn khớp không tính thời gian chờ → lỗ lại thì đề xuất lại ngay
    mock.snapshot = shop();
    expect((await runAgent()).proposals).toBe(1);
  });

  it('video có đơn bù ở sản phẩm khác → vẫn đề xuất, kèm offset; xét lại thì cập nhật / bỏ offset', async () => {
    mock.snapshot.videos.push(video({ id: 'v1', campaignId: 'c1', productId: 'p2', revenue: 900_000, orders: 2 }));
    await runAgent();
    const p = () => mock.runtime.proposals.find((x) => x.target.videoId === 'v1')!;
    expect(p().status).toBe('pending');
    expect(p().offset).toMatchObject({ revenue: 900_000, orders: 2, total: { cost: 200_000, revenue: 900_000 } });
    mock.snapshot.videos.pop();
    await runAgent();
    expect(p().offset).toBeUndefined();
  });

  it('quy tắc bị tắt → đề xuất đang chờ của nó chuyển Không còn khớp', async () => {
    await runAgent();
    mock.config.rules[0].mode = 'off';
    expect((await runAgent()).outdated).toBe(3);
    expect(mock.runtime.proposals.every((p) => p.status === 'outdated' && p.note === 'Quy tắc đã tắt')).toBe(true);
  });

  it('lệnh lỗi (chưa chạy được trên TikTok) không tính thời gian chờ', async () => {
    mock.runtime.actions.push({
      id: 'a1',
      executedAt: new Date().toISOString(),
      actor: 'approved',
      ruleId: 'cut',
      actionType: 'remove_creative',
      target: { campaignId: 'c1', productId: 'p1', videoId: 'v1' },
      params: {},
      before: { from: '', to: '', cost: 0, revenue: 0, orders: 0, roi: 0, breakEven: null },
      after: null,
      status: 'failed',
      error: 'NOT_AVAILABLE',
    });
    expect((await runAgent()).proposals).toBe(3);
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

  it('quy tắc chiến dịch theo nhóm cũ (đã thay bằng BOT chỉnh, Sếp chốt 26/11) → không chạy dù đang bật', async () => {
    mock.snapshot.campaigns[0] = campaign({ id: 'c1', budget: 1_000_000, cost: 7_000_000, revenue: 42_000_000, orders: 40, roi: 6, targetRoi: 5 });
    mock.config.rules = [rule({ id: 'up', level: 'campaign', trigger: 'c-scale', actionType: 'update_budget', params: { budgetChangePct: 20 } })];
    const s = await runAgent();
    expect(s.proposals + s.reminders).toBe(0);
  });

  it('BOT chỉnh: % ngân sách vượt giới hạn an toàn → đề xuất đúng mức giới hạn', async () => {
    mock.settings = { ...settingsWith({ pA: 3.5 }), campaignTune: { mode: 'growth' } };
    mock.config.guardrails = { ...GUARDRAILS, maxBudgetIncreasePct: 25 };
    mock.snapshot = snapshot({
      range: { from: '2026-11-12', to: '2026-11-18' },
      campaigns: [campaign({ id: 'c1', budget: 480_000, cost: 3.2e6, revenue: 14e6, orders: 40, targetRoi: 4 })],
      products: [product({ id: 'pA', campaignId: 'c1', revenue: 14e6, cost: 3.2e6, orders: 40 })],
    });
    const x2 = <T extends { cost: number | null; revenue: number | null; orders: number | null }>(r: T): T => ({ ...r, cost: r.cost! * 2, revenue: r.revenue! * 2, orders: r.orders! * 2 });
    mock.byFrom['2026-11-05'] = { ...mock.snapshot, range: { from: '2026-11-05', to: '2026-11-18' }, campaigns: mock.snapshot.campaigns.map(x2), products: mock.snapshot.products.map(x2) };
    mock.byFrom['2026-11-18'] = snapshot({ range: { from: '2026-11-18', to: '2026-11-18' } });
    mock.config.rules = [rule({ id: 'tune-campaign', level: 'campaign', trigger: 'c-tune', actionType: 'update_roi_target', params: {} })];
    await runAgent();
    expect(mock.runtime.proposals[0].params).toMatchObject({ budgetChangePct: 25, tune: { code: 'C1' } }); // Tăng trưởng +30% → kẹp 25%
  });

  it('BOT chỉnh chế độ Nhắc việc: chỉ nhắc chiến dịch cần Sếp quyết, không nhắc lại mỗi giờ', async () => {
    mock.settings = settingsWith({ pA: 4 });
    // Lỗ, tiêu ít, ROI thực 3 ≪ ROI MT 5 → B6 (cần Sếp quyết); chiến dịch c2 lời → không nhắc
    mock.snapshot = snapshot({
      range: { from: '2026-11-12', to: '2026-11-18' },
      campaigns: [
        campaign({ id: 'c1', budget: 2_000_000, cost: 3e6, revenue: 9e6, orders: 40, targetRoi: 5 }),
        campaign({ id: 'c2', budget: 2_000_000, cost: 3e6, revenue: 15e6, orders: 40, targetRoi: 4 }),
      ],
      products: [
        product({ id: 'pA', campaignId: 'c1', revenue: 9e6, cost: 3e6, orders: 40 }),
        product({ id: 'pA', campaignId: 'c2', revenue: 15e6, cost: 3e6, orders: 40 }),
      ],
    });
    const x2 = <T extends { cost: number | null; revenue: number | null; orders: number | null }>(r: T): T => ({ ...r, cost: r.cost! * 2, revenue: r.revenue! * 2, orders: r.orders! * 2 });
    mock.byFrom['2026-11-05'] = { ...mock.snapshot, range: { from: '2026-11-05', to: '2026-11-18' }, campaigns: mock.snapshot.campaigns.map(x2), products: mock.snapshot.products.map(x2) };
    mock.byFrom['2026-11-18'] = snapshot({ range: { from: '2026-11-18', to: '2026-11-18' } });
    mock.config.rules = [rule({ id: 'tune-remind', level: 'campaign', trigger: 'c-tune', actionType: 'remind', params: {}, cooldownHours: 24 })];
    expect((await runAgent()).reminders).toBe(1);
    expect(mock.runtime.actions[0]).toMatchObject({ actionType: 'remind', target: { campaignId: 'c1' } });
    expect((await runAgent()).reminders).toBe(0);
  });

  it('quy tắc Tắt không chạy', async () => {
    mock.config.rules = mock.config.rules.map((r) => ({ ...r, mode: 'off' as const }));
    const s = await runAgent();
    expect(s.proposals + s.reminders).toBe(0);
  });

  it('Quét ngay (fresh) lấy số liệu mới, lịch tự động dùng cache', async () => {
    vi.mocked(cache.getSnapshot).mockClear();
    await runAgent({ fresh: true });
    expect(cache.getSnapshot).toHaveBeenCalledWith({ from: '2026-11-12', to: '2026-11-18' }, true);
    expect(cache.getSnapshot).toHaveBeenCalledWith({ from: '2026-11-05', to: '2026-11-18' }, true); // 14 ngày
    expect(cache.getSnapshot).toHaveBeenCalledWith({ from: '2026-10-20', to: '2026-11-18' }, false); // 30 ngày dùng cache
    vi.mocked(cache.getSnapshot).mockClear();
    await runAgent();
    expect(cache.getSnapshot).toHaveBeenCalledWith({ from: '2026-11-12', to: '2026-11-18' }, false);
    expect(cache.getSnapshot).not.toHaveBeenCalledWith(expect.anything(), true);
  });

  describe('xác nhận bằng khung 14 ngày (Sếp chốt 22/11)', () => {
    /** 14 ngày: v1 vẫn lỗ (chi lớn, 0 đơn), v2 đã có lời → v2 chỉ lỗ trong 7 ngày */
    const d14 = () =>
      snapshot({
        range: { from: '2026-11-05', to: '2026-11-18' },
        campaigns: [campaign({ id: 'c1', targetRoi: 5, budget: 1_000_000 })],
        products: [product({ id: 'p1', campaignId: 'c1' })],
        videos: [
          video({ id: 'v1', campaignId: 'c1', productId: 'p1', cost: 400_000 }),
          video({ id: 'v2', campaignId: 'c1', productId: 'p1', cost: 300_000, revenue: 3_000_000, orders: 6 }),
          video({ id: 'v3', campaignId: 'c1', productId: 'p1', cost: 250_000 }),
          video({ id: 'v5', campaignId: 'c1', productId: 'p1', status: 'authorization_needed', revenue: 900_000, orders: 2 }),
        ],
      });

    it('7 + 14 ngày cùng Cắt lỗ → đề xuất (kèm số 14 / 30 ngày); chỉ lỗ 7 ngày → bỏ qua "chưa xác nhận"', async () => {
      mock.byFrom['2026-11-05'] = d14();
      mock.byFrom['2026-10-20'] = { ...d14(), range: { from: '2026-10-20', to: '2026-11-18' } };
      const s = await runAgent();
      const ids = mock.runtime.proposals.map((p) => p.target.videoId).sort();
      expect(ids).toEqual(['v1', 'v3']);
      expect(s.skippedTargets['Mới có dấu hiệu — 14 ngày chưa cùng nhóm']).toBe(1);
      const p1 = mock.runtime.proposals.find((p) => p.target.videoId === 'v1')!;
      expect(p1.windows?.d14).toMatchObject({ cost: 400_000, orders: 0 });
      expect(p1.long).toBe(true); // 30 ngày cũng Cắt lỗ
      // Cần ủy quyền theo trạng thái TikTok → không cần xác nhận
      expect(s.reminders).toBe(1);
    });

    it('lỗ âm thầm: 7 ngày chi 42k 0 đơn (chưa tới ngưỡng), 14 + 30 ngày Cắt lỗ → vẫn đề xuất gỡ; 7 ngày có lời → đang hồi phục', async () => {
      const add = (snap: AdsSnapshot, v: ReturnType<typeof video>) => ({ ...snap, videos: [...snap.videos, v] });
      mock.snapshot = add(add(shop(), video({ id: 'v9', campaignId: 'c1', productId: 'p1', cost: 42_000 })), video({ id: 'v8', campaignId: 'c1', productId: 'p1', cost: 40_000, revenue: 600_000, orders: 3 }));
      const long = (from: string, cost: number) =>
        add(add({ ...d14(), range: { from, to: '2026-11-18' } }, video({ id: 'v9', campaignId: 'c1', productId: 'p1', cost })), video({ id: 'v8', campaignId: 'c1', productId: 'p1', cost }));
      mock.byFrom['2026-11-05'] = long('2026-11-05', 120_000);
      mock.byFrom['2026-10-20'] = long('2026-10-20', 260_000);
      const s = await runAgent();
      const p9 = mock.runtime.proposals.find((p) => p.target.videoId === 'v9');
      expect(p9).toMatchObject({ actionType: 'remove_creative', slowLoss: true, long: true });
      expect(p9?.before.cost).toBe(42_000); // số 7 ngày
      expect(p9?.reason).toMatch(/Lỗ âm thầm/);
      expect(mock.runtime.proposals.some((p) => p.target.videoId === 'v8')).toBe(false);
      expect(s.skippedTargets['Đang hồi phục — 7 ngày gần nhất đã tốt lên']).toBe(1);
    });

    it('Sếp tắt xác nhận → chỉ xét 7 ngày như cũ', async () => {
      mock.byFrom['2026-11-05'] = d14();
      mock.config.guardrails = { ...mock.config.guardrails, confirmWindow: false };
      const s = await runAgent();
      expect(s.proposals).toBe(3);
    });

    it('đề xuất đang chờ: 14 ngày không còn cùng nhóm → tự huỷ (outdated) kèm lý do', async () => {
      await runAgent(); // tạo 3 đề xuất (14 ngày = chung snapshot → khớp)
      mock.byFrom['2026-11-05'] = d14();
      const s = await runAgent();
      const v2 = mock.runtime.proposals.find((p) => p.target.videoId === 'v2')!;
      expect(v2.status).toBe('outdated');
      expect(v2.note).toMatch(/Mới có dấu hiệu/);
      expect(s.outdated).toBe(1);
    });
  });
});

describe('BOT chỉnh ROI & ngân sách (Sếp chốt 26/11)', () => {
  it('quy tắc c-tune → đề xuất hành động + % riêng của chiến dịch, kèm mã tình huống', async () => {
    mock.settings = settingsWith({ pA: 3.5, pB: 4.5 });
    mock.snapshot = snapshot({
      range: { from: '2026-11-12', to: '2026-11-18' },
      campaigns: [campaign({ id: 'c1', cost: 3.2e6, revenue: 14e6, orders: 40, budget: 480_000, targetRoi: 4 })],
      products: [
        product({ id: 'pA', campaignId: 'c1', revenue: 10e6, cost: 2e6, orders: 30 }),
        product({ id: 'pB', campaignId: 'c1', revenue: 4e6, cost: 1.2e6, orders: 10 }),
      ],
    });
    // 14 ngày = 2 lần 7 ngày → khung B (7 ngày trước) cùng hướng; hôm nay chưa có số
    const x2 = <T extends { cost: number | null; revenue: number | null; orders: number | null }>(r: T): T => ({ ...r, cost: r.cost! * 2, revenue: r.revenue! * 2, orders: r.orders! * 2 });
    mock.byFrom['2026-11-05'] = { ...mock.snapshot, range: { from: '2026-11-05', to: '2026-11-18' }, campaigns: mock.snapshot.campaigns.map(x2), products: mock.snapshot.products.map(x2) };
    mock.byFrom['2026-11-18'] = snapshot({ range: { from: '2026-11-18', to: '2026-11-18' } });
    mock.config.rules = [rule({ id: 'tune-campaign', level: 'campaign', trigger: 'c-tune', actionType: 'update_roi_target', params: {} })];
    const s = await runAgent();
    expect(s.proposals).toBe(1);
    expect(mock.runtime.proposals[0]).toMatchObject({
      actionType: 'update_budget',
      target: { campaignId: 'c1' },
      params: { budgetChangePct: 20, tune: { code: 'C1', step: 1 } },
    });
    // Chạy lại: đề xuất đang chờ được giữ, không tạo trùng
    await runAgent();
    expect(mock.runtime.proposals.filter((p) => p.status === 'pending')).toHaveLength(1);
  });

  it('bước thử đã chạy + đo xong (2 ngày) → bước tiếp không bị thời gian chờ 72h của quy tắc chặn; Sếp bỏ qua thì vẫn chờ', async () => {
    mock.settings = settingsWith({ pA: 3.5, pB: 4.5 });
    mock.snapshot = snapshot({
      range: { from: '2026-11-12', to: '2026-11-18' },
      campaigns: [campaign({ id: 'c1', cost: 3.2e6, revenue: 14e6, orders: 40, budget: 480_000, targetRoi: 4 })],
      products: [
        product({ id: 'pA', campaignId: 'c1', revenue: 10e6, cost: 2e6, orders: 30 }),
        product({ id: 'pB', campaignId: 'c1', revenue: 4e6, cost: 1.2e6, orders: 10 }),
      ],
    });
    const x2 = <T extends { cost: number | null; revenue: number | null; orders: number | null }>(r: T): T => ({ ...r, cost: r.cost! * 2, revenue: r.revenue! * 2, orders: r.orders! * 2 });
    mock.byFrom['2026-11-05'] = { ...mock.snapshot, range: { from: '2026-11-05', to: '2026-11-18' }, campaigns: mock.snapshot.campaigns.map(x2), products: mock.snapshot.products.map(x2) };
    mock.byFrom['2026-11-18'] = snapshot({ range: { from: '2026-11-18', to: '2026-11-18' } });
    const goodDay = (date: string) => ({ date, cost: 0.48e6, revenue: 2.2e6, orders: 7, roi: 4.6 });
    mock.runtime.actions = [
      {
        id: 'a1',
        executedAt: '2026-11-15T17:00:00Z', // 60 giờ trước
        actor: 'approved',
        ruleId: 'tune-campaign',
        actionType: 'update_budget',
        target: { campaignId: 'c1', productId: '', videoId: '' },
        params: { budgetChangePct: 20, prev: { budget: 400_000 }, next: { budget: 480_000 }, tune: { code: 'C1', step: 1 } },
        before: { from: '2026-11-08T00:00:00+07:00', to: '2026-11-15T00:00:00+07:00', cost: 2.8e6, revenue: 12e6, orders: 40, roi: 4.3, breakEven: 3.74 },
        after: { from: '', to: '', cost: 0.96e6, revenue: 4.4e6, orders: 14, roi: 4.6, breakEven: null, days: [goodDay('2026-11-16'), goodDay('2026-11-17')] },
        status: 'success',
      },
    ];
    mock.config.rules = [rule({ id: 'tune-campaign', level: 'campaign', trigger: 'c-tune', actionType: 'update_roi_target', params: {}, cooldownHours: 72 })];
    expect((await runAgent()).proposals).toBe(1);
    expect(mock.runtime.proposals[0].params.tune).toMatchObject({ code: 'C1', step: 2 });
    // Sếp bỏ qua → lượt sau không đề xuất lại trong 72h
    mock.runtime.proposals[0].status = 'rejected';
    expect((await runAgent()).proposals).toBe(0);
  });
});

describe('Gỡ sai → Thêm lại video theo chế độ quy tắc (Sếp chốt 28/11)', () => {
  /** Lần gỡ video v9 ngày 15/11: tính đủ ngày gỡ + đơn về sau → ROI 5,03 ≥ hoà vốn 3,5 = Gỡ sai */
  function wrongCut(over: Partial<AgentActionLog> = {}): AgentActionLog {
    return {
      id: 'cut-v9',
      executedAt: '2026-11-15T03:00:00Z',
      actor: 'agent',
      ruleId: 'cut',
      actionType: 'remove_creative',
      target: { campaignId: 'c1', productId: 'p1', videoId: 'v9' },
      params: {},
      before: { from: '2026-11-09T00:00:00+07:00', to: '2026-11-14T23:59:59+07:00', cost: 382_000, revenue: 878_000, orders: 2, roi: 2.3, breakEven: 3.5 },
      beforeFull: { from: '2026-11-09', to: '2026-11-15', cost: 436_000, revenue: 1_756_000, orders: 4, at: '2026-11-17T00:00:00Z' },
      after: {
        from: '2026-11-16T00:00:00+07:00',
        to: '2026-11-17T23:59:59+07:00',
        cost: 0,
        revenue: 439_000,
        orders: 1,
        roi: null,
        breakEven: 3.5,
        days: [
          { date: '2026-11-16', cost: 0, revenue: 439_000, orders: 1, roi: null },
          { date: '2026-11-17', cost: 0, revenue: 0, orders: 0, roi: null },
        ],
      },
      status: 'success',
      ...over,
    };
  }
  const reAdds = () => mock.runtime.proposals.filter((p) => p.reAddOf);

  it('quy tắc Cần duyệt → đề xuất Thêm lại ở Chờ duyệt (không tự chạy), lý do ghi rõ gỡ sai', async () => {
    mock.runtime.actions = [wrongCut()];
    const s = await runAgent();
    expect(reAdds()).toHaveLength(1);
    const p = reAdds()[0];
    expect(p).toMatchObject({ actionType: 'add_creative', ruleId: 'cut', ruleMode: 'approve', reAddOf: 'cut-v9', status: 'pending' });
    expect(p.target.videoId).toBe('v9');
    expect(p.reason).toMatch(/^Gỡ sai — video có lãi: tính đủ 09\/11–17\/11 .*ROI lúc gỡ 5,03 ≥ hoà vốn 3,5/);
    expect(s.autoIds).not.toContain(p.id);
    // Lượt sau không tạo trùng
    await runAgent();
    expect(reAdds()).toHaveLength(1);
  });

  it('quy tắc BOT chạy → đề xuất vào autoIds (BOT tự thêm lại)', async () => {
    mock.config.rules[0] = { ...mock.config.rules[0], mode: 'auto' };
    mock.runtime.actions = [wrongCut()];
    const s = await runAgent();
    expect(reAdds()[0].ruleMode).toBe('auto');
    expect(s.autoIds).toContain(reAdds()[0].id);
  });

  it('quy tắc Tắt → không làm; gỡ thủ công → đề xuất Cần duyệt (không theo quy tắc)', async () => {
    mock.config.rules[0] = { ...mock.config.rules[0], mode: 'off' };
    mock.runtime.actions = [wrongCut()];
    await runAgent();
    expect(reAdds()).toHaveLength(0);
    mock.runtime.actions = [wrongCut({ ruleId: null, actor: 'manual' })];
    const s = await runAgent();
    expect(reAdds()[0]).toMatchObject({ ruleId: '', ruleMode: 'approve' });
    expect(s.autoIds).toHaveLength(0);
  });

  it('không thêm lại: chưa đủ số ngày gỡ / Sếp đã bỏ qua / video đã có thao tác mới / đã hoàn tác / video đang chạy lại', async () => {
    mock.runtime.actions = [wrongCut({ beforeFull: undefined })];
    await runAgent();
    expect(reAdds()).toHaveLength(0);

    mock.runtime.actions = [wrongCut()];
    await runAgent();
    reAdds()[0].status = 'rejected';
    await runAgent();
    expect(reAdds()).toHaveLength(1);

    mock.runtime.proposals = [];
    mock.runtime.actions = [
      wrongCut(),
      { ...wrongCut({ id: 'manual-add', actionType: 'add_creative', actor: 'manual', ruleId: null }), executedAt: '2026-11-17T03:00:00Z' },
    ];
    await runAgent();
    expect(reAdds()).toHaveLength(0);

    mock.runtime.actions = [wrongCut({ status: 'undone' })];
    await runAgent();
    expect(reAdds()).toHaveLength(0);

    mock.runtime.actions = [wrongCut()];
    mock.snapshot.videos.push(video({ id: 'v9', campaignId: 'c1', productId: 'p1', cost: 10_000, status: 'delivering' }));
    await runAgent();
    expect(reAdds()).toHaveLength(0);
  });

  it('đề xuất thêm lại đang chờ mà video đã chạy lại → Không còn khớp', async () => {
    mock.runtime.actions = [wrongCut()];
    await runAgent();
    mock.snapshot.videos.push(video({ id: 'v9', campaignId: 'c1', productId: 'p1', cost: 10_000, status: 'delivering' }));
    await runAgent();
    expect(reAdds()[0]).toMatchObject({ status: 'outdated', note: 'Video chưa bị gỡ' });
  });

  it('video vừa thêm lại vì gỡ sai → quy tắc gỡ bỏ qua video đó 7 ngày', async () => {
    mock.runtime.actions = [
      { ...wrongCut({ id: 'readd-v1', actionType: 'add_creative', reAddOf: 'x', target: { campaignId: 'c1', productId: 'p1', videoId: 'v1' } }), executedAt: '2026-11-17T03:00:00Z' },
    ];
    const s = await runAgent();
    expect(mock.runtime.proposals.filter((p) => p.actionType === 'remove_creative').map((p) => p.target.videoId).sort()).toEqual(['v2', 'v3']);
    expect(s.skippedTargets['Vừa thêm lại vì gỡ sai — chưa gỡ lại']).toBe(1);
  });
});
