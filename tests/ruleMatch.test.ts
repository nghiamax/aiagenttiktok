import { describe, expect, it } from 'vitest';
import { matchRuleTargets, skippedText } from '../src/pages/ads/agent/ruleMatch';
import { campaign, product, rule, settingsWith, snapshot, video } from './fixtures';

/* "N … khớp" trên thẻ quy tắc phải đếm giống Agent: bỏ đối tượng TikTok không cho làm */
const S = settingsWith();
const snap = snapshot({
  campaigns: [campaign({ id: 'c1' }), campaign({ id: 'c2', status: 'paused' })],
  products: [product({ id: 'p1', campaignId: 'c1' }), product({ id: 'p2', campaignId: 'c2' })],
  videos: [
    video({ id: 'v1', campaignId: 'c1', productId: 'p1', cost: 200_000 }),
    video({ id: 'v2', campaignId: 'c1', productId: 'p1', cost: 300_000, status: 'excluded' }),
    video({ id: 'v3', campaignId: 'c2', productId: 'p2', cost: 150_000 }),
  ],
});

describe('matchRuleTargets', () => {
  it('Gỡ video: video đã gỡ / chiến dịch tắt vào bỏ qua, không đếm', () => {
    const m = matchRuleTargets(rule({ id: 'r', trigger: 'cut', actionType: 'remove_creative' }), S, snap);
    expect(m.names).toHaveLength(1);
    expect(m.skipped).toEqual({ 'Video đã bị gỡ': 1, 'Chiến dịch đang tắt': 1 });
    expect(skippedText(m)).toBe('+2 bỏ qua: video đã bị gỡ 1, chiến dịch đang tắt 1');
  });

  it('Nhắc việc: không bỏ qua gì', () => {
    const m = matchRuleTargets(rule({ id: 'r', trigger: 'cut', actionType: 'remind' }), S, snap);
    expect(m.names).toHaveLength(3);
    expect(skippedText(m)).toBeNull();
  });
});
