import { Link } from 'react-router-dom';
import Modal from '../../../components/ui/Modal';
import { formatDateTime, formatNumber, formatVnd } from '../../../lib/format';
import { judgeStep, TUNE_CODES, tuneActionText, tuneHistory, tuneSettingsOf } from '../../../../shared/campaignTune';
import { useAgentStore } from '../agent/agentStore';
import { useAdsSettings } from '../settings';
import { TUNE_TONE, type CampaignTune } from '../useCampaignTune';
import type { Campaign } from '../types';

interface CampaignTuneModalProps {
  campaign: Campaign;
  tune: CampaignTune;
  onClose: () => void;
}

const money = (n: number | null) => (n == null ? '--' : `${n < 0 ? '−' : '+'}${formatVnd(Math.abs(n))}`);

/** Hộp chi tiết 1 chiến dịch (Sếp chốt 26/11): số chính, lãi/lỗ theo sản phẩm, lịch sử bước thử, việc tiếp theo */
export default function CampaignTuneModal({ campaign, tune, onClose }: CampaignTuneModalProps) {
  const { state } = useAgentStore();
  const { settings } = useAdsSettings();
  const s = tuneSettingsOf(settings);
  const e = tune.econ;
  const perDay = (n: number | null) => (n == null ? null : n / Math.max(1, e.days));
  const maxAbs = Math.max(1, ...e.products.map((p) => Math.abs(perDay(p.profit) ?? 0)));
  const history = tuneHistory(state.actions, campaign.id).slice(0, 8);
  const pending = state.proposals.find((p) => p.status === 'pending' && p.target.campaignId === campaign.id && !p.target.productId && !p.target.videoId);
  const label = tune.signal ? 'Dấu hiệu' : TUNE_CODES[tune.code];

  return (
    <Modal title={campaign.name} description={`7 ngày tính cả hôm nay · ID ${campaign.id}`} onClose={onClose}>
      <div className="space-y-5 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tune.signal ? 'bg-amber-50 text-amber-700' : TUNE_TONE[tune.kind]}`}>
            {tune.code.length === 2 && !tune.signal && <span className="mr-1 opacity-70">{tune.code}</span>}
            {label}
          </span>
          <span className="text-sm text-muted">{tune.reason}</span>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {[
            ['ROI thực', formatNumber(e.roi, 2), e.roi != null && e.breakEven != null && e.roi < e.breakEven ? 'text-danger' : ''],
            ['Hoà vốn CD', formatNumber(e.breakEven, 2), ''],
            ['ROI mục tiêu', formatNumber(campaign.targetRoi, 1), ''],
            ['Tiêu NS', e.budgetUse == null ? '--' : `${formatNumber(e.budgetUse)}%`, ''],
            ['Lãi/ngày', money(perDay(e.profit)), (e.profit ?? 0) < 0 ? 'text-danger' : 'text-accent-green'],
          ].map(([k, v, cls]) => (
            <div key={k} className="rounded-xl bg-canvas px-3 py-2">
              <span className="block text-xs text-muted">{k}</span>
              <b className={`text-lg tabular-nums ${cls}`}>{v}</b>
            </div>
          ))}
        </div>

        <section>
          <h3 className="mb-2 text-sm font-semibold">Lãi/lỗ mỗi ngày theo sản phẩm</h3>
          <ul className="space-y-2">
            {e.products.map((p) => {
              const v = perDay(p.profit);
              const w = v == null ? 0 : (Math.abs(v) / maxAbs) * 50;
              return (
                <li key={p.id} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_max-content] items-center gap-3 text-sm">
                  <span className="truncate" title={p.name}>{p.name}</span>
                  <span className="relative h-3 rounded-full bg-canvas">
                    <span className="absolute inset-y-[-3px] left-1/2 w-px bg-muted/40" />
                    {v != null && (
                      <span
                        className={`absolute inset-y-0 rounded-full ${v < 0 ? 'bg-danger' : 'bg-accent-green'}`}
                        style={v < 0 ? { right: '50%', width: `${w}%` } : { left: '50%', width: `${w}%` }}
                      />
                    )}
                  </span>
                  <span className={`whitespace-nowrap tabular-nums ${v == null ? 'text-muted' : v < 0 ? 'text-danger' : 'text-accent-green'}`}>
                    {v == null ? 'chưa có hoà vốn' : money(v)}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-xs text-muted">Hoà vốn chiến dịch = tổng doanh thu ÷ tổng lời gộp các sản phẩm (mỗi sản phẩm theo ROI hoà vốn riêng).</p>
        </section>

        <section>
          <h3 className="mb-1 text-sm font-semibold">Lịch sử thử</h3>
          <p className="mb-3 text-xs text-muted">Mỗi bước đổi 1 thứ, đo {Math.round(s.waitHours / 24)} ngày sau so với trung bình/ngày lúc quyết định</p>
          {history.length === 0 && !tune.action ? (
            <p className="text-sm text-muted">Chưa có bước thử nào.</p>
          ) : (
            <ol className="relative space-y-4 border-l-2 border-line pl-5">
              {history.map((a) => {
                const j = judgeStep(a, s, e.breakEven);
                const what = a.actionType === 'update_budget'
                  ? `Ngân sách ${formatVnd(a.params.prev?.budget)} → ${formatVnd(a.params.next?.budget)}`
                  : `ROI mục tiêu ${formatNumber(a.params.prev?.roasBid, 1)} → ${formatNumber(a.params.next?.roasBid, 1)}`;
                const revert = !!(a.params.tune?.revertOf || a.undoOf);
                const dot = a.status === 'undone' || revert ? 'border-danger' : j ? (j.keep ? 'border-accent-green' : 'border-danger') : 'border-amber-500';
                return (
                  <li key={a.id} className="relative">
                    <span className={`absolute -left-[27px] top-1 size-3.5 rounded-full border-[3px] bg-white ${dot}`} />
                    <b className="text-sm">
                      {formatDateTime(a.executedAt)} · {revert ? 'Lùi lại' : a.params.tune?.step ? `Bước ${a.params.tune.step}` : 'Đổi tay'} · {what}
                    </b>
                    <p className="text-xs text-muted">
                      {a.status === 'undone'
                        ? 'Đã hoàn tác'
                        : revert
                          ? 'Trả về số cũ'
                          : j
                            ? `Đo: ${j.text} → ${j.keep ? 'Giữ' : 'Lùi'}`
                            : 'Đang đo'}
                    </p>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        {(tune.action || pending) && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-primary-soft px-4 py-3">
            <p className="text-sm">
              <span className="text-muted">Việc tiếp theo: </span>
              <b>{pending ? 'Có đề xuất đang chờ duyệt' : tuneActionText(tune.action!)}</b>
              {!pending && tune.action && <span className="text-muted"> · BOT đề xuất ở lượt quét tới (khi bật quy tắc)</span>}
            </p>
            <Link
              to="/care-ads/product?view=pending"
              className="rounded-xl bg-primary px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-hover"
            >
              Xem Chờ duyệt
            </Link>
          </div>
        )}
      </div>
    </Modal>
  );
}
