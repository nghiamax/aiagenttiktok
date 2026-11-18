import { useEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { addDays, addMonths, formatDmy, ymOf, type YearMonth } from '../../lib/dates';
import CalendarMonth from './CalendarMonth';

export interface DateRangeValue {
  from: string;
  to: string;
}

export interface DateRangePreset {
  label: string;
  range: DateRangeValue;
}

interface DateRangeSelectProps {
  value: DateRangeValue;
  onChange: (range: DateRangeValue) => void;
  presets: DateRangePreset[];
  /** Ngày lớn nhất được chọn (thường là hôm nay) */
  max: string;
  /** Số ngày tối đa của một khoảng */
  maxDays?: number;
}

const same = (a: DateRangeValue, b: DateRangeValue) => a.from === b.from && a.to === b.to;
const monthLabel = (m: YearMonth) => `${String(m.month + 1).padStart(2, '0')}/${m.year}`;

const navBtn =
  'flex size-8 items-center justify-center rounded-lg text-muted transition hover:bg-canvas hover:text-ink disabled:cursor-not-allowed disabled:opacity-30';

/** Ô chọn khoảng ngày gộp: nút hiện khoảng đang chọn → bảng gồm nút nhanh + lịch 2 tháng */
export default function DateRangeSelect({ value, onChange, presets, max, maxDays = 90 }: DateRangeSelectProps) {
  const [open, setOpen] = useState(false);
  /** Ngày đầu đã bấm, đang chờ bấm ngày cuối */
  const [anchor, setAnchor] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  // Tháng bên trái; tháng bên phải = trái + 1. Mặc định để tháng cuối của khoảng nằm bên phải
  const [view, setView] = useState<YearMonth>(() => addMonths(ymOf(value.to), -1));
  const rootRef = useRef<HTMLDivElement>(null);

  const activePreset = presets.find((p) => same(p.range, value));
  const maxMonth = addMonths(ymOf(max), -1);
  const atMaxMonth = view.year * 12 + view.month >= maxMonth.year * 12 + maxMonth.month;

  function close() {
    setOpen(false);
    setAnchor(null);
    setHover(null);
  }

  function toggle() {
    if (open) return close();
    setView(addMonths(ymOf(value.to), -1));
    setOpen(true);
  }

  // Bấm ra ngoài / Esc → đóng
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function pickPreset(range: DateRangeValue) {
    onChange(range);
    close();
  }

  function pickDay(iso: string) {
    if (!anchor) {
      setAnchor(iso);
      return;
    }
    const [from, to] = anchor <= iso ? [anchor, iso] : [iso, anchor];
    onChange({ from, to });
    close();
  }

  // Đang chọn: không cho vượt quá maxDays tính từ ngày đầu
  const isDisabled = (iso: string) =>
    iso > max || (anchor !== null && (iso > addDays(anchor, maxDays - 1) || iso < addDays(anchor, -(maxDays - 1))));

  // Khoảng tô màu: đang chọn → ngày đầu ↔ ngày đang rê chuột; không thì khoảng hiện tại
  let shownFrom: string | null = value.from;
  let shownTo: string | null = value.to;
  if (anchor) {
    const other = hover && !isDisabled(hover) ? hover : anchor;
    [shownFrom, shownTo] = anchor <= other ? [anchor, other] : [other, anchor];
  }

  const calendarProps = { from: shownFrom, to: shownTo, today: max, isDisabled, onPick: pickDay, onHover: setHover };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`inline-flex h-11 items-center gap-2.5 rounded-xl border bg-white px-3.5 text-sm shadow-sm transition-colors ${
          open ? 'border-primary' : 'border-line hover:border-primary/40'
        }`}
      >
        <CalendarDays className="size-4 shrink-0 text-primary" />
        <span className="font-semibold text-ink">{activePreset?.label ?? 'Tùy chỉnh'}</span>
        <span className="text-muted">
          {value.from === value.to ? formatDmy(value.from) : `${formatDmy(value.from)} – ${formatDmy(value.to)}`}
        </span>
        <ChevronDown className={`size-4 text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Chọn khoảng ngày"
          className="absolute right-0 top-full z-40 mt-2 flex w-[calc(100vw-2rem)] max-w-[700px] flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-xl sm:flex-row"
        >
          {/* Nút nhanh */}
          <div className="flex gap-2 overflow-x-auto border-b border-line p-3 sm:w-36 sm:shrink-0 sm:flex-col sm:border-b-0 sm:border-r">
            {presets.map((p) => {
              const active = !anchor && activePreset === p;
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => pickPreset(p.range)}
                  className={`shrink-0 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                    active
                      ? 'border-primary bg-primary-soft text-primary'
                      : 'border-line text-muted hover:border-primary/40 hover:text-ink'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* Lịch 2 tháng */}
          <div className="min-w-0 flex-1 p-4">
            <p className="mb-3 text-center text-sm">
              <span
                className={`inline-block rounded-lg border px-3 py-1 font-medium ${
                  activePreset && !anchor ? 'border-line text-muted' : 'border-primary text-primary'
                }`}
              >
                {anchor ? 'Chọn ngày kết thúc' : 'Tùy chỉnh'}
              </span>
            </p>
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex">
                    <button type="button" className={navBtn} onClick={() => setView(addMonths(view, -12))} aria-label="Năm trước">
                      <ChevronsLeft className="size-4" />
                    </button>
                    <button type="button" className={navBtn} onClick={() => setView(addMonths(view, -1))} aria-label="Tháng trước">
                      <ChevronLeft className="size-4" />
                    </button>
                  </div>
                  <span className="text-sm font-semibold text-ink">{monthLabel(view)}</span>
                  {/* Màn hình nhỏ chỉ có 1 tháng → nút sang tháng sau nằm ở đây */}
                  <div className="flex md:invisible">
                    <button
                      type="button"
                      className={navBtn}
                      onClick={() => setView(addMonths(view, 1))}
                      disabled={atMaxMonth}
                      aria-label="Tháng sau"
                    >
                      <ChevronRight className="size-4" />
                    </button>
                  </div>
                </div>
                <CalendarMonth month={view} {...calendarProps} />
              </div>
              <div className="hidden md:block">
                <div className="mb-2 flex items-center justify-between">
                  <span className="size-8" />
                  <span className="text-sm font-semibold text-ink">{monthLabel(addMonths(view, 1))}</span>
                  <div className="flex">
                    <button
                      type="button"
                      className={navBtn}
                      onClick={() => setView(addMonths(view, 1))}
                      disabled={atMaxMonth}
                      aria-label="Tháng sau"
                    >
                      <ChevronRight className="size-4" />
                    </button>
                    <button
                      type="button"
                      className={navBtn}
                      onClick={() => {
                        const next = addMonths(view, 12);
                        setView(next.year * 12 + next.month > maxMonth.year * 12 + maxMonth.month ? maxMonth : next);
                      }}
                      disabled={atMaxMonth}
                      aria-label="Năm sau"
                    >
                      <ChevronsRight className="size-4" />
                    </button>
                  </div>
                </div>
                <CalendarMonth month={addMonths(view, 1)} {...calendarProps} />
              </div>
            </div>
            <p className="mt-3 text-center text-xs text-muted">
              Bấm ngày bắt đầu rồi ngày kết thúc · tối đa {maxDays} ngày
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
