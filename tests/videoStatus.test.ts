import { describe, expect, it } from 'vitest';
import { classifyVideo } from '../shared/classify';
import { findRuleTargets, ineligibleReason } from '../shared/agentMatch';
import { annotateCrossProduct, markCrossProduct } from '../shared/videoStatus';
import { isIdleVideo } from '../server/ads/mapping';
import { campaign, product, rule, settingsWith, snapshot, video } from './fixtures';

/* Chiến dịch nhiều sản phẩm: "Cần ủy quyền" giả khi video đang chạy ở sản phẩm khác */
const S = settingsWith();
const base = () =>
  snapshot({
    campaigns: [campaign({ id: 'c1', targetRoi: 5 }), campaign({ id: 'c2' })],
    products: [product({ id: 'A', campaignId: 'c1' }), product({ id: 'B', campaignId: 'c1' }), product({ id: 'X', campaignId: 'c2' })],
    videos: [
      // v1 gắn B (đang chạy), dòng ở A là "cần ủy quyền" giả
      video({ id: 'v1', campaignId: 'c1', productId: 'A', status: 'authorization_needed', cost: 100, revenue: 400_000, orders: 1 }),
      video({ id: 'v1', campaignId: 'c1', productId: 'B', status: 'delivering', cost: 600_000, revenue: 6_000_000, orders: 12 }),
      // v2 chỉ có dòng cần ủy quyền → cần ủy quyền thật
      video({ id: 'v2', campaignId: 'c1', productId: 'A', status: 'authorization_needed', revenue: 300_000, orders: 1 }),
      // v1 có dòng ở chiến dịch khác (sản phẩm X) — vẫn là video đang chạy ở c1
      video({ id: 'v1', campaignId: 'c2', productId: 'X', status: 'authorization_needed', revenue: 200_000, orders: 1 }),
    ],
  });

describe('annotateCrossProduct', () => {
  it('đánh dấu dòng cần ủy quyền giả, chỉ ra sản phẩm thật + trạng thái ở đó; không đổi status gốc', () => {
    const s = annotateCrossProduct(base());
    const [a, b, v2, other] = s.videos;
    expect(a).toMatchObject({ status: 'authorization_needed', crossProduct: true, mainProductId: 'B', mainStatus: 'delivering' });
    expect(b.crossProduct).toBeUndefined();
    expect(v2.crossProduct).toBeUndefined();
    // v1 ở chiến dịch c2 chỉ có dòng cần ủy quyền, nhưng đang chạy ở c1 → cũng là giả, trỏ về nơi chạy thật
    expect(other).toMatchObject({ crossProduct: true, mainCampaignId: 'c1', mainProductId: 'B', mainStatus: 'delivering' });
  });

  it('phân loại: dòng giả không vào Cần ủy quyền, video cần ủy quyền thật vẫn vào', () => {
    const s = annotateCrossProduct(base());
    const c1 = s.campaigns[0];
    expect(classifyVideo(s.videos[0], c1, S)?.action).not.toBe('authorize');
    expect(classifyVideo(s.videos[2], c1, S)?.action).toBe('authorize');
  });

  it('điều kiện TikTok dùng trạng thái ở sản phẩm thật → Tăng cường không bị khoá nhầm', () => {
    const s = annotateCrossProduct(base());
    const t = findRuleTargets(rule({ id: 'r', trigger: 'authorize', actionType: 'remind' }), S, s);
    expect(t.map((x) => `${x.target.campaignId}/${x.target.videoId}`)).toEqual(['c1/v2']);
    const probe = { campaignRunning: true, videoStatus: 'delivering' } as Parameters<typeof ineligibleReason>[2];
    expect(ineligibleReason('boost_creative', { boostBudget: 300_000 }, probe)).toBeNull();
  });
});

describe('Đối chiếu trước khi lọc (dòng thật 0 chi ở sản phẩm khác)', () => {
  // Ca thật 21/11: video Ap4 ANC — dòng A4 NOT_DELIVERING 0 chi (bị lọc), dòng PR GEN3 AUTHORIZATION_NEEDED 1đ
  const rows = () => [
    video({ id: 'ap4', campaignId: 'c1', productId: 'GEN3', status: 'authorization_needed', cost: 1, revenue: 0, orders: 0 }),
    video({ id: 'ap4', campaignId: 'c1', productId: 'A4', status: 'not_delivering', cost: 0, revenue: 0, orders: 0 }),
  ];

  it('markCrossProduct trên mọi dòng → dòng GEN3 là giả, trỏ về A4 (không phân phối)', () => {
    const [gen3] = markCrossProduct(rows());
    expect(gen3).toMatchObject({ crossProduct: true, mainProductId: 'A4', mainStatus: 'not_delivering' });
  });

  it('sau khi lọc dòng 0 chi, web chạy lại annotateCrossProduct vẫn giữ nhãn → không vào Cần ủy quyền', () => {
    const kept = markCrossProduct(rows()).filter((v) => !isIdleVideo(v));
    expect(kept).toHaveLength(1);
    const s = annotateCrossProduct(snapshot({ campaigns: [campaign({ id: 'c1' })], products: [product({ id: 'GEN3', campaignId: 'c1' })], videos: kept }));
    expect(s.videos[0].crossProduct).toBe(true);
    expect(classifyVideo(s.videos[0], s.campaigns[0], S)?.action).not.toBe('authorize');
  });

  it('chỉ có dòng cần ủy quyền ở mọi sản phẩm → vẫn là cần ủy quyền thật', () => {
    const only = markCrossProduct([
      video({ id: 'x', campaignId: 'c1', productId: 'A', status: 'authorization_needed', revenue: 300_000, orders: 1 }),
      video({ id: 'x', campaignId: 'c1', productId: 'B', status: 'authorization_needed', cost: 0 }),
    ]);
    expect(only.every((v) => !v.crossProduct)).toBe(true);
  });

  it('chi bằng nhau → ưu tiên dòng đang phân phối làm nơi chạy thật', () => {
    const [a] = markCrossProduct([
      video({ id: 'y', campaignId: 'c1', productId: 'A', status: 'authorization_needed', cost: 5 }),
      video({ id: 'y', campaignId: 'c1', productId: 'B', status: 'not_delivering', cost: 0 }),
      video({ id: 'y', campaignId: 'c1', productId: 'C', status: 'delivering', cost: 0 }),
    ]);
    expect(a.mainProductId).toBe('C');
  });
});
