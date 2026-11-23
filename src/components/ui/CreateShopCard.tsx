import { useState, type FormEvent } from 'react';
import { Loader2, Store } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { useShop } from '../../shop/ShopProvider';
import Card from './Card';

/** Tài khoản chưa có shop nào: tạo shop đầu tiên (rồi Kết nối TikTok cho shop đó) */
export default function CreateShopCard() {
  const { createShop } = useShop();
  const canCreate = useAuth().can('configure');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <Card className="flex min-h-[360px] flex-col items-center justify-center p-8 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary-soft text-primary">
        <Store className="size-7" strokeWidth={1.75} />
      </div>
      <h2 className="text-lg font-semibold">Tạo shop đầu tiên</h2>
      <p className="mt-1.5 max-w-md leading-relaxed text-muted">
        {canCreate ? 'Đặt tên shop, sau đó kết nối TikTok để xem số liệu quảng cáo.' : 'Nhờ chủ tài khoản tạo shop.'}
      </p>
      {canCreate && (
        <form onSubmit={submit} className="mt-6 flex w-full max-w-sm gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder="vd Shop phụ kiện"
            autoFocus
            className="min-w-0 flex-1 rounded-xl border border-line px-3.5 py-2.5 text-[15px] outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          <button
            type="submit"
            disabled={busy || !name.trim()}
            className="flex shrink-0 items-center gap-2 rounded-xl bg-primary px-4 py-2.5 font-semibold text-white transition hover:bg-primary-hover disabled:opacity-50"
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            Tạo shop
          </button>
        </form>
      )}
      {error && <p className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-danger">{error}</p>}
    </Card>
  );
}
