import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Link2, Loader2 } from 'lucide-react';
import Modal from '../ui/Modal';
import { useAuth } from '../../auth/AuthProvider';
import { api, ApiError } from '../../lib/api';
import { useTikTok } from '../../tiktok/TikTokProvider';

/** Kết nối TikTok: chỉ thông tin chính (trạng thái + tài khoản) + nút Kết nối / Kết nối lại */
export default function TikTokConnectModal({ onClose }: { onClose: () => void }) {
  const { status, connect, connecting, refresh } = useTikTok();
  const canConnect = useAuth().can('configure');
  const [error, setError] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const ok = !!status?.connected;
  const hasToken = !!status && status.state !== 'never';

  async function disconnect() {
    setDisconnecting(true);
    setError(null);
    try {
      const r = await api<{ revoked: boolean }>('/tiktok/disconnect', { method: 'POST', body: { confirm: true } });
      setNotice(r.revoked ? 'Đã ngắt kết nối TikTok.' : 'Đã ngắt kết nối trên máy. TikTok chưa xác nhận thu hồi quyền.');
      setConfirmDisconnect(false);
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Không ngắt kết nối được');
    } finally {
      setDisconnecting(false);
    }
  }

  if (confirmDisconnect) {
    return (
      <Modal title="Ngắt kết nối TikTok?" onClose={() => setConfirmDisconnect(false)}>
        <div className="space-y-4 p-5">
          <p className="leading-relaxed text-muted">
            Web sẽ không lấy được số liệu và Agent dừng quét cho tới khi kết nối lại. Quảng cáo trên TikTok vẫn chạy bình thường.
          </p>
          {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmDisconnect(false)}
              className="rounded-xl border border-line px-4 py-2 text-sm font-medium text-muted transition hover:bg-canvas hover:text-ink"
            >
              Huỷ
            </button>
            <button
              type="button"
              disabled={disconnecting}
              onClick={disconnect}
              className="flex items-center gap-2 rounded-xl bg-danger px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
            >
              {disconnecting && <Loader2 className="size-4 animate-spin" />}
              Ngắt kết nối
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Kết nối TikTok" onClose={onClose}>
      <div className="space-y-4 p-5">
        {!status ? (
          <p className="text-sm text-muted">Chưa đọc được trạng thái kết nối.</p>
        ) : (
          <div className="flex items-center justify-between gap-4 rounded-xl border border-line px-4 py-3">
            <div className="min-w-0">
              <p className="truncate font-semibold">{status.state === 'never' ? 'TikTok for Business' : status.advertiser.name}</p>
              <p className="text-sm text-muted">Tài khoản quảng cáo</p>
            </div>
            {ok ? (
              <span className="flex shrink-0 items-center gap-1.5 text-sm font-semibold text-accent-green">
                <CheckCircle2 className="size-4" /> Đang kết nối
              </span>
            ) : status.state === 'never' ? (
              <span className="shrink-0 text-sm font-semibold text-muted">Chưa kết nối</span>
            ) : (
              <span className="flex shrink-0 items-center gap-1.5 text-sm font-semibold text-danger">
                <AlertTriangle className="size-4" /> Mất kết nối
              </span>
            )}
          </div>
        )}

        {notice && <p className="rounded-xl bg-canvas px-3 py-2 text-sm text-muted">{notice}</p>}
        {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-danger">{error}</p>}

        {/* Ngắt (phụ, xám) cạnh Kết nối (chính) — cùng bên phải; đóng hộp bằng nút ✕ */}
        {canConnect ? (
          <div className="flex items-center justify-end gap-2">
            {hasToken && (
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setConfirmDisconnect(true);
                }}
                className="rounded-xl border border-line px-4 py-2 text-sm font-medium text-muted transition hover:bg-canvas hover:text-ink"
              >
                Ngắt kết nối
              </button>
            )}
            <button
              type="button"
              disabled={connecting}
              onClick={async () => setError(await connect())}
              className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {connecting ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />}
              {ok ? 'Kết nối lại' : 'Kết nối TikTok'}
            </button>
          </div>
        ) : (
          <p className="text-sm text-muted">Chỉ Chủ shop kết nối / ngắt kết nối được.</p>
        )}
      </div>
    </Modal>
  );
}
