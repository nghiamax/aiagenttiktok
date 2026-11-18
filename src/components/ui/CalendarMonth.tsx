import { monthGrid, type YearMonth } from '../../lib/dates';

const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

interface CalendarMonthProps {
  month: YearMonth;
  /** Hai đầu khoảng đang chọn / xem trước (đã sắp xếp from ≤ to) */
  from: string | null;
  to: string | null;
  today: string;
  isDisabled: (iso: string) => boolean;
  onPick: (iso: string) => void;
  onHover: (iso: string | null) => void;
}

/** Lưới ngày của 1 tháng (thứ Hai đầu tuần), tô khoảng đang chọn */
export default function CalendarMonth({ month, from, to, today, isDisabled, onPick, onHover }: CalendarMonthProps) {
  return (
    <div className="grid grid-cols-7 gap-y-1 text-center text-sm" onMouseLeave={() => onHover(null)}>
      {WEEKDAYS.map((w) => (
        <span key={w} className="pb-2 text-xs font-semibold text-muted">
          {w}
        </span>
      ))}
      {monthGrid(month).map(({ iso, day, inMonth }) => {
        if (!inMonth) {
          return (
            <span key={iso} className="flex h-9 items-center justify-center text-muted/40">
              {day}
            </span>
          );
        }
        const disabled = isDisabled(iso);
        const isEdge = iso === from || iso === to;
        const inRange = from !== null && to !== null && iso > from && iso < to;
        return (
          <button
            key={iso}
            type="button"
            disabled={disabled}
            onClick={() => onPick(iso)}
            onMouseEnter={() => onHover(iso)}
            aria-label={iso.split('-').reverse().join('/')}
            aria-pressed={isEdge}
            className={`relative flex h-9 items-center justify-center font-medium transition-colors ${
              disabled
                ? 'cursor-not-allowed bg-canvas text-muted/50'
                : isEdge
                  ? 'rounded-lg bg-primary text-white'
                  : inRange
                    ? 'bg-primary-soft text-primary'
                    : 'rounded-lg text-ink hover:bg-primary-soft hover:text-primary'
            }`}
          >
            {day}
            {iso === today && (
              <span className={`absolute bottom-1 size-1 rounded-full ${isEdge ? 'bg-white' : 'bg-primary'}`} />
            )}
          </button>
        );
      })}
    </div>
  );
}
