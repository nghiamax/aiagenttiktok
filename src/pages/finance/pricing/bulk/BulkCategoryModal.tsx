import { useState } from 'react';
import Modal from '../../../../components/ui/Modal';
import { formatNumber } from '../../../../lib/format';
import CategoryCombobox from '../CategoryCombobox';
import type { SavedCategory } from '../config';
import type { BulkRow, CategoryScope } from './bulkRows';

export type CategoryTarget =
  /** Bấm ô ngành của 1 dòng. productCount / fileCategoryCount = số SKU cùng sản phẩm / cùng ngành trong file */
  | { kind: 'row'; row: BulkRow; productCount: number; fileCategoryCount: number }
  /** Nút "Ngành chung" — áp cho mọi SKU chưa khớp ngành */
  | { kind: 'fallback'; count: number; current: SavedCategory | null };

interface BulkCategoryModalProps {
  target: CategoryTarget;
  categories: SavedCategory[];
  profileLabel: string;
  onApply: (categoryId: string, scope: CategoryScope) => void;
  /** Bỏ ngành đã chọn tay → quay lại tự khớp theo file / ngành chung */
  onReset: (() => void) | null;
  onClose: () => void;
}

/** Chọn ngành trong bảng phí cho 1 SKU, cả sản phẩm, cả ngành trong file, hoặc làm ngành chung */
export default function BulkCategoryModal({
  target,
  categories,
  profileLabel,
  onApply,
  onReset,
  onClose,
}: BulkCategoryModalProps) {
  const isRow = target.kind === 'row';
  const current = isRow ? ('category' in target.row.category ? target.row.category.category : null) : target.current;
  const [picked, setPicked] = useState<SavedCategory | null>(current);

  const options: { value: CategoryScope; label: string }[] = [];
  if (isRow) {
    const { row, productCount, fileCategoryCount } = target;
    if (row.item.category && fileCategoryCount > 1)
      options.push({
        value: 'file',
        label: `Cả ${formatNumber(fileCategoryCount)} SKU có ngành “${row.item.category}” trong file`,
      });
    if (row.item.productId && productCount > 1)
      options.push({ value: 'product', label: `Cả ${formatNumber(productCount)} phân loại của sản phẩm này` });
    options.push({ value: 'row', label: 'Chỉ SKU này' });
  }
  const [scope, setScope] = useState<CategoryScope>(isRow ? options[0].value : 'fallback');

  return (
    <Modal
      title={isRow ? 'Chọn ngành hàng' : 'Ngành chung cho SKU chưa khớp'}
      description={
        isRow
          ? `${target.row.item.name}${target.row.item.variant ? ` · ${target.row.item.variant}` : ''}`
          : `Áp cho ${formatNumber(target.count)} SKU chưa có ngành (vd file Shopee không có cột ngành). SKU đã chọn ngành riêng vẫn giữ nguyên.`
      }
      onClose={onClose}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {onReset && (
            <button
              type="button"
              onClick={() => {
                onReset();
                onClose();
              }}
              className="mr-auto rounded-lg px-3 py-2 text-sm font-medium text-muted transition hover:bg-canvas hover:text-ink"
            >
              {isRow ? 'Bỏ ngành chọn tay' : 'Bỏ ngành chung'}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3.5 py-2 text-sm font-medium text-muted transition hover:bg-canvas"
          >
            Huỷ
          </button>
          <button
            type="button"
            disabled={!picked}
            onClick={() => {
              if (!picked) return;
              onApply(picked.id, scope);
              onClose();
            }}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-hover disabled:opacity-50"
          >
            Áp dụng
          </button>
        </div>
      }
    >
      {/* đủ cao để danh sách thả xuống của ô tìm ngành không bị cắt */}
      <div className="min-h-[28rem] space-y-4 p-5">
        {isRow && target.row.item.category && (
          <p className="text-sm text-muted">
            Ngành trong file: <b className="text-ink">{target.row.item.category}</b>
          </p>
        )}
        <CategoryCombobox
          categories={categories}
          selected={picked}
          onSelect={setPicked}
          onClear={() => setPicked(null)}
        />
        <p className="text-sm text-muted">
          Bảng phí đang dùng: {profileLabel} ({formatNumber(categories.length)} ngành)
        </p>
        {options.length > 1 && (
          <fieldset className="space-y-1.5">
            <legend className="mb-1.5 text-sm font-medium">Áp dụng cho</legend>
            {options.map((o) => (
              <label
                key={o.value}
                className={`flex cursor-pointer items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm transition hover:bg-canvas ${
                  scope === o.value ? 'border-primary/40 bg-primary-soft/40' : 'border-line'
                }`}
              >
                <input
                  type="radio"
                  name="category-scope"
                  checked={scope === o.value}
                  onChange={() => setScope(o.value)}
                  className="mt-0.5 size-4 accent-primary"
                />
                <span>{o.label}</span>
              </label>
            ))}
          </fieldset>
        )}
      </div>
    </Modal>
  );
}
