import { formatNumber } from '../../../lib/format';

/** id để ô Tổng quan cuộn tới khi bấm "+N có dấu hiệu" */
export const SIGNAL_ANCHOR = 'dau-hieu';

interface SignalDividerProps {
  colSpan: number;
  groupName: string;
  count: number;
  /** "video" / "sản phẩm" / "chiến dịch" */
  unit: string;
}

/**
 * Dải phân cách trong bảng khi lọc theo nhóm: phía trên = đã thuộc nhóm (7 và 14 ngày cùng nhóm),
 * phía dưới = "dấu hiệu" (7 ngày gần nhất thuộc nhóm, 14 ngày chưa) — Agent chờ thêm, chưa đề xuất.
 */
export default function SignalDivider({ colSpan, groupName, count, unit }: SignalDividerProps) {
  return (
    <tr id={SIGNAL_ANCHOR} className="scroll-mt-20 bg-canvas">
      <td colSpan={colSpan} className="px-5 py-2.5 text-sm">
        <span className="font-semibold">
          Dấu hiệu {groupName} ({formatNumber(count)} {unit})
        </span>
        <span className="text-muted"> — 7 ngày gần nhất thuộc nhóm này, 14 ngày chưa. Agent chờ thêm, chưa đề xuất.</span>
      </td>
    </tr>
  );
}
