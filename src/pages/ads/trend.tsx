import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { buildTrendIndex, productKey, videoKey, type TrendInfo, type TrendSnaps } from '../../../shared/trend';
import type { ConfirmSnaps } from '../../../shared/agentMatch';
import { profitPerOrderMap, type ProfitMap } from '../../../shared/productProfit';
import { useAgentStore } from './agent/agentStore';
import { formatDm } from '../../lib/dates';
import { lastDays, useAdsData } from './data';
import { useAdsSettings } from './settings';
import type { AdsProduct, AdsVideo, Campaign } from './types';

/*
 * Nhóm đã xác nhận 7 · 14 · 30 ngày đến hôm qua (Sếp chốt 22/11) — tính 1 lần cho cả trang ADS.
 * Cột Nhóm các bảng, hộp Tổng quan, Gợi ý, thẻ quy tắc đều đọc từ đây → khớp với cái Agent xét.
 */

interface TrendValue {
  snaps: TrendSnaps;
  /** Xác nhận bằng 14 ngày đang bật (Giới hạn an toàn) */
  confirmOn: boolean;
  /** Khung dùng để xác nhận (null khi tắt / chưa tải) */
  confirm: ConfirmSnaps;
  video: (v: Pick<AdsVideo, 'campaignId' | 'productId' | 'id'>) => TrendInfo | undefined;
  product: (p: Pick<AdsProduct, 'campaignId' | 'id'>) => TrendInfo | undefined;
  campaign: (c: Pick<Campaign, 'id'>) => TrendInfo | undefined;
  /** Đã có khung 14 ngày (chưa có → nhóm chỉ theo 7 ngày, chưa xác nhận được) */
  ready: boolean;
  /**
   * Khoảng ngày bảng đang hiện so với 3 khung: trùng khung nào → `ring` (chấm khung đó có viền);
   * khác cả 3 → `ring: null`, ô Nhóm thêm dòng "Khoảng chọn: …" xếp nhóm theo số đang hiện.
   */
  viewing: ViewingRange;
  /** Lợi nhuận 1 đơn theo sản phẩm (30 → 14 → 7 ngày) — điều kiện "lần lợi nhuận 1 đơn" */
  profit: ProfitMap;
}

export interface ViewingRange {
  ring: 'g7' | 'g14' | 'g30' | null;
  /** dd/MM–dd/MM */
  label: string;
}

const TrendContext = createContext<TrendValue | null>(null);

export function TrendProvider({ children }: { children: ReactNode }) {
  const { trendSnaps, snapshot } = useAdsData();
  const from = snapshot.range?.from;
  const to = snapshot.range?.to;
  const { settings } = useAdsSettings();
  const { state } = useAgentStore();
  const confirmOn = state.guardrails.confirmWindow !== false;

  const value = useMemo<TrendValue>(() => {
    const idx = {
      video: buildTrendIndex('video', trendSnaps, settings, confirmOn),
      product: buildTrendIndex('product', trendSnaps, settings, confirmOn),
      campaign: buildTrendIndex('campaign', trendSnaps, settings, confirmOn),
    };
    return {
      snaps: trendSnaps,
      confirmOn,
      confirm: confirmOn ? { d14: trendSnaps.d14, d30: trendSnaps.d30 } : { d14: null, d30: null },
      video: (v) => idx.video.get(videoKey(v)),
      product: (p) => idx.product.get(productKey(p.campaignId, p.id)),
      campaign: (c) => idx.campaign.get(c.id),
      ready: !!trendSnaps.d14,
      viewing: viewingOf(from, to),
      profit: profitPerOrderMap(trendSnaps, settings),
    };
  }, [trendSnaps, settings, confirmOn, from, to]);

  return <TrendContext.Provider value={value}>{children}</TrendContext.Provider>;
}

function viewingOf(from: string | undefined, to: string | undefined): ViewingRange {
  if (!from || !to) return { ring: 'g7', label: '' };
  const same = (n: number) => {
    const r = lastDays(n);
    return r.from === from && r.to === to;
  };
  const ring = same(7) ? 'g7' : same(14) ? 'g14' : same(30) ? 'g30' : null;
  return { ring, label: from === to ? formatDm(from) : `${formatDm(from)}–${formatDm(to)}` };
}

export function useTrend(): TrendValue {
  const ctx = useContext(TrendContext);
  if (!ctx) throw new Error('useTrend phải nằm trong TrendProvider');
  return ctx;
}
