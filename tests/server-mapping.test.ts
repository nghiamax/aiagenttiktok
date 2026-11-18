import { describe, expect, it } from 'vitest';
import { num, roiOf, text, toCampaign, toVideo, videoStatus } from '../server/ads/mapping';
import { previousRange } from '../server/ads/buildSnapshot';

describe('Chuyển dữ liệu TikTok → snapshot', () => {
  it('num / text bỏ giá trị giả của TikTok', () => {
    expect(num('-')).toBeNull();
    expect(num('')).toBeNull();
    expect(num('12.5')).toBe(12.5);
    expect(text('0')).toBeNull();
    expect(text('-')).toBeNull();
    expect(text('Tai nghe')).toBe('Tai nghe');
  });

  it('ROI tự tính; chi phí 0 → null (TikTok trả 0.00 giả)', () => {
    expect(roiOf(1_000_000, 0)).toBeNull();
    expect(roiOf(1_000_000, null)).toBeNull();
    expect(roiOf(184_774_766, 26_779_008)).toBeCloseTo(6.9, 1);
  });

  it('trạng thái NOT_DELIVERYING (TikTok viết sai) → not_delivering; mã lạ → unknown', () => {
    expect(videoStatus('NOT_DELIVERYING')).toBe('not_delivering');
    expect(videoStatus('AUTHORIZATION_NEEDED')).toBe('authorization_needed');
    expect(videoStatus('SOMETHING_NEW')).toBe('unknown');
  });

  it('chiến dịch: ENABLE → running, ngân sách + ROI mục tiêu từ báo cáo', () => {
    const c = toCampaign({
      dimensions: { campaign_id: '1' },
      metrics: { campaign_name: 'A', operation_status: 'ENABLE', target_roi_budget: '6000000', roas_bid: '7.50', cost: '100', gross_revenue: '750', orders: '2' },
    });
    expect(c).toMatchObject({ status: 'running', budget: 6_000_000, targetRoi: 7.5, roi: 7.5 });
    expect(toCampaign({ dimensions: { campaign_id: '2' }, metrics: { operation_status: 'DISABLE' } }).status).toBe('paused');
  });

  it('thẻ sản phẩm (item_id -1) → product_card, không có tiêu đề', () => {
    const v = toVideo({ dimensions: { item_id: '-1' }, metrics: { cost: '100', title: '0', shop_content_type: 'PRODUCT_CARD', creative_delivery_status: 'DELIVERING' } }, 'c', 'p');
    expect(v).toMatchObject({ contentType: 'product_card', title: null });
  });

  it('video không chi / đơn / DT: chỉ giữ khi đang phân phối / học / chờ', () => {
    const idle = (status: string) => toVideo({ dimensions: { item_id: '9' }, metrics: { cost: '0', orders: '0', gross_revenue: '0', creative_delivery_status: status } }, 'c', 'p');
    expect(idle('UNAVAILABLE')).toBeNull();
    expect(idle('NOT_ACTIVE')).toBeNull();
    expect(idle('LEARNING')).not.toBeNull();
    expect(idle('IN_QUEUE')).not.toBeNull();
  });

  it('kỳ trước cùng số ngày, liền trước', () => {
    expect(previousRange({ from: '2026-11-10', to: '2026-11-16' })).toEqual({ from: '2026-11-03', to: '2026-11-09' });
    expect(previousRange({ from: '2026-11-18', to: '2026-11-18' })).toEqual({ from: '2026-11-17', to: '2026-11-17' });
  });
});
