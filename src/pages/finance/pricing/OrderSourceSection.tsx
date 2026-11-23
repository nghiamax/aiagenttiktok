import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Share2 } from 'lucide-react';
import { formatNumber } from '../../../lib/format';
import SectionCard from './SectionCard';
import PercentSlider from './PercentSlider';
import QuickPicks from './QuickPicks';
import { ORDER_SOURCES, sourceDef, type OrderSource, type SourceRates } from './orderSource';

interface OrderSourceSectionProps {
  source: OrderSource;
  rates: SourceRates;
  onSource: (s: OrderSource) => void;
  onRates: (patch: Partial<SourceRates>) => void;
}

function RateRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="rounded-xl border border-line p-3">
      <p className="text-sm font-medium text-ink" title={hint}>
        {label}
      </p>
      <p className="mb-1.5 truncate text-sm text-muted" title={hint}>
        {hint}
      </p>
      <PercentSlider label={label} value={value} onChange={onChange} max={30} />
      <QuickPicks values={[5, 10, 15, 20]} value={value} onPick={onChange} />
    </div>
  );
}

/** Ô chọn nguồn đơn: bấm để xổ danh sách (kèm mô tả từng nguồn), Esc / bấm ra ngoài để đóng */
function SourceSelect({ source, onChange }: { source: OrderSource; onChange: (s: OrderSource) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const d = sourceDef(source);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Nguồn đơn hàng"
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center gap-3 rounded-xl border bg-white px-3 py-2 text-left transition ${
          open ? 'border-primary ring-2 ring-primary/15' : 'border-line hover:border-primary/40'
        }`}
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-ink">{d.label}</span>
          <span className="block truncate text-sm text-muted">{d.desc}</span>
        </span>
        <ChevronDown className={`size-5 shrink-0 text-muted transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label="Nguồn đơn hàng"
          className="absolute inset-x-0 top-full z-30 mt-1.5 rounded-xl border border-line bg-white p-1.5 shadow-lg"
        >
          {ORDER_SOURCES.map((s) => {
            const on = s.id === source;
            return (
              <li key={s.id} role="option" aria-selected={on}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(s.id);
                    setOpen(false);
                  }}
                  className={`flex w-full items-start gap-2.5 rounded-lg px-3 py-2 text-left transition ${
                    on ? 'bg-primary-soft' : 'hover:bg-canvas'
                  }`}
                >
                  <Check className={`mt-0.5 size-4 shrink-0 ${on ? 'text-primary' : 'invisible'}`} />
                  <span className="min-w-0">
                    <span className={`block font-medium ${on ? 'text-primary' : 'text-ink'}`}>{s.label}</span>
                    <span className="block text-sm text-muted">{s.desc}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Nguồn đơn hàng: Tự bán · Tiếp thị liên kết · Quảng cáo · Ads + % HH quảng cáo · Ads + % HH tự nhiên */
export default function OrderSourceSection({ source, rates, onSource, onRates }: OrderSourceSectionProps) {
  const d = sourceDef(source);
  const roas = rates.adsPct > 0 ? 100 / rates.adsPct : null;
  const needAff = d.affiliate === 'standard' && rates.affiliatePct <= 0;
  const needShopAff = d.affiliate === 'shopAds' && rates.shopAdsAffiliatePct <= 0;

  return (
    <SectionCard
      icon={Share2}
      title="Nguồn đơn hàng"
      hint="Đơn đến từ đâu thì trả thêm quảng cáo / hoa hồng KOC tương ứng. Bảng bên phải so sánh mọi nguồn."
    >
      <SourceSelect source={source} onChange={onSource} />

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {d.ads && (
          <div className="rounded-xl border border-line p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-ink">Chi phí quảng cáo</p>
              {roas != null && (
                <span className="rounded-md bg-primary-soft px-2 py-0.5 text-sm font-semibold text-primary">
                  ROAS {formatNumber(roas, 1)}
                </span>
              )}
            </div>
            <p className="mb-1.5 text-sm text-muted">% giá bán chi cho quảng cáo</p>
            <PercentSlider label="% chi phí quảng cáo" value={rates.adsPct} onChange={(v) => onRates({ adsPct: v })} />
            <QuickPicks values={[5, 10, 15, 20, 25]} value={rates.adsPct} onPick={(v) => onRates({ adsPct: v })} />
          </div>
        )}
        {d.affiliate === 'standard' && (
          <RateRow
            label="Hoa hồng tiêu chuẩn cho KOC"
            hint="Phí Affiliate cho đơn tự nhiên của KOC"
            value={rates.affiliatePct}
            onChange={(v) => onRates({ affiliatePct: v })}
          />
        )}
        {d.affiliate === 'shopAds' && (
          <RateRow
            label="Hoa hồng quảng cáo cửa hàng"
            hint="Trả KOC cho đơn quảng cáo chạy bằng video của KOC"
            value={rates.shopAdsAffiliatePct}
            onChange={(v) => onRates({ shopAdsAffiliatePct: v })}
          />
        )}
        {!d.ads && d.affiliate === 'none' && (
          <p className="rounded-xl bg-canvas px-3 py-2 text-sm text-muted md:col-span-2">
            Không trừ quảng cáo và hoa hồng — chỉ còn phí sàn, thuế và chi phí khác.
          </p>
        )}
        {(needAff || needShopAff) && (
          <p className="text-sm text-amber-700 md:col-span-2">
            Nhập % hoa hồng để kết quả tính đúng nguồn này (đang là 0%).
          </p>
        )}
      </div>
    </SectionCard>
  );
}
