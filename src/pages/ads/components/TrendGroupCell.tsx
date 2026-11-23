import type { ReactNode } from 'react';
import { formatNumber, shortVnd } from '../../../../shared/format';
import { trendDetail, trendLabel, type TrendInfo, type WindowStat } from '../../../../shared/trend';
import { GROUP_TONE_DOT, type GroupLevel } from '../groups';
import { findGroup, useAdsSettings } from '../settings';
import { useTrend } from '../trend';
import ActionBadge from './ActionBadge';

interface TrendGroupCellProps {
  level: GroupLevel;
  trend: TrendInfo | undefined;
  /** Dòng thêm dưới (vd tổng video gồm đơn bù) */
  extra?: ReactNode;
  /**
   * Nhóm theo số của khoảng ngày đang chọn (bỏ trống = không so, vd ô Đang theo dõi luôn hiện 7 ngày).
   * Khoảng chọn trùng 7 / 14 / 30 ngày → chấm khung đó có viền; khác → thêm dòng "Khoảng chọn: ● nhóm".
   */
  current?: string | null;
}

const WINDOWS = [
  { key: 'g7', w: 'w7', label: '7N', name: '7 ngày' },
  { key: 'g14', w: 'w14', label: '14N', name: '14 ngày' },
  { key: 'g30', w: 'w30', label: '30N', name: '30 ngày' },
] as const;

const statText = (s: WindowStat | null) =>
  s ? `chi ${shortVnd(s.cost ?? 0)} · ${formatNumber(s.orders ?? 0)} đơn · ROI ${s.roi == null ? '--' : formatNumber(s.roi, 2)}` : 'không có số';

/**
 * Ô Nhóm theo 3 khung 7 · 14 · 30 ngày đến hôm qua (Sếp chốt 22/11): badge nhóm đã xác nhận (7 = 14 ngày),
 * 3 chấm màu nhóm từng khung (rê chuột xem số), câu ngắn "kéo dài 30 ngày" / "2 tuần gần đây" / "dấu hiệu".
 */
export default function TrendGroupCell({ level, trend, extra, current }: TrendGroupCellProps) {
  const { settings } = useAdsSettings();
  const { viewing } = useTrend();
  const compare = current !== undefined;
  const ring = compare ? viewing.ring : null;
  const nameOf = (id: string | null) => (id ? (findGroup(settings, id, level)?.name ?? 'nhóm đã xoá') : 'không có số');
  const dotOf = (id: string | null) => {
    const g = id ? findGroup(settings, id, level) : undefined;
    return g ? GROUP_TONE_DOT[g.tone] ?? 'bg-muted' : 'bg-line';
  };
  // Khoảng chọn khác 7 / 14 / 30 ngày → nhóm theo số đang hiện (Agent vẫn xét theo 3 khung)
  const currentLine =
    compare && !viewing.ring && current ? (
      <span
        title={`Theo số ${viewing.label}. Agent vẫn xét theo 7 · 14 · 30 ngày đến hôm qua.`}
        className={`flex cursor-help items-center gap-1 whitespace-nowrap text-xs ${current !== (trend?.group ?? trend?.g7) ? 'font-semibold text-ink' : 'text-muted'}`}
      >
        <span className="font-normal text-muted">Khoảng chọn:</span>
        <span className={`size-2 rounded-full ${dotOf(current)}`} />
        {nameOf(current)}
      </span>
    ) : null;

  if (!trend || (!trend.group && !trend.unconfirmed)) {
    return (
      <div className="flex flex-col items-start gap-1">
        <span className="text-muted" title="Không có chi phí / đơn trong 7 ngày gần nhất">
          --
        </span>
        {currentLine}
      </div>
    );
  }
  const label = trendLabel(trend);
  const detail = trendDetail(trend, nameOf);

  return (
    <div className="flex flex-col items-start gap-1">
      <ActionBadge
        action={trend.group ?? trend.g7}
        level={level}
        unconfirmed={trend.unconfirmed}
        reason={trend.unconfirmed ? `7 ngày gần nhất thuộc ${nameOf(trend.g7)}, nhưng 14 ngày vẫn là ${nameOf(trend.g14)}. Agent chờ thêm, chưa đề xuất.` : trend.reason}
      />
      <span className="flex items-center gap-1.5">
        <span className="flex items-center gap-0.5" aria-label="Nhóm theo 7, 14, 30 ngày">
          {WINDOWS.map((x) => (
            <span
              key={x.key}
              title={`${x.name}: ${nameOf(trend[x.key])} · ${statText(trend[x.w])}${ring === x.key ? ' · đang xem khung này' : ''}`}
              className={`size-2 cursor-help rounded-full ${dotOf(trend[x.key])} ${ring === x.key ? 'ring-2 ring-primary/40 ring-offset-1' : ''}`}
            />
          ))}
        </span>
        {label && (
          <span title={detail ?? undefined} className={`cursor-help whitespace-nowrap text-xs ${trend.long || trend.slowLoss ? 'font-medium text-ink' : 'text-muted'}`}>
            {label}
          </span>
        )}
      </span>
      {currentLine}
      {extra}
    </div>
  );
}
