import { useCallback, useMemo, useState } from 'react';
import { FolderOpen, Megaphone, Package, Search } from 'lucide-react';
import FilterSelect, { type FilterOption } from '../../components/ui/FilterSelect';
import PageHeader from '../../components/ui/PageHeader';
import snapshotJson from '../../data/ads-snapshot.json';
import { formatNumber } from '../../lib/format';
import { impactTotal } from './agent/evaluate';
import { activeRuleCount, AGENT_DATA, pendingProposals, ruleForTrigger, useAgentConfig } from './agent/useAgentConfig';
import { classifyVideo, shortVnd, type VideoClassification } from './classify';
import ActionInbox, { type ActionSummary } from './components/ActionInbox';
import AdsStatsGrid from './components/AdsStatsGrid';
import AdsSubNav from './components/AdsSubNav';
import BreakEvenModal from './components/BreakEvenModal';
import CampaignTable from './components/CampaignTable';
import GmvMaxListCard from './components/GmvMaxListCard';
import ProductTable from './components/ProductTable';
import SnapshotInfo from './components/SnapshotInfo';
import VideoTable from './components/VideoTable';
import { productKey } from './metrics';
import { breakEvenOf, useAdsSettings } from './settings';
import type { AdsProduct, AdsSnapshot, AdsVideo, VideoAction } from './types';
import { useAdsListParams } from './useAdsListParams';

// Dữ liệu do Claude lấy qua MCP tiktok-ads và ghi vào file JSON (xem CLAUDE.md mục 6)
const snapshot = snapshotJson as AdsSnapshot;
const campaignById = new Map(snapshot.campaigns.map((c) => [c.id, c]));
const productByKey = new Map(snapshot.products.map((p) => [productKey(p.campaignId, p.id), p]));
const productIds = [...new Set(snapshot.products.map((p) => p.id))];

const metricLine = (roi: number | null, cost: number | null) =>
  `ROI ${formatNumber(roi, 2)} · Chi ${cost == null ? '--' : shortVnd(cost)}`;

const campaignOptions: FilterOption[] = snapshot.campaigns.map((c) => ({
  value: c.id,
  label: c.name,
  description: metricLine(c.roi, c.cost),
}));

const emptySummary = (): ActionSummary => ({ count: 0, cost: 0, revenue: 0 });

export default function AdsPage() {
  const { tab, campaignId, productId, query, action, update } = useAdsListParams();
  const { settings, save, reset } = useAdsSettings();
  const { config: agentConfig } = useAgentConfig();
  const pendingCount = pendingProposals().length;
  // Ô "Đề xuất chờ duyệt" và "Quy tắc đang bật" lấy từ dữ liệu Agent
  const statsSummary = {
    ...snapshot.summary,
    pendingSuggestions: pendingCount,
    activeRules: activeRuleCount(agentConfig.rules),
    totalRules: agentConfig.rules.length,
  };
  const [settingsOpen, setSettingsOpen] = useState(false);
  const openSettings = () => setSettingsOpen(true);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  // Phân loại việc cần làm cho toàn bộ video (tính lại khi đổi thiết lập)
  const { classification, inbox } = useMemo(() => {
    const map = new Map<AdsVideo, VideoClassification>();
    // Một mục cho mỗi nhóm Sếp định nghĩa
    const summary: Record<string, ActionSummary> = Object.fromEntries(
      settings.groups.map((g) => [g.id, emptySummary()]),
    );
    for (const v of snapshot.videos) {
      const cls = classifyVideo(v, campaignById.get(v.campaignId), settings);
      if (!cls) continue;
      map.set(v, cls);
      const s = (summary[cls.action] ??= emptySummary());
      s.count += 1;
      s.cost += v.cost ?? 0;
      s.revenue += v.revenue ?? 0;
    }
    return { classification: map, inbox: summary };
  }, [settings]);

  const missingBreakEven = productIds.filter((id) => breakEvenOf(settings, id) == null).length;

  const q = query.trim().toLowerCase();
  const matches = (...fields: (string | null)[]) => !q || fields.some((f) => f?.toLowerCase().includes(q));
  const inCampaign = (id: string) => !campaignId || id === campaignId;

  const campaigns = snapshot.campaigns.filter((c) => inCampaign(c.id));
  const products = snapshot.products.filter((p) => inCampaign(p.campaignId) && (!productId || p.id === productId));
  const videos = snapshot.videos.filter(
    (v) =>
      inCampaign(v.campaignId) && (!productId || v.productId === productId) && matches(v.title, v.id, v.identityName),
  );

  // Drill-down: chiến dịch → sản phẩm → video
  const openCampaign = (id: string) => update({ tab: 'products', campaign: id, product: null });
  const openProduct = (p: AdsProduct) => update({ tab: 'videos', campaign: p.campaignId, product: p.id });
  const filterProduct = (cId: string, pId: string) => update({ campaign: cId, product: pId });
  // Hộp việc cần xử lý đếm trên toàn bộ video → bỏ bộ lọc để danh sách khớp số
  const openAction = (a: VideoAction) =>
    update({ tab: 'videos', action: a, campaign: null, product: null, q: null });

  // Ô chọn sản phẩm: chỉ liệt kê sản phẩm của chiến dịch đang chọn
  const productOptions: FilterOption[] = snapshot.products
    .filter((p) => inCampaign(p.campaignId))
    .map((p) => ({
      value: productKey(p.campaignId, p.id),
      label: p.name,
      description: campaignId
        ? metricLine(p.roi, p.cost)
        : `${campaignById.get(p.campaignId)?.name ?? p.campaignId} · ${metricLine(p.roi, p.cost)}`,
      imageUrl: p.imageUrl,
    }));
  const selectedProduct = productId
    ? ((campaignId && productByKey.get(productKey(campaignId, productId))) ||
      snapshot.products.find((p) => p.id === productId))
    : undefined;

  const changeCampaign = (id: string | null) =>
    // Đổi chiến dịch → bỏ sản phẩm nếu sản phẩm đó không thuộc chiến dịch mới
    update({ campaign: id, product: id && selectedProduct?.campaignId === id ? productId : null });
  const changeProduct = (key: string | null) => {
    const p = key ? productByKey.get(key) : undefined;
    update(p ? { campaign: p.campaignId, product: p.id } : { product: null });
  };

  const filters = (
    <>
      <FilterSelect
        label="Chiến dịch"
        icon={FolderOpen}
        allLabel="Tất cả chiến dịch"
        options={campaignOptions}
        value={campaignId}
        onChange={changeCampaign}
        searchPlaceholder="Gõ tên chiến dịch…"
      />
      <FilterSelect
        label="Sản phẩm"
        icon={Package}
        allLabel="Tất cả sản phẩm"
        options={productOptions}
        value={selectedProduct ? productKey(selectedProduct.campaignId, selectedProduct.id) : null}
        onChange={changeProduct}
        searchPlaceholder="Gõ tên sản phẩm…"
      />
      {tab === 'videos' && (
        <label className="relative block sm:min-w-[220px] sm:flex-1">
          <span className="sr-only">Tìm video</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => update({ q: e.target.value }, true)}
            placeholder="Tìm video theo tiêu đề hoặc tài khoản"
            className="h-11 w-full rounded-xl border border-line bg-white pl-10 pr-4 text-sm outline-none transition placeholder:text-muted hover:border-muted/40 focus:border-primary focus:ring-2 focus:ring-primary-soft"
          />
        </label>
      )}
    </>
  );

  return (
    <>
      <PageHeader
        icon={Megaphone}
        title="ADS 24/7"
        description="Theo dõi và tối ưu chiến dịch GMV Max sản phẩm trên TikTok Ads."
        actions={<SnapshotInfo snapshot={snapshot} />}
      />
      <AdsSubNav pendingCount={pendingCount} />

      <div className="space-y-6">
        <AdsStatsGrid summary={statsSummary} />
        <ActionInbox
          summary={inbox}
          missingBreakEven={missingBreakEven}
          onOpenAction={openAction}
          onOpenSettings={openSettings}
          agent={{
            paused: AGENT_DATA.paused,
            lastRunAt: AGENT_DATA.lastRunAt,
            pendingCount,
            impact30: impactTotal(AGENT_DATA.actions, agentConfig.guardrails.evaluateAfterHours, '30d'),
            ruleFor: (a) => ruleForTrigger(agentConfig.rules, a),
          }}
        />
        <GmvMaxListCard
          tab={tab}
          onTabChange={(t) => update({ tab: t })}
          filters={filters}
        >
          {tab === 'campaigns' && (
            <CampaignTable campaigns={campaigns} onOpenCampaign={openCampaign} onOpenBreakEven={openSettings} />
          )}
          {tab === 'products' && (
            <ProductTable
              products={products}
              campaignById={campaignById}
              onOpenProduct={openProduct}
              onOpenCampaign={openCampaign}
              settings={settings}
              onOpenSettings={openSettings}
            />
          )}
          {tab === 'videos' && (
            <VideoTable
              videos={videos}
              productByKey={productByKey}
              onFilterProduct={filterProduct}
              classification={classification}
              action={action}
              onActionChange={(a) => update({ action: a })}
            />
          )}
        </GmvMaxListCard>
      </div>

      {settingsOpen && (
        <BreakEvenModal
          products={snapshot.products}
          campaignById={campaignById}
          settings={settings}
          onSave={save}
          onReset={reset}
          onClose={closeSettings}
        />
      )}
    </>
  );
}
