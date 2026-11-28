import { cutLateText, cutRoiText, cutWindows, isWrongCut } from '../../shared/actionVerdict.js';
import type { ConfirmedTarget } from '../../shared/agentMatch.js';
import type { AdsSnapshot } from '../../shared/adsSnapshot.js';
import type { AgentActionLog, AgentConfig, AgentProposal, AgentTarget, MetricWindow, RuleMode } from '../../shared/agentTypes.js';
import { effectiveStatus } from '../../shared/videoStatus.js';

/**
 * THÊM LẠI VIDEO KHI GỠ SAI (Sếp chốt 28/11): lần gỡ video đã đủ cơ sở kết luận sai (tính đủ ngày gỡ + đơn về sau,
 * ROI lúc gỡ ≥ hoà vốn — `isWrongCut`) → BOT làm theo chế độ của quy tắc đã gỡ:
 * Cần duyệt → đề xuất Thêm lại ở Chờ duyệt; BOT chạy → đề xuất + BOT tự chạy (runAutoProposals);
 * quy tắc Tắt / đã xoá → không làm; gỡ thủ công (không có quy tắc) → đề xuất Cần duyệt (`ruleId` = "").
 * Mỗi lần gỡ chỉ đề xuất 1 lần (Sếp Bỏ qua → không đề xuất lại). Logic thuần — engine.ts gọi.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Chỉ xét lần gỡ trong ngần này ngày (khớp số ngày đo "Sau thao tác" + ngày gỡ) */
export const REREADD_WINDOW_DAYS = 9;
/** Video vừa thêm lại vì gỡ sai → quy tắc gỡ bỏ qua video đó ngần này ngày (chống gỡ ↔ thêm lặp) */
export const REREMOVE_BLOCK_DAYS = 7;
export const REREMOVE_BLOCK_REASON = 'Vừa thêm lại vì gỡ sai — chưa gỡ lại';

const sameVideo = (x: AgentTarget, y: AgentTarget) => x.campaignId === y.campaignId && x.videoId === y.videoId;

/** Chế độ dùng cho đề xuất thêm lại: quy tắc đã gỡ (Tắt / đã xoá → null = không làm), gỡ thủ công → Cần duyệt */
export function reAddMode(cut: AgentActionLog, cfg: AgentConfig): { ruleId: string; mode: RuleMode } | null {
  if (!cut.ruleId) return { ruleId: '', mode: 'approve' };
  const rule = cfg.rules.find((r) => r.id === cut.ruleId);
  if (!rule || rule.mode === 'off') return null;
  return { ruleId: rule.id, mode: rule.mode };
}

/** Lý do không thêm lại được (null = được). Không xét chế độ quy tắc / đề xuất đã có. */
export function reAddBlockReason(cut: AgentActionLog, actions: AgentActionLog[], snapshot: AdsSnapshot, evaluateAfterHours: number, now: number): string | null {
  if (cut.status !== 'success') return 'Lần gỡ đã hoàn tác / chưa chạy';
  if (!isWrongCut(cut, evaluateAfterHours, now)) return 'Lần gỡ không còn là Gỡ sai';
  const at = Date.parse(cut.executedAt);
  // Đã có thao tác mới trên video (Thêm lại tay, Hoàn tác, gỡ / thêm khác…) → Sếp đã xử lý
  const later = actions.some(
    (x) => x.id !== cut.id && x.status !== 'failed' && x.actionType !== 'remind' && sameVideo(x.target, cut.target) && Date.parse(x.executedAt) > at,
  );
  if (later) return 'Video đã có thao tác mới sau lần gỡ';
  const t = cut.target;
  const camp = snapshot.campaigns.find((c) => c.id === t.campaignId);
  if (camp && camp.status !== 'running') return 'Chiến dịch đang tắt';
  const rows = snapshot.videos.filter((v) => v.campaignId === t.campaignId && v.id === t.videoId && v.contentType !== 'product_card');
  // Không có dòng (video gỡ không còn chi) = vẫn đang gỡ theo Nhật ký; có dòng mà không phải "đã gỡ" → đã chạy lại
  const main = rows.find((v) => !v.crossProduct) ?? rows[0];
  if (main && effectiveStatus(main) !== 'excluded') return 'Video chưa bị gỡ';
  return null;
}

/** "Thêm lại vì gỡ sai — tính đủ …: ROI lúc gỡ 5,03 ≥ hoà vốn 3,5" */
export function reAddReason(cut: AgentActionLog): string {
  const c = cutWindows(cut);
  return `Gỡ sai — video có lãi: ${cutLateText(cut, c)} → ${cutRoiText(cut, c)}`;
}

/** Ô "Lúc đề xuất" của đề xuất thêm lại = khoảng đã tính (đủ ngày gỡ + đơn về sau) */
export function reAddWindow(cut: AgentActionLog): MetricWindow {
  const c = cutWindows(cut);
  const span = c.span ?? { from: cut.before.from.slice(0, 10), to: cut.before.to.slice(0, 10) };
  return {
    from: `${span.from}T00:00:00+07:00`,
    to: `${span.to}T23:59:59+07:00`,
    cost: c.sum.cost,
    revenue: c.sum.revenue,
    orders: c.sum.orders,
    roi: c.roi,
    breakEven: cut.before.breakEven,
  };
}

/** Đối tượng giả lập cho recheckProposal (đề xuất thêm lại không đi theo nhóm của quy tắc) */
export function reAddMatch(cut: AgentActionLog): ConfirmedTarget {
  const w = reAddWindow(cut);
  return {
    target: cut.target,
    name: cut.target.videoId,
    reason: reAddReason(cut),
    cost: w.cost,
    revenue: w.revenue,
    orders: w.orders,
    roi: w.roi,
    breakEven: w.breakEven,
    videoStatus: 'excluded',
    campaignRunning: true,
  };
}

/** Các lần gỡ cần đề xuất thêm lại ở lượt quét này */
export function findWrongCuts(
  actions: AgentActionLog[],
  proposals: AgentProposal[],
  cfg: AgentConfig,
  snapshot: AdsSnapshot,
  now: number,
): { cut: AgentActionLog; ruleId: string; mode: RuleMode }[] {
  const asked = new Set(proposals.filter((p) => p.reAddOf).map((p) => p.reAddOf!));
  const out: { cut: AgentActionLog; ruleId: string; mode: RuleMode }[] = [];
  for (const a of actions) {
    if (a.actionType !== 'remove_creative' || a.status !== 'success' || a.hidden || a.undoOf) continue;
    if (now - Date.parse(a.executedAt) > REREADD_WINDOW_DAYS * DAY) continue;
    if (asked.has(a.id)) continue;
    const m = reAddMode(a, cfg);
    if (!m) continue;
    if (reAddBlockReason(a, actions, snapshot, cfg.guardrails.evaluateAfterHours, now)) continue;
    out.push({ cut: a, ...m });
  }
  return out;
}

/** Video vừa được thêm lại vì gỡ sai (chưa lỗi) trong REREMOVE_BLOCK_DAYS ngày → không gỡ lại */
export function recentlyReAdded(actions: AgentActionLog[], target: AgentTarget, now: number): boolean {
  return actions.some(
    (x) =>
      x.reAddOf &&
      x.actionType === 'add_creative' &&
      x.status !== 'failed' &&
      sameVideo(x.target, target) &&
      now - Date.parse(x.executedAt) < REREMOVE_BLOCK_DAYS * DAY,
  );
}
