import { useState, type FormEvent } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import Modal from '../ui/Modal';
import { api, ApiError } from '../../lib/api';
import { MIN_PASSWORD_LENGTH } from '../../../shared/permissions';

const INPUT =
  'w-full rounded-xl border border-line px-3.5 py-2.5 text-[15px] outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20';

/** Đổi mật khẩu: đổi xong giữ phiên này, các thiết bị khác bị đăng xuất */
export default function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (next.length < MIN_PASSWORD_LENGTH) return setError(`Mật khẩu mới cần ít nhất ${MIN_PASSWORD_LENGTH} ký tự`);
    if (next !== again) return setError('Hai lần nhập mật khẩu mới không khớp');
    setBusy(true);
    setError(null);
    try {
      await api('/auth/password', { method: 'POST', body: { current, next } });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không đổi được mật khẩu');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Đổi mật khẩu" description="Đổi xong, các thiết bị khác đang đăng nhập sẽ bị đăng xuất." onClose={onClose}>
      {done ? (
        <div className="space-y-4 p-5">
          <p className="flex items-center gap-2 text-accent-green">
            <CheckCircle2 className="size-5" />
            Đã đổi mật khẩu.
          </p>
          <div className="flex justify-end">
            <button type="button" onClick={onClose} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover">
              Đóng
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4 p-5" noValidate>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Mật khẩu hiện tại</span>
            <input className={INPUT} type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" autoFocus />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Mật khẩu mới</span>
            <input className={INPUT} type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
            <span className="block text-xs text-muted">Ít nhất {MIN_PASSWORD_LENGTH} ký tự.</span>
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Nhập lại mật khẩu mới</span>
            <input className={INPUT} type="password" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" />
          </label>
          {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-xl border border-line px-4 py-2 text-sm font-medium text-muted hover:bg-canvas hover:text-ink">
              Huỷ
            </button>
            <button
              type="submit"
              disabled={busy}
              className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              Đổi mật khẩu
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
