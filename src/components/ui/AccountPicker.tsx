import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronRight, Loader2, RefreshCw } from 'lucide-react';
import { api, ApiError } from '../../lib/api';

/* Chọn tài khoản quảng cáo + shop TikTok cho shop đang mở (GET /api/tiktok/accounts → POST /api/tiktok/account) */

interface StoreOption {
  storeId: string;
  storeName: string | null;
  exclusive: boolean;
  exclusiveAdvertiserId: string | null;
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
  const [showOthers, setShowOthers] = useState(false);

  useEffect(() => {
    setList(null);
    setError(null);
    api<{ advertisers: AdvertiserOption[] }>('/tiktok/accounts')
      .then((r) => setList(r.advertisers))
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Không đọc được danh sách tài khoản'));
  }, [reloadKey]);

  // Mỗi shop chỉ cấp quyền GMV Max độc quyền cho 1 tài khoản → cặp có quyền đó là cặp đang chạy quảng cáo (Nên chọn)
  const pairs = (list ?? []).flatMap((a) => a.stores.map((s) => ({ a, s, k: key(a.advertiserId, s.storeId) })));
  const recommended = pairs.filter((p) => p.s.exclusive);
  const others = pairs.filter((p) => !p.s.exclusive);
  const nameOf = (advertiserId: string) => list?.find((a) => a.advertiserId === advertiserId)?.advertiserName ?? advertiserId;
  const currentKey = current ? key(current.advertiserId, current.storeId) : null;
  const othersOpen = showOthers || (!!currentKey && others.some((p) => p.k === currentKey)) || recommended.length === 0;

  const row = (p: (typeof pairs)[number], note?: string) => (
    <label key={p.k} className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-canvas">
      <input type="radio" name="tiktok-account" checked={picked === p.k} onChange={() => setPicked(p.k)} className="accent-primary" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{p.s.storeName ?? p.s.storeId}</span>
        <span className="block truncate text-xs text-muted">
          Tài khoản {p.a.advertiserName ?? p.a.advertiserId} · ID shop {p.s.storeId}
        </span>
        {note && <span className="block text-xs text-amber-700">{note}</span>}
      </span>
      {p.k === currentKey && <CheckCircle2 className="size-4 shrink-0 text-accent-green" />}
    </label>
  );
  const changed = !!picked && picked !== currentKey;

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

      {list && pairs.length === 0 && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Không tài khoản quảng cáo nào có shop chạy GMV Max. Kiểm tra lại quyền đã cấp trên TikTok rồi Kết nối lại.
        </p>
      )}

      <div className="max-h-[55vh] space-y-3 overflow-y-auto">
        {recommended.length > 0 && (
          <section>
            <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted">Nên chọn — shop đã cấp quyền GMV Max</p>
            <div className="rounded-xl border border-line p-1">{recommended.map((p) => row(p))}</div>
          </section>
        )}

        {others.length > 0 && (
          <section>
            {recommended.length > 0 && (
              <button
                type="button"
                onClick={() => setShowOthers((v) => !v)}
                aria-expanded={othersOpen}
                className="flex w-full items-center gap-1.5 px-3 py-1 text-left text-xs font-semibold uppercase tracking-wide text-muted hover:text-ink"
              >
                <ChevronRight className={`size-3.5 transition-transform ${othersOpen ? 'rotate-90' : ''}`} />
                Lựa chọn khác ({others.length})
              </button>
            )}
            {othersOpen && (
              <div className="rounded-xl border border-dashed border-line p-1">
                {others.map((p) =>
                  row(
                    p,
                    p.s.exclusiveAdvertiserId
                      ? `Shop đang cấp quyền GMV Max cho tài khoản ${nameOf(p.s.exclusiveAdvertiserId)} — thường không có số liệu`
                      : 'Shop chưa cấp quyền GMV Max cho tài khoản nào',
                  ),
                )}
              </div>
            )}
          </section>
        )}
      </div>

      {current && changed && (
        <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-700">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          Đổi tài khoản: đề xuất đang chờ sẽ đóng và Agent tạm dừng — bật lại sau khi xem quy tắc.
        </p>
      )}

      {pairs.length > 0 && (
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
