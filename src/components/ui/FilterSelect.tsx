import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown, Search, X, type LucideIcon } from 'lucide-react';

export interface FilterOption {
  value: string;
  label: string;
  /** Dòng phụ dưới tên (ROI, chi phí, chiến dịch…) */
  description?: string;
  imageUrl?: string | null;
}

interface FilterSelectProps {
  /** Tên bộ lọc, ví dụ "Chiến dịch" */
  label: string;
  icon: LucideIcon;
  /** Chữ hiện khi chưa chọn, ví dụ "Tất cả chiến dịch" */
  allLabel: string;
  options: FilterOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  searchPlaceholder: string;
}

/** Ô chọn có tìm kiếm: bấm mở danh sách, gõ để lọc, ✕ để bỏ chọn */
export default function FilterSelect({
  label,
  icon: Icon,
  allLabel,
  options,
  value,
  onChange,
  searchPlaceholder,
}: FilterSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value) ?? null;
  const q = query.trim().toLowerCase();
  const filtered = q
    ? options.filter((o) => o.label.toLowerCase().includes(q) || o.description?.toLowerCase().includes(q))
    : options;
  // Mục 0 là "Tất cả" (chỉ khi không gõ tìm)
  const items: (FilterOption | null)[] = q ? filtered : [null, ...filtered];

  // Đóng khi bấm ra ngoài
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    inputRef.current?.focus();
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  function toggle() {
    setQuery('');
    setActive(0);
    setOpen((o) => !o);
  }

  function choose(option: FilterOption | null) {
    onChange(option ? option.value : null);
    setOpen(false);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') setOpen(false);
    else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && items.length > 0) {
      e.preventDefault();
      choose(items[Math.min(active, items.length - 1)]);
    }
  }

  return (
    <div ref={rootRef} className="relative w-full sm:w-80">
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex h-11 w-full items-center gap-2.5 rounded-xl border px-3 text-left text-sm transition ${
          selected
            ? 'border-primary/30 bg-primary-soft pr-16 hover:border-primary/50'
            : 'border-line bg-white pr-9 hover:border-muted/40 hover:bg-canvas'
        }`}
      >
        <Icon className={`size-4 shrink-0 ${selected ? 'text-primary' : 'text-muted'}`} />
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-medium leading-tight text-muted">{label}</span>
          <span className={`block truncate font-medium leading-tight ${selected ? 'text-primary' : ''}`}>
            {selected ? selected.label : allLabel}
          </span>
        </span>
      </button>

      {selected && (
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label={`Bỏ lọc ${label.toLowerCase()}`}
          title={`Bỏ lọc ${label.toLowerCase()}`}
          className="absolute right-8 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-primary transition-colors hover:bg-white"
        >
          <X className="size-3.5" />
        </button>
      )}
      <ChevronDown
        className={`pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 transition-transform ${
          selected ? 'text-primary' : 'text-muted'
        } ${open ? 'rotate-180' : ''}`}
      />

      {open && (
        <div className="absolute left-0 top-full z-30 mt-2 w-[min(28rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-line bg-white shadow-lg">
          <label className="relative block border-b border-line">
            <span className="sr-only">{searchPlaceholder}</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
              placeholder={searchPlaceholder}
              className="w-full bg-transparent py-3 pl-9 pr-3 text-sm outline-none placeholder:text-muted"
            />
          </label>

          <ul role="listbox" aria-label={label} className="max-h-80 overflow-y-auto py-1">
            {items.map((o, i) => {
              const isSelected = o ? o.value === value : value == null;
              return (
                <li key={o?.value ?? '__all'} role="option" aria-selected={isSelected}>
                  <button
                    type="button"
                    onClick={() => choose(o)}
                    onMouseEnter={() => setActive(i)}
                    className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors ${
                      i === active ? 'bg-canvas' : ''
                    }`}
                  >
                    {o?.imageUrl !== undefined &&
                      (o.imageUrl ? (
                        <img src={o.imageUrl} alt="" loading="lazy" className="size-9 shrink-0 rounded-lg bg-canvas object-cover" />
                      ) : (
                        <span className="size-9 shrink-0 rounded-lg bg-canvas" />
                      ))}
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate ${isSelected ? 'font-semibold text-primary' : 'font-medium'}`}>
                        {o ? o.label : allLabel}
                      </span>
                      {o?.description && <span className="block truncate text-xs text-muted">{o.description}</span>}
                    </span>
                    {isSelected && <Check className="size-4 shrink-0 text-primary" />}
                  </button>
                </li>
              );
            })}
            {items.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">Không tìm thấy</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
