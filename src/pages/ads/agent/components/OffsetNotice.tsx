import { AlertTriangle, Info } from 'lucide-react';
import { offsetPart, offsetTotal, offsetVerdict } from '../../../../../shared/offsetText';
import type { VideoOffset } from '../types';

/**
 * Khung "có đơn bù ở sản phẩm khác" dưới đề xuất gỡ video: vàng = tổng vẫn có lời (nên cân nhắc), xám = tổng vẫn lỗ.
 * Agent vẫn đề xuất — Sếp tự quyết.
 */
export default function OffsetNotice({ offset }: { offset: VideoOffset }) {
  const warn = offset.profitable !== false;
  const Icon = warn ? AlertTriangle : Info;
  return (
    <p className={`flex items-start gap-2 rounded-xl px-3 py-2 text-xs ${warn ? 'bg-amber-50 text-amber-800' : 'bg-canvas text-muted'}`}>
      <Icon className="mt-0.5 size-3.5 shrink-0" />
      <span>
        <span className="font-semibold">Có đơn bù ở sản phẩm khác:</span> {offsetPart(offset)}. Tính tổng video trong chiến dịch:{' '}
        {offsetTotal(offset)} → <span className="font-semibold">{offsetVerdict(offset)}</span>. Gỡ sẽ mất cả phần đơn bù.
      </span>
    </p>
  );
}
