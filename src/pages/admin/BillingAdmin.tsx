import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Landmark, Loader2 } from 'lucide-react';
import Card from '../../components/ui/Card';
import { api, ApiError } from '../../lib/api';
import { formatNumber } from '../../lib/format';
import {
  GATEWAYS,
  gatewayMeta,
  monthsLabel,
  providerName,
  type BillingOrder,
  type GatewayId,
  type GatewaySettings,
  type ProOption,
} from '../../../shared/billing';
import GatewayConfig from './GatewayConfig';
import { labelCls } from './PlanFields';

interface BillingConfig {
  provider: GatewayId;
  options: ProOption[];
  gateways: Record<GatewayId, GatewaySettings>;
}

interface UnmatchedTx {
  txId: string;
  amount: number;
  content: string;
  at: string;
  note: string;
}

interface AdminData {
  config: BillingConfig;
  /** Cổng đã nhập đủ cấu hình */
  ready: Record<GatewayId, boolean>;
  orders: BillingOrder[];
  unmatched: UnmatchedTx[];
}

const vnd = (n: number) => `${formatNumber(n)}đ`;
const timeVi = (iso: string) =>
  new Date(iso).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

const STATUS: Record<BillingOrder['status'], { label: string; cls: string }> = {
  pending: { label: 'Chờ chuyển khoản', cls: 'text-amber-700' },
  paid: { label: 'Đã thanh toán', cls: 'text-accent-green' },
  cancelled: { label: 'Đã huỷ', cls: 'text-muted' },
};

/**
 * Trang Tài khoản → Thanh toán: chọn cổng thanh toán (danh sách GATEWAYS — thêm cổng không phải sửa trang này),
 * giá gói Pro, cấu hình cổng, đơn mua, giao dịch chưa khớp
 */
export default function BillingAdmin({ onPaid }: { onPaid: () => void }) {
  const [data, setData] = useState<AdminData | null>(null);
  const [draft, setDraft] = useState<BillingConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api<AdminData>('/billing/admin');
      setData(d);
      setDraft((cur) => cur ?? d.config);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : 'Không tải được thanh toán' });
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 30_000);
    return () => clearInterval(t);
  }, [load]);

  if (!draft || !data) {
    return (
      <Card className="mt-6 flex items-center justify-center gap-2 p-8 text-muted">
        <Loader2 className="size-5 animate-spin" /> Đang tải thanh toán…
      </Card>
    );
  }

  const saved = data.config;
  const unsaved = JSON.stringify(saved) !== JSON.stringify(draft);
  const meta = gatewayMeta(draft.provider)!;
  const setField = (key: string, value: string) =>
    setDraft((d) =>
      d ? { ...d, gateways: { ...d.gateways, [d.provider]: { ...d.gateways[d.provider], [key]: value } } } : d,
    );

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await api('/billing/admin/config', { method: 'PUT', body: draft });
      const d = await api<AdminData>('/billing/admin');
      setData(d);
      setDraft(d.config);
      setMsg({ ok: true, text: 'Đã lưu.' });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : 'Không lưu được' });
    } finally {
      setSaving(false);
    }
  };

  const markPaid = async (o: BillingOrder) => {
    if (!window.confirm(`Xác nhận đã nhận ${vnd(o.amount)} của @${o.username} (${o.code})? Tài khoản sẽ lên Pro ngay.`))
      return;
    try {
      await api(`/billing/admin/orders/${o.id}/mark-paid`, { method: 'POST', body: {} });
      await load();
      onPaid();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : 'Không xác nhận được' });
    }
  };

  return (
    <div className="mt-6 space-y-6">
      <Card className="p-5">
        <div className="mb-4 flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <Landmark className="size-5" />
          </span>
          <div>
            <h3 className="font-semibold">Thanh toán gói Pro</h3>
            <p className="text-sm text-muted">
              Chọn cổng thanh toán + giá. Khách quét QR chuyển khoản, cổng báo tiền về → tài khoản tự lên Pro. Cấu hình
              của từng cổng được giữ riêng — đổi qua lại không phải nhập lại.
            </p>
          </div>
        </div>

        <p className={labelCls}>Cổng thanh toán</p>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3" role="radiogroup" aria-label="Cổng thanh toán">
          {GATEWAYS.map((g) => {
            const on = draft.provider === g.id;
            const active = saved.provider === g.id;
            return (
              <button
                key={g.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setDraft((d) => (d ? { ...d, provider: g.id } : d))}
                className={`rounded-xl border p-3 text-left transition ${
                  on ? 'border-primary bg-primary-soft' : 'border-line hover:bg-canvas'
                }`}
              >
                <span className={`flex flex-wrap items-center gap-2 font-semibold ${on ? 'text-primary' : 'text-ink'}`}>
                  <span
                    className={`size-4 shrink-0 rounded-full border-2 ${on ? 'border-primary bg-primary' : 'border-line'}`}
                  />
                  {g.name}
                  <span className="text-sm font-normal text-muted">{g.site}</span>
                  <span className="ml-auto flex gap-1.5 text-xs font-medium">
                    {active && (
                      <span className="rounded-full bg-accent-green/10 px-2 py-0.5 text-accent-green">Đang dùng</span>
                    )}
                    {data.ready[g.id] ? (
                      <span className="inline-flex items-center gap-1 text-muted">
                        <CheckCircle2 className="size-3.5" /> Đã cấu hình
                      </span>
                    ) : (
                      <span className="text-muted">Chưa cấu hình</span>
                    )}
                  </span>
                </span>
                <span className="mt-1 block text-sm text-muted">{g.hint}</span>
              </button>
            );
          })}
        </div>
        {saved.provider !== draft.provider && (
          <p className="mt-2 text-sm text-amber-700">
            Bấm Lưu để chuyển sang {providerName(draft.provider)}. Đơn cũ của {providerName(saved.provider)} chuyển muộn
            vẫn được nhận.
          </p>
        )}

        <p className={`${labelCls} mt-5`}>Giá gói Pro (để 0 = không bán thời hạn đó)</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {draft.options.map((o, i) => (
            <label key={o.months} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2">
              <span className="w-16 shrink-0 text-sm font-medium">{monthsLabel(o.months)}</span>
              <input
                inputMode="numeric"
                value={o.price ? formatNumber(o.price) : ''}
                placeholder="0"
                onChange={(e) => {
                  const price = Number(e.target.value.replace(/\D/g, '')) || 0;
                  setDraft((d) =>
                    d ? { ...d, options: d.options.map((x, k) => (k === i ? { ...x, price } : x)) } : d,
                  );
                }}
                aria-label={`Giá ${monthsLabel(o.months)}`}
                className="min-w-0 flex-1 text-right text-[15px] tabular-nums outline-none"
              />
              <span className="text-sm text-muted">đ</span>
            </label>
          ))}
        </div>

        <GatewayConfig
          key={meta.id}
          meta={meta}
          settings={draft.gateways[meta.id]}
          onChange={setField}
          unsaved={unsaved}
        />

        <div className="mt-4 flex items-center justify-end gap-3">
          {msg && <p className={`text-sm ${msg.ok ? 'text-accent-green' : 'text-danger'}`}>{msg.text}</p>}
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-hover disabled:opacity-60"
          >
            {saving ? 'Đang lưu…' : 'Lưu'}
          </button>
        </div>
      </Card>

      <Card className="overflow-x-auto">
        <div className="px-5 pt-4">
          <h3 className="font-semibold">Đơn mua gói Pro</h3>
          <p className="text-sm text-muted">
            100 đơn gần nhất. Khách ghi sai nội dung → bấm xác nhận tay sau khi thấy tiền về.
          </p>
        </div>
        {data.orders.length === 0 ? (
          <p className="p-5 text-sm text-muted">Chưa có đơn nào.</p>
        ) : (
          <table className="mt-2 w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-muted">
                <th className="px-5 py-2.5 font-medium">Lúc tạo</th>
                <th className="px-3 py-2.5 font-medium">Tài khoản</th>
                <th className="px-3 py-2.5 font-medium">Gói</th>
                <th className="px-3 py-2.5 text-right font-medium">Số tiền</th>
                <th className="px-3 py-2.5 font-medium">Nội dung CK</th>
                <th className="px-3 py-2.5 font-medium">Trạng thái</th>
                <th className="px-5 py-2.5" aria-label="Thao tác" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.orders.map((o) => (
                <tr key={o.id}>
                  <td className="px-5 py-2.5 text-muted">{timeVi(o.createdAt)}</td>
                  <td className="px-3 py-2.5 font-medium">@{o.username}</td>
                  <td className="px-3 py-2.5">Pro {monthsLabel(o.months)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{vnd(o.amount)}</td>
                  <td className="px-3 py-2.5 font-mono">{o.code}</td>
                  <td className={`px-3 py-2.5 ${STATUS[o.status].cls}`}>
                    {STATUS[o.status].label}
                    {o.status === 'paid' && o.paidAt && (
                      <span className="block text-xs text-muted">
                        {timeVi(o.paidAt)} · {o.paidBy === 'manual' ? 'xác nhận tay' : 'tự động'}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-2.5 text-right">
                    {o.status !== 'paid' && (
                      <button
                        type="button"
                        onClick={() => void markPaid(o)}
                        className="rounded-lg border border-line px-2.5 py-1 text-sm font-medium transition hover:bg-canvas"
                      >
                        Đã nhận tiền
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {data.unmatched.length > 0 && (
          <div className="border-t border-line px-5 py-4">
            <p className="text-sm font-semibold text-amber-700">Tiền vào chưa khớp đơn ({data.unmatched.length})</p>
            <ul className="mt-2 space-y-1 text-sm">
              {data.unmatched.map((t) => (
                <li key={`${t.txId}-${t.at}`} className="flex flex-wrap gap-x-3">
                  <span className="text-muted">{timeVi(t.at)}</span>
                  <b className="tabular-nums">{vnd(t.amount)}</b>
                  <span className="min-w-0 truncate">“{t.content}”</span>
                  <span className="text-muted">— {t.note}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </div>
  );
}
