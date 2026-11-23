import { AlertTriangle, Calculator, ChevronDown, RotateCcw } from 'lucide-react';
import { formatNumber } from '../../../../lib/format';
import NumberField from '../NumberField';
import { logisticsFee } from '../calc';
import { PATH_SEP } from '../import/categoryImport';
import type { BulkRow } from './bulkRows';

interface BulkTableProps {
  rows: BulkRow[];
  marginPct: number;
  applyLogistics: boolean;
  onCost: (key: string, value: number) => void;
  onPrice: (key: string, value: number | null) => void;
  onPickCategory: (row: BulkRow) => void;
  onOpenSingle: (row: BulkRow) => void;
}

const vnd = (n: number) => `${formatNumber(Math.round(n))}đ`;
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${formatNumber(Math.abs(Math.round(n)))}đ`;

function CategoryCell({ row, onClick }: { row: BulkRow; onClick: () => void }) {
  const c = row.category;
  let main: string;
  let sub: string;
  let tone = 'text-ink';
  if ('category' in c) {
    main = c.category.name.split(PATH_SEP).pop() ?? c.category.name;
    sub = {
      file: c.ambiguous ? 'tự khớp · trùng tên, kiểm tra lại' : 'tự khớp theo file',
      row: 'chọn riêng SKU này',
      product: 'chọn cho cả sản phẩm',
      map: 'chọn cho cả ngành trong file',
      fallback: 'ngành chung',
    }[c.kind];
    if (c.ambiguous) tone = 'text-amber-700';
  } else if (c.kind === 'default') {
    main = row.item.category ?? 'Chưa chọn ngành';
    sub = row.item.category ? 'không khớp · dùng mặc định' : 'dùng % mặc định';
    tone = 'text-amber-700';
  } else {
    main = row.item.category ?? 'Chưa chọn ngành';
    sub = 'chưa có phí ngành — bấm để chọn';
    tone = 'text-danger';
  }
  return (
    <button
      type="button"
      onClick={onClick}
      title={'category' in c ? c.category.name : 'Bấm để chọn ngành trong bảng phí'}
      className="group flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-canvas"
    >
      <span className="min-w-0 flex-1">
        <span className={`line-clamp-2 font-medium ${tone}`}>{main}</span>
        <span className="block text-sm text-muted">
          <b className={`tabular-nums ${tone}`}>{formatNumber(row.categoryPct, 2)}%</b> · {sub}
        </span>
      </span>
      <ChevronDown className="mt-1 size-4 shrink-0 text-muted opacity-0 transition group-hover:opacity-100" />
    </button>
  );
}

function ProfitCell({ row, marginPct }: { row: BulkRow; marginPct: number }) {
  const { status, current } = row.result;
  if (status === 'missing-cost') return <span className="text-sm text-muted">Nhập giá vốn</span>;
  if (!current) return <span className="text-sm text-muted">--</span>;
  const tone = status === 'loss' ? 'text-danger' : status === 'below-target' ? 'text-amber-700' : 'text-accent-green';
  return (
    <div className="text-right">
      <p className={`font-semibold tabular-nums ${tone}`}>{vnd(current.profit)}</p>
      <p className={`text-sm tabular-nums ${tone}`}>
        {formatNumber(current.marginPct ?? 0, 1)}%
        {status === 'below-target' && <span className="text-muted"> / {marginPct}%</span>}
      </p>
    </div>
  );
}

function SuggestCell({ row }: { row: BulkRow }) {
  const { suggested, diff, status } = row.result;
  if (status === 'missing-cost') return <span className="text-sm text-muted">--</span>;
  if (suggested == null)
    return (
      <span className="inline-flex items-center gap-1 text-sm text-danger" title="Tổng % phí + % lãi mong muốn ≥ 100%">
        <AlertTriangle className="size-4" /> Không đạt
      </span>
    );
  return (
    <div className="text-right">
      <p className="font-semibold tabular-nums text-ink">{vnd(suggested)}</p>
      {diff != null && (
        <p className={`text-sm tabular-nums ${diff > 0 ? 'text-amber-700' : 'text-muted'}`}>
          {diff === 0 ? 'bằng giá hiện tại' : `${signed(diff)} so với giá bán`}
        </p>
      )}
    </div>
  );
}

/** Bảng tính hàng loạt: mỗi dòng một SKU, sửa giá vốn / giá bán / ngành ngay trên bảng */
export default function BulkTable({
  rows,
  marginPct,
  applyLogistics,
  onCost,
  onPrice,
  onPickCategory,
  onOpenSingle,
}: BulkTableProps) {
  const th = 'px-3 py-2.5 text-left text-sm font-medium text-muted whitespace-nowrap';
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1080px] border-collapse">
        <thead className="border-y border-line bg-canvas/60">
          <tr>
            <th className={`${th} pl-5`}>Sản phẩm</th>
            <th className={th}>Ngành · phí</th>
            <th className={`${th} text-right`}>Trọng lượng</th>
            <th className={th}>Giá vốn</th>
            <th className={th}>Giá bán</th>
            <th className={`${th} text-right`}>Lãi / đơn</th>
            <th className={`${th} text-right`}>Giá đề xuất · lãi {marginPct}%</th>
            <th className={`${th} pr-5`}>
              <span className="sr-only">Thao tác</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => {
            const fee = applyLogistics && r.item.weightG ? logisticsFee(r.item.weightG / 1000) : 0;
            return (
              <tr
                key={r.item.key}
                className={`align-top transition hover:bg-canvas/50 ${
                  r.result.status === 'loss' ? 'shadow-[inset_3px_0_0] shadow-danger' : ''
                }`}
              >
                <td className="max-w-[20rem] py-2.5 pl-5 pr-3">
                  <p className="line-clamp-2 font-medium text-ink" title={r.item.name}>
                    {r.item.name}
                  </p>
                  <p className="text-sm text-muted">
                    {[
                      r.item.variant,
                      r.item.sellerSku,
                      r.item.skuId && `SKU ${r.item.skuId}`,
                      r.item.stock != null && `tồn ${formatNumber(r.item.stock)}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </td>
                <td className="w-56 px-1 py-1">
                  <CategoryCell row={r} onClick={() => onPickCategory(r)} />
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right text-sm tabular-nums">
                  {r.item.weightG != null ? (
                    `${formatNumber(r.item.weightG)} g`
                  ) : (
                    <span className="text-muted">--</span>
                  )}
                  {fee > 0 && <span className="block text-amber-700">+{vnd(fee)} logistics</span>}
                </td>
                <td className="px-3 py-2">
                  <NumberField
                    compact
                    ariaLabel={`Giá vốn ${r.item.name}`}
                    value={r.cost ?? 0}
                    onChange={(v) => onCost(r.item.key, v)}
                    suffix="đ"
                    className="w-32"
                  />
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1">
                    <NumberField
                      compact
                      ariaLabel={`Giá bán ${r.item.name}`}
                      value={r.price ?? 0}
                      onChange={(v) => onPrice(r.item.key, v)}
                      suffix="đ"
                      className="w-32"
                    />
                    {r.priceEdited && (
                      <button
                        type="button"
                        aria-label="Về giá bán trong file"
                        title={`Về giá trong file: ${r.item.price != null ? vnd(r.item.price) : '--'}`}
                        onClick={() => onPrice(r.item.key, null)}
                        className="rounded-md p-1 text-muted transition hover:bg-canvas hover:text-ink"
                      >
                        <RotateCcw className="size-3.5" />
                      </button>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <ProfitCell row={r} marginPct={marginPct} />
                </td>
                <td className="px-3 py-2.5">
                  <SuggestCell row={r} />
                </td>
                <td className="py-2 pl-1 pr-5">
                  <button
                    type="button"
                    aria-label={`Xem chi tiết ${r.item.name}`}
                    title="Xem chi tiết từng khoản phí"
                    onClick={() => onOpenSingle(r)}
                    className="rounded-lg p-2 text-muted transition hover:bg-primary-soft hover:text-primary"
                  >
                    <Calculator className="size-4" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
