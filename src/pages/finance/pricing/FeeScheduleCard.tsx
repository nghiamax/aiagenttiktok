import { useState } from 'react';
import { ChevronDown, Lock, Pencil, ReceiptText, ShieldCheck } from 'lucide-react';
import Card from '../../../components/ui/Card';
import { formatNumber } from '../../../lib/format';
import NumberField from './NumberField';
import FeeLinesEditor from './FeeLinesEditor';
import type { FeeLine, Platform, ShopType } from './calc';
import { PLATFORM_LABEL, SHOP_TYPE_LABEL, type FeeProfile } from './config';
import type { CategoryTable } from './categoryTables';
import type { SystemFeeLine } from '../../../../shared/platformFees';

interface FeeScheduleCardProps {
  platform: Platform;
  shopType: ShopType;
  profile: FeeProfile;
  /** Phí cố định của sàn do hệ thống cung cấp (chỉ Quản trị viên sửa) */
  systemFees: SystemFeeLine[];
  canEditSystem: boolean;
  /** ID phí hệ thống tuỳ chọn mà shop có đăng ký */
  optIn: Set<string>;
  onOptIn: (id: string, on: boolean) => void;
  onSaveSystem: (lines: SystemFeeLine[]) => Promise<unknown>;
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
  systemFees,
  canEditSystem,
  optIn,
  onOptIn,
  onSaveSystem,
  tables,
  tablesLoading,
  taxPct,
  onFees,
  onTax,
}: FeeScheduleCardProps) {
  const shopLabels = SHOP_TYPE_LABEL[platform];
  const table = tables[shopType];
  const latest = [tables.standard.updatedAt, tables.mall.updatedAt].filter(Boolean).sort().pop() ?? null;
  const [open, setOpen] = useState([...systemFees, ...profile.fees].every((f) => f.value <= 0));
  const [draft, setDraft] = useState<SystemFeeLine[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const saveSystem = async () => {
    if (!draft) return;
    setSaving(true);
    setSaveError(null);
    try {
      await onSaveSystem(draft.filter((f) => f.label.trim()));
      setDraft(null);
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const valueText = (f: FeeLine) =>
    f.kind === 'pct' ? `${formatNumber(f.value, 2)}%` : `${formatNumber(f.value)}đ / đơn`;

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
            {summary([...systemFees.filter((f) => !f.optional || optIn.has(f.id)), ...profile.fees])} · thuế{' '}
            {formatNumber(taxPct, 2)}% ·{' '}
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
          {/* Phí cố định của sàn — hệ thống cung cấp, chỉ Quản trị viên sửa */}
          <div className="rounded-xl border border-line p-3">
            <div className="mb-1.5 flex items-center gap-2">
              <ShieldCheck className="size-4 shrink-0 text-accent-green" />
              <span className="min-w-0 flex-1 text-sm font-medium text-ink">
                Phí cố định của {PLATFORM_LABEL[platform]} · {shopLabels[shopType]}
                <span className="block text-xs font-normal text-muted">
                  Hệ thống cập nhật{canEditSystem ? ' · chỉ Quản trị viên sửa' : ''}
                </span>
              </span>
              {canEditSystem && !draft && (
                <button
                  type="button"
                  onClick={() => setDraft(systemFees.map((f) => ({ ...f })))}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-primary transition hover:bg-primary-soft"
                >
                  <Pencil className="size-3.5" /> Sửa
                </button>
              )}
            </div>
            {draft ? (
              <>
                <FeeLinesEditor fees={draft} onChange={(f) => setDraft(f as SystemFeeLine[])} optionalToggle />
                <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
                  {saveError && <span className="mr-auto text-sm text-danger">{saveError}</span>}
                  <button
                    type="button"
                    onClick={() => {
                      setDraft(null);
                      setSaveError(null);
                    }}
                    className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted transition hover:bg-canvas hover:text-ink"
                  >
                    Huỷ
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void saveSystem()}
                    className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-primary-hover disabled:opacity-50"
                  >
                    {saving ? 'Đang lưu…' : 'Lưu cho mọi tài khoản'}
                  </button>
                </div>
              </>
            ) : systemFees.length ? (
              <ul className="space-y-1">
                {systemFees.map((f) => {
                  const on = !f.optional || optIn.has(f.id);
                  return (
                    <li key={f.id} className={`flex items-center gap-2 px-2 py-1 text-sm ${on ? '' : 'opacity-60'}`}>
                      <span className="min-w-0 flex-1 text-ink">
                        {f.label}
                        {f.note && <span className="text-muted"> · {f.note}</span>}
                        {f.optional && (
                          <label className="mt-0.5 flex w-fit cursor-pointer items-center gap-1.5 text-xs text-muted">
                            <input
                              type="checkbox"
                              checked={on}
                              onChange={(e) => onOptIn(f.id, e.target.checked)}
                              className="size-3.5 accent-primary"
                            />
                            Shop có đăng ký chương trình này
                          </label>
                        )}
                      </span>
                      <span className={`font-semibold tabular-nums ${on ? 'text-ink' : 'text-muted line-through'}`}>
                        {valueText(f)}
                      </span>
                      <Lock className="size-3.5 shrink-0 text-muted" aria-label="Hệ thống cung cấp" />
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="px-2 py-1 text-sm text-muted">Chưa có khoản phí cố định nào cho sàn này.</p>
            )}
          </div>

          <div>
            <p className="mb-1 text-sm text-muted">
              Khoản phí riêng của shop{' '}
              <span className="text-muted/70">(chương trình shop tự đăng ký: Voucher Xtra, Freeship Xtra…)</span>
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
