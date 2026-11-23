import { formatNumber } from '../../../lib/format';

/** id để ô Tổng quan cuộn tới khi bấm "N dấu hiệu" */
export const SIGNAL_ANCHOR = 'dau-hieu';

interface SignalDividerProps {
  colSpan: number;
  groupName: string;
  count: number;
  /** "video" / "sản phẩm" / "chiến dịch" */
  unit: string;
  /** signal = dấu hiệu (7 ngày thuộc nhóm, 14 chưa); paused = thuộc chiến dịch đã tắt (không tính) */
  kind?: 'signal' | 'paused';
}

/**
 * Dải tiêu đề trong bảng khi lọc theo nhóm (Sếp chốt 22/11): trên = Cần xử lý (số khớp ô Tổng quan),
 * rồi "Dấu hiệu" (Agent chờ thêm), cuối = thuộc chiến dịch đã tắt (không tính). Video đã gỡ ở ô lọc riêng "Đã gỡ".
 */
export default function SignalDivider({ colSpan, groupName, count, unit, kind = 'signal' }: SignalDividerProps) {
  return (
    <tr id={kind === 'signal' ? SIGNAL_ANCHOR : undefined} className="scroll-mt-20 bg-canvas">
      <td colSpan={colSpan} className="px-5 py-2.5 text-sm">
        {kind === 'signal' ? (
          <>
            <span className="font-semibold">
              Dấu hiệu {groupName} ({formatNumber(count)} {unit})
            </span>
            <span className="text-muted"> — 7 ngày gần nhất thuộc nhóm này, 14 ngày chưa. Agent chờ thêm, chưa đề xuất.</span>
          </>
        ) : (
          <>
            <span className="font-semibold">
              Thuộc chiến dịch đã tắt ({formatNumber(count)} {unit})
            </span>
            <span className="text-muted"> — không tính, Agent không làm gì.</span>
          </>
        )}
      </td>
    </tr>
  );
}
