import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, KeyRound, Landmark, Loader2 } from 'lucide-react';
import Card from '../../components/ui/Card';
import { api, ApiError } from '../../lib/api';
import { formatNumber } from '../../lib/format';
import { BANKS, monthsLabel, type BillingOrder, type ProOption } from '../../../shared/billing';
import { inputCls, labelCls } from './PlanFields';

interface BillingConfig {
  bankBin: string;
  accountNo: string;
  accountName: string;
  options: ProOption[];
  webhookKey: string;
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

function randomKey(): string {
  const a = new Uint8Array(24);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
      className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-line text-muted transition hover:bg-canvas hover:text-ink"
    >
      {done ? <Check className="size-4 text-accent-green" /> : <Copy className="size-4" />}
    </button>
  );
}

/** Trang Tài khoản → Thanh toán: ngân hàng nhận tiền, giá gói Pro, webhook SePay, đơn mua, giao dịch chưa khớp */
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

  const webhookUrl = `${window.location.origin}/api/billing/webhook/sepay`;
  const isLocal = /localhost|127\.0\.0\.1/.test(window.location.hostname);
  const set = <K extends keyof BillingConfig>(k: K, v: BillingConfig[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const { config } = await api<{ config: BillingConfig }>('/billing/admin/config', { method: 'PUT', body: draft });
      setDraft(config);
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
              Tài khoản nhận tiền + giá. Khách quét QR chuyển khoản, SePay báo tiền về → tài khoản tự lên Pro.
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className={labelCls} htmlFor="bill-bank">
              Ngân hàng
            </label>
            <select
              id="bill-bank"
              value={draft.bankBin}
              onChange={(e) => set('bankBin', e.target.value)}
              className={`${inputCls} bg-white`}
            >
              <option value="">— Chọn ngân hàng —</option>
              {BANKS.map((b) => (
                <option key={b.bin} value={b.bin}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="bill-acc">
              Số tài khoản
            </label>
            <input
              id="bill-acc"
              value={draft.accountNo}
              onChange={(e) => set('accountNo', e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="bill-name">
              Tên chủ tài khoản
            </label>
            <input
              id="bill-name"
              value={draft.accountName}
              onChange={(e) => set('accountName', e.target.value)}
              placeholder="NGUYEN VAN A"
              className={`${inputCls} uppercase`}
            />
          </div>
        </div>

        <p className={`${labelCls} mt-4`}>Giá gói Pro (để 0 = không bán thời hạn đó)</p>
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
                  set(
                    'options',
                    draft.options.map((x, k) => (k === i ? { ...x, price } : x)),
                  );
                }}
                aria-label={`Giá ${monthsLabel(o.months)}`}
                className="min-w-0 flex-1 text-right text-[15px] tabular-nums outline-none"
              />
              <span className="text-sm text-muted">đ</span>
            </label>
          ))}
        </div>

        <div className="mt-5 rounded-xl border border-line bg-canvas/60 p-4">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <KeyRound className="size-4 text-primary" /> Tự động xác nhận bằng SePay
          </p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-ink/80">
            <li>Đăng ký sepay.vn, liên kết tài khoản ngân hàng nhận tiền ở trên.</li>
            <li>
              SePay → Tích hợp WebHooks → Thêm: sự kiện <b>Có tiền vào</b>, URL bên dưới, chứng thực <b>API Key</b> =
              khoá bên dưới.
            </li>
            <li>Bấm Lưu ở đây. Khách chuyển khoản đúng nội dung → tài khoản lên Pro trong vài giây.</li>
          </ol>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div>
              <p className={labelCls}>URL webhook</p>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={webhookUrl}
                  className={`${inputCls} bg-white text-sm`}
                  aria-label="URL webhook"
                />
                <CopyButton text={webhookUrl} label="Sao chép URL webhook" />
              </div>
              {isLocal && (
                <p className="mt-1 text-sm text-amber-700">
                  Đang chạy trên máy (localhost) — SePay không gọi tới được. Dùng địa chỉ web thật sau khi đưa lên
                  hosting.
                </p>
              )}
            </div>
            <div>
              <p className={labelCls}>Khoá API (webhook)</p>
              <div className="flex gap-2">
                <input
                  value={draft.webhookKey}
                  onChange={(e) => set('webhookKey', e.target.value)}
                  className={`${inputCls} bg-white font-mono text-sm`}
                  aria-label="Khoá API webhook"
                />
                <CopyButton text={draft.webhookKey} label="Sao chép khoá" />
                <button
                  type="button"
                  onClick={() => set('webhookKey', randomKey())}
                  className="shrink-0 rounded-lg border border-line bg-white px-3 text-sm font-medium transition hover:bg-canvas"
                >
                  Tạo khoá
                </button>
              </div>
            </div>
          </div>
        </div>

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
