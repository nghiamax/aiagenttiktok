import { describe, expect, it } from 'vitest';
import { computeFromPrice, priceForProfit, priceForTarget, priceForMargin, roundUpPrice, type PricingInput } from '../src/pages/finance/pricing/calc';
import { applySource, compareSources, ORDER_SOURCES } from '../src/pages/finance/pricing/orderSource';
import { normalizeForm } from '../src/pages/finance/pricing/config';

// Theo bảng tính giá TikTok của Sếp: giá 90.000đ, quảng cáo 10%, hoa hồng tiêu chuẩn 10%, HH quảng cáo cửa hàng 5%
const base: PricingInput = {
  cost: 65_000,
  categoryPct: 13.5,
  fees: [{ id: 'tx', label: 'Phí giao dịch', kind: 'pct', value: 6 }],
  adsPct: 0,
  taxPct: 1.5,
  weightKg: 0.5,
  applyLogistics: true,
};
const rates = { adsPct: 10, affiliatePct: 10, shopAdsAffiliatePct: 5 };
const deduct = (inp: PricingInput, id: string) => computeFromPrice(90_000, inp).deductions.find((d) => d.id === id)?.amount ?? 0;

describe('nguồn đơn hàng', () => {
  it('mỗi nguồn trả quảng cáo / hoa hồng như bảng tính', () => {
    const by = Object.fromEntries(ORDER_SOURCES.map((s) => [s.id, applySource(base, s.id, rates)]));
    // Tự bán: không quảng cáo, không hoa hồng
    expect(deduct(by.self, 'ads')).toBe(0);
    expect(deduct(by.self, 'affiliate')).toBe(0);
    // Tiếp thị liên kết: 10% × 90k = 9.000
    expect(deduct(by.affiliate, 'affiliate')).toBe(9_000);
    expect(deduct(by.affiliate, 'ads')).toBe(0);
    // Quảng cáo: 9.000 quảng cáo
    expect(deduct(by.ads, 'ads')).toBe(9_000);
    expect(deduct(by.ads, 'affiliate')).toBe(0);
    // Ads + HH quảng cáo cửa hàng: 9.000 + 4.500
    expect(deduct(by.adsShopAff, 'ads')).toBe(9_000);
    expect(deduct(by.adsShopAff, 'affiliate')).toBe(4_500);
    // Ads + HH tự nhiên: 9.000 + 9.000
    expect(deduct(by.adsAff, 'affiliate')).toBe(9_000);
  });

  it('lãi giảm dần đúng thứ tự cột: Tự bán > Quảng cáo = Liên kết > Ads+HH QC > Ads+HH tự nhiên', () => {
    const rows = compareSources(base, rates, 'profit', { kind: 'pct', value: 0 }, 90_000);
    const p = Object.fromEntries(rows.map((r) => [r.source.id, r.result!.profit]));
    expect(p.self - p.ads).toBeCloseTo(9_000);
    expect(p.ads).toBeCloseTo(p.affiliate);
    expect(p.ads - p.adsShopAff).toBeCloseTo(4_500);
    expect(p.ads - p.adsAff).toBeCloseTo(9_000);
  });

  it('chế độ tìm giá: nguồn tốn nhiều phí hơn → giá đề xuất cao hơn', () => {
    const rows = compareSources(base, rates, 'price', { kind: 'pct', value: 20 }, 0);
    const price = Object.fromEntries(rows.map((r) => [r.source.id, r.price!]));
    expect(price.self).toBeLessThan(price.ads);
    expect(price.ads).toBeLessThan(price.adsShopAff);
    expect(price.adsShopAff).toBeLessThan(price.adsAff);
    // chưa có giá vốn → không tính
    expect(compareSources({ ...base, cost: 0 }, rates, 'price', { kind: 'pct', value: 20 }, 0).every((r) => r.price == null)).toBe(true);
  });

  it('form cũ không có nguồn → mặc định Quảng cáo (giữ kết quả như trước), hoa hồng 0', () => {
    const f = normalizeForm({ mode: 'price', adsPct: 12 });
    expect(f).toMatchObject({ orderSource: 'ads', affiliatePct: 0, shopAdsAffiliatePct: 0, adsPct: 12 });
    expect(normalizeForm({ orderSource: 'xyz' }).orderSource).toBe('ads');
    expect(normalizeForm({ orderSource: 'adsAff', affiliatePct: 10 })).toMatchObject({ orderSource: 'adsAff', affiliatePct: 10 });
  });
});

describe('lãi mong muốn theo số tiền', () => {
  it('giá bán để lãi đúng A đồng mỗi sản phẩm', () => {
    const inp = applySource(base, 'ads', rates);
    const p = priceForProfit(30_000, inp)!;
    expect(computeFromPrice(p, inp).profit).toBeCloseTo(30_000);
    // làm tròn lên 1.000đ → lãi ≥ mục tiêu
    expect(computeFromPrice(roundUpPrice(p), inp).profit).toBeGreaterThanOrEqual(30_000);
    expect(priceForTarget({ kind: 'amount', value: 30_000 }, inp)).toBe(p);
    expect(priceForTarget({ kind: 'pct', value: 10 }, inp)).toBe(priceForMargin(10, inp));
  });

  it('tổng % phí ≥ 100% → không có giá', () => {
    expect(priceForProfit(10_000, { ...base, adsPct: 90 })).toBeNull();
  });

  it('so sánh nguồn theo số tiền: mọi nguồn cùng lãi ~A', () => {
    const rows = compareSources(base, rates, 'price', { kind: 'amount', value: 20_000 }, 0);
    for (const r of rows) expect(r.result!.profit).toBeGreaterThanOrEqual(20_000);
  });

  it('form cũ → lãi theo %, số tiền 0', () => {
    expect(normalizeForm({})).toMatchObject({ marginKind: 'pct', marginAmount: 0 });
    expect(normalizeForm({ marginKind: 'amount', marginAmount: 25000 })).toMatchObject({ marginKind: 'amount', marginAmount: 25000 });
  });
});
