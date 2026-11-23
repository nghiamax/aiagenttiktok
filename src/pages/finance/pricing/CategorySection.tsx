import { useState } from 'react';
import { formatNumber } from '../../../lib/format';
import NumberField from './NumberField';
import CategoryCombobox from './CategoryCombobox';
import { categoryId, PATH_SEP } from './import/categoryImport';
import type { SavedCategory } from './config';

interface CategorySectionProps {
  /** Ngành của bảng phí hệ thống + ngành Sếp tự lưu */
  categories: SavedCategory[];
  /** Phí suất mặc định cho ngành không có trong bảng */
  defaultCategoryPct: number | null;
  /** Vd "TikTok Shop · Shop tiêu chuẩn" */
  profileLabel: string;
  selectedId: string | null;
  pct: number;
  recentIds: string[];
  onSelect: (category: SavedCategory) => void;
  onClear: () => void;
  onPctChange: (pct: number) => void;
  onAddCategory: (category: SavedCategory) => void;
  /** Bảng phí có mức ưu đãi người bán mới */
  promoAvailable: boolean;
  newSeller: boolean;
  onNewSeller: (value: boolean) => void;
}

const lastPart = (name: string) => name.split(PATH_SEP).pop() ?? name;

/** Tìm & chọn ngành trong bảng phí của sàn + loại shop đang chọn, hoặc nhập % tay */
export default function CategorySection({
  categories,
  defaultCategoryPct,
  profileLabel,
  selectedId,
  pct,
  recentIds,
  onSelect,
  onClear,
  onPctChange,
  onAddCategory,
  promoAvailable,
  newSeller,
  onNewSeller,
}: CategorySectionProps) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');

  const selected = categories.find((c) => c.id === selectedId) ?? null;
  const usingDefault = !selected && defaultCategoryPct != null && pct === defaultCategoryPct;
  const recents = recentIds
    .map((id) => categories.find((c) => c.id === id))
    .filter((c): c is SavedCategory => !!c && c.id !== selectedId)
    .slice(0, 5);

  const saveManual = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onAddCategory({ id: categoryId(trimmed), name: trimmed, pct });
    setName('');
    setNaming(false);
  };

  return (
    <div className="space-y-3">
      {categories.length === 0 && (
        <p className="rounded-xl bg-canvas px-3.5 py-2.5 text-sm text-muted">
          Hệ thống chưa có bảng phí ngành cho {profileLabel} — nhập % phí ngành tay ở ô bên phải.
        </p>
      )}

      {promoAvailable && (
        <button
          type="button"
          role="switch"
          aria-checked={newSeller}
          onClick={() => onNewSeller(!newSeller)}
          className={`flex w-full items-start gap-3 rounded-xl border px-3 py-2 text-left transition hover:bg-canvas ${
            newSeller ? 'border-primary/40 bg-primary-soft/40' : 'border-line'
          }`}
        >
          <span
            className={`relative mt-0.5 h-6 w-10 shrink-0 rounded-full transition ${newSeller ? 'bg-primary' : 'bg-line'}`}
          >
            <span
              className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${newSeller ? 'left-[18px]' : 'left-0.5'}`}
            />
          </span>
          <span className="text-sm">
            <span className="font-medium text-ink">Người bán mới — dùng mức phí ưu đãi</span>
            <span className="block text-muted">
              {newSeller
                ? 'Đang tính theo mức phí ưu đãi cho người bán mới (theo bảng phí đã tải).'
                : 'Bảng phí của sàn có mức ưu đãi cho người bán mới. Bật nếu shop đang được hưởng.'}
            </span>
          </span>
        </button>
      )}

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]">
        <CategoryCombobox categories={categories} selected={selected} onSelect={onSelect} onClear={onClear} />
        <div className="sm:self-start">
          <NumberField ariaLabel="Phí ngành (%)" value={pct} onChange={onPctChange} suffix="%" decimals={2} max={99} />
        </div>
      </div>

      {(recents.length > 0 || defaultCategoryPct != null) && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {recents.length > 0 && <span className="text-muted">Gần đây:</span>}
          {recents.map((c) => (
            <button
              key={c.id}
              type="button"
              title={c.name}
              onClick={() => onSelect(c)}
              className="rounded-lg bg-canvas px-2.5 py-1 font-medium text-ink transition hover:bg-primary-soft hover:text-primary"
            >
              {lastPart(c.name)} · {formatNumber(c.pct, 2)}%
            </button>
          ))}
          {defaultCategoryPct != null && (
            <button
              type="button"
              onClick={() => onPctChange(defaultCategoryPct)}
              aria-pressed={usingDefault}
              className={`rounded-lg border px-2.5 py-1 font-medium transition ${
                usingDefault
                  ? 'border-primary bg-primary-soft text-primary'
                  : 'border-dashed border-line text-muted hover:border-primary/40 hover:text-ink'
              } ${recents.length > 0 ? 'sm:ml-auto' : ''}`}
            >
              Ngành không có trong bảng · mặc định {formatNumber(defaultCategoryPct, 2)}%
            </button>
          )}
        </div>
      )}

      {!selected && !usingDefault && pct > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {naming ? (
            <>
              <input
                autoFocus
                aria-label="Tên ngành hàng"
                placeholder="Tên ngành, vd Phụ kiện điện thoại"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveManual();
                  if (e.key === 'Escape') setNaming(false);
                }}
                className="min-w-0 flex-1 rounded-xl border border-line px-3 py-2 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
              />
              <button
                type="button"
                onClick={saveManual}
                disabled={!name.trim()}
                className="rounded-xl bg-primary px-3.5 py-2 font-semibold text-white transition hover:bg-primary-hover disabled:opacity-50"
              >
                Lưu
              </button>
              <button
                type="button"
                onClick={() => setNaming(false)}
                className="rounded-xl px-3 py-2 text-muted transition hover:bg-canvas"
              >
                Huỷ
              </button>
            </>
          ) : (
            <>
              <span className="text-muted">Đang dùng {formatNumber(pct, 2)}% nhập tay.</span>
              <button
                type="button"
                onClick={() => setNaming(true)}
                className="rounded-lg px-2 py-1 font-medium text-primary transition hover:bg-primary-soft"
              >
                Lưu thành ngành
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
