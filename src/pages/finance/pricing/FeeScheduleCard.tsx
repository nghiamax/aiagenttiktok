import { useState } from 'react';
import { ChevronDown, ReceiptText, ShieldCheck } from 'lucide-react';
import Card from '../../../components/ui/Card';
import { formatNumber } from '../../../lib/format';
import NumberField from './NumberField';
import FeeLinesEditor from './FeeLinesEditor';
import type { FeeLine, Platform, ShopType } from './calc';
import { PLATFORM_LABEL, SHOP_TYPE_LABEL, type FeeProfile } from './config';
import type { CategoryTable } from './categoryTables';

interface FeeScheduleCardProps {
  platform: Platform;
  shopType: ShopType;
  profile: FeeProfile;
  /** Bảng phí ngành của hệ thống cho 2 loại shop của sàn đang chọn */
  tables: Record<ShopType, CategoryTable>;
  tablesLoading: boolean;
  taxPct: number;
  onFees: (fees: FeeLine[]) => void;
  onTax: (pct: number) => void;
}

const dateVi = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : null);

/** Tóm tắt các khoản phí, vd "Phí thanh toán 5% · Phí cố định 3.000đ" */
function summary(fees: FeeLine[]): string {
  const set = fees.filter((f) => f.value > 0);
  if (!set.length) return 'Chưa nhập khoản phí nào';
  return set
    .map(
      (f) => `${f.label || 'Phí'} ${f.kind === 'pct' ? `${formatNumber(f.value, 2)}%` : `${formatNumber(f.value)}đ`}`,
    )
    .join(' · ');
}

/** Biểu phí của sàn × loại shop: khoản phí sửa được + bảng phí ngành do hệ thống cập nhật (chỉ xem) */
export default function FeeScheduleCard({
  platform,
  shopType,
  profile,
  tables,
  tablesLoading,
  taxPct,
  onFees,
  onTax,
}: FeeScheduleCardProps) {
  const shopLabels = SHOP_TYPE_LABEL[platform];
  const table = tables[shopType];
  const latest = [tables.standard.updatedAt, tables.mall.updatedAt].filter(Boolean).sort().pop() ?? null;
  const [open, setOpen] = useState(profile.fees.every((f) => f.value <= 0));

  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 rounded-2xl px-4 py-3.5 text-left transition hover:bg-canvas/50 md:px-5"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-canvas text-ink">
          <ReceiptText className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold">
            Biểu phí {PLATFORM_LABEL[platform]} · {shopLabels[shopType]}
          </span>
          <span className="block truncate text-sm text-muted">
            {summary(profile.fees)} · thuế {formatNumber(taxPct, 2)}% ·{' '}
            {tablesLoading
              ? 'đang tải bảng phí ngành…'
              : table.categories.length
                ? `phí ngành ${formatNumber(table.categories.length)} ngành`
                : 'chưa có bảng phí ngành'}
          </span>
        </span>
        <span className="hidden shrink-0 text-sm font-medium text-primary sm:inline">{open ? 'Thu gọn' : 'Sửa'}</span>
        <ChevronDown className={`size-5 shrink-0 text-muted transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="space-y-3 border-t border-line p-4 md:px-5">
          <div>
            <p className="mb-1 text-sm text-muted">
              Các khoản phí của {shopLabels[shopType]} <span className="text-muted/70">(ngoài phí ngành)</span>
            </p>
            <FeeLinesEditor fees={profile.fees} onChange={onFees} />
            <div className="mt-3 flex items-center gap-2 border-t border-dashed border-line pt-3">
              <span className="min-w-0 flex-1 px-2 text-sm text-ink">
                Thuế sàn khấu trừ
                <span className="block text-sm text-muted">
                  Hộ kinh doanh 1,5% · doanh nghiệp đặt 0 · dùng chung 2 sàn
                </span>
              </span>
              <NumberField
                ariaLabel="Thuế sàn khấu trừ (%)"
                value={taxPct}
                onChange={onTax}
                decimals={2}
                max={99}
                className="w-24"
              />
              <span className="w-14 shrink-0 text-center text-sm text-muted">%</span>
              <span className="w-6" />
            </div>
          </div>

          {/* Bảng phí ngành do hệ thống cập nhật — chỉ hiện ngày cập nhật gần nhất */}
          <p className="flex flex-wrap items-center gap-2 rounded-xl bg-canvas px-3.5 py-2.5 text-sm text-muted">
            <ShieldCheck className="size-4 shrink-0 text-accent-green" />
            <span className="font-medium text-ink">Bảng phí ngành {PLATFORM_LABEL[platform]}</span>
            <span>
              {tablesLoading
                ? '· đang tải…'
                : latest
                  ? `· hệ thống cập nhật ${dateVi(latest)}`
                  : '· chưa có — nhập % phí ngành tay'}
            </span>
          </p>
        </div>
      )}
    </Card>
  );
}
