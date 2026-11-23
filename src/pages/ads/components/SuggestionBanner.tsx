import { ArrowRight, Lightbulb } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useSuggestions } from '../agent/useSuggestions';

/** Dải nhỏ trên Tổng quan: "Có N gợi ý cho shop" → AI Agent / Gợi ý. Không có gợi ý thì ẩn */
export default function SuggestionBanner() {
  const { openCount, urgentCount } = useSuggestions();
  if (openCount === 0) return null;

  return (
    <Link
      to="/care-ads/product?view=suggest"
      className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-white px-5 py-3.5 shadow-sm transition hover:border-primary/30 hover:shadow-md"
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
          <Lightbulb className="size-5" />
        </span>
        <span className="text-sm">
          <span className="font-semibold">Có {openCount} gợi ý cho shop</span>
          {urgentCount > 0 && <span className="text-danger"> · {urgentCount} việc đang làm mất tiền</span>}
          <span className="hidden text-muted sm:inline"> — hệ thống đọc số liệu và đề xuất quy tắc nên bật</span>
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-primary">
        Xem gợi ý
        <ArrowRight className="size-4" />
      </span>
    </Link>
  );
}
