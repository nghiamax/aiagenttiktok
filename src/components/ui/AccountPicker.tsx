import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { api, ApiError } from '../../lib/api';

/* Chọn tài khoản quảng cáo + shop TikTok cho shop đang mở (GET /api/tiktok/accounts → POST /api/tiktok/account) */

interface StoreOption {
  storeId: string;
  storeName: string | null;
  exclusive: boolean;
}
interface AdvertiserOption {
  advertiserId: string;
  advertiserName: string | null;
  stores: StoreOption[];
  error?: string;
}

interface AccountPickerProps {
  /** Tài khoản đang chọn (để đánh dấu sẵn) */
  current?: { advertiserId: string; storeId: string } | null;
  /** Chọn xong → mặc định tải lại trang (số liệu theo tài khoản mới) */
  onDone?: () => void;
}

const key = (a: string, s: string) => `${a}|${s}`;

export default function AccountPicker({ current, onDone }: AccountPickerProps) {
  const [list, setList] = useState<AdvertiserOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(current ? key(current.advertiserId, current.storeId) : null);
  const [saving, setSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setList(null);
    setError(null);
    api<{ advertisers: AdvertiserOption[] }>('/tiktok/accounts')
      .then((r) => setList(r.advertisers))
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Không đọc được danh sách tài khoản'));
  }, [reloadKey]);

  const withStores = list?.filter((a) => a.stores.length > 0) ?? [];
  const without = list?.filter((a) => a.stores.length === 0) ?? [];
  const changed = !!picked && picked !== (current ? key(current.advertiserId, current.storeId) : null);

  async function save() {
    if (!picked) return;
    const [advertiserId, storeId] = picked.split('|');
    setSaving(true);
    setError(null);
    try {
      await api('/tiktok/account', { method: 'POST', body: { advertiserId, storeId } });
      if (onDone) onDone();
      else window.location.reload();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Không lưu được');
      setSaving(false);
    }
  }

  if (!list && !error) {
    return (
      <p className="flex items-center gap-2 py-6 text-sm text-muted">
        <Loader2 className="size-4 animate-spin" /> Đang đọc tài khoản quảng cáo từ TikTok…
      </p>
    );
  }

  return (
    <div className="space-y-4 text-left">
      {error && (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-danger">
          <span>{error}</span>
          <button type="button" onClick={() => setReloadKey((k) => k + 1)} className="flex items-center gap-1 font-semibold hover:underline">
            <RefreshCw className="size-3.5" /> Thử lại
          </button>
        </div>
      )}

      {list && withStores.length === 0 && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Không tài khoản quảng cáo nào có shop chạy GMV Max. Kiểm tra lại quyền đã cấp trên TikTok rồi Kết nối lại.
        </p>
      )}

      {withStores.length > 0 && (
        <ul className="max-h-[50vh] space-y-2 overflow-y-auto">
          {withStores.map((a) => (
            <li key={a.advertiserId} className="rounded-xl border border-line">
              <p className="border-b border-line px-4 py-2 text-sm font-semibold">
                {a.advertiserName ?? a.advertiserId}
                <span className="ml-2 text-xs font-normal text-muted">ID {a.advertiserId}</span>
              </p>
              {a.stores.map((s) => {
                const k = key(a.advertiserId, s.storeId);
                return (
                  <label key={k} className="flex cursor-pointer items-center gap-3 px-4 py-2.5 transition hover:bg-canvas">
                    <input type="radio" name="tiktok-account" checked={picked === k} onChange={() => setPicked(k)} className="accent-primary" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{s.storeName ?? s.storeId}</span>
                      {!s.exclusive && <span className="block text-xs text-amber-700">Chưa cấp quyền GMV Max độc quyền — chỉ xem được số liệu</span>}
                    </span>
                    {current && k === key(current.advertiserId, current.storeId) && <CheckCircle2 className="size-4 shrink-0 text-accent-green" />}
                  </label>
                );
              })}
            </li>
          ))}
        </ul>
      )}

      {without.length > 0 && (
        <p className="text-xs text-muted">
          {without.length} tài khoản không có shop GMV Max: {without.map((a) => a.advertiserName ?? a.advertiserId).join(', ')}
        </p>
      )}

      {current && changed && (
        <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-700">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          Đổi tài khoản: đề xuất đang chờ sẽ đóng và Agent tạm dừng — bật lại sau khi xem quy tắc.
        </p>
      )}

      {withStores.length > 0 && (
        <div className="flex justify-end">
          <button
            type="button"
            disabled={!changed || saving}
            onClick={save}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving && <Loader2 className="size-4 animate-spin" />}
            Dùng tài khoản này
          </button>
        </div>
      )}
    </div>
  );
}
