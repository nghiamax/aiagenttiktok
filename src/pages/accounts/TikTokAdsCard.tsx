import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Megaphone, Settings2 } from 'lucide-react';
import Card from '../../components/ui/Card';
import TikTokConnectModal from '../../components/layout/TikTokConnectModal';
import { useAuth } from '../../auth/AuthProvider';
import { useTikTok } from '../../tiktok/TikTokProvider';

const timeVi = (iso: string) =>
  new Date(iso).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** Thẻ TikTok Ads (TikTok for Business) — dùng lại hộp Kết nối TikTok hiện có */
export default function TikTokAdsCard() {
  const { status } = useTikTok();
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  const state = status?.state ?? 'never';

  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-ink text-white">
          <Megaphone className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">TikTok Ads</h3>
            {state === 'connected' ? (
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-accent-green">
                <CheckCircle2 className="size-4" /> Đang kết nối
              </span>
            ) : state === 'lost' ? (
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-danger">
                <AlertTriangle className="size-4" /> Mất kết nối
              </span>
            ) : (
              <span className="text-sm font-semibold text-muted">Chưa kết nối</span>
            )}
          </div>
          <p className="text-sm text-muted">Dùng cho: ADS 24/7, AI Agent</p>
          {status && state !== 'never' && (
            <p className="mt-0.5 text-sm text-muted">
              {status.advertiser.name}
              {status.connectedAt && ` · kết nối lúc ${timeVi(status.connectedAt)}`}
              {status.connectedBy && ` bởi ${status.connectedBy}`}
            </p>
          )}
        </div>
      </div>
      <div className="mt-4 flex justify-end">
        {can('configure') ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-hover"
          >
            <Settings2 className="size-4" /> {state === 'never' ? 'Kết nối' : 'Quản lý kết nối'}
          </button>
        ) : (
          <p className="text-sm text-muted">Do quản trị viên quản lý.</p>
        )}
      </div>
      {open && <TikTokConnectModal onClose={() => setOpen(false)} />}
    </Card>
  );
}
