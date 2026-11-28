import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { WATCH_ANCHOR } from '../../../config/navigation';
import { useNavAnchor } from '../../../lib/useNavAnchor';
import { ChevronRight, Eye, Plus, X } from 'lucide-react';
import Card from '../../../components/ui/Card';
import { formatDateTime, formatNumber, formatVnd } from '../../../lib/format';
import { effectiveStatus } from '../../../../shared/videoStatus';
import { useAgentStore } from '../agent/agentStore';
import { dayMonth, evaluateAction, firstAfterDate, firstAfterReadyAt, summarizeAction } from '../agent/evaluate';
import { actionTypeMeta } from '../agent/meta';
import type { AgentActionLog } from '../agent/types';
import MetricWindowBox from '../agent/components/MetricWindowBox';
import VerdictBadge from '../agent/components/VerdictBadge';
import { TargetCell } from '../agent/components/AgentBits';
import { productKey, tiktokVideoUrl } from '../metrics';
import { useTrend } from '../trend';
import { useWatchlist, type WatchItem } from '../watchlist';
import TrendGroupCell from './TrendGroupCell';
import VideoActions from './VideoActions';
import VideoTitleCell from './VideoTitleCell';
import WatchAddModal from './WatchAddModal';
import { STATUS } from './VideoTable';

const DAY = 86_400_000;
/** Thao tác video còn hiện ở phần "Vừa thao tác" trong ngần này */
const RECENT_DAYS = 7;
const VIDEO_ACTIONS = new Set(['remove_creative', 'add_creative', 'boost_creative']);
const OPEN_KEY = 'ads-watch-open';
/** ID thao tác Sếp đã xoá khỏi "Vừa thao tác" (theo trình duyệt; Nhật ký giữ nguyên; video có thao tác mới → hiện lại) */
const HIDDEN_KEY = 'ads-watch-hidden';

function readHidden(): Set<string> {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? '[]');
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

const ago = (iso: string) => {
  const d = Math.floor((Date.now() - Date.parse(iso)) / DAY);
  return d <= 0 ? 'hôm nay' : `${d} ngày trước`;
};
const tone = { good: 'text-accent-green', bad: 'text-danger', muted: 'text-muted' } as const;

/**
 * Ô "Đang theo dõi" (Sếp chốt 22/11): (1) video vừa thao tác trong 7 ngày — gọn, Lúc quyết định → Sau thao tác;
 * (2) video Sếp tự thêm (mã / link) — như bảng Video: nhóm 7 · 14 · 30, số 7 ngày, nút thao tác, bỏ theo dõi.
 */
export default function WatchCard() {
  const { state } = useAgentStore();
  const watch = useWatchlist();
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(OPEN_KEY) !== '0';
    } catch {
      return true;
    }
  });
  const [adding, setAdding] = useState(false);
  const [hidden, setHidden] = useState(readHidden);
  const hide = (id: string) => {
    setHidden((prev) => {
      const next = new Set(prev).add(id);
      try {
        localStorage.setItem(HIDDEN_KEY, JSON.stringify([...next].slice(-500)));
      } catch {
        /* bỏ qua */
      }
      return next;
    });
  };
  const toggle = () => {
    setOpen((v) => {
      try {
        localStorage.setItem(OPEN_KEY, v ? '0' : '1');
      } catch {
        /* bỏ qua */
      }
      return !v;
    });
  };

  // Thao tác video trong 7 ngày (mới nhất mỗi video), gồm thủ công + Hoàn tác
  const recent = useMemo(() => {
    const seen = new Set<string>();
    const out: AgentActionLog[] = [];
    for (const a of [...state.actions].sort((x, y) => y.executedAt.localeCompare(x.executedAt))) {
      if (!VIDEO_ACTIONS.has(a.actionType) || !a.target.videoId) continue;
      if (a.status === 'failed' || Date.now() - Date.parse(a.executedAt) > RECENT_DAYS * DAY) continue;
      const k = `${a.target.campaignId}/${a.target.videoId}`;
      if (seen.has(k)) continue;
      seen.add(k);
      // Đã xoá khỏi danh sách: chỉ ẩn đúng thao tác đó — video có thao tác mới thì hiện lại
      if (!hidden.has(a.id)) out.push(a);
    }
    return out;
  }, [state.actions, hidden]);

  // Sidebar "Theo dõi video": mở hẳn ô rồi cuộn tới
  useNavAnchor(WATCH_ANCHOR, () => {
    setOpen(true);
    try {
      localStorage.setItem(OPEN_KEY, '1');
    } catch {
      /* bỏ qua */
    }
  });

  const total = recent.length + watch.items.length;

  return (
    <Card id={WATCH_ANCHOR} className="scroll-mt-20">
      <div className="flex flex-wrap items-center gap-3 px-5 py-4">
        <button type="button" onClick={toggle} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <ChevronRight className={`size-4 shrink-0 text-muted transition-transform ${open ? 'rotate-90' : ''}`} />
          <Eye className="size-5 shrink-0 text-primary" />
          <span className="font-semibold">Đang theo dõi ({total})</span>
          <span className="hidden truncate text-sm text-muted sm:inline">video vừa thao tác (7 ngày) và video tự thêm</span>
        </button>
        {watch.canEdit && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 rounded-xl border border-line px-3 py-1.5 text-sm font-medium text-muted transition hover:bg-canvas hover:text-ink"
          >
            <Plus className="size-4" /> Theo dõi video
          </button>
        )}
      </div>

      {open && (
        <div className="border-t border-line">
          <Section title="Vừa thao tác" count={recent.length} empty="Chưa có thao tác video nào trong 7 ngày.">
            {recent.map((a) => (
              <RecentRow key={a.id} item={a} evaluateAfterHours={state.guardrails.evaluateAfterHours} onHide={() => hide(a.id)} />
            ))}
          </Section>
          <Section
            title="Tự thêm"
            count={watch.items.length}
            empty={watch.canEdit ? 'Bấm "Theo dõi video" hoặc ☆ ở bảng Video để thêm.' : 'Chưa có video nào.'}
          >
            {watch.items.map((w) => (
              <WatchRows key={w.videoId} item={w} />
            ))}
          </Section>
        </div>
      )}

      {adding && <WatchAddModal onClose={() => setAdding(false)} />}
    </Card>
  );
}

function Section({ title, count, empty, children }: { title: string; count: number; empty: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-line last:border-b-0">
      <p className="bg-canvas px-5 py-2 text-xs font-semibold uppercase tracking-wide text-muted">
        {title} ({count})
      </p>
      {count === 0 ? <p className="px-5 py-4 text-sm text-muted">{empty}</p> : <ul className="divide-y divide-line">{children}</ul>}
    </section>
  );
}

/** Một thao tác gần đây: video · thao tác · Lúc quyết định → Sau thao tác · Đúng/Sai */
function RecentRow({ item, evaluateAfterHours, onHide }: { item: AgentActionLog; evaluateAfterHours: number; onHide: () => void }) {
  const meta = actionTypeMeta(item.actionType, item.params);
  const ev = evaluateAction(item, evaluateAfterHours);
  const summary = summarizeAction(item, ev);
  const readyAt = firstAfterReadyAt(item.executedAt);
  const wait =
    item.status === 'running'
      ? 'Đo sau khi TikTok xác nhận xong'
      : item.measureStop
        ? `Không đo — ${item.measureStop.reason}`
        : Date.now() < readyAt
          ? `Có số ngày ${dayMonth(firstAfterDate(item.executedAt))} lúc ~${formatDateTime(new Date(readyAt).toISOString())}`
          : 'Đang lấy số từ TikTok…';
  return (
    <li className="grid gap-3 px-5 py-4 lg:grid-cols-[minmax(0,1.2fr)_150px_minmax(0,1fr)_minmax(0,1fr)_150px_auto] lg:items-start">
      <TargetCell target={item.target} />
      <div className="text-xs">
        <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 font-semibold ${meta.className}`}>
          <meta.icon className="size-3.5" />
          {meta.label}
        </span>
        <p className="mt-1 text-muted" title={formatDateTime(item.executedAt)}>
          {ago(item.executedAt)}
        </p>
      </div>
      <MetricWindowBox title="Lúc quyết định" window={item.before} />
      <MetricWindowBox title="Sau thao tác" window={item.after} compareTo={item.before} pendingText={item.after ? undefined : wait} />
      <div className="flex flex-col items-start gap-1 lg:items-end lg:text-right">
        <VerdictBadge ev={ev} />
        {summary && <p className={`text-xs ${tone[summary.tone]}`}>{summary.text}</p>}
        <Link to="/care-ads/product?view=log" className="text-xs font-medium text-primary hover:text-primary-hover">
          Xem ở Nhật ký
        </Link>
      </div>
      <button
        type="button"
        onClick={onHide}
        aria-label="Xoá khỏi danh sách theo dõi"
        title="Xoá khỏi danh sách (Nhật ký vẫn giữ)"
        className="flex size-8 items-center justify-center justify-self-end rounded-lg text-muted transition hover:bg-canvas hover:text-danger"
      >
        <X className="size-4" />
      </button>
    </li>
  );
}

/** Video tự thêm: mỗi (chiến dịch, sản phẩm) 1 dòng như bảng Video; chưa có số 7 ngày → 1 dòng báo */
function WatchRows({ item }: { item: WatchItem }) {
  const trends = useTrend();
  const watch = useWatchlist();
  const d7 = trends.snaps.d7;
  const rows = d7.videos.filter((v) => v.id === item.videoId && v.contentType === 'video');
  const productBy = new Map(d7.products.map((p) => [productKey(p.campaignId, p.id), p]));
  const campaignBy = new Map(d7.campaigns.map((c) => [c.id, c]));
  const removeBtn = watch.canEdit && (
    <button
      type="button"
      onClick={() => void watch.remove(item.videoId)}
      aria-label="Bỏ theo dõi"
      title="Bỏ theo dõi"
      className="flex size-8 items-center justify-center rounded-lg text-muted transition hover:bg-canvas hover:text-danger"
    >
      <X className="size-4" />
    </button>
  );
  const note = item.note && <p className="mt-0.5 text-xs text-amber-700">Ghi chú: {item.note}</p>;

  if (rows.length === 0) {
    return (
      <li className="flex items-center justify-between gap-3 px-5 py-3">
        <div className="min-w-0">
          <p className="text-sm font-medium tabular-nums">Video {item.videoId}</p>
          <p className="text-xs text-muted">Chưa có chi phí / đơn trong 7 ngày gần nhất</p>
          {note}
        </div>
        {removeBtn}
      </li>
    );
  }

  return (
    <>
      {rows.map((v) => {
        const product = productBy.get(productKey(v.campaignId, v.productId));
        const url = tiktokVideoUrl(v.id, v.authorUsername);
        const st = STATUS[effectiveStatus(v)];
        return (
          <li
            key={`${v.campaignId}-${v.productId}`}
            className="grid gap-3 px-5 py-3 text-sm lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_180px_120px_minmax(0,1.2fr)_auto] lg:items-center"
          >
            <div className="min-w-0">
              <VideoTitleCell video={v} product={product} videoUrl={url} />
              {note}
            </div>
            <p className="truncate text-muted" title={product?.name}>
              {product?.name ?? v.productId}
            </p>
            <TrendGroupCell level="video" trend={trends.video(v)} />
            <span>{st && <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${st.className}`}>{st.label}</span>}</span>
            <p className="tabular-nums text-muted">
              Chi {formatVnd(v.cost)} · DT {formatVnd(v.revenue)} · {formatNumber(v.orders)} đơn · ROI {formatNumber(v.roi, 2)}
            </p>
            <div className="flex items-center justify-end gap-1">
              <VideoActions video={v} campaignRunning={campaignBy.get(v.mainCampaignId ?? v.campaignId)?.status === 'running'} videoUrl={url} />
              {removeBtn}
            </div>
          </li>
        );
      })}
    </>
  );
}
