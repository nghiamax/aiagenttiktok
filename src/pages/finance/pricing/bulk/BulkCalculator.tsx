import { useEffect, useMemo, useState } from 'react';
import { Download, Search, Sheet, Tags } from 'lucide-react';
import Card from '../../../../components/ui/Card';
import Pagination from '../../../../components/ui/Pagination';
import { formatNumber } from '../../../../lib/format';
import NumberField from '../NumberField';
import QuickPicks from '../QuickPicks';
import type { FeeLine, Platform } from '../calc';
import { PLATFORM_LABEL, type SavedCategory } from '../config';
import BulkUploadCard from './BulkUploadCard';
import BulkTable from './BulkTable';
import BulkCategoryModal, { type CategoryTarget } from './BulkCategoryModal';
import { mergeItems } from './bulkImport';
import {
  applyCategory,
  categoryMapKey,
  clearCategory,
  countRows,
  filterRows,
  resolveBulkRows,
  type BulkFilter,
  type BulkRow,
} from './bulkRows';
import { bulkExportTable } from './exportBulk';
import { buildXlsx } from './writeXlsx';
import { useBulkStore } from './useBulkStore';

interface BulkCalculatorProps {
  /** Sàn đang chọn ở biểu phí phía trên */
  platform: Platform;
  /** Đổi sàn (file tải lên là của sàn khác) */
  onPlatform: (platform: Platform) => void;
  profileLabel: string;
  /** Ngành của bảng phí đang dùng (đã áp mức ưu đãi người bán mới nếu bật) */
  categories: SavedCategory[];
  defaultCategoryPct: number | null;
  fees: FeeLine[];
  taxPct: number;
  applyLogistics: boolean;
  /** Nguồn đơn đang chọn có quảng cáo không (không → ẩn ô % quảng cáo) */
  adsEnabled: boolean;
  adsPct: number;
  /** Hoa hồng KOC theo nguồn đơn (%) */
  affiliatePct: number;
  marginPct: number;
  onAdsPct: (v: number) => void;
  onMarginPct: (v: number) => void;
  onOpenSingle: (row: BulkRow) => void;
}

const PAGE_SIZE = 50;

const FILTERS: { value: BulkFilter; label: string; tone: string }[] = [
  { value: 'all', label: 'Tất cả', tone: 'text-ink' },
  { value: 'loss', label: 'Đang lỗ', tone: 'text-danger' },
  { value: 'below-target', label: 'Dưới mục tiêu', tone: 'text-amber-700' },
  { value: 'missing-cost', label: 'Thiếu giá vốn', tone: 'text-muted' },
  { value: 'category', label: 'Chưa khớp ngành', tone: 'text-amber-700' },
];

function download(data: Uint8Array, fileName: string) {
  const url = URL.createObjectURL(
    new Blob([data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Tải file danh sách sản phẩm → tính lãi & giá đề xuất cho từng SKU theo biểu phí đang chọn */
export default function BulkCalculator({
  platform,
  onPlatform,
  profileLabel,
  categories,
  defaultCategoryPct,
  fees,
  taxPct,
  applyLogistics,
  adsEnabled,
  adsPct,
  affiliatePct,
  marginPct,
  onAdsPct,
  onMarginPct,
  onOpenSingle,
}: BulkCalculatorProps) {
  const { state, setState, setFor, all } = useBulkStore(platform);
  const otherPlatform: Platform = platform === 'tiktok' ? 'shopee' : 'tiktok';
  const other = all[otherPlatform];
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState<BulkFilter>('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [picking, setPicking] = useState<CategoryTarget | null>(null);

  const rows = useMemo(
    () =>
      resolveBulkRows(state, categories, defaultCategoryPct, {
        fees,
        adsPct,
        affiliatePct,
        taxPct,
        applyLogistics,
        marginPct,
      }),
    [state, categories, defaultCategoryPct, fees, adsPct, affiliatePct, taxPct, applyLogistics, marginPct],
  );
  const counts = useMemo(() => countRows(rows), [rows]);
  const visible = useMemo(() => filterRows(rows, filter, query), [rows, filter, query]);
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  useEffect(() => setPage(1), [filter, query, state.items]);
  // Đổi sàn → đóng hộp chọn ngành, bỏ lọc của danh sách sàn kia
  useEffect(() => {
    setPicking(null);
    setFilter('all');
    setQuery('');
  }, [platform]);
  const pageRows = visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const totals = useMemo(() => {
    const priced = rows.filter((r) => r.result.current);
    return {
      priced: priced.length,
      avgMargin: priced.length
        ? priced.reduce((s, r) => s + (r.result.current?.marginPct ?? 0), 0) / priced.length
        : null,
    };
  }, [rows]);

  const pickRow = (row: BulkRow) => {
    const cat = row.item.category ? categoryMapKey(row.item.category) : null;
    setPicking({
      kind: 'row',
      row,
      productCount: row.item.productId ? state.items.filter((i) => i.productId === row.item.productId).length : 1,
      fileCategoryCount: cat ? state.items.filter((i) => i.category && categoryMapKey(i.category) === cat).length : 1,
    });
  };
  const fallbackCategory = categories.find((c) => c.id === state.fallbackCategoryId) ?? null;
  const fallbackCount = rows.filter((r) => r.category.kind === 'fallback').length + counts.category;
  const productCount = useMemo(() => new Set(state.items.map((i) => i.productId ?? i.key)).size, [state.items]);

  const exportXlsx = () => {
    const t = bulkExportTable(visible, marginPct);
    const date = new Date().toISOString().slice(0, 10);
    download(buildXlsx('Tính giá', t.header, t.rows, t.widths), `tinh-gia-hang-loat-${date}.xlsx`);
  };

  const hasItems = state.items.length > 0;

  return (
    <Card className="overflow-visible">
      <div className="flex items-start gap-3 p-5 pb-4">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-canvas text-ink">
          <Sheet className="size-[18px]" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold leading-tight">Tính hàng loạt · {PLATFORM_LABEL[platform]}</h3>
          <p className="mt-0.5 text-sm text-muted">
            Danh sách riêng của <b className="text-ink">{PLATFORM_LABEL[platform]}</b>, tính theo biểu phí{' '}
            <b className="text-ink">{profileLabel}</b> ở trên — đổi loại shop / khoản phí là bảng tự tính lại. Giá vốn
            nhập một lần, được nhớ theo ID SKU.
          </p>
        </div>
      </div>

      <div className="space-y-4 px-5 pb-5">
        <BulkUploadCard
          platformLabel={PLATFORM_LABEL[platform]}
          files={state.files}
          itemCount={state.items.length}
          onLoaded={(items, names, replace, filePlatform) => {
            // File của sàn nào vào danh sách của sàn đó; khác sàn đang xem → chuyển sang sàn đó
            const target = filePlatform ?? platform;
            setFor(target, (s) => ({
              ...s,
              items: replace && target === platform ? mergeItems([], items) : mergeItems(s.items, items),
              files: replace && target === platform ? names : [...s.files.filter((f) => !names.includes(f)), ...names],
            }));
            if (target !== platform) {
              setNotice(
                `File ${names.join(', ')} là của ${PLATFORM_LABEL[target]} → đã đưa vào danh sách ${PLATFORM_LABEL[target]}.`,
              );
              onPlatform(target);
            } else setNotice(null);
          }}
          onClear={() => setState((s) => ({ ...s, items: [], files: [], prices: {} }))}
        />

        {notice && <p className="rounded-xl bg-primary-soft/60 px-3.5 py-2.5 text-sm text-primary">{notice}</p>}
        {!hasItems && other.items.length > 0 && (
          <p className="text-sm text-muted">
            Danh sách {PLATFORM_LABEL[otherPlatform]} ({formatNumber(other.items.length)} SKU) vẫn được giữ riêng — chọn
            tab {PLATFORM_LABEL[otherPlatform]} ở trên để xem.
          </p>
        )}

        {hasItems && (
          <div className={`grid gap-4 ${adsEnabled ? 'md:grid-cols-2' : ''}`}>
            {adsEnabled && (
              <div className="rounded-xl border border-line p-3.5">
                <div className="flex items-center gap-3">
                  <span className="min-w-0 flex-1 text-sm font-medium">Chi phí quảng cáo (% giá bán)</span>
                  <NumberField
                    compact
                    ariaLabel="% chi phí quảng cáo"
                    value={adsPct}
                    onChange={onAdsPct}
                    suffix="%"
                    decimals={1}
                    max={99}
                    className="w-24"
                  />
                </div>
                <QuickPicks values={[0, 5, 10, 15, 20]} value={adsPct} onPick={onAdsPct} />
              </div>
            )}
            <div className="rounded-xl border border-line p-3.5">
              <div className="flex items-center gap-3">
                <span className="min-w-0 flex-1 text-sm font-medium">Lãi mong muốn để tính giá đề xuất</span>
                <NumberField
                  compact
                  ariaLabel="% lãi mong muốn"
                  value={marginPct}
                  onChange={onMarginPct}
                  suffix="%"
                  decimals={1}
                  max={99}
                  className="w-24"
                />
              </div>
              <QuickPicks values={[10, 15, 20, 30]} value={marginPct} onPick={onMarginPct} />
            </div>
          </div>
        )}
      </div>

      {hasItems && (
        <>
          <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Lọc SKU">
              {FILTERS.map((f) => {
                const on = filter === f.value;
                const n = counts[f.value];
                if (f.value !== 'all' && n === 0 && !on) return null;
                return (
                  <button
                    key={f.value}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => setFilter(f.value)}
                    className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                      on ? 'border-primary bg-primary-soft text-primary' : 'border-line hover:bg-canvas'
                    }`}
                  >
                    <span className={on ? '' : f.tone}>{f.label}</span>{' '}
                    <span className="tabular-nums text-muted">{formatNumber(n)}</span>
                  </button>
                );
              })}
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {(fallbackCount > 0 || fallbackCategory) && (
                <button
                  type="button"
                  onClick={() => setPicking({ kind: 'fallback', count: fallbackCount, current: fallbackCategory })}
                  title="Chọn 1 ngành áp cho mọi SKU chưa khớp ngành"
                  className={`inline-flex max-w-[16rem] items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                    fallbackCategory
                      ? 'border-primary/40 bg-primary-soft/50 text-primary hover:bg-primary-soft'
                      : 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
                  }`}
                >
                  <Tags className="size-4 shrink-0" />
                  <span className="truncate">
                    {fallbackCategory
                      ? `Ngành chung: ${fallbackCategory.name.split(' › ').pop()}`
                      : `Chọn ngành chung (${formatNumber(counts.category)} SKU)`}
                  </span>
                </button>
              )}
              <label className="flex items-center gap-2 rounded-lg border border-line px-2.5 transition focus-within:border-primary">
                <Search className="size-4 text-muted" />
                <input
                  aria-label="Tìm sản phẩm"
                  placeholder="Tìm tên, SKU…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-44 bg-transparent py-1.5 text-sm outline-none placeholder:text-muted/70"
                />
              </label>
              <button
                type="button"
                onClick={exportXlsx}
                disabled={visible.length === 0}
                className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-ink/85 disabled:opacity-50"
              >
                <Download className="size-4" /> Xuất Excel
              </button>
            </div>
          </div>

          {totals.priced > 0 && (
            <p className="px-5 pb-3 text-sm text-muted">
              {formatNumber(productCount)} sản phẩm · {formatNumber(totals.priced)}/{formatNumber(rows.length)} SKU đã
              tính được lãi · lãi trung bình <b className="text-ink">{formatNumber(totals.avgMargin ?? 0, 1)}%</b> giá
              bán
              {counts.loss > 0 && (
                <>
                  {' '}
                  · <b className="text-danger">{formatNumber(counts.loss)} SKU đang lỗ</b>
                </>
              )}
            </p>
          )}

          {visible.length === 0 ? (
            <p className="border-t border-line px-5 py-10 text-center text-sm text-muted">
              Không có SKU nào khớp bộ lọc.
            </p>
          ) : (
            <BulkTable
              rows={pageRows}
              marginPct={marginPct}
              applyLogistics={applyLogistics}
              onCost={(key, v) =>
                setState((s) => {
                  const costs = { ...s.costs };
                  if (v > 0) costs[key] = v;
                  else delete costs[key];
                  return { ...s, costs };
                })
              }
              onPrice={(key, v) =>
                setState((s) => {
                  const prices = { ...s.prices };
                  if (v == null) delete prices[key];
                  else prices[key] = v;
                  return { ...s, prices };
                })
              }
              onPickCategory={pickRow}
              onOpenSingle={onOpenSingle}
            />
          )}
          <Pagination page={page} pageCount={pageCount} total={visible.length} onChange={setPage} />
        </>
      )}

      {picking && (
        <BulkCategoryModal
          target={picking}
          categories={categories}
          profileLabel={profileLabel}
          onApply={(id, scope) =>
            setState((s) => applyCategory(s, picking.kind === 'row' ? picking.row.item : null, id, scope))
          }
          onReset={
            picking.kind === 'fallback'
              ? picking.current
                ? () => setState((s) => clearCategory(s, null))
                : null
              : ['row', 'product', 'map'].includes(picking.row.category.kind)
                ? () => setState((s) => clearCategory(s, picking.row))
                : null
          }
          onClose={() => setPicking(null)}
        />
      )}
    </Card>
  );
}
