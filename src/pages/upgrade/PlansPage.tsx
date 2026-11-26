import { useCallback, useEffect, useState } from 'react';
import { Check, Crown, Loader2, Sparkles } from 'lucide-react';
import Card from '../../components/ui/Card';
import PageHeader from '../../components/ui/PageHeader';
import { useAuth } from '../../auth/AuthProvider';
import { api, ApiError } from '../../lib/api';
import { formatNumber } from '../../lib/format';
import { monthsLabel, type BillingPublic } from '../../../shared/billing';
import { FREE_PRICING_CALCS, FREE_PROFIT_ORDERS, type FinanceQuota } from '../../../shared/plans';
import PaymentModal, { type OrderView } from './PaymentModal';

interface PlansResponse {
  billing: BillingPublic;
  quota: FinanceQuota | null;
  isAdmin: boolean;
}

const FREE_FEATURES = [
  `Tính giá bán ${FREE_PRICING_CALCS} lượt`,
  'Tìm giá bán & Kiểm tra lãi từng sản phẩm',
  `Tính lợi nhuận ${FREE_PROFIT_ORDERS} đơn hàng`,
  'Bảng phí ngành TikTok Shop & Shopee cập nhật sẵn',
  'So sánh lãi theo nguồn đơn (tự bán, KOC, quảng cáo)',
];

const PRO_FEATURES = [
  'Tính giá bán không giới hạn',
  'Tính hàng loạt: tải file sản phẩm, tính cho từng SKU',
  'Tính lợi nhuận không giới hạn đơn hàng',
  'Xuất Excel kết quả',
  'Mọi tính năng của gói Miễn phí',
];

const dateVi = (iso: string) => new Date(iso).toLocaleDateString('vi-VN');

function FeatureList({ items, pro }: { items: string[]; pro?: boolean }) {
  return (
    <ul className="mt-5 space-y-2.5 text-[15px]">
      {items.map((f) => (
        <li key={f} className="flex items-start gap-2.5">
          <Check className={`mt-0.5 size-4 shrink-0 ${pro ? 'text-accent-violet' : 'text-muted'}`} />
          {f}
        </li>
      ))}
    </ul>
  );
}

/** Trang Nâng cấp: 2 gói Miễn phí / Pro → mua Pro bằng chuyển khoản QR, tiền về tự lên Pro */
export default function PlansPage() {
  const { refresh } = useAuth();
  const [data, setData] = useState<PlansResponse | null>(null);
  const [months, setMonths] = useState<number | null>(null);
  const [order, setOrder] = useState<OrderView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api<PlansResponse>('/billing/plans');
      setData(d);
      setMonths((m) => m ?? d.billing.options[0]?.months ?? null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Không tải được bảng giá');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onPaid = useCallback(() => {
    void refresh();
    void load();
  }, [refresh, load]);

  if (!data) {
    return (
      <div className="flex justify-center p-16 text-muted">
        {error ?? <Loader2 className="size-6 animate-spin" aria-label="Đang tải" />}
      </div>
    );
  }

  const { billing, quota, isAdmin } = data;
  const isPro = quota?.plan === 'pro';
  const option = billing.options.find((o) => o.months === months) ?? billing.options[0];
  // Giá / tháng của gói dài hạn để thấy tiết kiệm
  const base = billing.options.find((o) => o.months === 1);

  const buy = async () => {
    if (!option) return;
    setBusy(true);
    setError(null);
    try {
      const { order: o } = await api<{ order: OrderView }>('/billing/orders', {
        method: 'POST',
        body: { months: option.months },
      });
      setOrder(o);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Không tạo được đơn');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        icon={Sparkles}
        title="Nâng cấp"
        description="Chọn gói phù hợp. Thanh toán chuyển khoản, kích hoạt tự động trong vài giây."
      />

      <div className="mx-auto grid max-w-4xl gap-5 md:grid-cols-2">
        {/* Miễn phí */}
        <Card className="flex flex-col p-6">
          <p className="font-semibold">Miễn phí</p>
          <h3 className="mt-3 text-2xl font-bold tracking-tight">Dùng thử</h3>
          <p className="mt-1 text-muted">Tính giá bán cho từng sản phẩm.</p>
          <div className="mt-5 rounded-xl border border-line py-2.5 text-center text-sm font-medium text-muted">
            {isAdmin ? 'Quản trị viên' : isPro ? 'Đã có gói cao hơn' : 'Gói đang dùng'}
          </div>
          <p className="mt-5 text-3xl font-bold">0đ</p>
          {quota && !quota.unlimited && (
            <p className="text-sm text-muted">
              Đã dùng {formatNumber(quota.used)}/{formatNumber(quota.limit ?? 0)} lượt
            </p>
          )}
          <FeatureList items={FREE_FEATURES} />
        </Card>

        {/* Pro */}
        <Card className="flex flex-col border-accent-violet/40 bg-gradient-to-b from-accent-violet/5 to-white p-6 ring-1 ring-accent-violet/30">
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-1.5 font-semibold text-accent-violet">
              <Crown className="size-4" /> Pro
            </p>
            {billing.options.length > 1 && (
              <div className="flex rounded-full bg-canvas p-1" role="radiogroup" aria-label="Thời hạn">
                {billing.options.map((o) => (
                  <button
                    key={o.months}
                    type="button"
                    role="radio"
                    aria-checked={o.months === option?.months}
                    onClick={() => setMonths(o.months)}
                    className={`rounded-full px-3 py-1 text-sm font-medium transition ${
                      o.months === option?.months ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink'
                    }`}
                  >
                    {monthsLabel(o.months)}
                  </button>
                ))}
              </div>
            )}
          </div>
          <h3 className="mt-3 text-2xl font-bold tracking-tight">Đầy đủ tính năng</h3>
          <p className="mt-1 text-muted">Tính hàng loạt và lợi nhuận thật của shop.</p>

          {isAdmin ? (
            <div className="mt-5 rounded-xl bg-ink py-2.5 text-center text-sm font-semibold text-white">
              Quản trị viên có sẵn mọi tính năng
            </div>
          ) : billing.ready && option ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void buy()}
              className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-accent-violet py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              {isPro ? `Gia hạn Pro ${monthsLabel(option.months)}` : `Nâng cấp lên Pro`}
            </button>
          ) : (
            <div className="mt-5 rounded-xl border border-dashed border-line py-2.5 text-center text-sm text-muted">
              Sắp mở bán — liên hệ quản trị viên
            </div>
          )}

          {option && (
            <>
              <p className="mt-5 text-3xl font-bold tabular-nums">{formatNumber(option.price)}đ</p>
              <p className="text-sm text-muted">
                {monthsLabel(option.months)}
                {option.months > 1 &&
                  ` · ~${formatNumber(Math.round(option.price / option.months / 1000) * 1000)}đ/tháng`}
                {base && option.months > 1 && base.price * option.months > option.price && (
                  <span className="ml-1 font-semibold text-accent-green">
                    tiết kiệm {Math.round((1 - option.price / (base.price * option.months)) * 100)}%
                  </span>
                )}
              </p>
            </>
          )}
          {isPro && quota?.proUntil && (
            <p className="mt-1 text-sm font-medium text-accent-violet">
              Đang dùng Pro đến {dateVi(quota.proUntil)} — mua thêm sẽ cộng nối tiếp
            </p>
          )}
          <FeatureList items={PRO_FEATURES} pro />
        </Card>
      </div>

      {error && <p className="mx-auto mt-4 max-w-4xl text-sm text-danger">{error}</p>}

      {order && <PaymentModal order={order} onClose={() => setOrder(null)} onPaid={onPaid} />}
    </>
  );
}
