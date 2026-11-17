import { formatNumber } from '../../../lib/format';
import type { ProductMargin } from '../types';

interface MarginBadgeProps {
  margin: ProductMargin | null;
  /** ROI hoà vốn đã nhập, hiện trong tooltip */
  breakEven: number | null;
}

export const MARGIN_META: Record<ProductMargin, { label: string; className: string }> = {
  loss: { label: 'Lỗ', className: 'bg-rose-50 text-danger' },
  near: { label: 'Sát hoà vốn', className: 'bg-amber-50 text-amber-600' },
  profit: { label: 'Lời', className: 'bg-green-50 text-accent-green' },
};

/** Lời/lỗ của sản phẩm so với ROI hoà vốn */
export default function MarginBadge({ margin, breakEven }: MarginBadgeProps) {
  if (!margin) {
    return (
      <span className="text-muted" title="Chưa nhập ROI hoà vốn">
        --
      </span>
    );
  }
  const meta = MARGIN_META[margin];
  return (
    <span
      title={`ROI hoà vốn ${formatNumber(breakEven, 2)}`}
      className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${meta.className}`}
    >
      {meta.label}
    </span>
  );
}
