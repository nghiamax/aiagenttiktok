import { useMemo } from 'react';
import { Coins, Tags } from 'lucide-react';
import { formatNumber } from '../../../lib/format';
import NumberField from './NumberField';
import PricingResultCard from './PricingResultCard';
import CategorySection from './CategorySection';
import SectionCard from './SectionCard';
import PlatformPicker from './PlatformPicker';
import FeeScheduleCard from './FeeScheduleCard';
import OrderSourceSection from './OrderSourceSection';
import SourceCompareCard from './SourceCompareCard';
import MarginTargetField from './MarginTargetField';
import BulkCalculator from './bulk/BulkCalculator';
import type { BulkRow } from './bulk/bulkRows';
import {
  computeFromPrice,
  feeTotals,
  LOGISTICS_RULE,
  logisticsFee,
  priceForTarget,
  type ProfitTarget,
  roundUpPrice,
  type PricingInput,
  type Platform,
} from './calc';
import {
  PLATFORM_LABEL,
  profileKey,
  RECENT_LIMIT,
  SHOP_TYPE_LABEL,
  type FeeProfile,
  type SavedCategory,
  effectiveCategories,
  hasPromo,
} from './config';
import { applySource, compareSources, sourceDef, type SourceRates } from './orderSource';
import { mergeCategories } from './import/categoryImport';
import { useCategoryTables } from './useCategoryTables';
import { tableOf } from './categoryTables';
import { usePricingConfig, usePricingForm } from './usePricingStore';
import { usePricingMeter } from './usePricingMeter';
import UpgradeCard from '../UpgradeCard';
import { useFinanceQuota } from '../useFinanceQuota';

const SINGLE_ANCHOR = 'pricing-single';

export default function PriceCalculator() {
  const { config, setConfig } = usePricingConfig();
  const { form, update, setForm } = usePricingForm();

  const key = profileKey(form.platform, form.shopType);
  const profile = config.profiles[key];
  // Bảng phí ngành do hệ thống cung cấp (khách không tự tải) + ngành Sếp tự lưu
  const { tables, loading: tablesLoading } = useCategoryTables();
  const platformTables = {
    standard: tableOf(tables, form.platform, 'standard'),
    mall: tableOf(tables, form.platform, 'mall'),
  };
  const sysTable = platformTables[form.shopType];
  const profileLabel = `${PLATFORM_LABEL[form.platform]} · ${SHOP_TYPE_LABEL[form.platform][form.shopType]}`;
  const applyLogistics = form.platform === 'tiktok';
  const source = sourceDef(form.orderSource);
  const rates: SourceRates = useMemo(
    () => ({ adsPct: form.adsPct, affiliatePct: form.affiliatePct, shopAdsAffiliatePct: form.shopAdsAffiliatePct }),
    [form.adsPct, form.affiliatePct, form.shopAdsAffiliatePct],
  );

  // Phí ngành lấy theo bảng của sàn + loại shop đang chọn (đổi Shop tiêu chuẩn ↔ Mall tự đổi % đúng)
  // Shopee Shop thường: bảng phí có mức ưu đãi người bán mới → công tắc "Người bán mới"
  const promoAvailable = hasPromo(sysTable.categories);
  const usingPromo = form.newSeller && promoAvailable;
  const categories = useMemo(
    () => effectiveCategories(mergeCategories(sysTable.categories, profile.categories), usingPromo),
    [sysTable.categories, profile.categories, usingPromo],
  );
  const defaultCategoryPct = sysTable.defaultPct;
  const selectedCategory = form.categoryId ? (categories.find((c) => c.id === form.categoryId) ?? null) : null;
  // Đang tải bảng phí → giữ % đã lưu, chưa báo "không có trong bảng"
  const missingCategory = !tablesLoading && form.categoryId != null && !selectedCategory;
  const categoryPct = selectedCategory ? selectedCategory.pct : missingCategory ? 0 : form.categoryPct;

  /** Chưa áp nguồn đơn (quảng cáo / hoa hồng tính theo nguồn) */
  const baseInput: PricingInput = useMemo(
    () => ({
      cost: form.cost,
      categoryPct,
      fees: profile.fees,
      adsPct: 0,
      taxPct: config.taxPct,
      weightKg: form.weightKg,
      applyLogistics,
    }),
    [form.cost, categoryPct, profile.fees, config.taxPct, form.weightKg, applyLogistics],
  );
  const input = useMemo(() => applySource(baseInput, form.orderSource, rates), [baseInput, form.orderSource, rates]);
  const target: ProfitTarget = useMemo(
    () =>
      form.marginKind === 'amount'
        ? { kind: 'amount', value: form.marginAmount }
        : { kind: 'pct', value: form.marginPct },
    [form.marginKind, form.marginAmount, form.marginPct],
  );
  const targetLabel =
    target.kind === 'amount' ? `${formatNumber(target.value)}đ / sp` : `${formatNumber(target.value, 2)}%`;
  const compareRows = useMemo(
    () => compareSources(baseInput, rates, form.mode, target, form.price),
    [baseInput, rates, form.mode, target, form.price],
  );

  const { result, exactPrice, error } = useMemo(() => {
    if (form.mode === 'price') {
      if (form.cost <= 0) return { result: null, exactPrice: null, error: null };
      const exact = priceForTarget(target, input);
      if (exact == null) {
        const fees = feeTotals(input).pct;
        return {
          result: null,
          exactPrice: null,
          error:
            target.kind === 'pct'
              ? `Tổng % phí và % lãi mong muốn là ${formatNumber(fees + target.value, 1)}% — từ 100% trở lên thì không có giá bán nào đạt. Giảm % lãi, % quảng cáo hoặc % hoa hồng.`
              : `Tổng % phí là ${formatNumber(fees, 1)}% — từ 100% trở lên thì không có giá bán nào đạt. Giảm % quảng cáo hoặc % hoa hồng.`,
        };
      }
      const rounded = roundUpPrice(exact);
      return { result: computeFromPrice(rounded, input), exactPrice: exact, error: null };
    }
    if (form.price <= 0) return { result: null, exactPrice: null, error: null };
    return { result: computeFromPrice(form.price, input), exactPrice: null, error: null };
  }, [form.mode, form.cost, target, form.price, input]);

  // Gói Miễn phí: mỗi kết quả mới = 1 lượt (server đếm); hết lượt → khoá kết quả mới
  const signature = useMemo(
    () =>
      result
        ? JSON.stringify(
            form.mode === 'price' ? { m: 'price', input, target } : { m: 'profit', input, price: form.price },
          )
        : null,
    [result, form.mode, input, target, form.price],
  );
  const { locked } = usePricingMeter(signature);
  const { quota, loading: quotaLoading } = useFinanceQuota();
  const bulkAllowed = !!quota?.bulk;

  const warnings = useMemo(() => {
    const w: string[] = [];
    if (missingCategory) w.push(`Ngành đã chọn không có trong bảng phí ${profileLabel} — chọn lại ngành.`);
    else if (categoryPct <= 0) w.push('Chưa chọn ngành hàng / chưa nhập phí ngành.');
    if (profile.fees.every((f) => f.value <= 0))
      w.push(`Chưa nhập các khoản phí của ${profileLabel} (phí thanh toán, dịch vụ…) ở phần Biểu phí.`);
    if (source.affiliate === 'standard' && form.affiliatePct <= 0)
      w.push(`Nguồn "${source.label}" chưa nhập % hoa hồng tiêu chuẩn cho KOC.`);
    if (source.affiliate === 'shopAds' && form.shopAdsAffiliatePct <= 0)
      w.push(`Nguồn "${source.label}" chưa nhập % hoa hồng quảng cáo cửa hàng.`);
    return w;
  }, [missingCategory, categoryPct, profile.fees, profileLabel, source, form.affiliatePct, form.shopAdsAffiliatePct]);

  const updateProfile = (k: typeof key, fn: (p: FeeProfile) => FeeProfile) =>
    setConfig((cfg) => ({ ...cfg, profiles: { ...cfg.profiles, [k]: fn(cfg.profiles[k]) } }));

  const selectCategory = (c: SavedCategory) =>
    setForm((f) => ({
      ...f,
      categoryId: c.id,
      categoryPct: c.pct,
      recentCategoryIds: [c.id, ...f.recentCategoryIds.filter((x) => x !== c.id)].slice(0, RECENT_LIMIT),
    }));

  /** Từ bảng hàng loạt → mở 1 SKU ở chế độ tính 1 sản phẩm để xem chi tiết từng khoản */
  const openSingle = (row: BulkRow) => {
    setForm((f) => ({
      ...f,
      view: 'single',
      mode: row.price ? 'profit' : 'price',
      cost: row.cost ?? 0,
      price: row.price ?? 0,
      categoryId: 'category' in row.category ? row.category.category.id : null,
      categoryPct: row.categoryPct,
      weightKg: row.item.weightG ? row.item.weightG / 1000 : f.weightKg,
    }));
    setTimeout(
      () => document.getElementById(SINGLE_ANCHOR)?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      50,
    );
  };

  // Đổi sàn → bỏ ngành đang chọn (bảng phí ngành mỗi sàn khác nhau)
  const changePlatform = (platform: Platform) =>
    platform !== form.platform && setForm((f) => ({ ...f, platform, categoryId: null, categoryPct: 0 }));

  const weightFee = logisticsFee(form.weightKg);
  const logisticsHint = `Phí vận hành logistics của TikTok từ 12/10/2026: dưới ${LOGISTICS_RULE.freeBelowKg}kg miễn phí, từ ${
    LOGISTICS_RULE.freeBelowKg
  }kg là ${formatNumber(LOGISTICS_RULE.baseFee)}đ, +${formatNumber(LOGISTICS_RULE.stepFee)}đ mỗi ${formatNumber(
    LOGISTICS_RULE.stepKg,
    1,
  )}kg, tối đa ${formatNumber(LOGISTICS_RULE.maxFee)}đ/đơn.`;
  const bulk = form.view === 'bulk';

  const setup = (
    <>
      <PlatformPicker
        platform={form.platform}
        shopType={form.shopType}
        mode={form.mode}
        view={form.view}
        onPlatform={changePlatform}
        onShopType={(shopType) => update('shopType', shopType)}
        onMode={(m) => setForm((f) => (m === 'bulk' ? { ...f, view: 'bulk' } : { ...f, view: 'single', mode: m }))}
        bulkLocked={!quotaLoading && !bulkAllowed}
      />
      <FeeScheduleCard
        key={key}
        platform={form.platform}
        shopType={form.shopType}
        profile={profile}
        tables={platformTables}
        tablesLoading={tablesLoading}
        taxPct={config.taxPct}
        onFees={(fees) => updateProfile(key, (p) => ({ ...p, fees }))}
        onTax={(taxPct) => setConfig((cfg) => ({ ...cfg, taxPct }))}
      />
    </>
  );

  if (bulk) {
    return (
      <div className="space-y-4">
        {setup}
        {!bulkAllowed ? (
          quotaLoading ? null : (
            <UpgradeCard reason="bulk" />
          )
        ) : (
          <BulkCalculator
            platform={form.platform}
            onPlatform={changePlatform}
            profileLabel={`${profileLabel}${usingPromo ? ' (ưu đãi người bán mới)' : ''} · nguồn ${source.label}`}
            categories={categories}
            defaultCategoryPct={defaultCategoryPct}
            fees={profile.fees}
            taxPct={config.taxPct}
            applyLogistics={applyLogistics}
            adsEnabled={source.ads}
            adsPct={input.adsPct}
            affiliatePct={input.affiliatePct ?? 0}
            marginPct={form.marginPct}
            onAdsPct={(v) => update('adsPct', v)}
            onMarginPct={(v) => update('marginPct', v)}
            onOpenSingle={openSingle}
          />
        )}
      </div>
    );
  }

  return (
    <div id={SINGLE_ANCHOR} className="grid scroll-mt-20 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-4">
        {setup}

        <SectionCard
          icon={Tags}
          title="Ngành hàng"
          hint={`Tìm trong bảng phí ${profileLabel}${
            categories.length ? ` (${formatNumber(categories.length)} ngành)` : ''
          }, hoặc nhập % tay ở ô bên phải.`}
        >
          <CategorySection
            categories={categories}
            defaultCategoryPct={defaultCategoryPct}
            promoAvailable={promoAvailable}
            newSeller={usingPromo}
            onNewSeller={(v) => update('newSeller', v)}
            profileLabel={profileLabel}
            selectedId={selectedCategory?.id ?? null}
            pct={categoryPct}
            recentIds={form.recentCategoryIds}
            onSelect={selectCategory}
            onClear={() => setForm((f) => ({ ...f, categoryId: null, categoryPct: 0 }))}
            onPctChange={(pct) => setForm((f) => ({ ...f, categoryPct: pct, categoryId: null }))}
            onAddCategory={(c) => {
              updateProfile(key, (p) => ({ ...p, categories: mergeCategories(p.categories, [c]) }));
              selectCategory(c);
            }}
          />
        </SectionCard>

        <SectionCard
          icon={Coins}
          title="Sản phẩm"
          hint={
            form.mode === 'price'
              ? 'Giá vốn, lãi mong muốn (theo % giá bán hoặc số tiền mỗi sản phẩm).'
              : 'Giá vốn và giá đang bán / định bán.'
          }
        >
          <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
            <NumberField
              label="Giá vốn mỗi sản phẩm"
              value={form.cost}
              onChange={(v) => update('cost', v)}
              suffix="đ"
            />
            {form.mode === 'profit' && (
              <NumberField label="Giá bán" value={form.price} onChange={(v) => update('price', v)} suffix="đ" />
            )}
            {applyLogistics && (
              <div>
                <NumberField
                  label="Cân nặng mỗi đơn"
                  value={form.weightKg}
                  onChange={(v) => update('weightKg', v)}
                  suffix="kg"
                  decimals={2}
                />
                <p
                  className={`mt-1 text-sm ${weightFee === 0 ? 'text-accent-green' : 'text-amber-700'}`}
                  title={logisticsHint}
                >
                  {weightFee === 0
                    ? `Miễn phí logistics (dưới ${LOGISTICS_RULE.freeBelowKg}kg)`
                    : `Phí logistics TikTok ${formatNumber(weightFee)}đ / đơn`}
                </p>
              </div>
            )}
            {form.mode === 'price' && (
              <div className={applyLogistics ? 'sm:col-span-2' : ''}>
                <MarginTargetField
                  kind={form.marginKind}
                  pct={form.marginPct}
                  amount={form.marginAmount}
                  onKind={(k) => update('marginKind', k)}
                  onPct={(v) => update('marginPct', v)}
                  onAmount={(v) => update('marginAmount', v)}
                />
              </div>
            )}
          </div>
        </SectionCard>

        <OrderSourceSection
          source={form.orderSource}
          rates={rates}
          onSource={(s) => update('orderSource', s)}
          onRates={(patch) => setForm((f) => ({ ...f, ...patch }))}
        />
      </div>

      {/* Kết quả luôn ở cột phải, ngay từ đầu trang */}
      {/* Cột phải dính theo khi cuộn; cao quá màn hình thì cuộn trong cột → 2 bảng luôn xem được */}
      <div className="space-y-2.5 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:pb-2 lg:pr-1">
        {locked ? (
          <UpgradeCard reason="used_up" />
        ) : (
          <>
            <PricingResultCard
              mode={form.mode}
              result={result}
              exactPrice={exactPrice}
              targetLabel={targetLabel}
              error={error}
              warnings={warnings}
              context={[
                profileLabel,
                selectedCategory
                  ? `${selectedCategory.name.split(' › ').pop()} (${formatNumber(categoryPct, 2)}%${
                      usingPromo && selectedCategory.promoPct != null ? ' ưu đãi NB mới' : ''
                    })`
                  : categoryPct > 0
                    ? `Phí ngành ${formatNumber(categoryPct, 2)}%`
                    : null,
                `Nguồn: ${source.label}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            />
            <SourceCompareCard
              rows={compareRows}
              mode={form.mode}
              selected={form.orderSource}
              onSelect={(s) => update('orderSource', s)}
            />
          </>
        )}
      </div>
    </div>
  );
}
