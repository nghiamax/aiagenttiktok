import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { formatNumber } from '../../../lib/format';
import type { SavedCategory } from './config';
import { PATH_SEP, searchCategories } from './import/categoryImport';

interface CategoryComboboxProps {
  categories: SavedCategory[];
  selected: SavedCategory | null;
  onSelect: (category: SavedCategory) => void;
  onClear: () => void;
}

/** Tên ngành: các cấp trên mờ, cấp cuối đậm */
export function CategoryPath({ name }: { name: string }) {
  const parts = name.split(PATH_SEP);
  const last = parts.pop();
  return (
    <span className="min-w-0">
      {parts.length > 0 && (
        <span className="text-muted">
          {parts.join(PATH_SEP)}
          {PATH_SEP}
        </span>
      )}
      <span className="font-medium text-ink">{last}</span>
    </span>
  );
}

export default function CategoryCombobox({ categories, selected, onSelect, onClear }: CategoryComboboxProps) {
  const listId = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const results = useMemo(() => searchCategories(categories, query), [categories, query]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const pick = (c: SavedCategory) => {
    onSelect(c);
    setQuery('');
    setOpen(false);
  };

  const empty = categories.length === 0;

  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-xl border border-line bg-white px-3 transition focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
        <Search className="size-4 shrink-0 text-muted" />
        <input
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-label="Tìm ngành hàng"
          disabled={empty}
          value={query}
          placeholder={
            empty
              ? 'Chưa có danh sách ngành — tải file phí ngành lên'
              : selected
                ? 'Tìm ngành khác…'
                : `Tìm trong ${formatNumber(categories.length)} ngành, vd "tai nghe", "ao thun"`
          }
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setOpen(true);
              setActive((a) => Math.min(a + 1, results.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === 'Enter' && open && results[active]) {
              e.preventDefault();
              pick(results[active]);
            } else if (e.key === 'Escape') {
              setOpen(false);
            }
          }}
          className="min-w-0 flex-1 bg-transparent py-2 text-[15px] outline-none placeholder:text-muted/70 disabled:cursor-not-allowed"
        />
        {query && (
          <button
            type="button"
            aria-label="Xoá từ khoá"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setQuery('')}
            className="rounded-md p-1 text-muted transition hover:bg-canvas hover:text-ink"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {open && !empty && (
        <ul
          id={listId}
          ref={listRef}
          role="listbox"
          className="absolute inset-x-0 top-full z-30 mt-1.5 max-h-80 overflow-y-auto rounded-xl border border-line bg-white p-1.5 shadow-lg"
        >
          {!query && categories.length > results.length && (
            <li className="px-3 pb-1.5 pt-1 text-sm text-muted">
              Gõ tên ngành để tìm trong {formatNumber(categories.length)} ngành…
            </li>
          )}
          {results.length === 0 ? (
            <li className="px-3 py-2.5 text-sm text-muted">Không tìm thấy ngành phù hợp — nhập % tay ở ô bên cạnh.</li>
          ) : (
            results.map((c, i) => (
              <li
                key={c.id}
                role="option"
                aria-selected={c.id === selected?.id}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(c)}
                className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm transition ${
                  i === active ? 'bg-primary-soft' : ''
                }`}
              >
                <CategoryPath name={c.name} />
                <span className="shrink-0 rounded-md bg-canvas px-2 py-0.5 font-semibold tabular-nums">
                  {formatNumber(c.pct, 2)}%
                </span>
              </li>
            ))
          )}
        </ul>
      )}

      {selected && (
        <div className="mt-2.5 flex items-center gap-3 rounded-xl border border-primary/30 bg-primary-soft/60 px-3 py-2">
          <div className="min-w-0 flex-1 text-sm">
            <CategoryPath name={selected.name} />
          </div>
          <span className="shrink-0 text-lg font-bold tabular-nums text-primary">{formatNumber(selected.pct, 2)}%</span>
          <button
            type="button"
            aria-label="Bỏ chọn ngành"
            onClick={onClear}
            className="rounded-md p-1 text-muted transition hover:bg-white hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}
