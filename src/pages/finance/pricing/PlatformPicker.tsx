import { Calculator, Check, Music2, Sheet, ShoppingBag, Target, type LucideIcon } from 'lucide-react';
import Card from '../../../components/ui/Card';
import type { Platform, ShopType } from './calc';
import { SHOP_TYPE_LABEL, type PricingMode, type PricingView } from './config';

interface PlatformPickerProps {
  platform: Platform;
  shopType: ShopType;
  mode: PricingMode;
  view: PricingView;
  onPlatform: (p: Platform) => void;
  onShopType: (s: ShopType) => void;
  onMode: (m: PricingMode | 'bulk') => void;
  /** Tính hàng loạt cần gói Pro → hiện nhãn "Pro" */
  bulkLocked?: boolean;
}

const PLATFORMS: { id: Platform; label: string; icon: LucideIcon; on: string; off: string; iconOff: string }[] = [
  {
    id: 'tiktok',
    label: 'TikTok Shop',
    icon: Music2,
    on: 'border-ink bg-ink text-white shadow-md',
    off: 'border-line bg-white text-ink hover:border-ink/40',
    iconOff: 'bg-ink text-white',
  },
  {
    id: 'shopee',
    label: 'Shopee',
    icon: ShoppingBag,
    on: 'border-shopee bg-shopee text-white shadow-md',
    off: 'border-line bg-white text-ink hover:border-shopee/50',
    iconOff: 'bg-shopee text-white',
  },
];

const SHOP_DESC: Record<ShopType, string> = { standard: 'Shop cá nhân / hộ kinh doanh', mall: 'Gian hàng chính hãng' };

const MODES: { value: PricingMode | 'bulk'; icon: LucideIcon; title: string; desc: string }[] = [
  { value: 'price', icon: Target, title: 'Tìm giá bán', desc: 'Biết giá vốn → giá nên đặt' },
  { value: 'profit', icon: Calculator, title: 'Kiểm tra lãi', desc: 'Có giá bán → lãi / lỗ' },
  { value: 'bulk', icon: Sheet, title: 'Tính hàng loạt', desc: 'Tải file → từng SKU' },
];

const STEP = 'mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted';

/** Bước 1: chọn sàn (nổi bật) → loại shop ngay dưới → cách tính */
export default function PlatformPicker({
  platform,
  shopType,
  mode,
  view,
  onPlatform,
  onShopType,
  onMode,
  bulkLocked = false,
}: PlatformPickerProps) {
  const shopTone = platform === 'shopee' ? 'border-shopee bg-shopee-soft text-shopee' : 'border-ink bg-canvas text-ink';

  return (
    <Card className="space-y-4 p-4 md:p-5">
      <div>
        <p className={STEP}>1 · Bán trên sàn</p>
        <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Sàn bán">
          {PLATFORMS.map((p) => {
            const on = p.id === platform;
            const Icon = p.icon;
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onPlatform(p.id)}
                className={`flex items-center justify-center gap-2.5 rounded-xl border-2 px-3 py-2.5 text-base font-bold transition md:text-lg ${
                  on ? p.on : p.off
                }`}
              >
                <span
                  className={`flex size-7 items-center justify-center rounded-lg md:size-8 ${on ? 'bg-white/15' : p.iconOff}`}
                >
                  <Icon className="size-4" strokeWidth={2.2} />
                </span>
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className={STEP}>2 · Loại shop</p>
        <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Loại shop">
          {(['standard', 'mall'] as ShopType[]).map((s) => {
            const on = s === shopType;
            return (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onShopType(s)}
                className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition ${
                  on ? shopTone : 'border-line hover:bg-canvas'
                }`}
              >
                <span
                  className={`flex size-4 shrink-0 items-center justify-center rounded-full border ${
                    on ? 'border-current bg-current' : 'border-line'
                  }`}
                >
                  {on && <Check className="size-2.5 text-white" strokeWidth={3.5} />}
                </span>
                <span className="min-w-0 text-sm">
                  <span className="block font-semibold">{SHOP_TYPE_LABEL[platform][s]}</span>
                  <span className="block truncate text-muted">{SHOP_DESC[s]}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className={STEP}>3 · Muốn biết</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Cách tính">
          {MODES.map((m) => {
            const on = view === 'bulk' ? m.value === 'bulk' : m.value === mode;
            const Icon = m.icon;
            return (
              <button
                key={m.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onMode(m.value)}
                className={`flex items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition ${
                  on ? 'border-primary bg-primary-soft/60 ring-1 ring-primary' : 'border-line hover:border-primary/40'
                }`}
              >
                <span
                  className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${
                    on ? 'bg-primary text-white' : 'bg-canvas text-muted'
                  }`}
                >
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0 text-sm">
                  <span className={`flex items-center gap-1.5 font-semibold ${on ? 'text-primary' : 'text-ink'}`}>
                    {m.title}
                    {m.value === 'bulk' && bulkLocked && (
                      <span className="rounded bg-accent-violet/10 px-1.5 text-xs font-semibold leading-5 text-accent-violet">
                        Pro
                      </span>
                    )}
                  </span>
                  <span className="block truncate text-muted">{m.desc}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
