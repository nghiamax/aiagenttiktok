import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ChevronDown, EyeOff, Lightbulb, Plus, TrendingUp, TriangleAlert, type LucideIcon } from 'lucide-react';
import { tiktokVideoUrl } from '../../metrics';
import { useAdsData } from '../../data';
import type { Suggestion } from '../useSuggestions';
import type { SuggestionSeverity } from '../../../../../shared/suggest';

interface SuggestionCardProps {
  suggestion: Suggestion;
  onApply: () => void;
  onDismiss: () => void;
  onOpenBreakEven: () => void;
}

const SEVERITY: Record<SuggestionSeverity, { label: string; icon: LucideIcon; border: string; chip: string }> = {
  urgent: { label: 'Đang mất tiền', icon: TriangleAlert, border: 'border-l-danger', chip: 'bg-rose-50 text-danger' },
  opportunity: { label: 'Cơ hội', icon: TrendingUp, border: 'border-l-accent-green', chip: 'bg-green-50 text-accent-green' },
  tidy: { label: 'Nên làm', icon: Lightbulb, border: 'border-l-primary', chip: 'bg-primary-soft text-primary' },
};

/** Một gợi ý: mức · tiêu đề · giải thích · ví dụ · Bật quy tắc / Ẩn */
export default function SuggestionCard({ suggestion: s, onApply, onDismiss, onOpenBreakEven }: SuggestionCardProps) {
  const [showWhy, setShowWhy] = useState(false);
  const { snapshot } = useAdsData();
  const meta = SEVERITY[s.severity];
  const label = s.id === 'break-even' ? 'Cần làm' : meta.label;

  const videoUrl = (videoId: string) => {
    if (!videoId) return null;
    const v = snapshot.videos.find((x) => x.id === videoId);
    return tiktokVideoUrl(videoId, v?.authorUsername);
  };

  return (
    <li
      className={`rounded-2xl border border-l-4 border-line bg-white p-5 shadow-sm transition hover:shadow-md ${
        s.done ? 'border-l-line opacity-70' : meta.border
      }`}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 space-y-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${meta.chip}`}>
            <meta.icon className="size-3.5" />
            {label}
          </span>
          <h3 className="font-semibold leading-snug">{s.title}</h3>
          <p className="text-sm text-muted">{s.detail}</p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {s.done ? (
            <span className="inline-flex items-center gap-1.5 rounded-xl bg-green-50 px-3 py-2 text-sm font-semibold text-accent-green">
              <CheckCircle2 className="size-4" />
              Đã bật quy tắc
            </span>
          ) : s.action.kind === 'breakEven' ? (
            <button
              type="button"
              onClick={onOpenBreakEven}
              className="flex items-center gap-1.5 whitespace-nowrap rounded-xl bg-primary px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-primary-hover"
            >
              Nhập ROI hoà vốn
            </button>
          ) : s.action.kind === 'info' ? null : s.action.groupMissing ? (
            <Link
              to={`/care-ads/product?view=groups&level=${s.action.level}`}
              title="Shop đã xoá nhóm dùng cho quy tắc này — tạo lại nhóm ở tab Nhóm để bật quy tắc"
              className="flex items-center gap-1.5 whitespace-nowrap rounded-xl border border-line px-3.5 py-2 text-sm font-semibold text-muted transition hover:bg-canvas hover:text-ink"
            >
              Chưa có nhóm phù hợp
            </Link>
          ) : (
            <button
              type="button"
              onClick={onApply}
              className="flex items-center gap-1.5 whitespace-nowrap rounded-xl bg-primary px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-primary-hover"
            >
              <Plus className="size-4" />
              Bật quy tắc (Cần duyệt)
            </button>
          )}
          {!s.done && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Ẩn gợi ý này"
              title="Ẩn gợi ý — sẽ hiện lại nếu số lượng tăng"
              className="flex size-9 items-center justify-center rounded-xl border border-line text-muted transition hover:bg-canvas hover:text-ink"
            >
              <EyeOff className="size-4" />
            </button>
          )}
        </div>
      </div>

      {s.examples.length > 0 && (
        <ul className="mt-4 space-y-1.5 rounded-xl bg-canvas p-3 text-sm">
          {s.examples.map((e) => {
            const url = videoUrl(e.target.videoId);
            return (
              <li key={`${e.target.campaignId}/${e.target.productId}/${e.target.videoId}`} className="flex flex-col gap-0.5 sm:flex-row sm:justify-between sm:gap-4">
                {url ? (
                  <a href={url} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate font-medium hover:text-primary" title={e.name}>
                    {e.name}
                  </a>
                ) : e.target.productId ? (
                  // Sản phẩm → mở bảng Video lọc theo sản phẩm
                  <Link
                    to={`/ads?tab=videos&campaign=${e.target.campaignId}&product=${e.target.productId}`}
                    className="min-w-0 truncate font-medium hover:text-primary"
                    title={`${e.name} — xem video của sản phẩm`}
                  >
                    {e.name}
                  </Link>
                ) : (
                  <span className="min-w-0 truncate font-medium" title={e.name}>
                    {e.name}
                  </span>
                )}
                {e.warning && (
                  <span className="shrink-0 rounded-md bg-amber-50 px-1.5 py-0.5 text-xs font-semibold text-amber-700">{e.warning}</span>
                )}
                <span className="shrink-0 tabular-nums text-muted">{e.metrics}</span>
              </li>
            );
          })}
          {s.count > s.examples.length && <li className="text-xs text-muted">… và {s.count - s.examples.length} nữa</li>}
          {!!s.unconfirmed && (
            <li className="text-xs text-muted" title="7 ngày gần nhất đúng điều kiện nhưng 14 ngày thì chưa — chờ thêm">
              +{s.unconfirmed} mới có dấu hiệu (chưa tính)
            </li>
          )}
        </ul>
      )}

      <div className="mt-3 flex flex-col gap-1 text-sm">
        {(s.action.kind === 'rule' || s.action.kind === 'info') && !s.done && <p className="text-muted">👉 {s.action.effect}</p>}
        <button
          type="button"
          onClick={() => setShowWhy((v) => !v)}
          aria-expanded={showWhy}
          className="flex w-fit items-center gap-1 text-xs font-medium text-muted transition hover:text-ink"
        >
          <ChevronDown className={`size-3.5 transition-transform ${showWhy ? 'rotate-180' : ''}`} />
          Vì sao gợi ý?
        </button>
        {showWhy && <p className="text-xs text-muted">Điều kiện nhận diện: {s.why}</p>}
      </div>
    </li>
  );
}
