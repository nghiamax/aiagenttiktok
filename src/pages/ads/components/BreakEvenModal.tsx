import { useEffect, useState } from 'react';
import { Package } from 'lucide-react';
import Modal from '../../../components/ui/Modal';
import { formatNumber } from '../../../lib/format';
import { useAdsSettings, type AdsSettings } from '../settings';
import { productPrices, type PriceSource } from '../../../../shared/productProfit';
import { useTrend } from '../trend';
import type { AdsProduct, Campaign } from '../types';
import MediaThumb from './MediaThumb';

interface BreakEvenModalProps {
  products: AdsProduct[];
  campaignById: Map<string, Campaign>;
  settings: AdsSettings;
  onSave: (next: AdsSettings) => void;
  onReset: () => void;
  onClose: () => void;
  /** Bấm ô ROI hoà vốn của 1 sản phẩm ở bảng → sản phẩm đó lên đầu + con trỏ ở ô nhập */
  focusProductId?: string | null;
}

/** ROI chỉ có phần thập phân nên không bỏ dấu chấm */
function parseRoi(text: string): number | null {
  const value = Number(text.trim().replace(',', '.'));
  return text.trim() === '' || !Number.isFinite(value) || value <= 0 ? null : value;
}

const toText = (n: number | undefined) => (n == null ? '' : String(n).replace('.', ','));

const SOURCE_LABEL: Record<PriceSource, string> = { aov: 'khách trả TB', list: 'giá niêm yết' };
const SOURCE_TITLE: Record<PriceSource, string> = {
  aov: 'Giá khách trả trung bình = doanh thu ÷ đơn của sản phẩm (30 ngày, mọi chiến dịch)',
  list: 'Sản phẩm chưa có đơn → giá niêm yết TikTok Shop (chưa trừ khuyến mãi)',
};

const INPUT =
  'w-full rounded-lg border border-line bg-white px-3 py-2 text-right text-sm tabular-nums outline-none transition hover:border-muted/40 focus:border-primary focus:ring-2 focus:ring-primary-soft';

export default function BreakEvenModal({
  products,
  campaignById,
  settings,
  onSave,
  onReset,
  onClose,
  focusProductId = null,
}: BreakEvenModalProps) {
  // Một SPU có thể nằm ở nhiều chiến dịch → nhập 1 lần theo ID sản phẩm
  const all = [...new Map(products.map((p) => [p.id, p])).values()];
  const uniqueProducts = focusProductId ? [...all.filter((p) => p.id === focusProductId), ...all.filter((p) => p.id !== focusProductId)] : all;

  const { loaded } = useAdsSettings();
  const fromSettings = () => Object.fromEntries(uniqueProducts.map((p) => [p.id, toText(settings.breakEvenRoi[p.id])]));
  const [beDraft, setBeDraft] = useState<Record<string, string>>(fromSettings);
  // Giá tự lấy (chỉ xem): giá khách trả TB 30 → 14 → 7 ngày, chưa có đơn thì giá niêm yết TikTok Shop
  const { snaps } = useTrend();
  const prices = productPrices(snaps);
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
      title="ROI hoà vốn"
      description="ROI hoà vốn = giá bán ÷ lợi nhuận gộp trước quảng cáo — video có ROI thấp hơn là đang lỗ. Lãi 1 đơn = giá khách trả TB ÷ ROI hoà vốn (tự tính, dùng cho điều kiện “lần lợi nhuận 1 đơn”). Chưa nhập ROI hoà vốn thì chưa tính được."
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
          <li key={p.id} className={`flex flex-wrap items-center gap-3 px-5 py-3 ${p.id === focusProductId ? 'bg-primary-soft' : ''}`}>
            <MediaThumb src={p.imageUrl} icon={Package} shape="square" />
            <div className="min-w-[160px] flex-1">
              <p className="truncate text-sm font-medium" title={p.name}>
                {p.name}
              </p>
              <p className="truncate text-xs text-muted">
                {campaignById.get(p.campaignId)?.name ?? p.campaignId} · ROI hiện tại {formatNumber(p.roi, 2)}
              </p>
            </div>
            {(() => {
              const price = prices.get(p.id);
              const be = parseRoi(beDraft[p.id] ?? '');
              const profit = price && be != null ? price.price / be : null;
              return (
                <div className="flex shrink-0 items-start gap-3">
                  <div className="w-28 pt-4 text-right" title={price ? SOURCE_TITLE[price.source] : 'Chưa có đơn và chưa lấy được giá niêm yết'}>
                    <span className="block text-[11px] text-muted">Giá {price ? `(${SOURCE_LABEL[price.source]})` : ''}</span>
                    <span className={`text-sm tabular-nums ${price ? '' : 'text-muted'}`}>{price ? formatNumber(Math.round(price.price)) : '--'}</span>
                  </div>
                  <label className="w-24">
                    <span className="block text-[11px] text-muted">ROI hoà vốn</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      autoFocus={p.id === focusProductId}
                      placeholder="vd 3,5"
                      value={beDraft[p.id] ?? ''}
                      onChange={(e) => setBeDraft({ ...beDraft, [p.id]: e.target.value })}
                      aria-label={`ROI hoà vốn của ${p.name}`}
                      className={INPUT}
                    />
                  </label>
                  <div className="w-24 pt-4 text-right">
                    <span className="block text-[11px] text-muted">Lãi 1 đơn</span>
                    <span className={`text-sm font-semibold tabular-nums ${profit == null ? 'text-muted' : ''}`} title={profit == null ? 'Cần ROI hoà vốn và giá để tính' : undefined}>
                      {profit == null ? '--' : formatNumber(Math.round(profit))}
                    </span>
                  </div>
                </div>
              );
            })()}
          </li>
        ))}
        {uniqueProducts.length === 0 && (
          <li className="px-5 py-8 text-center text-sm text-muted">Chưa có dữ liệu sản phẩm.</li>
        )}
      </ul>

    </Modal>
  );
}
