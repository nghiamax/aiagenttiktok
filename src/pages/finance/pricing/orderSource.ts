// Nguồn đơn hàng (theo bảng tính giá TikTok của Sếp): mỗi nguồn trả thêm quảng cáo và / hoặc hoa hồng KOC khác nhau.
// Logic thuần, test ở tests/pricing.test.ts
import {
  computeFromPrice,
  priceForTarget,
  roundUpPrice,
  type PricingInput,
  type PricingResult,
  type ProfitTarget,
} from './calc';

export type OrderSource = 'self' | 'affiliate' | 'ads' | 'adsShopAff' | 'adsAff';

/** Mức % do Sếp nhập (mặc định 0 — không tự điền) */
export interface SourceRates {
  /** Chi phí quảng cáo (% giá bán) */
  adsPct: number;
  /** Hoa hồng tiêu chuẩn cho KOC (Phí Affiliate cho đơn tự nhiên của KOC) */
  affiliatePct: number;
  /** Hoa hồng quảng cáo cửa hàng (Phí Affiliate cho đơn quảng cáo chạy bằng video KOC) */
  shopAdsAffiliatePct: number;
}

export interface SourceDef {
  id: OrderSource;
  label: string;
  desc: string;
  ads: boolean;
  affiliate: 'none' | 'standard' | 'shopAds';
}

export const ORDER_SOURCES: SourceDef[] = [
  {
    id: 'self',
    label: 'Tự bán',
    desc: 'Khách tự tìm đến shop — không quảng cáo, không hoa hồng',
    ads: false,
    affiliate: 'none',
  },
  {
    id: 'affiliate',
    label: 'Tiếp thị liên kết',
    desc: 'Đơn từ video / live của KOC — trả hoa hồng tiêu chuẩn',
    ads: false,
    affiliate: 'standard',
  },
  {
    id: 'ads',
    label: 'Quảng cáo',
    desc: 'Đơn từ quảng cáo của shop — trả chi phí quảng cáo',
    ads: true,
    affiliate: 'none',
  },
  {
    id: 'adsShopAff',
    label: 'Ads + % HH quảng cáo',
    desc: 'Quảng cáo chạy bằng video KOC — chi phí quảng cáo + hoa hồng quảng cáo cửa hàng',
    ads: true,
    affiliate: 'shopAds',
  },
  {
    id: 'adsAff',
    label: 'Ads + % HH tự nhiên',
    desc: 'Đơn quảng cáo vẫn trả KOC hoa hồng tiêu chuẩn — chi phí quảng cáo + hoa hồng tiêu chuẩn',
    ads: true,
    affiliate: 'standard',
  },
];

export const sourceDef = (id: OrderSource) => ORDER_SOURCES.find((s) => s.id === id) ?? ORDER_SOURCES[2];

/** Áp nguồn đơn vào dữ liệu tính giá: bật / tắt quảng cáo và loại hoa hồng KOC */
export function applySource(input: PricingInput, source: OrderSource, rates: SourceRates): PricingInput {
  const d = sourceDef(source);
  return {
    ...input,
    adsPct: d.ads ? rates.adsPct : 0,
    affiliatePct:
      d.affiliate === 'standard' ? rates.affiliatePct : d.affiliate === 'shopAds' ? rates.shopAdsAffiliatePct : 0,
    affiliateLabel:
      d.affiliate === 'shopAds' ? 'Hoa hồng quảng cáo cửa hàng (KOC)' : 'Hoa hồng tiếp thị liên kết (KOC)',
  };
}

export interface SourceCompareRow {
  source: SourceDef;
  /** Chế độ tìm giá: giá đề xuất (làm tròn 1.000đ); null nếu tổng % ≥ 100% */
  price: number | null;
  result: PricingResult | null;
}

/** So sánh mọi nguồn đơn: cùng giá vốn, cùng mục tiêu lãi (tìm giá) hoặc cùng giá bán (kiểm tra lãi) */
export function compareSources(
  input: PricingInput,
  rates: SourceRates,
  mode: 'price' | 'profit',
  target: ProfitTarget,
  price: number,
): SourceCompareRow[] {
  return ORDER_SOURCES.map((source) => {
    const inp = applySource(input, source.id, rates);
    if (mode === 'price') {
      if (inp.cost <= 0) return { source, price: null, result: null };
      const exact = priceForTarget(target, inp);
      const p = exact == null ? null : roundUpPrice(exact);
      return { source, price: p, result: p == null ? null : computeFromPrice(p, inp) };
    }
    return { source, price: price > 0 ? price : null, result: price > 0 ? computeFromPrice(price, inp) : null };
  });
}
