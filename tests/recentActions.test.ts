import { describe, expect, it } from 'vitest';
import { applyRecentActions, type CreativeActionLike } from '../shared/videoStatus';
import { classifyVideo } from '../shared/classify';
import { findRuleTargets, ineligibleReason } from '../shared/agentMatch';
import { campaign, rule, settingsWith, snapshot, video } from './fixtures';

// Snapshot dựng lúc 2026-11-18T00:00:00Z (fixtures)
const camp = campaign({ id: 'c1', status: 'running' });
const lossy = video({ id: 'v1', campaignId: 'c1', productId: 'p1', cost: 300_000, revenue: 0, orders: 0, roi: 0, status: 'delivering' });
const lossyB = video({ id: 'v1', campaignId: 'c1', productId: 'p2', cost: 50_000, revenue: 0, orders: 0, roi: 0, status: 'delivering' });
const other = video({ id: 'v2', campaignId: 'c1', productId: 'p1', cost: 10_000, status: 'delivering' });
const base = snapshot({ campaigns: [camp], videos: [lossy, lossyB, other] });

const act = (p: Partial<CreativeActionLike> & { executedAt: string }): CreativeActionLike => ({
  actionType: 'remove_creative',
  status: 'success',
  target: { campaignId: 'c1', videoId: 'v1' },
  ...p,
});

describe('applyRecentActions — video vừa gỡ / thêm lại', () => {
  it('gỡ thành công sau lúc dựng snapshot → mọi dòng của video trong chiến dịch thành excluded', () => {
    const s = applyRecentActions(base, [act({ executedAt: '2026-11-18T05:00:00Z' })]);
    expect(s.videos.filter((v) => v.id === 'v1').map((v) => v.status)).toEqual(['excluded', 'excluded']);
    expect(s.videos.find((v) => v.id === 'v2')!.status).toBe('delivering');
  });

  it('video đã gỡ không còn ở nhóm Cắt lỗ của Agent (bị bỏ qua "đã bị gỡ")', () => {
    const settings = settingsWith({ p1: 3, p2: 3 });
    const r = rule({ id: 'cut', trigger: 'cut', actionType: 'remove_creative' });
    const before = findRuleTargets(r, settings, base).filter((t) => !ineligibleReason('remove_creative', {}, t));
    expect(before.map((t) => t.target.videoId)).toContain('v1');
    const s = applyRecentActions(base, [act({ executedAt: '2026-11-18T05:00:00Z' })]);
    const after = findRuleTargets(r, settings, s).filter((t) => !ineligibleReason('remove_creative', {}, t));
    expect(after.map((t) => t.target.videoId)).not.toContain('v1');
    expect(classifyVideo(s.videos[0], camp, settings)).not.toBeNull();
  });

  it('thao tác trước lúc dựng snapshot, lỗi hoặc đang chờ TikTok → không đổi', () => {
    for (const a of [
      act({ executedAt: '2026-11-17T23:00:00Z' }),
      act({ executedAt: '2026-11-18T05:00:00Z', status: 'failed' }),
      act({ executedAt: '2026-11-18T05:00:00Z', status: 'running' }),
      act({ executedAt: '2026-11-18T05:00:00Z', actionType: 'boost_creative' }),
    ]) {
      expect(applyRecentActions(base, [a])).toBe(base);
    }
  });

  it('gỡ rồi Hoàn tác (thêm lại mới hơn) → video chạy lại', () => {
    const removed = snapshot({ campaigns: [camp], videos: [{ ...lossy, status: 'excluded' }] });
    const s = applyRecentActions(removed, [
      act({ executedAt: '2026-11-18T05:00:00Z', status: 'undone' }),
      act({ executedAt: '2026-11-18T06:00:00Z', actionType: 'add_creative' }),
    ]);
    expect(s.videos[0].status).toBe('delivering');
  });

  it('lấy thao tác mới nhất: thêm lại rồi gỡ lại → excluded', () => {
    const s = applyRecentActions(base, [
      act({ executedAt: '2026-11-18T07:00:00Z' }),
      act({ executedAt: '2026-11-18T06:00:00Z', actionType: 'add_creative' }),
    ]);
    expect(s.videos[0].status).toBe('excluded');
  });

  it('video ở chiến dịch khác không bị đổi', () => {
    const s = applyRecentActions(base, [act({ executedAt: '2026-11-18T05:00:00Z', target: { campaignId: 'c9', videoId: 'v1' } })]);
    expect(s).toBe(base);
  });
});
