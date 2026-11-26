import { useState } from 'react';
import CampaignTuneTiles from './CampaignTuneTiles';
import { useCampaignTune } from '../useCampaignTune';
import { AlertTriangle, ArrowRight, Bot, Plus, SlidersHorizontal } from 'lucide-react';
import { Link } from 'react-router-dom';
import Card from '../../../components/ui/Card';
import SegmentedControl from '../../../components/ui/SegmentedControl';
import { formatDateTime, formatNumber, shortVnd } from '../../../lib/format';
import { signedVnd } from '../agent/components/VerdictBadge';
import { MODE_LABEL } from '../agent/meta';
import type { AgentRule } from '../agent/types';
import { groupDescription, groupMeta, groupUsesBreakEven, LEVEL_UNIT, type GroupLevel } from '../groups';
import { groupsOf, useAdsSettings } from '../settings';
import type { VideoAction } from '../types';

export interface ActionSummary {
  /** Số đối tượng khác nhau (video gộp theo chiến dịch + video) */
  count: number;
  /** Số dòng (1 video gắn nhiều sản phẩm = nhiều dòng trong bảng Video) */
  rows: number;
  cost: number;
  revenue: number;
  /** Đã gỡ / thuộc chiến dịch đã tắt — Agent không làm gì được nên không tính vào số / chi / DT */
  skipped?: number;
  /** Video Cắt lỗ mà tổng video (gồm đơn bù ở sản phẩm khác) vẫn có lời — đã nằm trong count */
  keepsProfit?: number;
  /** Đã xác nhận và 30 ngày cũng thuộc nhóm ("kéo dài") — đã nằm trong count */
  long?: number;
  /** Dấu hiệu: 7 ngày thuộc nhóm này nhưng 14 ngày khác nhóm — không tính vào count */
  unconfirmed?: number;
}

/** Số đối tượng / chi phí / doanh thu theo ID nhóm, cho từng cấp */
export type InboxSummary = Record<GroupLevel, Record<string, ActionSummary>>;

interface ActionInboxProps {
  summary: InboxSummary;
  /** Số sản phẩm chưa nhập ROI hoà vốn */
  missingBreakEven: number;
  /** focus 'signals' → cuộn tới dải "Dấu hiệu" của nhóm trong bảng */
  onOpenAction: (level: GroupLevel, id: VideoAction, focus?: 'signals') => void;
  onOpenSettings: () => void;
  agent: {
    paused: boolean;
    lastRunAt: string | null;
    pendingCount: number;
    activeRules: number;
    totalRules: number;
    /** Lợi nhuận tác động 30 ngày (ước tính); null nếu chưa có */
    impact30: number | null;
    /** Quy tắc đang xử lý từng nhóm */
    ruleFor: (level: GroupLevel, id: VideoAction) => AgentRule | null;
  };
}

const EMPTY: ActionSummary = { count: 0, rows: 0, cost: 0, revenue: 0 };

/** Video trước vì là nơi có nhiều việc nhất; sau đó từ lớn tới nhỏ */
const LEVEL_TABS: GroupLevel[] = ['video', 'product', 'campaign'];
const LEVEL_NAME: Record<GroupLevel, string> = { video: 'Video', product: 'Sản phẩm', campaign: 'Chiến dịch' };

const total = (s: Record<string, ActionSummary>) => Object.values(s).reduce((acc, x) => acc + x.count, 0);

/** "Agent đang theo dõi": tab Video | Sản phẩm | Chiến dịch, mỗi nhóm là một ô + quy tắc Agent xử lý nhóm đó */
export default function ActionInbox({ summary, missingBreakEven, onOpenAction, onOpenSettings, agent }: ActionInboxProps) {
  const { settings } = useAdsSettings();
  const [level, setLevel] = useState<GroupLevel>('video');
  const groups = groupsOf(settings, level);
  const levelSummary = summary[level];
  const unit = LEVEL_UNIT[level];
  const tiles = groups.filter((g) => g.showInInbox);
  // Mọi sản phẩm đều thiếu hoà vốn → nhóm so với hoà vốn chắc chắn trống, nói rõ thay vì hiện 0
  const breakEvenBlocked = level !== 'campaign' && missingBreakEven > 0;

  // Tab Chiến dịch đếm theo BOT chỉnh ROI & ngân sách (số chiến dịch có việc cần làm)
  const tunes = useCampaignTune();
  const tuneCount = [...tunes.values()].filter((t) => !t.signal && !!t.action).length;
  const levelOptions = LEVEL_TABS.map((l) => ({ value: l, label: `${LEVEL_NAME[l]} ${formatNumber(l === 'campaign' ? tuneCount : total(summary[l]))}` }));

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-line px-5 py-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">Agent đang theo dõi</h2>
            <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-muted">
              <Bot className="size-4" />
              {agent.paused ? 'Agent tạm dừng' : 'Agent'} · Lần chạy gần nhất:{' '}
              {agent.lastRunAt ? formatDateTime(agent.lastRunAt) : 'chưa chạy'} ·{' '}
              <span className={agent.activeRules > 0 ? 'font-medium text-accent-violet' : ''}>
                {formatNumber(agent.activeRules)}/{formatNumber(agent.totalRules)} quy tắc đang bật
              </span>
              {agent.pendingCount > 0 && (
                <span className="font-medium text-danger"> · {formatNumber(agent.pendingCount)} chờ duyệt</span>
              )}
              {agent.impact30 != null && (
                <span className={agent.impact30 >= 0 ? 'text-accent-green' : 'text-danger'}>
                  {' '}
                  · 30 ngày: {signedVnd(agent.impact30)} (ước tính)
                </span>
              )}
            </p>
          </div>
          <SegmentedControl options={levelOptions} value={level} onChange={setLevel} ariaLabel="Cấp theo dõi" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to={`/care-ads/product?view=groups${level === 'video' ? '' : `&level=${level}`}`}
            className="flex w-fit items-center gap-2 rounded-xl border border-line px-3.5 py-2 text-sm font-medium transition-colors hover:bg-canvas"
          >
            <SlidersHorizontal className="size-4 text-muted" />
            Sửa phân nhóm
          </Link>
          <Link
            to="/care-ads/product"
            className="flex w-fit items-center gap-2 rounded-xl bg-primary-soft px-3.5 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-white"
          >
            Mở Care Ads
            {agent.pendingCount > 0 && (
              <span className="rounded-full bg-danger px-1.5 py-0.5 text-xs leading-none text-white">
                {agent.pendingCount} chờ duyệt
              </span>
            )}
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>

      {/* Chiến dịch không so với hoà vốn → không cảnh báo ở tab Chiến dịch */}
      {missingBreakEven > 0 && level !== 'campaign' && (
        <div className="flex flex-col gap-2 border-b border-line bg-amber-50/60 px-5 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-center gap-2 text-amber-700">
            <AlertTriangle className="size-4 shrink-0" />
            {missingBreakEven} sản phẩm chưa có ROI hoà vốn — điều kiện so với hoà vốn sẽ không khớp.
          </span>
          <button
            type="button"
            onClick={onOpenSettings}
            className="w-fit rounded-lg bg-white px-3 py-1.5 font-medium text-amber-700 shadow-sm transition hover:shadow-md"
          >
            Nhập ROI hoà vốn
          </button>
        </div>
      )}

      {level === 'campaign' ? (
        <CampaignTuneTiles onOpen={(id) => onOpenAction('campaign', id)} />
      ) : tiles.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted">
          Chưa có nhóm {unit} nào bật “Hiện ở Tổng quan”. Bật trong Care Ads → Nhóm.
        </p>
      ) : (
        /* gap-px + nền line = đường kẻ giữa các ô, đúng với mọi số lượng nhóm */
        <div className="grid grid-cols-1 gap-px bg-line sm:grid-cols-2 xl:grid-cols-4">
          {tiles.map((group) => {
            const meta = groupMeta(group);
            const s = levelSummary[group.id] ?? EMPTY;
            const rule = agent.ruleFor(level, group.id);
            const description = groupDescription(group, level);
            // Nhóm đang trống → làm nhạt để mắt tập trung vào ô có việc
            const empty = s.count === 0;
            const needsBreakEven = empty && breakEvenBlocked && groupUsesBreakEven(group);
            // Ô = 2 vùng bấm riêng: nội dung → lọc bảng bên dưới; chip quy tắc → sang BOT AI (không lồng link trong button)
            return (
              <div key={group.id} className="group bg-white p-5 transition-colors hover:bg-canvas">
                <button
                  type="button"
                  onClick={() => onOpenAction(level, group.id)}
                  title={`Xem ${unit} nhóm ${meta.label} ở danh sách bên dưới`}
                  className="flex w-full items-start gap-3 text-left"
                >
                  <span
                    className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${empty ? 'bg-canvas text-muted' : meta.tone}`}
                  >
                    <meta.icon className="size-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-muted group-hover:text-ink">{meta.label}</span>
                    <span className={`mt-0.5 block text-2xl font-bold tabular-nums ${empty ? 'text-muted/60' : ''}`}>
                      {formatNumber(s.count)} <span className="text-sm font-medium text-muted">{unit}</span>
                    </span>
                    {s.rows > s.count && (
                      <span className="block text-xs text-muted">{formatNumber(s.rows)} dòng theo sản phẩm</span>
                    )}
                    {!!s.keepsProfit && (
                      <span className="block text-xs font-medium text-amber-700">
                        trong đó {formatNumber(s.keepsProfit)} {unit} tổng vẫn có lời (có đơn bù)
                      </span>
                    )}
                    {!!s.unconfirmed && (
                      <span
                        role="link"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenAction(level, group.id, 'signals');
                        }}
                        onKeyDown={(e) => {
                          if (e.key !== 'Enter') return;
                          e.stopPropagation();
                          onOpenAction(level, group.id, 'signals');
                        }}
                        className="block text-xs text-muted underline decoration-dotted underline-offset-2 hover:text-primary"
                        title="7 ngày gần nhất thuộc nhóm này, 14 ngày chưa — Agent chờ thêm, chưa đề xuất. Bấm để xem"
                      >
                        {formatNumber(s.unconfirmed)} dấu hiệu
                      </span>
                    )}
                    {needsBreakEven ? (
                      <span className="block text-sm font-medium text-amber-700">Chưa tính được — thiếu ROI hoà vốn</span>
                    ) : (
                      <span className="block text-sm font-medium tabular-nums">
                        Chi {shortVnd(s.cost)} · DT {shortVnd(s.revenue)}
                      </span>
                    )}
                    <span className="mt-1 line-clamp-2 text-xs text-muted" title={description}>
                      {description}
                    </span>
                  </span>
                </button>
                {/* ml-[52px] = icon 40px + gap 12px → chip thẳng cột với chữ */}
                <div className="ml-[52px] mt-2">
                  {rule ? (
                    <Link
                      to="/care-ads/product?view=rules"
                      title="Xem / sửa quy tắc ở Care Ads"
                      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium transition hover:ring-1 hover:ring-current ${
                        rule.mode !== 'off' ? 'bg-violet-50 text-accent-violet' : 'bg-canvas text-muted hover:text-ink'
                      }`}
                    >
                      <Bot className="size-3" />
                      {rule.name} · {MODE_LABEL[rule.mode]}
                    </Link>
                  ) : (
                    <Link
                      to={`/care-ads/product?view=rules&add=${level}:${encodeURIComponent(group.id)}`}
                      title={`Tạo quy tắc cho nhóm ${meta.label}`}
                      className="inline-flex items-center gap-1 rounded-md border border-dashed border-primary/40 px-1.5 py-0.5 text-xs font-medium text-primary transition-colors hover:bg-primary-soft"
                    >
                      <Plus className="size-3" />
                      Tạo quy tắc
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
          {/* Lấp ô trống cuối hàng cho nền trắng */}
          {tiles.length % 4 !== 0 && (
            <div className="hidden bg-white xl:block" style={{ gridColumn: `span ${4 - (tiles.length % 4)}` }} />
          )}
        </div>
      )}
    </Card>
  );
}
