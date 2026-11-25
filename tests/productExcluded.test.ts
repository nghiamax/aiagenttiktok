import { describe, expect, it } from 'vitest';
import { markExcluded } from '../server/ads/buildSnapshot';
import { ineligibleReason, type RuleTarget } from '../shared/agentMatch';

/* Sản phẩm đã loại trừ (tắt khỏi chiến dịch chọn sản phẩm thủ công): đánh dấu trong snapshot + Agent không làm sai */

describe('markExcluded', () => {
  const products = [
    { id: 'p1', campaignId: 'c1' },
    { id: 'p2', campaignId: 'c1' },
    { id: 'p3', campaignId: 'c2' },
  ];

  it('chiến dịch chọn sản phẩm thủ công: sản phẩm không có trong danh sách đang bật → excluded', () => {
    const out = markExcluded(products, new Map([['c1', new Set(['p1'])]]));
    expect(out.find((p) => p.id === 'p1')?.excluded).toBeUndefined();
    expect(out.find((p) => p.id === 'p2')?.excluded).toBe(true);
  });

  it('chiến dịch tự chọn sản phẩm / không đọc được (null) → không đoán, không đánh dấu', () => {
    const out = markExcluded(products, new Map([['c1', null]]));
    expect(out.every((p) => p.excluded === undefined)).toBe(true);
  });
});

describe('ineligibleReason — sản phẩm', () => {
  const t = (productExcluded: boolean) => ({ productExcluded, campaignRunning: true }) as RuleTarget;
  it('Tắt sản phẩm bỏ qua sản phẩm đã tắt; Bật sản phẩm chỉ áp cho sản phẩm đã tắt', () => {
    expect(ineligibleReason('disable_product', {}, t(true))).toBe('Sản phẩm đã tắt khỏi chiến dịch');
    expect(ineligibleReason('disable_product', {}, t(false))).toBeNull();
    expect(ineligibleReason('enable_product', {}, t(false))).toBe('Sản phẩm đang bật');
    expect(ineligibleReason('enable_product', {}, t(true))).toBeNull();
  });
});

describe('reEnableVerdict — ô "Cần bật lại"', async () => {
  const { reEnableVerdict } = await import('../src/pages/ads/reEnable');
  const w = (cost: number, orders: number, roi: number | null) => ({ cost, revenue: null, orders, roi });
  const t = (w30: ReturnType<typeof w> | null, w14: ReturnType<typeof w> | null = null) => ({ w30, w14 }) as never;
  it('có lời ≥ 3 đơn → suggest; ít đơn → few; lỗ → keep_off; thiếu hoà vốn / không có số', () => {
    expect(reEnableVerdict(t(w(2_000_000, 19, 6.1)), 4.5)).toBe('suggest');
    expect(reEnableVerdict(t(w(78, 1, 50)), 4.5)).toBe('few');
    expect(reEnableVerdict(t(w(1_000_000, 10, 3)), 4.5)).toBe('keep_off');
    expect(reEnableVerdict(t(w(1_000_000, 10, 6)), null)).toBe('no_break_even');
    expect(reEnableVerdict(t(null), 4.5)).toBe('no_data');
    // không có 30 ngày → dùng 14 ngày
    expect(reEnableVerdict(t(w(0, 0, null), w(500_000, 5, 6)), 4.5)).toBe('suggest');
  });
});
