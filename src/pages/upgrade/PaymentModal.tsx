import { useEffect, useState } from 'react';
import { Check, CheckCircle2, Copy, ExternalLink, Loader2 } from 'lucide-react';
import Modal from '../../components/ui/Modal';
import { api } from '../../lib/api';
import { formatNumber } from '../../lib/format';
import { bankName, monthsLabel, type BillingOrder, type PayAccount } from '../../../shared/billing';

/** Đơn kèm thông tin chuyển khoản (server tính theo cổng thanh toán của đơn) */
export type OrderView = BillingOrder & {
  qrUrl: string | null;
  account: PayAccount | null;
  /** Nội dung chuyển khoản phải ghi */
  content: string;
  /** payOS: trang thanh toán của payOS */
  checkoutUrl: string | null;
};

interface PaymentModalProps {
  order: OrderView;
  onClose: () => void;
  /** Tiền đã về, tài khoản đã lên Pro */
  onPaid: (o: OrderView) => void;
}

/** Kiểm tra đơn mỗi 3 giây (server nhận webhook ngân hàng) */
const POLL_MS = 3000;

function CopyRow({ label, value, copy }: { label: string; value: string; copy?: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="text-sm text-muted">{label}</span>
      <span className="flex min-w-0 items-center gap-2">
        <b className="truncate text-right">{value}</b>
        <button
          type="button"
          aria-label={`Sao chép ${label.toLowerCase()}`}
          onClick={() => {
            void navigator.clipboard?.writeText(copy ?? value).then(() => {
              setDone(true);
              setTimeout(() => setDone(false), 1500);
            });
          }}
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-canvas hover:text-ink"
        >
          {done ? <Check className="size-4 text-accent-green" /> : <Copy className="size-4" />}
        </button>
      </span>
    </div>
  );
}

/** Mã QR ngân hàng + thông tin chuyển khoản; tự chuyển sang "Thành công" khi tiền về */
export default function PaymentModal({ order: initial, onClose, onPaid }: PaymentModalProps) {
  const [order, setOrder] = useState(initial);
  const paid = order.status === 'paid';

  useEffect(() => {
    if (paid) return;
    const t = setInterval(async () => {
      try {
        const { order: o } = await api<{ order: OrderView }>(`/billing/orders/${initial.id}`);
        setOrder(o);
        if (o.status === 'paid') onPaid(o);
      } catch {
        /* mạng chập chờn → thử lại lượt sau */
      }
    }, POLL_MS);
    return () => clearInterval(t);
  }, [paid, initial.id, onPaid]);

  if (paid) {
    return (
      <Modal title="Thanh toán thành công" onClose={onClose}>
        <div className="p-8 text-center">
          <CheckCircle2 className="mx-auto size-14 text-accent-green" />
          <h3 className="mt-3 text-lg font-semibold">Tài khoản đã lên gói Pro</h3>
          <p className="mt-1 text-muted">
            {order.proUntil
              ? `Dùng đến ${new Date(order.proUntil).toLocaleDateString('vi-VN')}.`
              : 'Không giới hạn thời hạn.'}{' '}
            Cảm ơn bạn!
          </p>
          <button
            type="button"
            onClick={onClose}
            className="mt-5 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-hover"
          >
            Bắt đầu dùng
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title={`Thanh toán gói Pro ${monthsLabel(order.months)}`}
      description="Mở app ngân hàng, quét mã QR — số tiền và nội dung đã điền sẵn."
      onClose={onClose}
    >
      <div className="grid gap-5 p-5 md:grid-cols-[260px_minmax(0,1fr)]">
        <div className="flex flex-col items-center">
          {order.qrUrl ? (
            <img
              src={order.qrUrl}
              alt={`Mã QR chuyển khoản ${formatNumber(order.amount)}đ`}
              className="w-full max-w-[260px] rounded-xl border border-line"
            />
          ) : (
            <div className="flex aspect-square w-full items-center justify-center rounded-xl border border-dashed border-line text-sm text-muted">
              Mã QR đã hết hạn — đóng và tạo lại
            </div>
          )}
        </div>
        <div>
          <div className="divide-y divide-line">
            {order.account && (
              <>
                <CopyRow label="Ngân hàng" value={bankName(order.account.bankBin)} />
                <CopyRow label="Số tài khoản" value={order.account.accountNo} />
                <CopyRow label="Chủ tài khoản" value={order.account.accountName} />
              </>
            )}
            <CopyRow label="Số tiền" value={`${formatNumber(order.amount)}đ`} copy={String(order.amount)} />
            <CopyRow label="Nội dung" value={order.content} />
          </div>
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Chuyển <b>đúng số tiền</b> và giữ <b>nội dung {order.content}</b> để hệ thống tự kích hoạt.
          </p>
          {order.checkoutUrl && (
            <a
              href={order.checkoutUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              Mở trang thanh toán payOS <ExternalLink className="size-4" />
            </a>
          )}
          <p className="mt-4 flex items-center gap-2 text-sm font-medium text-primary">
            <Loader2 className="size-4 animate-spin" />{' '}
            {order.provider === 'manual'
              ? 'Chuyển xong, quản trị viên sẽ xác nhận và kích hoạt — trang tự cập nhật khi xong.'
              : 'Đang chờ tiền về… trang tự cập nhật khi nhận được.'}
          </p>
        </div>
      </div>
    </Modal>
  );
}
