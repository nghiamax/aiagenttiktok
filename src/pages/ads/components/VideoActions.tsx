import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Loader2, RotateCcw, Trash2, Zap, type LucideIcon } from 'lucide-react';
import { ineligibleReason, offsetOf, type RuleTarget } from '../../../../shared/agentMatch';
import { offsetWarning, profitWarning } from '../../../../shared/offsetText';
import { useAdsSettings } from '../settings';
import { effectiveStatus } from '../../../../shared/videoStatus';
import { useAgentConfig } from '../agent/useAgentConfig';
import { useAgentStore, type ExecOutcome } from '../agent/agentStore';
import ConfirmExecuteModal from '../agent/components/ConfirmExecuteModal';
import { describeExec } from '../agent/execText';
import { useAdsData } from '../data';
import type { AdsVideo, VideoStatus } from '../types';
import type { AgentActionType, AgentRuleParams } from '../agent/types';
import BoostDialog from './BoostDialog';

interface VideoActionsProps {
  video: AdsVideo;
  campaignRunning: boolean;
  /** Link mở video trên TikTok; null nếu chưa có username tác giả */
  videoUrl: string | null;
}

type Manual = 'remove_creative' | 'add_creative' | 'boost_creative';

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/**
 * Thao tác trên dòng video: Gỡ / Thêm lại / Tăng cường (hộp xác nhận → server chạy thật, Nhật ký "Thủ công") + mở TikTok.
 * Điều kiện nút lấy từ ineligibleReason (giống Agent); server kiểm tra lại bằng số liệu mới trước khi gửi.
 */
export default function VideoActions({ video: v, campaignRunning, videoUrl }: VideoActionsProps) {
  const { snapshot } = useAdsData();
  const { state, runManual } = useAgentStore();
  const { config } = useAgentConfig();
  const { settings } = useAdsSettings();
  const [boosting, setBoosting] = useState(false);
  const [confirm, setConfirm] = useState<{ actionType: Manual; params: AgentRuleParams } | null>(null);
  const [result, setResult] = useState<ExecOutcome | null>(null);
  // Gỡ: đơn bù ở các sản phẩm khác của video trong chiến dịch (so với dòng sản phẩm chính)
  const mainCampaign = v.mainCampaignId ?? v.campaignId;
  const mainProduct = v.mainProductId ?? v.productId;
  const offset = offsetOf(
    snapshot,
    settings,
    mainCampaign,
    v.id,
    new Set(snapshot.videos.filter((x) => x.campaignId === mainCampaign && x.id === v.id && x.productId === mainProduct)),
  );
  // Dòng "Gắn SP khác" → thao tác trên sản phẩm thật của video
  const target = { campaignId: v.mainCampaignId ?? v.campaignId, productId: v.mainProductId ?? v.productId, videoId: v.id };

  // Thao tác gỡ / thêm gần nhất sau lần cập nhật số liệu → trạng thái tạm (bảng chưa kịp cập nhật)
  const since = Date.parse(snapshot.updatedAt ?? '') || 0;
  const recent = state.actions.find(
    (a) =>
      a.target.campaignId === v.campaignId &&
      a.target.videoId === v.id &&
      (a.actionType === 'remove_creative' || a.actionType === 'add_creative' || a.actionType === 'boost_creative') &&
      a.status !== 'failed' &&
      Date.parse(a.executedAt) > since,
  );
  let status: VideoStatus = effectiveStatus(v);
  if (recent?.status === 'success' && recent.actionType === 'remove_creative') status = 'excluded';
  if (recent?.status === 'success' && recent.actionType === 'add_creative') status = 'delivering';

  const probe = { campaignRunning, videoStatus: status } as RuleTarget;
  const boostParams = { boostBudget: 1, boostDays: 1 };
  const reason = (t: AgentActionType, params: AgentRuleParams = {}) => ineligibleReason(t, params, probe);
  const removed = status === 'excluded';

  const todayStart = startOfToday();
  const usedToday = state.actions
    .filter((a) => a.actionType === 'boost_creative' && a.status !== 'failed' && !a.undoOf && Date.parse(a.executedAt) >= todayStart)
    .reduce((s, a) => s + (a.params.boostBudget ?? 0), 0);

  const pendingText =
    recent?.status === 'running'
      ? recent.actionType === 'remove_creative'
        ? 'Đang gỡ…'
        : recent.actionType === 'add_creative'
          ? 'Đang thêm lại…'
          : 'Đang gửi…'
      : recent?.status === 'success'
        ? recent.actionType === 'remove_creative'
          ? 'Đã gỡ'
          : recent.actionType === 'add_creative'
            ? 'Đã thêm lại'
            : 'Đang tăng cường'
        : null;

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center justify-end gap-1">
        {recent?.status === 'running' ? (
          <span className="flex items-center gap-1 px-2 text-xs font-medium text-primary">
            <Loader2 className="size-3.5 animate-spin" />
            {pendingText}
          </span>
        ) : removed ? (
          <ActionButton icon={RotateCcw} label="Thêm lại" why={reason('add_creative')} onClick={() => setConfirm({ actionType: 'add_creative', params: {} })} />
        ) : (
          <>
            <ActionButton icon={Trash2} label="Gỡ" danger why={reason('remove_creative')} onClick={() => setConfirm({ actionType: 'remove_creative', params: {} })} />
            <ActionButton icon={Zap} label="Tăng cường" iconOnly why={reason('boost_creative', boostParams)} onClick={() => setBoosting(true)} />
          </>
        )}
        {videoUrl ? (
          <a
            href={videoUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Mở video trên TikTok"
            title="Mở video trên TikTok"
            className="flex size-8 items-center justify-center rounded-lg text-primary transition-colors hover:bg-primary-soft"
          >
            <ExternalLink className="size-4" />
          </a>
        ) : (
          <span
            aria-label="Không mở được video"
            title="Không có username tác giả (video riêng tư / đã xoá) nên không mở được"
            className="flex size-8 cursor-not-allowed items-center justify-center rounded-lg text-muted opacity-40"
          >
            <ExternalLink className="size-4" />
          </span>
        )}
      </div>
      {recent?.status === 'success' && pendingText && <span className="text-xs text-accent-green">{pendingText}</span>}
      {result && (
        <span className={`max-w-[220px] text-right text-xs ${result.ok ? 'text-accent-green' : 'text-danger'}`}>
          {result.ok ? 'Đã gửi lên TikTok · ' : `${result.message} · `}
          <Link to="/ads/agent?view=log" className="font-semibold underline underline-offset-2 hover:text-ink">
            Nhật ký
          </Link>
        </span>
      )}

      {boosting && (
        <BoostDialog
          title={v.title || `Video ${v.id}`}
          usedToday={usedToday}
          dailyCap={config.guardrails.dailyBoostCap}
          onClose={() => setBoosting(false)}
          onNext={(boostBudget, boostDays) => {
            setBoosting(false);
            setConfirm({ actionType: 'boost_creative', params: { boostBudget, boostDays } });
          }}
        />
      )}
      {confirm && (
        <ConfirmExecuteModal
          title="Chạy thật trên TikTok?"
          lines={[
            describeExec(snapshot, confirm.actionType, confirm.params, target) +
              (confirm.actionType === 'remove_creative' && offset ? `\n${offsetWarning(offset)}` : ''),
          ]}
          topWarning={confirm.actionType === 'remove_creative' && offset?.profitable ? profitWarning(1) : undefined}
          boostTotal={confirm.actionType === 'boost_creative' ? (confirm.params.boostBudget ?? 0) * (confirm.params.boostDays ?? 1) : undefined}
          confirmLabel="Xác nhận"
          onConfirm={async () => setResult(await runManual(confirm.actionType, target, confirm.params))}
          onClose={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

interface ActionButtonProps {
  icon: LucideIcon;
  label: string;
  /** Lý do không làm được (null = làm được) */
  why: string | null;
  danger?: boolean;
  iconOnly?: boolean;
  onClick: () => void;
}

function ActionButton({ icon: Icon, label, why, danger, iconOnly, onClick }: ActionButtonProps) {
  const tone = danger ? 'text-danger hover:bg-rose-50' : 'text-primary hover:bg-primary-soft';
  return (
    <button
      type="button"
      disabled={!!why}
      onClick={onClick}
      aria-label={label}
      title={why ? `${label}: ${why}` : `${label} (hộp xác nhận → chạy thật trên TikTok)`}
      className={`flex h-8 items-center gap-1 rounded-lg text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent ${iconOnly ? 'w-8 justify-center' : 'px-2'} ${tone}`}
    >
      <Icon className="size-4" />
      {!iconOnly && label}
    </button>
  );
}
