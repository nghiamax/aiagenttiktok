import { useState } from 'react';
import { CheckCircle2, ExternalLink, Loader2, LogIn, LogOut, MonitorSmartphone, X } from 'lucide-react';
import Card from '../../components/ui/Card';
import { SELLER_LABEL, useSeller, type SellerPlatform } from './useSeller';

interface SellerCardProps {
  platform: SellerPlatform;
  title: string;
  usedFor: string;
  /** Màu thương hiệu cho ô icon */
  tone: string;
}

const timeVi = (iso: string) =>
  new Date(iso).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** Thẻ đăng nhập Seller Center: mở trình duyệt thật → người dùng tự đăng nhập → phiên được nhớ để lấy file */
export default function SellerCard({ platform, title, usedFor, tone }: SellerCardProps) {
  const { state, enabled, busy, error, open, close, logout } = useSeller(platform);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const loggedIn = state?.status === 'logged_in';
  const waiting = state?.status === 'waiting_login';

  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl text-white ${tone}`}>
          <MonitorSmartphone className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{title}</h3>
            {loggedIn ? (
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-accent-green">
                <CheckCircle2 className="size-4" /> Đã đăng nhập
              </span>
            ) : waiting ? (
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-amber-700">
                <Loader2 className="size-4 animate-spin" /> Đang chờ đăng nhập
              </span>
            ) : (
              <span className="text-sm font-semibold text-muted">Chưa đăng nhập</span>
            )}
          </div>
          <p className="text-sm text-muted">Dùng cho: {usedFor}</p>
          {loggedIn && state?.loggedInAt && (
            <p className="mt-0.5 text-sm text-muted">
              Đăng nhập lúc {timeVi(state.loggedInAt)}
              {state.open && ' · cửa sổ đang mở'}
            </p>
          )}
        </div>
      </div>

      {waiting && (
        <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Đã mở cửa sổ <b>{SELLER_LABEL[platform]}</b> trên máy tính. Đăng nhập trong cửa sổ đó (mật khẩu, mã OTP nhập
          trực tiếp với sàn — hệ thống không nhận mật khẩu). Đăng nhập xong <b>cửa sổ tự đóng</b> để bảo mật, phiên được
          nhớ cho lần sau.
        </p>
      )}
      {!enabled && (
        <p className="mt-4 rounded-xl bg-canvas px-4 py-3 text-sm text-muted">
          Máy chủ này không mở được trình duyệt. Tính năng chỉ chạy khi hệ thống chạy trên máy tính có màn hình.
        </p>
      )}
      {error && <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-danger">{error}</p>}

      {confirmLogout ? (
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2 rounded-xl border border-line p-3">
          <p className="mr-auto text-sm">Đăng xuất sẽ xoá phiên đã lưu — lần sau phải đăng nhập lại.</p>
          <button
            type="button"
            onClick={() => setConfirmLogout(false)}
            className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-muted transition hover:bg-canvas"
          >
            Huỷ
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              await logout();
              setConfirmLogout(false);
            }}
            className="rounded-lg bg-danger px-3 py-1.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
          >
            Đăng xuất
          </button>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {(loggedIn || state?.open) && (
            <button
              type="button"
              onClick={() => setConfirmLogout(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-line px-4 py-2 text-sm font-medium text-muted transition hover:bg-canvas hover:text-ink"
            >
              <LogOut className="size-4" /> Đăng xuất
            </button>
          )}
          {state?.open && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void close()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-line px-4 py-2 text-sm font-medium text-muted transition hover:bg-canvas hover:text-ink"
            >
              <X className="size-4" /> Đóng cửa sổ
            </button>
          )}
          <button
            type="button"
            disabled={busy || !enabled}
            onClick={() => void open()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-hover disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : loggedIn ? (
              <ExternalLink className="size-4" />
            ) : (
              <LogIn className="size-4" />
            )}
            {loggedIn ? 'Mở Seller Center' : waiting ? 'Mở lại cửa sổ đăng nhập' : 'Đăng nhập'}
          </button>
        </div>
      )}
    </Card>
  );
}
