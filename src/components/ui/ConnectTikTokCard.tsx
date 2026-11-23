import { useState } from 'react';
import { Link2, Loader2, PlugZap } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { useTikTok } from '../../tiktok/TikTokProvider';
import { useShop } from '../../shop/ShopProvider';
import Card from './Card';
import TikTokPendingBox from './TikTokPendingBox';

/** Lần đầu chưa kết nối TikTok: thay nội dung trang bằng 1 việc duy nhất — Kết nối TikTok */
export default function ConnectTikTokCard() {
  const { connect, connecting, pending } = useTikTok();
  const canConnect = useAuth().can('configure');
  const shop = useShop().current;
  const [error, setError] = useState<string | null>(null);

  return (
    <Card className="flex min-h-[360px] flex-col items-center justify-center p-8 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary-soft text-primary">
        <PlugZap className="size-7" strokeWidth={1.75} />
      </div>
      <h2 className="text-lg font-semibold">Kết nối TikTok để bắt đầu</h2>
      {shop && shop.name !== 'Tài khoản quảng cáo mới' && (
        <p className="mt-1 text-sm text-muted">
          Shop <span className="font-semibold text-ink">{shop.name}</span> chưa kết nối TikTok
        </p>
      )}
      <p className="mt-1.5 max-w-md leading-relaxed text-muted">
        {canConnect
          ? 'Kết nối tài khoản TikTok for Business để xem số liệu quảng cáo.'
          : 'Nhờ Chủ shop kết nối TikTok để xem số liệu quảng cáo.'}
      </p>
      {canConnect &&
        (pending ? (
          <div className="mt-6 w-full max-w-md">
            <TikTokPendingBox />
          </div>
        ) : (
          <button
            type="button"
            disabled={connecting}
            onClick={async () => setError(await connect())}
            className="mt-6 flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 font-semibold text-white shadow-sm transition hover:bg-primary-hover disabled:opacity-60"
          >
            {connecting ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />}
            Kết nối TikTok
          </button>
        ))}
      {error && <p className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-danger">{error}</p>}
    </Card>
  );
}
