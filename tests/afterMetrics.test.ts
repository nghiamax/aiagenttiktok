import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdsSnapshot } from '../shared/adsSnapshot';
import type { AgentActionLog, AgentRuntime } from '../shared/agentTypes';
import { evaluateAction, firstAfterDate, firstAfterReadyAt, summarizeAction } from '../src/pages/ads/agent/evaluate';
import { campaign, product, snapshot, video } from './fixtures';

/* "Sau thao tác" theo NGÀY LỊCH (snapshot 1 ngày, CHỈ ĐỌC) + câu kết luận */
const mock = vi.hoisted(() => ({
  runtime: null as unknown as AgentRuntime,
  /** snapshot theo ngày */
  byDate: {} as Record<string, AdsSnapshot>,
  calls: [] as string[],
}));

vi.mock('../server/ads/cache', () => ({
  todayVN: () => '2026-11-21',
  getSnapshot: async (r: { from: string; to: string }) => {
    mock.calls.push(`${r.from}_${r.to}`);
    const s = mock.byDate[r.from];
    if (!s) throw new Error(`không có số ngày ${r.from}`);
    return { snapshot: s, cached: true };
  },
}));
vi.mock('../server/store', () => ({
  getRuntime: () => structuredClone(mock.runtime),
  updateRuntime: (fn: (r: AgentRuntime) => AgentRuntime | void) => {
    const r = structuredClone(mock.runtime);
    mock.runtime = fn(r) ?? r;
    return mock.runtime;
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
const AT = '2026-11-19T07:57:00Z'; // 14:57 19/11 giờ VN
const NOW = Date.parse('2026-11-21T09:00:00Z'); // 16:00 21/11 → Ngày 1 (20/11) + Ngày 2 (21/11, đang chạy)

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

const day = (rows: ReturnType<typeof video>[]) =>
  snapshot({ campaigns: [campaign({ id: 'c1' }), campaign({ id: 'c2' })], products: [product({ id: 'p1', campaignId: 'c1' })], videos: rows });

beforeEach(() => {
  mock.runtime = { lastRunAt: null, proposals: [], actions: [] };
  mock.calls = [];
  mock.byDate = {
    '2026-11-20': day([
      video({ id: 'v1', campaignId: 'c1', productId: 'p1', cost: 100, revenue: 600, orders: 1 }),
      video({ id: 'v1', campaignId: 'c1', productId: 'p2', cost: 50, revenue: 200, orders: 1 }),
      video({ id: 'v1', campaignId: 'c2', productId: 'p9', cost: 999, revenue: 0, orders: 0 }), // chiến dịch khác: không tính
    ]),
    '2026-11-21': day([video({ id: 'v1', campaignId: 'c1', productId: 'p1', cost: 30, revenue: 0, orders: 0, status: 'excluded' })]),
  };
});

describe('afterDates', () => {
  it('Ngày k = ngày lịch kế tiếp, hiện khi tròn k×24h; bỏ ngày thao tác; tối đa 7', () => {
    expect(m.afterDates(AT, Date.parse('2026-11-20T07:56:00Z'))).toEqual([]); // 14:56 20/11: chưa đủ 24h
    expect(m.afterDates(AT, Date.parse('2026-11-20T07:57:00Z'))).toEqual(['2026-11-20']);
    expect(m.afterDates(AT, NOW)).toEqual(['2026-11-20', '2026-11-21']);
    expect(m.afterDates(AT, Date.parse('2026-12-30T00:00:00Z'))).toHaveLength(7);
    // Thao tác lúc 23:30 giờ VN → Ngày 1 vẫn là ngày lịch kế tiếp
    expect(m.afterDates('2026-11-19T16:30:00Z', Date.parse('2026-11-20T16:30:00Z'))).toEqual(['2026-11-20']);
    // web khớp server
    expect(new Date(firstAfterReadyAt(AT)).toISOString()).toBe(m.firstDayReadyAt(AT));
    expect(firstAfterDate(AT)).toBe('2026-11-20');
  });
});

describe('dayMetric', () => {
  it('video: cộng mọi sản phẩm trong chiến dịch, chiến dịch khác không tính; không có dòng (đã gỡ) = 0', () => {
    expect(m.dayMetric(mock.byDate['2026-11-20'], action().target, '2026-11-20')).toEqual({
      date: '2026-11-20',
      cost: 150,
      revenue: 800,
      orders: 2,
      roi: 800 / 150,
    });
    expect(m.dayMetric(day([]), action().target, '2026-11-22')).toMatchObject({ cost: 0, orders: 0, roi: null });
  });
});

describe('fillAfterMetrics', () => {
  it('ghi từng ngày + tổng; mỗi ngày đọc 1 snapshot dùng chung; ngày đang chạy thì to = lúc lấy', async () => {
    mock.runtime.actions = [action(), action({ id: 'a2' })];
    expect(await m.fillAfterMetrics(NOW)).toBe(2);
    const after = mock.runtime.actions[0].after!;
    expect(after.days!.map((d) => [d.date, d.cost, d.revenue, d.orders])).toEqual([
      ['2026-11-20', 150, 800, 2],
      ['2026-11-21', 30, 0, 0],
    ]);
    expect(after).toMatchObject({ cost: 180, revenue: 800, orders: 2, breakEven: 4.5, from: '2026-11-20T00:00:00+07:00' });
    expect(after.to).toBe(new Date(NOW).toISOString());
    expect(mock.calls.sort()).toEqual(['2026-11-20_2026-11-20', '2026-11-21_2026-11-21']);
  });

  it('bỏ dữ liệu khối giờ cũ (có from) và đo lại theo ngày', async () => {
    mock.runtime.actions = [
      action({ after: { ...BEFORE, days: [{ date: '2026-11-19', from: '2026-11-19T08:00:00.000Z', cost: 1, revenue: 1, orders: 1, roi: 1 }] } }),
    ];
    await m.fillAfterMetrics(NOW);
    expect(mock.runtime.actions[0].after!.days!.map((d) => d.date)).toEqual(['2026-11-20', '2026-11-21']);
  });

  it('bỏ qua nhắc việc / lệnh lỗi; chưa đủ 24h → không đọc số', async () => {
    mock.runtime.actions = [
      action({ id: 'r', actionType: 'remind' }),
      action({ id: 'f', status: 'failed' }),
      action({ id: 'new', executedAt: '2026-11-21T07:00:00Z' }),
    ];
    expect(await m.fillAfterMetrics(NOW)).toBe(0);
    expect(mock.calls).toEqual([]);
  });

  it('dòng Hoàn tác (thêm lại video) cũng được đo', async () => {
    mock.byDate['2026-11-21'] = day([video({ id: 'v1', campaignId: 'c1', productId: 'p1', cost: 30, status: 'delivering' })]);
    mock.runtime.actions = [action({ id: 'u', actionType: 'add_creative', actor: 'manual', undoOf: 'x' })];
    expect(await m.fillAfterMetrics(NOW)).toBe(1);
    expect(mock.runtime.actions[0].after?.days).toHaveLength(2);
  });
});

describe('Video thay đổi → ngừng đo', () => {
  const later = (over: Partial<AgentActionLog>) => action({ id: 'b', ...over });

  it('thao tác mới ngày sau → chỉ đo các ngày trước ngày đó', async () => {
    mock.runtime.actions = [action(), later({ actionType: 'add_creative', executedAt: '2026-11-21T03:00:00Z' })];
    await m.fillAfterMetrics(NOW);
    const a = mock.runtime.actions[0];
    expect(a.measureStop).toEqual({ date: '2026-11-21', reason: 'có thao tác Thêm lại video lúc 10:00 21/11' });
    expect(a.after!.days!.map((d) => d.date)).toEqual(['2026-11-20']);
  });

  it('thao tác mới cùng ngày → không đo, không chấm', async () => {
    mock.runtime.actions = [action(), later({ actionType: 'add_creative', executedAt: '2026-11-19T08:30:00Z' })];
    await m.fillAfterMetrics(NOW);
    const a = mock.runtime.actions[0];
    expect(a.measureStop?.reason).toBe('có thao tác Thêm lại video cùng ngày lúc 15:30');
    expect(a.after).toBeNull();
    expect(evaluateAction(a, 24, NOW).verdict).toBe('excluded');
  });

  it('lệnh lỗi / nhắc việc / video khác / chiến dịch khác không cắt', () => {
    const at = '2026-11-21T03:00:00Z';
    const others = [
      later({ id: 'f', status: 'failed', executedAt: at }),
      later({ id: 'r', actionType: 'remind', executedAt: at }),
      later({ id: 'v', target: { campaignId: 'c1', productId: 'p1', videoId: 'v2' }, executedAt: at }),
      later({ id: 'c', target: { campaignId: 'c2', productId: 'p1', videoId: 'v1' }, executedAt: at }),
    ];
    expect(m.nextActionStop(action(), [action(), ...others])).toBeNull();
  });

  it('trạng thái video đổi (ngoài hệ thống) → dừng từ hôm nay; không có dòng → vẫn đo', () => {
    const today = '2026-11-21';
    const snap = (status: ReturnType<typeof video>['status']) => day([video({ id: 'v1', campaignId: 'c1', productId: 'p1', status })]);
    expect(m.statusStop(action(), snap('delivering'), today)).toEqual({ date: today, reason: 'trạng thái video đổi sang Đang phân phối' });
    expect(m.statusStop(action(), snap('excluded'), today)).toBeNull();
    expect(m.statusStop(action(), day([]), today)).toBeNull();
    const add = action({ actionType: 'add_creative' });
    expect(m.statusStop(add, snap('unavailable'), today)?.reason).toBe('trạng thái video đổi sang Không khả dụng');
    expect(m.statusStop(add, snap('delivering'), today)).toBeNull();
    // thao tác hôm nay: chưa xét trạng thái
    expect(m.statusStop(action({ executedAt: '2026-11-21T02:00:00Z' }), snap('delivering'), today)).toBeNull();
  });

  it('fillAfterMetrics: trạng thái hôm nay lệch → dừng, giữ ngày trước; mốc không bị ghi đè', async () => {
    mock.byDate['2026-11-21'] = day([video({ id: 'v1', campaignId: 'c1', productId: 'p1', cost: 30, status: 'delivering' })]);
    mock.runtime.actions = [action()];
    await m.fillAfterMetrics(NOW);
    const a = mock.runtime.actions[0];
    expect(a.measureStop?.date).toBe('2026-11-21');
    expect(a.after!.days!.map((d) => d.date)).toEqual(['2026-11-20']);
    // lượt sau: trạng thái về lại, mốc vẫn giữ
    mock.byDate['2026-11-21'] = day([video({ id: 'v1', campaignId: 'c1', productId: 'p1', status: 'excluded' })]);
    await m.fillAfterMetrics(NOW + 3_600_000);
    expect(mock.runtime.actions[0].measureStop?.date).toBe('2026-11-21');
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
  const T = Date.parse('2026-11-23T05:00:00Z');
  const line = (a: AgentActionLog) => summarizeAction(a, evaluateAction(a, 24, T), T);

  it('chưa có ngày nào → không có câu (câu chờ nằm trong ô Sau thao tác)', () => {
    expect(line(action())).toBeNull();
  });

  // Chuẩn chung: lãi/lỗ mỗi ngày = DT ÷ hoà vốn − chi; so SAU với TRƯỚC (tình trạng lúc bấm)
  it('gỡ video lỗ (trước −73k/ngày), sau gỡ 0đ → Đúng', () => {
    const r = line(withAfter(action(), [{ cost: 0, revenue: 0, orders: 0 }, { cost: 0, revenue: 0, orders: 0 }]));
    expect(r?.tone).toBe('good');
    expect(r?.text).toMatch(/^✓ Đúng — 2 ngày sau: lãi\/lỗ \+0đ\/ngày \(trước −73k\)/);
  });

  it('gỡ video đang có lời → Sai, gợi ý Thêm lại', () => {
    const good = action({ before: { ...BEFORE, revenue: 7_000_000, orders: 30, roi: 10 } });
    const r = line(withAfter(good, [{ cost: 0, revenue: 0, orders: 0 }]));
    expect(r?.tone).toBe('bad');
    expect(r?.text).toContain('cân nhắc Thêm lại');
  });

  // Đơn về muộn sau khi gỡ (Sếp chốt 28/11): cộng vào khoảng trước, không tính là lãi của việc gỡ
  it('ca thật 26/11: gỡ rồi có 1 đơn về muộn 439k → không còn "lợi 144k"; tính cả vẫn ROI 3,45 < hoà vốn → Đúng sát hoà vốn', () => {
    const real = action({
      before: { from: '2026-11-19T00:00:00+07:00', to: '2026-11-25T23:59:59+07:00', cost: 382_000, revenue: 878_000, orders: 2, roi: 2.3, breakEven: 3.5 },
    });
    const a = withAfter(real, [{ cost: 0, revenue: 439_000, orders: 1 }]);
    const ev = evaluateAction(a, 24, T);
    expect(ev.verdict).toBe('good');
    expect(ev.profitEffect!).toBeGreaterThan(0);
    expect(ev.profitEffect!).toBeLessThan(2_000);
    expect(line(a)?.text).toMatch(/^✓ Đúng — 1 ngày sau: 1 đơn về muộn \(DT 439k, chi 0đ\), tính cả vẫn ROI lúc gỡ 3,45 < hoà vốn 3,5/);
  });

  it('đơn về muộn đẩy ROI lúc gỡ ≥ hoà vốn → Gỡ sai, gợi ý Thêm lại', () => {
    const a = withAfter(action(), [{ cost: 0, revenue: 2_500_000, orders: 3 }]);
    const ev = evaluateAction(a, 24, T);
    expect(ev.verdict).toBe('bad');
    expect(ev.profitEffect!).toBeLessThan(0);
    const r = line(a);
    expect(r?.tone).toBe('bad');
    expect(r?.text).toMatch(/^✗ Gỡ sai — 1 ngày sau: 3 đơn về muộn .*ROI lúc gỡ 4,77 ≥ hoà vốn 4,5.*cân nhắc Thêm lại$/);
  });

  it('gỡ không có đơn về muộn → Đúng, tác động = lỗ tránh được', () => {
    const a = withAfter(action(), [{ cost: 0, revenue: 0, orders: 0 }]);
    const ev = evaluateAction(a, 24, T);
    // trước: (840k ÷ 4,5 − 700k) ÷ ~7 ngày ≈ −73k/ngày
    expect(ev.verdict).toBe('good');
    expect(Math.round(ev.profitEffect! / 1000)).toBe(73);
  });

  it('thêm lại video: trước = 0 (đang tắt), không so với số trước khi gỡ', () => {
    const add = (be = 3.5) =>
      action({ actionType: 'add_creative', before: { ...BEFORE, cost: 136_000, revenue: 0, orders: 0, roi: 0, breakEven: be } });
    // chi 1k, 0 đơn → chênh quá nhỏ → Chưa đủ số liệu (trước đây bị chấm "Hiệu quả +18k")
    const tiny = withAfter(add(), [{ cost: 1_211, revenue: 0, orders: 0 }]);
    expect(evaluateAction(tiny, 24, T)).toMatchObject({ verdict: 'insufficient', profitEffect: null });
    expect(line(tiny)?.text).toMatch(/^Chưa đủ số liệu để chấm — 1 ngày sau: chi 1k/);
    // chi 100k ra 1 đơn 500k (hoà vốn 3,5) → +43k/ngày > 0 → Đúng
    const win = line(withAfter(add(), [{ cost: 100_000, revenue: 500_000, orders: 1 }]));
    expect(win).toMatchObject({ tone: 'good', text: expect.stringMatching(/^✓ Đúng — 1 ngày sau: lãi\/lỗ \+43k\/ngày \(trước 0đ — đang tắt\)/) });
    // chi 100k, 0 đơn → −100k → Sai, gợi ý Gỡ lại
    expect(line(withAfter(add(), [{ cost: 100_000, revenue: 0, orders: 0 }]))?.text).toMatch(/^✗ Sai .*cân nhắc Gỡ lại$/);
  });

  it('ngày cuối là hôm nay → "tạm tính"', () => {
    const a = { ...action(), after: m.windowOfDays([{ date: '2026-11-23', cost: 0, revenue: 0, orders: 0, roi: null }], 4.5, T) };
    expect(line(a)?.text).toContain('1 ngày sau (tạm tính)');
  });

  it('tăng cường lãi/lỗ tăng → Đúng; thiếu hoà vốn → chưa chấm được; nhắc việc / lỗi → không có câu', () => {
    const boost = action({ actionType: 'boost_creative', before: { ...BEFORE, revenue: 2_940_000, orders: 7, roi: 4.2 } });
    expect(line(withAfter(boost, [{ cost: 200_000, revenue: 1_400_000, orders: 5 }]))).toMatchObject({
      tone: 'good',
      text: expect.stringMatching(/^✓ Đúng — 1 ngày sau: lãi\/lỗ \+111k\/ngày \(trước −7k\)/),
    });
    const noBe = action({ actionType: 'boost_creative', before: { ...BEFORE, breakEven: null } });
    expect(line(withAfter(noBe, [{ cost: 1, revenue: 1, orders: 0 }]))?.text).toContain('thiếu ROI hoà vốn');
    expect(line(action({ actionType: 'remind' }))).toBeNull();
    expect(line(action({ status: 'failed' }))).toBeNull();
  });
});
