import { formatNumber } from '../../../../lib/format';
import { shortVnd } from '../../classify';
import type { MetricWindow } from '../types';
import type { WindowStat } from '../../../../../shared/trend';

interface WindowsTableProps {
  /** Khung chính (7 ngày) lúc đề xuất */
  before: MetricWindow;
  windows: { d14: WindowStat | null; d30: WindowStat | null };
  /** 30 ngày cũng thuộc nhóm ("kéo dài") */
  long?: boolean;
  /** Lỗ âm thầm: 7 ngày chi ít chưa tới ngưỡng nhưng 14 + 30 ngày đều thuộc nhóm */
  slowLoss?: boolean;
}

const money = (n: number | null | undefined) => (n == null ? '--' : shortVnd(n));

/**
 * Số 7 · 14 · 30 ngày của đề xuất (Sếp chốt 22/11): 7 và 14 ngày cùng nhóm mới đề xuất;
 * 30 ngày cho biết "kéo dài" (chắc chắn) hay "2 tuần gần đây" (cân nhắc thêm).
 */
export default function WindowsTable({ before, windows, long, slowLoss }: WindowsTableProps) {
  const cols: { label: string; w: WindowStat | null }[] = [
    { label: '7 ngày', w: before },
    { label: '14 ngày', w: windows.d14 },
    { label: '30 ngày', w: windows.d30 },
  ];
  const be = before.breakEven;
  const roiClass = (roi: number | null) => (roi != null && be != null ? (roi < be ? 'text-danger' : 'text-accent-green') : '');

  return (
    <div className="rounded-xl bg-canvas/70 px-3 py-2.5">
      <table className="w-full text-xs tabular-nums">
        <thead>
          <tr className="text-muted">
            <th className="pb-1 text-left font-semibold" />
            {cols.map((c) => (
              <th key={c.label} className="pb-1 text-right font-semibold">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="text-muted">Chi</td>
            {cols.map((c) => (
              <td key={c.label} className="text-right">
                {money(c.w?.cost)}
              </td>
            ))}
          </tr>
          <tr>
            <td className="text-muted">Đơn</td>
            {cols.map((c) => (
              <td key={c.label} className="text-right">
                {c.w ? formatNumber(c.w.orders) : '--'}
              </td>
            ))}
          </tr>
          <tr>
            <td className="text-muted">ROI{be != null && <span className="font-normal"> (hv {formatNumber(be, 2)})</span>}</td>
            {cols.map((c) => (
              <td key={c.label} className={`text-right font-semibold ${roiClass(c.w?.roi ?? null)}`}>
                {c.w ? formatNumber(c.w.roi, 2) : '--'}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      {slowLoss ? (
        <p className="mt-1.5 border-t border-line pt-1.5 text-xs font-medium text-ink">
          Lỗ âm thầm — 7 ngày chi ít nên chưa tới ngưỡng, nhưng 14 và 30 ngày đều cùng nhóm.
        </p>
      ) : long !== undefined && (
        <p className={`mt-1.5 border-t border-line pt-1.5 text-xs ${long ? 'font-medium text-ink' : 'text-amber-700'}`}>
          {long
            ? 'Cả 7, 14 và 30 ngày đều cùng nhóm — kéo dài, đáng tin.'
            : '7 và 14 ngày cùng nhóm, nhưng 30 ngày thì không — mới 2 tuần gần đây, cân nhắc thêm.'}
        </p>
      )}
    </div>
  );
}
