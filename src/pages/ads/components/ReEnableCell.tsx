import { RotateCcw } from 'lucide-react';
import { formatNumber, shortVnd } from '../../../../shared/format';
import type { TrendInfo, WindowStat } from '../../../../shared/trend';

interface ReEnableCellProps {
  trend: TrendInfo | undefined;
  /** ROI hoà vốn của sản phẩm (null = chưa nhập) */
  breakEven: number | null;
}

/**
 * Sản phẩm đã loại trừ (tắt khỏi chiến dịch): thay cột Nhóm bằng đánh giá có nên bật lại — theo số lúc còn chạy
 * (khung 30 ngày đến hôm qua, không có thì 14 ngày) so với ROI hoà vốn. Chỉ gợi ý, không tự bật (Sếp chốt 25/11).
 */
export default function ReEnableCell({ trend, breakEven }: ReEnableCellProps) {
  const pick: { label: string; s: WindowStat } | null =
    trend?.w30 && (trend.w30.cost ?? 0) > 0
      ? { label: '30N', s: trend.w30 }
      : trend?.w14 && (trend.w14.cost ?? 0) > 0
        ? { label: '14N', s: trend.w14 }
        : null;

  if (!pick) {
    return (
      <span className="text-muted" title="Đã loại trừ — 30 ngày gần nhất không có chi phí để đánh giá">
        --
      </span>
    );
  }
  const { s } = pick;
  const roi = s.roi;
  const stat = `${pick.label} lúc còn chạy: chi ${shortVnd(s.cost ?? 0)} · ${formatNumber(s.orders ?? 0)} đơn · ROI ${roi == null ? '--' : formatNumber(roi, 2)}`;
  if (breakEven == null || roi == null) {
    return (
      <span className="cursor-help text-xs text-muted" title={`${stat}\nChưa nhập ROI hoà vốn — chưa đánh giá được`}>
        Chưa đánh giá
      </span>
    );
  }
  const good = roi >= breakEven;
  return (
    <span
      title={`${stat} ${good ? '≥' : '<'} hoà vốn ${formatNumber(breakEven, 2)}\n${good ? 'Đang có lời lúc chạy — cân nhắc bật lại (quy tắc Bật sản phẩm, cần duyệt)' : 'Lỗ lúc chạy — tắt là đúng'}`}
      className={`inline-flex cursor-help items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${
        good ? 'bg-green-50 text-accent-green' : 'bg-canvas text-muted'
      }`}
    >
      {good && <RotateCcw className="size-3.5" />}
      {good ? 'Cân nhắc bật lại' : 'Tắt là đúng'}
    </span>
  );
}
