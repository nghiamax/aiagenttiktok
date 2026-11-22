import type { ReactNode } from 'react';
import { formatNumber, shortVnd } from '../../../../shared/format';
import { trendLabel, type TrendInfo, type WindowStat } from '../../../../shared/trend';
import { GROUP_TONE_DOT, type GroupLevel } from '../groups';
import { findGroup, useAdsSettings } from '../settings';
import ActionBadge from './ActionBadge';

interface TrendGroupCellProps {
  level: GroupLevel;
  trend: TrendInfo | undefined;
  /** Dòng thêm dưới (vd tổng video gồm đơn bù) */
  extra?: ReactNode;
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
 * 3 chấm màu nhóm từng khung (rê chuột xem số), câu ngắn "kéo dài 30 ngày" / "2 tuần gần đây" / "chưa xác nhận".
 */
export default function TrendGroupCell({ level, trend, extra }: TrendGroupCellProps) {
  const { settings } = useAdsSettings();
  if (!trend || (!trend.group && !trend.unconfirmed)) {
    return (
      <span className="text-muted" title="Không có chi phí / đơn trong 7 ngày gần nhất">
        --
      </span>
    );
  }
  const nameOf = (id: string | null) => (id ? (findGroup(settings, id, level)?.name ?? 'nhóm đã xoá') : 'không có số');
  const dotOf = (id: string | null) => {
    const g = id ? findGroup(settings, id, level) : undefined;
    return g ? GROUP_TONE_DOT[g.tone] ?? 'bg-muted' : 'bg-line';
  };
  const label = trendLabel(trend, nameOf);

  return (
    <div className="flex flex-col items-start gap-1">
      <ActionBadge
        action={trend.group ?? trend.g7}
        level={level}
        unconfirmed={trend.unconfirmed}
        reason={trend.unconfirmed ? `7 ngày: ${nameOf(trend.g7)} nhưng 14 ngày: ${nameOf(trend.g14)} — chưa chắc chắn, Agent không đề xuất` : trend.reason}
      />
      <span className="flex items-center gap-1.5">
        <span className="flex items-center gap-0.5" aria-label="Nhóm theo 7, 14, 30 ngày">
          {WINDOWS.map((x) => (
            <span
              key={x.key}
              title={`${x.name}: ${nameOf(trend[x.key])} · ${statText(trend[x.w])}`}
              className={`size-2 cursor-help rounded-full ${dotOf(trend[x.key])}`}
            />
          ))}
        </span>
        {label && <span className={`whitespace-nowrap text-xs ${trend.unconfirmed ? 'text-muted' : trend.long ? 'font-medium text-ink' : 'text-muted'}`}>{label}</span>}
      </span>
      {extra}
    </div>
  );
}
