import { useState } from 'react';
import { Loader2, Plus, Store } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { useShop } from '../../shop/ShopProvider';
import Card from './Card';

/** Tài khoản chưa có tài khoản quảng cáo nào: Thêm tài khoản quảng cáo (tên tự lấy khi kết nối + chọn) */
export default function CreateShopCard() {
  const { createShop } = useShop();
  const canCreate = useAuth().can('configure');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setBusy(true);
    const err = await createShop();
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
      <h2 className="text-lg font-semibold">Thêm tài khoản quảng cáo</h2>
      <p className="mt-1.5 max-w-md leading-relaxed text-muted">
        {canCreate ? 'Kết nối TikTok rồi chọn tài khoản quảng cáo để xem số liệu.' : 'Nhờ chủ tài khoản thêm tài khoản quảng cáo.'}
      </p>
      {canCreate && (
        <button
          type="button"
          disabled={busy}
          onClick={add}
          className="mt-6 flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 font-semibold text-white shadow-sm transition hover:bg-primary-hover disabled:opacity-60"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Thêm tài khoản quảng cáo
        </button>
      )}
      {error && <p className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-danger">{error}</p>}
    </Card>
  );
}
