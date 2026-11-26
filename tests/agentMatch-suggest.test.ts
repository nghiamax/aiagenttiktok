import { describe, expect, it } from 'vitest';
import { findRuleTargets } from '../shared/agentMatch';
import { buildSuggestions } from '../shared/suggest';
import { MIN_BOOST_BUDGET_VND } from '../shared/agentPolicy';
import { campaign, GUARDRAILS, product, rule, settingsWith, snapshot, video } from './fixtures';

/** Video lỗ (chi ≥ 100k, 0 đơn) gắn 2 sản phẩm trong cùng chiến dịch + 1 video lỗ ở chiến dịch khác */
const snap = snapshot({
  campaigns: [campaign({ id: 'c1' }), campaign({ id: 'c2' })],
  products: [product({ id: 'p1', campaignId: 'c1' }), product({ id: 'p2', campaignId: 'c1' }), product({ id: 'p3', campaignId: 'c2' })],
  videos: [
    video({ id: 'v1', campaignId: 'c1', productId: 'p1', cost: 200_000 }),
    video({ id: 'v1', campaignId: 'c1', productId: 'p2', cost: 150_000 }),
    video({ id: 'v2', campaignId: 'c2', productId: 'p3', cost: 300_000 }),
  ],
});
const S = settingsWith();

describe('findRuleTargets (Agent và Gợi ý dùng chung)', () => {
  it('cấp video gộp theo (chiến dịch, video): 1 video gắn 2 sản phẩm chỉ tính 1 lần', () => {
    const t = findRuleTargets(rule({ id: 'r', trigger: 'cut' }), S, snap);
    expect(t.map((x) => `${x.target.campaignId}/${x.target.videoId}`)).toEqual(['c1/v1', 'c2/v2']);
  });

  it('tôn trọng phạm vi chiến dịch', () => {
    const t = findRuleTargets(rule({ id: 'r', trigger: 'cut', campaignIds: ['c2'] }), S, snap);
    expect(t.map((x) => x.target.videoId)).toEqual(['v2']);
  });

  it('quy tắc chưa chọn nhóm → không có đối tượng', () => {
    expect(findRuleTargets(rule({ id: 'r', trigger: '' }), S, snap)).toEqual([]);
  });

  it('ghi trạng thái chiến dịch đang chạy / đã tắt', () => {
    const s2 = { ...snap, campaigns: [campaign({ id: 'c1', status: 'paused' }), campaign({ id: 'c2' })] };
    const t = findRuleTargets(rule({ id: 'r', trigger: 'cut' }), S, s2);
    expect(t.find((x) => x.target.campaignId === 'c1')?.campaignRunning).toBe(false);
  });
});

describe('buildSuggestions — xác nhận bằng 14 ngày (Sếp chốt 22/11)', () => {
  it('video lỗ 7 ngày nhưng 14 ngày có lời → không gợi ý gỡ, đếm vào "chưa xác nhận"', () => {
    const d14 = snapshot({
      ...snap,
      range: { from: '2026-11-04', to: '2026-11-17' },
      videos: [
        video({ id: 'v1', campaignId: 'c1', productId: 'p1', cost: 400_000 }),
        video({ id: 'v1', campaignId: 'c1', productId: 'p2', cost: 300_000 }),
        video({ id: 'v2', campaignId: 'c2', productId: 'p3', cost: 500_000, revenue: 5_000_000, orders: 10 }),
      ],
    });
    const g = buildSuggestions(snap, S, [], GUARDRAILS, d14).find((x) => x.id === 'video-cut');
    expect(g?.count).toBe(1);
    expect(g?.examples.map((e) => e.target.videoId)).toEqual(['v1']);
    expect(g?.unconfirmed).toBe(1);
    // Không có khung 14 ngày → như cũ
    expect(buildSuggestions(snap, S, [], GUARDRAILS, null).find((x) => x.id === 'video-cut')?.count).toBe(2);
  });
});

describe('buildSuggestions', () => {
  it('gợi ý Gỡ video lỗ, đếm 2 video, tổng chi 650k; done khi quy tắc đang bật', () => {
    const off = buildSuggestions(snap, S, [], GUARDRAILS).find((s) => s.id === 'video-cut');
    expect(off?.count).toBe(2);
    expect(off?.amount).toBe(650_000);
    expect(off?.done).toBe(false);

    const on = buildSuggestions(snap, S, [rule({ id: 'x', trigger: 'cut', actionType: 'remove_creative' })], GUARDRAILS).find(
      (s) => s.id === 'video-cut',
    );
    expect(on?.done).toBe(true);
  });

  it('quy tắc cùng nhóm nhưng đang Tắt → chưa done', () => {
    const r = rule({ id: 'x', trigger: 'cut', actionType: 'remove_creative', mode: 'off' });
    expect(buildSuggestions(snap, S, [r], GUARDRAILS).find((s) => s.id === 'video-cut')?.done).toBe(false);
  });

  it('video đã bị gỡ (EXCLUDED) không còn trong gợi ý Gỡ video; hết video thì ẩn gợi ý', () => {
    const s = snapshot({
      ...snap,
      videos: snap.videos.map((v) => (v.id === 'v2' ? { ...v, status: 'excluded' as const } : v)),
    });
    const g = buildSuggestions(s, S, [], GUARDRAILS).find((x) => x.id === 'video-cut');
    expect(g?.count).toBe(1);
    expect(g?.examples.map((e) => e.target.videoId)).toEqual(['v1']);

    const all = snapshot({ ...snap, videos: snap.videos.map((v) => ({ ...v, status: 'excluded' as const })) });
    expect(buildSuggestions(all, S, [], GUARDRAILS).some((x) => x.id === 'video-cut')).toBe(false);
  });

  it('chiến dịch đang tắt → không gợi ý gỡ video của nó', () => {
    const s = snapshot({ ...snap, campaigns: [campaign({ id: 'c1', status: 'paused' }), campaign({ id: 'c2' })] });
    const g = buildSuggestions(s, S, [], GUARDRAILS).find((x) => x.id === 'video-cut');
    expect(g?.examples.map((e) => e.target.videoId)).toEqual(['v2']);
  });

  it('video cần ủy quyền / đã gỡ → không gợi ý tăng cường', () => {
    const s = snapshot({
      campaigns: [campaign({ id: 'c1', targetRoi: 5 })],
      products: [product({ id: 'p1', campaignId: 'c1' })],
      videos: [video({ id: 'v9', campaignId: 'c1', productId: 'p1', cost: 300_000, revenue: 3_000_000, orders: 5, status: 'excluded' })],
    });
    expect(buildSuggestions(s, S, [], GUARDRAILS).some((x) => x.id === 'video-scale')).toBe(false);
  });

  it('thiếu ROI hoà vốn cho sản phẩm có chi tiêu → gợi ý đầu tiên', () => {
    const s = snapshot({ ...snap, products: [product({ id: 'p1', campaignId: 'c1', cost: 500_000 })] });
    expect(buildSuggestions(s, S, [], GUARDRAILS)[0]?.id).toBe('break-even');
    expect(buildSuggestions(s, settingsWith({ p1: 4 }), [], GUARDRAILS).some((x) => x.id === 'break-even')).toBe(false);
  });

  it('sản phẩm lỗ chi dưới 50k là nhiễu → không gợi ý', () => {
    const s = snapshot({
      campaigns: [campaign({ id: 'c1' })],
      products: [product({ id: 'p1', campaignId: 'c1', cost: 350, revenue: 0, roi: 0 })],
    });
    expect(buildSuggestions(s, settingsWith({ p1: 4 }), [], GUARDRAILS).some((x) => x.id === 'product-loss')).toBe(false);
  });

  it('chiến dịch đã tắt không có gợi ý đổi ngân sách / ROI mục tiêu', () => {
    const s = snapshot({ campaigns: [campaign({ id: 'c1', status: 'paused', budget: 6_000_000, cost: 0, orders: 0 })] });
    // chi = 0 và đơn = 0 → không phân loại; thêm 1 chiến dịch tắt có chi tiêu thấp
    const s2 = snapshot({ campaigns: [campaign({ id: 'c1', status: 'paused', budget: 6_000_000, cost: 100_000, orders: 1, revenue: 900_000, roi: 9 })] });
    for (const x of [s, s2]) {
      expect(buildSuggestions(x, S, [], GUARDRAILS).filter((g) => g.id.startsWith('campaign-'))).toEqual([]);
    }
  });

  it('tăng cường: trần thấp hơn mức tối thiểu TikTok → kèm nâng trần', () => {
    const s = snapshot({
      campaigns: [campaign({ id: 'c1', targetRoi: 5 })],
      products: [product({ id: 'p1', campaignId: 'c1' })],
      videos: [video({ id: 'v9', campaignId: 'c1', productId: 'p1', cost: 300_000, revenue: 3_000_000, orders: 5 })],
    });
    const low = buildSuggestions(s, S, [], { ...GUARDRAILS, dailyBoostCap: 200_000 }).find((x) => x.id === 'video-scale');
    expect(low?.action.kind === 'rule' && low.action.guardrailsPatch).toEqual({ dailyBoostCap: MIN_BOOST_BUDGET_VND });
    const ok = buildSuggestions(s, S, [], GUARDRAILS).find((x) => x.id === 'video-scale');
    expect(ok?.action.kind === 'rule' && ok.action.guardrailsPatch).toBeUndefined();
  });

  it('thứ tự: chưa làm trước đã làm; Đang mất tiền trước Cơ hội', () => {
    const list = buildSuggestions(snap, S, [rule({ id: 'x', trigger: 'cut', actionType: 'remove_creative' })], GUARDRAILS);
    const firstDone = list.findIndex((x) => x.done);
    expect(list.slice(firstDone).every((x) => x.done)).toBe(true);
  });
});

describe('Gợi ý cấp chiến dịch → bật BOT chỉnh ROI & ngân sách (Sếp chốt 26/11)', () => {
  const snap = snapshot({
    campaigns: [campaign({ id: 'c1', status: 'running', budget: 400_000, cost: 2.8e6, revenue: 14e6, orders: 40, roi: 5, targetRoi: 4 })],
    products: [product({ id: 'p1', campaignId: 'c1', cost: 2.8e6, revenue: 14e6, orders: 40 })],
  });
  const S = settingsWith({ p1: 3 });

  it('nút Bật quy tắc trỏ quy tắc c-tune, không tạo quy tắc theo nhóm cũ', () => {
    const g = buildSuggestions(snap, S, [], GUARDRAILS).find((x) => x.id === 'campaign-scale');
    expect(g?.action).toMatchObject({ kind: 'rule', level: 'campaign', trigger: 'c-tune', actionType: 'update_roi_target' });
    expect(g?.done).toBe(false);
    const tune = rule({ id: 'tune-campaign', level: 'campaign', trigger: 'c-tune', actionType: 'update_roi_target', params: {} });
    expect(buildSuggestions(snap, S, [tune], GUARDRAILS).find((x) => x.id === 'campaign-scale')?.done).toBe(true);
  });
});
