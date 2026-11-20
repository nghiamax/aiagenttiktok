import { formatNumber } from '../../../lib/format';
import type { AdsSnapshot } from '../types';
import { describeTarget } from './lookup';
import type { AgentActionLog, AgentActionType, AgentRuleParams, AgentTarget } from './types';

/* Mô tả bằng lời việc sẽ chạy thật trên TikTok (hộp xác nhận) */

const vnd = (n: number | null | undefined) => (n == null ? '--' : `${formatNumber(Math.round(n))}đ`);
const q = (s: string) => `«${s}»`;

/** Một việc của đề xuất, viết bằng lời (số "khoảng" tính từ snapshot; server tính số chính xác lúc chạy) */
export function describeExec(
  snapshot: AdsSnapshot,
  actionType: AgentActionType,
  params: AgentRuleParams,
  target: AgentTarget,
): string {
  const info = describeTarget(snapshot, target);
  const campaign = snapshot.campaigns.find((c) => c.id === target.campaignId);
  const cName = q(info.campaignName);
  switch (actionType) {
    case 'remove_creative':
      return `Gỡ video ${q(info.title)} khỏi chiến dịch ${cName}`;
    case 'add_creative':
      return `Thêm lại video ${q(info.title)} vào chiến dịch ${cName}`;
    case 'boost_creative': {
      const budget = params.boostBudget ?? 0;
      const days = params.boostDays ?? 1;
      return `Tăng cường video ${q(info.title)} ${vnd(budget)}/ngày × ${days} ngày (tối đa ${vnd(budget * days)})`;
    }
    case 'update_budget': {
      const pct = params.budgetChangePct ?? 0;
      const cur = campaign?.budget ?? null;
      const next = cur != null ? Math.round((cur * (1 + pct / 100)) / 1000) * 1000 : null;
      return `${pct >= 0 ? 'Tăng' : 'Giảm'} ngân sách chiến dịch ${cName} ${Math.abs(pct)}%${
        cur != null ? ` (khoảng ${vnd(cur)} → ${vnd(next)})` : ''
      }`;
    }
    case 'update_roi_target': {
      const pct = params.roiTargetChangePct ?? 0;
      const cur = campaign?.targetRoi ?? null;
      const next = cur != null ? Math.round(cur * (1 + pct / 100) * 10) / 10 : null;
      return `${pct >= 0 ? 'Tăng' : 'Giảm'} ROI mục tiêu chiến dịch ${cName} ${Math.abs(pct)}%${
        cur != null ? ` (khoảng ${cur} → ${next})` : ''
      }`;
    }
    case 'disable_product':
      return `Tắt sản phẩm ${q(info.title)} trong chiến dịch ${cName}`;
    case 'enable_product':
      return `Bật lại sản phẩm ${q(info.title)} trong chiến dịch ${cName}`;
    case 'remind':
      return `Nhắc việc ${q(info.title)}`;
  }
}

/** Hoàn tác: làm ngược lại thao tác đã chạy */
export function describeUndo(snapshot: AdsSnapshot, a: AgentActionLog): string {
  const info = describeTarget(snapshot, a.target);
  const cName = q(info.campaignName);
  const prev = a.params.prev ?? {};
  switch (a.actionType) {
    case 'remove_creative':
      return `Thêm lại video ${q(info.title)} vào chiến dịch ${cName}`;
    case 'add_creative':
      return `Gỡ lại video ${q(info.title)} khỏi chiến dịch ${cName}`;
    case 'update_budget':
      return `Đặt lại ngân sách chiến dịch ${cName} về ${vnd(prev.budget)}`;
    case 'update_roi_target':
      return `Đặt lại ROI mục tiêu chiến dịch ${cName} về ${prev.roasBid ?? '--'}`;
    case 'disable_product':
      return `Bật lại sản phẩm ${q(info.title)} trong chiến dịch ${cName}`;
    case 'enable_product':
      return `Tắt lại sản phẩm ${q(info.title)} trong chiến dịch ${cName}`;
    default:
      return 'Không hoàn tác được';
  }
}

/** Thao tác hoàn tác được (khớp server/agent/executor.ts canUndo) */
export const UNDOABLE: AgentActionType[] = [
  'remove_creative',
  'add_creative',
  'update_budget',
  'update_roi_target',
  'disable_product',
  'enable_product',
];

/** Lỗi TikTok → câu tiếng Việt ngắn (chuỗi gốc vẫn xem được qua tooltip) */
export function friendlyError(error: string): string {
  if (/IN_ROLL_OUT|NOT_AVAILABLE/.test(error))
    return 'TikTok chặn lệnh này ở kết nối cũ (19/11). Server đã chuyển sang kết nối mới — lần duyệt sau sẽ chạy được.';
  if (/login|đăng nhập|401/i.test(error)) return 'Chưa đăng nhập TikTok — chạy npm run login rồi thử lại.';
  if (/rate limit/i.test(error)) return 'TikTok đang giới hạn tần suất — thử lại sau ít phút.';
  return error.length > 160 ? `${error.slice(0, 160)}…` : error;
}

export const canUndo = (a: AgentActionLog, all: AgentActionLog[]) =>
  !a.undoOf &&
  a.status === 'success' &&
  UNDOABLE.includes(a.actionType) &&
  !all.some((x) => x.undoOf === a.id && x.status !== 'failed');
