import { Link } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { CheckSquare, Search, X } from 'lucide-react';
import Card from '../../../components/ui/Card';
import Pagination from '../../../components/ui/Pagination';
import { formatNumber } from '../../../lib/format';
import { fold } from '../pricing/import/categoryImport';
import NumberField from '../pricing/NumberField';
import type { SkuResult } from './profitCalc';

interface SkuProfitTableProps {
  skus: SkuResult[];
  costs: Record<string, number>;
  onCost: (key: string, value: number) => void;
  /** Gói Pro: giá vốn được nhớ cho lần sau */
  remember: boolean;
  /** File quảng cáo có chi tiết theo sản phẩm (Shopee) → thêm cột Quảng cáo + Lãi sau QC */
  withAds?: boolean;
}

const PAGE = 30;
const vnd = (n: number) => `${n < 0 ? '−' : ''}${formatNumber(Math.abs(Math.round(n)))}đ`;

/** Lợi nhuận theo SKU (trước quảng cáo) — giá vốn nhập ngay trên bảng, dùng chung với Tính giá bán */
export default function SkuProfitTable({ skus, costs, onCost, remember, withAds = false }: SkuProfitTableProps) {
  const [query, setQuery] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [page, setPage] = useState(1);
  // Nhập giá vốn hàng loạt: tích chọn SKU (hoặc để trống = tất cả đang hiện) → 1 giá → Áp dụng
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [bulkCost, setBulkCost] = useState(0);
  const [applied, setApplied] = useState<string | null>(null);

  const missing = skus.filter((s) => s.qty > 0 && !(costs[s.key] > 0)).length;
  const visible = useMemo(() => {
    const words = fold(query).split(/\s+/).filter(Boolean);
    return skus.filter((s) => {
      if (onlyMissing && !(s.qty > 0 && !(costs[s.key] > 0))) return false;
      const hay = fold(`${s.productName} ${s.variation ?? ''} ${s.skuId ?? ''}`);
      return words.every((w) => hay.includes(w));
    });
  }, [skus, query, onlyMissing, costs]);
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE));
  const current = Math.min(page, pageCount);
  const rows = visible.slice((current - 1) * PAGE, current * PAGE);

  const selCount = selected.size;
  const allVisibleSelected = visible.length > 0 && visible.every((s) => selected.has(s.key));
  const someVisibleSelected = visible.some((s) => selected.has(s.key));
  const toggle = (key: string) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const toggleAllVisible = () =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (allVisibleSelected) visible.forEach((s) => next.delete(s.key));
      else visible.forEach((s) => next.add(s.key));
      return next;
    });
  const applyBulk = () => {
    const targets = selCount > 0 ? [...selected] : visible.map((s) => s.key);
    if (!targets.length || !(bulkCost > 0)) return;
    if (
      selCount === 0 &&
      !window.confirm(
        `Đặt giá vốn ${formatNumber(bulkCost)}đ cho tất cả ${formatNumber(targets.length)} sản phẩm đang hiện?`,
      )
    )
      return;
    for (const k of targets) onCost(k, bulkCost);
    setApplied(`Đã đặt giá vốn ${formatNumber(bulkCost)}đ cho ${formatNumber(targets.length)} sản phẩm.`);
    setSelected(new Set());
  };

  const th = 'whitespace-nowrap px-3 py-2.5 text-sm font-medium text-muted';

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3 p-5 pb-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">Lợi nhuận theo sản phẩm</h3>
          <p className="mt-0.5 text-sm text-muted">
            Tiền của mỗi đơn chia cho từng SKU theo tiền hàng.{' '}
            {withAds ? (
              <>
                Quảng cáo của từng sản phẩm (theo file quảng cáo) chia cho các phân loại theo doanh thu →{' '}
                <b className="text-ink">lãi sau quảng cáo</b>.{' '}
              </>
            ) : (
              <>
                Lãi ở đây là <b className="text-ink">trước quảng cáo</b> (báo cáo quảng cáo tổng không tách theo sản
                phẩm).{' '}
              </>
            )}
            {remember ? (
              <>
                <b className="text-ink">Giá vốn nhập 1 lần được nhớ theo SKU</b> trên tài khoản — lần sau tải file có
                SKU đó sẽ tự điền, vẫn sửa được (dùng chung với Tính hàng loạt).
              </>
            ) : (
              <>
                Gói Miễn phí <b className="text-ink">không nhớ giá vốn</b> — tải lại trang phải nhập lại.{' '}
                <Link to="/upgrade" className="font-semibold text-accent-violet hover:underline">
                  Nâng cấp Pro
                </Link>{' '}
                để giá vốn tự điền cho lần sau.
              </>
            )}
          </p>
        </div>
        {missing > 0 && (
          <button
            type="button"
            aria-pressed={onlyMissing}
            onClick={() => {
              setOnlyMissing((v) => !v);
              setPage(1);
            }}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
              onlyMissing
                ? 'border-primary bg-primary-soft text-primary'
                : 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
            }`}
          >
            Chưa có giá vốn {formatNumber(missing)}
          </button>
        )}
        <label className="flex items-center gap-2 rounded-lg border border-line px-2.5 transition focus-within:border-primary">
          <Search className="size-4 text-muted" />
          <input
            aria-label="Tìm sản phẩm"
            placeholder="Tìm tên, SKU…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            className="w-44 bg-transparent py-1.5 text-sm outline-none placeholder:text-muted/70"
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-line bg-primary-soft/40 px-5 py-2.5 text-sm">
        <CheckSquare className="size-4 shrink-0 text-primary" />
        <span className="font-medium text-ink">
          {selCount > 0 ? `Đã chọn ${formatNumber(selCount)} sản phẩm` : 'Nhập giá vốn hàng loạt'}
        </span>
        <span className="text-muted">
          {selCount > 0 ? '· giá vốn mỗi sản phẩm' : '· tích ô đầu dòng để chọn, không chọn = tất cả đang hiện'}
        </span>
        <NumberField
          compact
          ariaLabel="Giá vốn áp dụng hàng loạt"
          value={bulkCost}
          onChange={setBulkCost}
          suffix="đ"
          className="w-36"
        />
        <button
          type="button"
          disabled={!(bulkCost > 0) || visible.length === 0}
          onClick={applyBulk}
          className="rounded-lg bg-primary px-3 py-1.5 font-semibold text-white transition hover:bg-primary-hover disabled:opacity-50"
        >
          {selCount > 0
            ? `Áp dụng cho ${formatNumber(selCount)} đã chọn`
            : `Nhập cho tất cả (${formatNumber(visible.length)})`}
        </button>
        {selCount > 0 && (
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-muted transition hover:bg-white hover:text-ink"
          >
            <X className="size-3.5" /> Bỏ chọn
          </button>
        )}
        {applied && <span className="ml-auto text-accent-green">{applied}</span>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1020px] border-collapse">
          <thead className="border-y border-line bg-canvas/60">
            <tr>
              <th className="w-10 py-2.5 pl-5">
                <input
                  type="checkbox"
                  aria-label="Chọn tất cả sản phẩm đang hiện"
                  checked={allVisibleSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = !allVisibleSelected && someVisibleSelected;
                  }}
                  onChange={toggleAllVisible}
                  className="size-4 cursor-pointer accent-primary"
                />
              </th>
              <th className={`${th} pl-2 text-left`}>Sản phẩm</th>
              <th className={`${th} text-right`}>Đơn</th>
              <th className={`${th} text-right`}>SL bán</th>
              <th className={`${th} text-right`}>Doanh thu</th>
              <th className={`${th} text-right`}>Phí sàn</th>
              <th className={`${th} text-right`}>Tiền về</th>
              <th className={`${th} text-left`}>Giá vốn / sp</th>
              {withAds && <th className={`${th} text-right`}>Quảng cáo</th>}
              <th className={`${th} pr-5 text-right`}>{withAds ? 'Lãi sau QC' : 'Lãi trước QC'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((s) => {
              const cost = costs[s.key];
              const hasCost = cost > 0;
              const cogs = hasCost ? cost * s.qty : 0;
              const profit = s.settlement - cogs - (withAds ? s.ads : 0);
              const margin = s.revenue > 0 ? (profit / s.revenue) * 100 : null;
              return (
                <tr
                  key={s.key}
                  className={`align-top transition hover:bg-canvas/50 ${selected.has(s.key) ? 'bg-primary-soft/40' : ''}`}
                >
                  <td className="py-3 pl-5">
                    <input
                      type="checkbox"
                      aria-label={`Chọn ${s.productName}`}
                      checked={selected.has(s.key)}
                      onChange={() => toggle(s.key)}
                      className="size-4 cursor-pointer accent-primary"
                    />
                  </td>
                  <td className="max-w-[22rem] py-2.5 pl-2 pr-3">
                    <p className="line-clamp-2 font-medium text-ink" title={s.productName}>
                      {s.productName}
                    </p>
                    <p className="text-sm text-muted">
                      {[s.variation, s.skuId && `SKU ${s.skuId}`].filter(Boolean).join(' · ')}
                    </p>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatNumber(s.orders)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatNumber(s.qty)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{vnd(s.revenue)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted">{vnd(s.fees)}</td>
                  <td className="px-3 py-2.5 text-right font-medium tabular-nums">{vnd(s.settlement)}</td>
                  <td className="px-3 py-2">
                    <NumberField
                      compact
                      ariaLabel={`Giá vốn ${s.productName}`}
                      value={cost ?? 0}
                      onChange={(v) => onCost(s.key, v)}
                      suffix="đ"
                      className="w-32"
                    />
                  </td>
                  {withAds && (
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted">{s.ads > 0 ? vnd(-s.ads) : '--'}</td>
                  )}
                  <td className="py-2.5 pl-3 pr-5 text-right">
                    {s.qty > 0 && !hasCost ? (
                      <span className="text-sm text-amber-700">Nhập giá vốn</span>
                    ) : (
                      <>
                        <p className={`font-semibold tabular-nums ${profit < 0 ? 'text-danger' : 'text-accent-green'}`}>
                          {vnd(profit)}
                        </p>
                        {margin != null && (
                          <p className="text-sm tabular-nums text-muted">{formatNumber(margin, 1)}%</p>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p className="px-5 py-8 text-center text-sm text-muted">Không có sản phẩm nào khớp.</p>}
      </div>
      <Pagination page={current} pageCount={pageCount} total={visible.length} onChange={setPage} />
    </Card>
  );
}
