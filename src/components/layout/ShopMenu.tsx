import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Check, ChevronDown, Link2, Loader2, Plus, Store } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { useShop } from '../../shop/ShopProvider';
import { useTikTok } from '../../tiktok/TikTokProvider';

interface ShopMenuProps {
  /** Mở hộp Kết nối TikTok của shop đang mở */
  onOpenTikTok: () => void;
}

/**
 * Header: shop đang mở + chấm trạng thái TikTok → danh sách shop của tài khoản (đổi shop), Thêm shop, Kết nối TikTok.
 * Mỗi shop có kết nối TikTok + số liệu + Agent riêng.
 */
export default function ShopMenu({ onOpenTikTok }: ShopMenuProps) {
  const { shops, current, switchShop, createShop } = useShop();
  const { status } = useTikTok();
  const canCreate = useAuth().can('configure');
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const dot = !current
    ? { className: 'bg-muted/40', label: 'Chưa có shop' }
    : !status || status.state === 'never'
      ? { className: 'bg-muted/40', label: 'Chưa kết nối TikTok' }
      : status.state === 'lost'
        ? { className: 'bg-danger', label: 'Mất kết nối TikTok' }
        : !status.account
          ? { className: 'bg-amber-500', label: 'Chưa chọn tài khoản quảng cáo' }
          : { className: 'bg-accent-green', label: 'Đang kết nối TikTok' };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    const err = await createShop(name.trim());
    if (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <div className="relative min-w-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={dot.label}
        aria-expanded={open}
        className="flex min-w-0 max-w-[60vw] items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm font-semibold transition-colors hover:bg-canvas sm:max-w-xs"
      >
        <Store className="size-4 shrink-0 text-primary" />
        <span className="truncate">{current?.name ?? 'Chưa có shop'}</span>
        <span className={`size-2 shrink-0 rounded-full ${dot.className}`} aria-label={dot.label} />
        <ChevronDown className="size-4 shrink-0 text-muted" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-40 mt-2 w-72 rounded-2xl border border-line bg-white p-2 shadow-lg">
          {shops.length > 0 && (
            <>
              <p className="px-3 pb-1 pt-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Shop của bạn</p>
              <ul className="max-h-64 overflow-y-auto">
                {shops.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={async () => {
                        if (s.id === current?.id) return setOpen(false);
                        setError(await switchShop(s.id));
                      }}
                      className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition hover:bg-canvas ${s.id === current?.id ? 'font-semibold text-primary' : ''}`}
                    >
                      <span className="min-w-0 flex-1 truncate">{s.name}</span>
                      {s.id === current?.id && <Check className="size-4 shrink-0" />}
                    </button>
                  </li>
                ))}
              </ul>
              <div className="my-1 border-t border-line" />
            </>
          )}

          {current && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onOpenTikTok();
              }}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition hover:bg-canvas"
            >
              <Link2 className="size-4 shrink-0 text-muted" />
              <span className="flex-1">Kết nối TikTok</span>
              <span className={`size-2 rounded-full ${dot.className}`} />
            </button>
          )}

          {canCreate &&
            (adding ? (
              <form onSubmit={submit} className="space-y-2 px-1 py-1.5">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={60}
                  placeholder="Tên shop mới"
                  autoFocus
                  className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setAdding(false)} className="rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-canvas">
                    Huỷ
                  </button>
                  <button
                    type="submit"
                    disabled={busy || !name.trim()}
                    className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-primary-hover disabled:opacity-50"
                  >
                    {busy && <Loader2 className="size-3.5 animate-spin" />}
                    Tạo shop
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-muted transition hover:bg-canvas hover:text-ink"
              >
                <Plus className="size-4 shrink-0" /> Thêm shop
              </button>
            ))}
          {error && <p className="mx-1 mt-1 rounded-lg bg-rose-50 px-3 py-2 text-xs text-danger">{error}</p>}
        </div>
      )}
    </div>
  );
}
