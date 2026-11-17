import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  pageCount: number;
  total: number;
  onChange: (page: number) => void;
}

/** Phân trang đơn giản: Trước / Sau. Ẩn khi chỉ có 1 trang */
export default function Pagination({ page, pageCount, total, onChange }: PaginationProps) {
  if (pageCount <= 1) return null;

  const btn =
    'flex size-8 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:bg-canvas hover:text-ink disabled:pointer-events-none disabled:opacity-40';

  return (
    <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3 text-sm text-muted">
      <span>
        Trang {page}/{pageCount} · {total} dòng
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          className={btn}
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
          aria-label="Trang trước"
        >
          <ChevronLeft className="size-4" />
        </button>
        <button
          type="button"
          className={btn}
          onClick={() => onChange(page + 1)}
          disabled={page >= pageCount}
          aria-label="Trang sau"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  );
}
