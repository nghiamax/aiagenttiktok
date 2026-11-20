import { useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import Modal from '../../../../components/ui/Modal';
import { formatNumber } from '../../../../lib/format';

interface ConfirmExecuteModalProps {
  title: string;
  /** Mỗi dòng = 1 việc sẽ chạy thật trên TikTok */
  lines: string[];
  /** Tổng tiền tăng cường tối đa (nếu có) */
  boostTotal?: number;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

const MAX_LINES = 8;

/** Hộp xác nhận trước khi gửi lệnh thật lên TikTok */
export default function ConfirmExecuteModal({
  title,
  lines,
  boostTotal,
  confirmLabel,
  onConfirm,
  onClose,
}: ConfirmExecuteModalProps) {
  const [busy, setBusy] = useState(false);
  const close = () => !busy && onClose();

  async function confirm() {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
    onClose();
  }

  return (
    <Modal
      title={title}
      description="Server sẽ gửi lệnh lên TikTok ngay sau khi Sếp xác nhận. Điều kiện được kiểm tra lại bằng số liệu mới trước khi gửi."
      onClose={close}
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={close}
            disabled={busy}
            className="rounded-xl border border-line px-4 py-2 text-sm font-medium text-muted transition hover:bg-canvas hover:text-ink disabled:opacity-60"
          >
            Huỷ
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={busy}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            {busy ? 'Đang gửi lệnh…' : confirmLabel}
          </button>
        </div>
      }
    >
      <div className="space-y-4 p-5">
        <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            Đây là <span className="font-semibold">thao tác thật</span> trên tài khoản quảng cáo TikTok.
          </span>
        </p>
        <ul className="list-disc space-y-1.5 pl-5 text-sm">
          {lines.slice(0, MAX_LINES).map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
        {lines.length > MAX_LINES && <p className="text-sm text-muted">… và {lines.length - MAX_LINES} việc khác.</p>}
        {boostTotal ? (
          <p className="text-sm">
            Tổng chi tăng cường tối đa: <span className="font-semibold">{formatNumber(boostTotal)}đ</span>
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
