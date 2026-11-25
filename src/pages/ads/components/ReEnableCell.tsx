import { RotateCcw } from 'lucide-react';
import { formatNumber, shortVnd } from '../../../../shared/format';
import type { TrendInfo, WindowStat } from '../../../../shared/trend';
import { formatDm } from '../../../lib/dates';
import { useTrend } from '../trend';

interface ReEnableCellProps {
  trend: TrendInfo | undefined;
  /** ROI hoà vốn của sản phẩm (null = chưa nhập) */
  breakEven: number | null;
  /** excluded = sản phẩm đã tắt khỏi chiến dịch đang chạy · paused = chiến dịch đang tắt */
  kind: 'excluded' | 'paused';
}

import { MIN_ORDERS_TO_SUGGEST } from '../reEnable';

/**
 * Sản phẩm đã loại trừ / thuộc chiến dịch đã tắt: thay cột Nhóm bằng đánh giá có nên bật lại — theo số khung 30 ngày
 * cố định đến hôm qua (không có thì 14 ngày; ngày sau khi tắt chi = 0 nên chỉ phản ánh phần đã chạy) so với ROI hoà vốn. Chỉ gợi ý, không tự bật (Sếp chốt 25/11).
 */
export default function ReEnableCell({ trend, breakEven, kind }: ReEnableCellProps) {
  const { snaps } = useTrend();
  const what = kind === 'paused' ? 'Chiến dịch đã tắt' : 'Đã loại trừ';
  // Khung cố định theo lịch, đến hôm qua (cùng khung cột Nhóm) — ghi rõ ngày, không phải "lúc còn chạy"
  const span = (r: { from: string; to: string } | null | undefined, n: number) => (r ? `${n} ngày qua (${formatDm(r.from)}–${formatDm(r.to)})` : `${n} ngày qua`);
  const label30 = span(snaps.d30?.range, 30);
  const pick: { label: string; s: WindowStat } | null =
    trend?.w30 && (trend.w30.cost ?? 0) > 0
      ? { label: label30, s: trend.w30 }
      : trend?.w14 && (trend.w14.cost ?? 0) > 0
        ? { label: span(snaps.d14?.range, 14), s: trend.w14 }
        : null;

  if (!pick) {
    return (
      <span className="text-muted" title={`${what} — ${label30} không có chi phí: tắt trước đó, không đủ số để đánh giá`}>
        --
      </span>
    );
  }
  const { s } = pick;
  const roi = s.roi;
  const stat = `${pick.label}: chi ${shortVnd(s.cost ?? 0)} · ${formatNumber(s.orders ?? 0)} đơn · ROI ${roi == null ? '--' : formatNumber(roi, 2)}`;
  if (breakEven == null || roi == null) {
    return (
      <span className="cursor-help text-xs text-muted" title={`${what}\n${stat}\nChưa nhập ROI hoà vốn — chưa đánh giá được`}>
        Chưa đánh giá
      </span>
    );
  }
  const good = roi >= breakEven;
  const vsBe = `${what}\n${stat} ${good ? '≥' : '<'} hoà vốn ${formatNumber(breakEven, 2)}`;
  // Có lời nhưng quá ít đơn → chưa kết luận (vd chi 78đ, 1 đơn → ROI rất cao nhưng vô nghĩa)
  if (good && (s.orders ?? 0) < MIN_ORDERS_TO_SUGGEST) {
    return (
      <span className="cursor-help whitespace-nowrap text-xs text-muted" title={`${vsBe}\nDưới ${MIN_ORDERS_TO_SUGGEST} đơn — chưa đủ để kết luận`}>
        Ít số liệu
      </span>
    );
  }
  const advice = good
    ? kind === 'paused'
      ? 'Có lời lúc chạy — chiến dịch đang tắt: cân nhắc bật lại chiến dịch hoặc đưa sản phẩm vào chiến dịch đang chạy'
      : 'Có lời lúc chạy — cân nhắc bật lại sản phẩm (quy tắc Bật sản phẩm, cần duyệt)'
    : 'Lỗ lúc chạy — tắt là đúng';
  return (
    <span
      title={`${vsBe}\n${advice}`}
      className={`inline-flex cursor-help items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${
        good ? 'bg-green-50 text-accent-green' : 'bg-canvas text-muted'
      }`}
    >
      {good && <RotateCcw className="size-3.5" />}
      {good ? 'Cân nhắc bật lại' : 'Tắt là đúng'}
    </span>
  );
}
