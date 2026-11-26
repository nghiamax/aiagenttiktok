import { useState } from 'react';
import { Package, Search } from 'lucide-react';
import type { ClauseValue, ConditionSet, Metric } from '../../groups';
import type { AdsProduct } from '../../types';
import MediaThumb from '../../components/MediaThumb';
import ConditionSetsEditor from './ConditionSetsEditor';

interface BulkAddPanelProps {
  /** Sản phẩm chưa có trong nhóm */
  products: AdsProduct[];
  subject: string;
  metrics: Metric[];
  valueTypes: ClauseValue['type'][];
  /** Điều kiện bắt đầu (bản chép điều kiện chung) */
  initial: ConditionSet[];
  onApply: (ids: string[], sets: ConditionSet[]) => void;
  onCancel: () => void;
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();

/** Thêm nhiều sản phẩm vào nhóm cùng 1 bộ điều kiện (Sếp chốt 26/11) — sau đó sửa riêng từng sản phẩm được */
export default function BulkAddPanel({ products, subject, metrics, valueTypes, initial, onApply, onCancel }: BulkAddPanelProps) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [sets, setSets] = useState<ConditionSet[]>(initial);
  const shown = q.trim() ? products.filter((p) => fold(`${p.name} ${p.id}`).includes(fold(q.trim()))) : products;
  const allShown = shown.length > 0 && shown.every((p) => picked.has(p.id));
  const filled = sets.length > 0 && sets.every((s) => s.clauses.length > 0);

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () =>
    setPicked((prev) => {
      const next = new Set(prev);
      for (const p of shown) {
        if (allShown) next.delete(p.id);
        else next.add(p.id);
      }
      return next;
    });

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-primary/40 bg-primary-soft/40 p-3">
      <p className="text-sm font-semibold">Đặt điều kiện riêng cho nhiều sản phẩm cùng lúc</p>

      <div className="rounded-xl border border-line bg-white">
        <div className="flex items-center gap-2 border-b border-line px-3 py-2">
          <Search className="size-4 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm sản phẩm…"
            aria-label="Tìm sản phẩm"
            className="min-w-0 flex-1 text-sm outline-none"
          />
          <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs text-muted">
            <input type="checkbox" checked={allShown} onChange={toggleAll} className="size-4 accent-primary" />
            Chọn tất cả
          </label>
        </div>
        <ul className="max-h-64 overflow-y-auto">
          {shown.map((p) => (
            <li key={p.id}>
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2 transition-colors hover:bg-canvas">
                <input type="checkbox" checked={picked.has(p.id)} onChange={() => toggle(p.id)} className="size-4 accent-primary" />
                <MediaThumb src={p.imageUrl ?? null} icon={Package} shape="square" />
                <span className="min-w-0 flex-1 truncate text-sm" title={p.name}>
                  {p.name} <span className="text-muted">· …{p.id.slice(-4)}</span>
                </span>
              </label>
            </li>
          ))}
          {shown.length === 0 && <li className="px-3 py-3 text-sm text-muted">Không có sản phẩm phù hợp</li>}
        </ul>
      </div>

      <ConditionSetsEditor sets={sets} onChange={setSets} subject={subject} metrics={metrics} valueTypes={valueTypes} />

      <div className="flex flex-wrap items-center justify-end gap-2">
        {!filled && <span className="mr-auto text-xs text-muted">Điền điều kiện cho mỗi cách trước khi áp dụng</span>}
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-line bg-white px-3.5 py-2 text-sm font-medium transition-colors hover:bg-canvas"
        >
          Huỷ
        </button>
        <button
          type="button"
          disabled={picked.size === 0 || !filled}
          onClick={() => onApply([...picked], sets)}
          className="rounded-xl bg-primary px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          Áp cho {picked.size} sản phẩm
        </button>
      </div>
    </div>
  );
}
