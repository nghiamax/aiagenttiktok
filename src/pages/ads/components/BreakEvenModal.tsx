import { useEffect, useState } from 'react';
import { Package } from 'lucide-react';
import Modal from '../../../components/ui/Modal';
import { formatNumber } from '../../../lib/format';
import { useAdsSettings, type AdsSettings } from '../settings';
import type { AdsProduct, Campaign } from '../types';
import MediaThumb from './MediaThumb';

interface BreakEvenModalProps {
  products: AdsProduct[];
  campaignById: Map<string, Campaign>;
  settings: AdsSettings;
  onSave: (next: AdsSettings) => void;
  onReset: () => void;
  onClose: () => void;
}

/** ROI chỉ có phần thập phân nên không bỏ dấu chấm */
function parseRoi(text: string): number | null {
  const value = Number(text.trim().replace(',', '.'));
  return text.trim() === '' || !Number.isFinite(value) || value <= 0 ? null : value;
}

const toText = (n: number | undefined) => (n == null ? '' : String(n).replace('.', ','));

const INPUT =
  'w-full rounded-lg border border-line bg-white px-3 py-2 text-right text-sm tabular-nums outline-none transition hover:border-muted/40 focus:border-primary focus:ring-2 focus:ring-primary-soft';

export default function BreakEvenModal({
  products,
  campaignById,
  settings,
  onSave,
  onReset,
  onClose,
}: BreakEvenModalProps) {
  // Một SPU có thể nằm ở nhiều chiến dịch → nhập 1 lần theo ID sản phẩm
  const uniqueProducts = [...new Map(products.map((p) => [p.id, p])).values()];

  const { loaded } = useAdsSettings();
  const fromSettings = () => Object.fromEntries(uniqueProducts.map((p) => [p.id, toText(settings.breakEvenRoi[p.id])]));
  const [beDraft, setBeDraft] = useState<Record<string, string>>(fromSettings);
  // Mở hộp lúc server chưa tải xong → tải xong thì điền lại số đã lưu
  useEffect(() => {
    if (loaded) setBeDraft(fromSettings());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  function handleSave() {
    const breakEvenRoi: Record<string, number> = {};
    for (const [id, text] of Object.entries(beDraft)) {
      const value = parseRoi(text);
      if (value != null) breakEvenRoi[id] = value;
    }
    onSave({ ...settings, breakEvenRoi });
    onClose();
  }

  function handleReset() {
    onReset();
    onClose();
  }

  return (
    <Modal
      title="ROI hoà vốn theo sản phẩm"
      description="ROI hoà vốn = giá bán ÷ lợi nhuận gộp trước quảng cáo. Video có ROI thấp hơn mức này là đang lỗ. Ngưỡng chi phí, số đơn… sửa ở Care Ads → Nhóm video."
      onClose={onClose}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          {loaded ? (
            <button
              type="button"
              onClick={handleReset}
              className="rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-canvas hover:text-ink"
            >
              Xoá hết ROI hoà vốn
            </button>
          ) : (
            <p className="text-sm text-amber-700">Đang tải số đã lưu từ server… (server chưa chạy thì chưa lưu được)</p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-line px-4 py-2 text-sm font-medium transition-colors hover:bg-canvas"
            >
              Huỷ
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!loaded}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              Lưu
            </button>
          </div>
        </div>
      }
    >
      <ul className="divide-y divide-line">
        {uniqueProducts.map((p) => (
          <li key={p.id} className="flex items-center gap-3 px-5 py-3">
            <MediaThumb src={p.imageUrl} icon={Package} shape="square" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium" title={p.name}>
                {p.name}
              </p>
              <p className="truncate text-xs text-muted">
                {campaignById.get(p.campaignId)?.name ?? p.campaignId} · ROI hiện tại {formatNumber(p.roi, 2)}
              </p>
            </div>
            <label className="w-24 shrink-0">
              <span className="sr-only">ROI hoà vốn của {p.name}</span>
              <input
                type="text"
                inputMode="decimal"
                placeholder="vd 3,5"
                value={beDraft[p.id] ?? ''}
                onChange={(e) => setBeDraft({ ...beDraft, [p.id]: e.target.value })}
                className={INPUT}
              />
            </label>
          </li>
        ))}
        {uniqueProducts.length === 0 && (
          <li className="px-5 py-8 text-center text-sm text-muted">Chưa có dữ liệu sản phẩm.</li>
        )}
      </ul>

    </Modal>
  );
}
