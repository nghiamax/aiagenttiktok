import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdsSnapshot } from '../shared/adsSnapshot';
import type { AgentActionLog, AgentRuntime } from '../shared/agentTypes';
import { evaluateAction, firstAfterReadyAt, summarizeAction } from '../src/pages/ads/agent/evaluate';
import { campaign, GUARDRAILS, product, snapshot, video } from './fixtures';

/* "Sau thao tác" theo khối 24h (báo cáo theo giờ, CHỈ ĐỌC) + câu kết luận — TikTok giả, cache ở thư mục tạm */
const mock = vi.hoisted(() => ({
  runtime: null as unknown as AgentRuntime,
  snapshot: null as unknown as AdsSnapshot,
  /** Dòng theo giờ: [chiến dịch, sản phẩm, item_id, "yyyy-MM-dd HH:00:00", chi, DT, đơn] */
  hours: [] as [string, string, string, string, number, number, number][],
  calls: [] as string[],
  writes: 0,
}));

vi.mock('../server/config', () => ({
  config: { dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'after-')), tiktok: { advertiserId: 'adv', storeId: 'store' } },
}));
vi.mock('../server/ads/cache', () => ({
  todayVN: () => '2026-11-23',
  getSnapshot: async () => ({ snapshot: mock.snapshot, cached: true }),
}));
vi.mock('../server/store', () => ({
  getAgentConfig: () => ({ paused: false, rules: [], guardrails: GUARDRAILS }),
  getRuntime: () => structuredClone(mock.runtime),
  updateRuntime: (fn: (r: AgentRuntime) => AgentRuntime | void) => {
    const r = structuredClone(mock.runtime);
    mock.runtime = fn(r) ?? r;
    return mock.runtime;
  },
}));
vi.mock('../server/tiktok/mcpClient', () => ({
  callReadTool: async (tool: string, p: { start_date: string; filtering: { campaign_ids: string[]; item_group_ids?: string[] } }) => {
    if (tool !== 'gmv_max_report_get') throw new Error(`tool lạ ${tool}`);
    const [c] = p.filtering.campaign_ids;
    const pid = p.filtering.item_group_ids?.[0];
    mock.calls.push(`${p.start_date}|${c}|${pid ?? '-'}`);
    const list = mock.hours
      .filter(([hc, hp, , h]) => hc === c && (!pid || hp === pid) && h.startsWith(p.start_date))
      .map(([, , item, h, cost, rev, ord]) => ({
        dimensions: { item_id: item, stat_time_hour: h },
        metrics: { cost: String(cost), gross_revenue: String(rev), orders: String(ord) },
      }));
    return { list, page_info: { total_page: 1 } };
  },
  callWithRetry: async () => {
    mock.writes++;
    throw new Error('không được gọi tool ghi');
  },
}));

const m = await import('../server/agent/afterMetrics');

const BEFORE = {
  from: '2026-11-12T00:00:00+07:00',
  to: '2026-11-18T23:59:59+07:00',
  cost: 700_000,
  revenue: 840_000,
  orders: 2,
  roi: 1.2,
  breakEven: 4.5,
};
const AT = '2026-11-19T07:37:00Z'; // 14:37 giờ VN
const NOW = Date.parse('2026-11-21T10:00:00Z'); // 17:00 21/11 → đủ 2 khối (hết 15:00 21/11 + 1h)

function action(over: Partial<AgentActionLog> = {}): AgentActionLog {
  return {
    id: 'a1',
    executedAt: AT,
    actor: 'approved',
    ruleId: 'r1',
    actionType: 'remove_creative',
    target: { campaignId: 'c1', productId: 'p1', videoId: 'v1' },
    params: {},
    before: { ...BEFORE },
    after: null,
    status: 'success',
    ...over,
  };
}

beforeEach(() => {
  mock.runtime = { lastRunAt: null, proposals: [], actions: [] };
  mock.snapshot = snapshot({
    campaigns: [campaign({ id: 'c1' })],
    products: [product({ id: 'p1', campaignId: 'c1' }), product({ id: 'p2', campaignId: 'c1' })],
    videos: [video({ id: 'v1', campaignId: 'c1', productId: 'p1' }), video({ id: 'v1', campaignId: 'c1', productId: 'p2' })],
  });
  mock.hours = [];
  mock.calls = [];
  mock.writes = 0;
});

describe('afterBlocks / blockMetrics', () => {
  it('khối bắt đầu ở giờ tròn kế tiếp, dài 24h, có số sau khi hết khối + 1h, tối đa 7', () => {
    expect(m.afterBlocks(AT, Date.parse('2026-11-20T08:30:00Z'))).toEqual([]); // 15:30 20/11: chưa đủ +1h
    expect(m.afterBlocks(AT, Date.parse('2026-11-20T09:00:00Z'))).toEqual([
      { start: '2026-11-19T08:00:00.000Z', end: '2026-11-20T08:00:00.000Z' }, // 15:00 19/11 → 15:00 20/11
    ]);
    expect(m.afterBlocks(AT, Date.parse('2026-12-30T00:00:00Z'))).toHaveLength(7);
    expect(m.datesOfBlock({ start: '2026-11-19T08:00:00.000Z', end: '2026-11-20T08:00:00.000Z' })).toEqual(['2026-11-19', '2026-11-20']);
    expect(new Date(firstAfterReadyAt(AT)).toISOString()).toBe('2026-11-20T09:00:00.000Z'); // web khớp server
  });

  it('chỉ cộng các giờ nằm trong khối (giờ 14:00 có thao tác không tính)', () => {
    const b = { start: '2026-11-19T08:00:00.000Z', end: '2026-11-20T08:00:00.000Z' };
    const rows = [
      { key: 'v1', hour: m.parseHour('2026-11-19 14:00:00'), cost: 999, revenue: 0, orders: 0 },
      { key: 'v1', hour: m.parseHour('2026-11-19 15:00:00'), cost: 100, revenue: 500, orders: 1 },
      { key: 'v1', hour: m.parseHour('2026-11-20 14:00:00'), cost: 50, revenue: 100, orders: 1 },
      { key: 'v1', hour: m.parseHour('2026-11-20 15:00:00'), cost: 777, revenue: 0, orders: 0 },
      { key: 'v9', hour: m.parseHour('2026-11-19 16:00:00'), cost: 1, revenue: 1, orders: 1 },
    ];
    expect(m.blockMetrics(rows, 'v1', b)).toMatchObject({ date: '2026-11-19', cost: 150, revenue: 600, orders: 2, roi: 4 });
    expect(m.blockMetrics([], 'v1', b)).toMatchObject({ cost: 0, orders: 0, roi: null });
  });
});

describe('fillAfterMetrics', () => {
  it('video: cộng mọi sản phẩm; mỗi (ngày, chiến dịch, sản phẩm) gọi 1 lần; không gọi tool ghi', async () => {
    mock.runtime.actions = [action()];
    mock.hours = [
      ['c1', 'p1', 'v1', '2026-11-19 16:00:00', 100, 600, 1],
      ['c1', 'p2', 'v1', '2026-11-20 10:00:00', 50, 200, 1],
      ['c1', 'p1', 'v1', '2026-11-21 09:00:00', 30, 0, 0],
    ];
    expect(await m.fillAfterMetrics(NOW)).toBe(1);
    const days = mock.runtime.actions[0].after?.days ?? [];
    expect(days.map((d) => [d.cost, d.revenue, d.orders])).toEqual([
      [150, 800, 2],
      [30, 0, 0],
    ]);
    expect(mock.runtime.actions[0].after).toMatchObject({ cost: 180, revenue: 800, orders: 2, breakEven: 4.5 });
    expect(new Set(mock.calls).size).toBe(mock.calls.length);
    expect(mock.writes).toBe(0);
  });

  it('bỏ qua nhắc việc / lệnh lỗi / hoàn tác; chưa đủ 24h + 1h → không gọi TikTok', async () => {
    mock.runtime.actions = [
      action({ id: 'r', actionType: 'remind' }),
      action({ id: 'f', status: 'failed' }),
      action({ id: 'u', undoOf: 'x' }),
      action({ id: 'new', executedAt: '2026-11-21T07:00:00Z' }),
    ];
    expect(await m.fillAfterMetrics(NOW)).toBe(0);
    expect(mock.calls).toEqual([]);
  });
});

describe('summarizeAction (câu kết luận)', () => {
  const withAfter = (a: AgentActionLog, days: { cost: number; revenue: number; orders: number }[]): AgentActionLog => ({
    ...a,
    after: m.windowOfDays(
      days.map((d, i) => ({ date: `2026-11-2${i}`, ...d, roi: d.cost ? d.revenue / d.cost : null })),
      a.before.breakEven,
    ),
  });
  const line = (a: AgentActionLog) => summarizeAction(a, evaluateAction(a, 24, Date.parse('2026-11-23T05:00:00Z')));

  it('chưa có khối nào → không có câu (câu chờ nằm trong ô Sau thao tác)', () => {
    expect(line(action())).toBeNull();
  });

  it('gỡ video lỗ, sau gỡ không tiêu tiền → Gỡ đúng', () => {
    const r = line(withAfter(action(), [{ cost: 0, revenue: 0, orders: 0 }, { cost: 0, revenue: 0, orders: 0 }]));
    expect(r?.tone).toBe('good');
    expect(r?.text).toMatch(/^✓ Gỡ đúng — 2 ngày sau: chi 0đ\/ngày \(trước 100k\)/);
  });

  it('gỡ video đang có lời → Gỡ chưa đúng, gợi ý Thêm lại', () => {
    const good = action({ before: { ...BEFORE, revenue: 7_000_000, orders: 30, roi: 10 } });
    const r = line(withAfter(good, [{ cost: 0, revenue: 0, orders: 0 }]));
    expect(r?.tone).toBe('bad');
    expect(r?.text).toContain('cân nhắc Thêm lại');
  });

  it('tăng cường ROI tăng → Hiệu quả; thiếu hoà vốn → chưa chấm được; nhắc việc / lỗi → không có câu', () => {
    const boost = action({ actionType: 'boost_creative', before: { ...BEFORE, revenue: 2_940_000, orders: 7, roi: 4.2 } });
    expect(line(withAfter(boost, [{ cost: 200_000, revenue: 1_400_000, orders: 5 }]))).toMatchObject({
      tone: 'good',
      text: expect.stringMatching(/^✓ Hiệu quả — 24h sau: ROI 7/),
    });
    const noBe = action({ actionType: 'boost_creative', before: { ...BEFORE, breakEven: null } });
    expect(line(withAfter(noBe, [{ cost: 1, revenue: 1, orders: 0 }]))?.text).toContain('thiếu ROI hoà vốn');
    expect(line(action({ actionType: 'remind' }))).toBeNull();
    expect(line(action({ status: 'failed' }))).toBeNull();
  });
});
