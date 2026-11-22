import { useCallback, useMemo, useState } from 'react';
import { FolderOpen, Megaphone, Package, Search } from 'lucide-react';
import FilterSelect, { type FilterOption } from '../../components/ui/FilterSelect';
import PageHeader from '../../components/ui/PageHeader';
import { formatNumber } from '../../lib/format';
import { impactTotal } from './agent/evaluate';
import { useAgentStore } from './agent/agentStore';
import { activeRuleCount, pendingProposals, ruleForTrigger } from './agent/useAgentConfig';
import { shortVnd } from './classify';
import { useTrend } from './trend';
import type { TrendInfo } from '../../../shared/trend';
import ActionInbox, { type ActionSummary, type InboxSummary } from './components/ActionInbox';
import AdsStatsGrid from './components/AdsStatsGrid';
import AdsSubNav from './components/AdsSubNav';
import BreakEvenModal from './components/BreakEvenModal';
import CampaignTable from './components/CampaignTable';
import GmvMaxListCard, { LIST_ANCHOR } from './components/GmvMaxListCard';
import ProductTable from './components/ProductTable';
import SuggestionBanner from './components/SuggestionBanner';
import AdsRangeControl from './components/AdsRangeControl';
import VideoTable from './components/VideoTable';
import { SIGNAL_ANCHOR } from './components/SignalDivider';
import { useAdsData } from './data';
import { offsetOf } from '../../../shared/agentMatch';
import { productKey } from './metrics';
import type { GroupLevel } from './groups';
import { breakEvenOf, useAdsSettings } from './settings';
import type { AdsListTab, AdsProduct, AdsVideo, VideoAction } from './types';

/** Ghi chú dưới ô (đếm 1 lần theo key): nhóm "kéo dài 30 ngày" / nhóm 7 ngày chưa được 14 ngày xác nhận */
function markIn(summary: Record<string, ActionSummary>, groupId: string, key: string, seen: Set<string>, field: 'long' | 'unconfirmed') {
  const k = `${field}|${groupId}|${key}`;
  if (seen.has(k)) return;
  seen.add(k);
  const s = (summary[groupId] ??= emptySummary());
  s[field] = (s[field] ?? 0) + 1;
}
import { useAdsListParams } from './useAdsListParams';

const metricLine = (roi: number | null, cost: number | null) =>
  `ROI ${formatNumber(roi, 2)} · Chi ${cost == null ? '--' : shortVnd(cost)}`;

const emptySummary = (): ActionSummary => ({ count: 0, rows: 0, cost: 0, revenue: 0 });

/** Đối tượng đã xử lý / không làm được → ghi vào `skipped` (đếm 1 lần theo key), không tính số / chi / DT */
function skipIn(summary: Record<string, ActionSummary>, groupId: string, key: string, seen: Set<string>) {
  const k = `skip|${groupId}|${key}`;
  if (seen.has(k)) return;
  seen.add(k);
  const s = (summary[groupId] ??= emptySummary());
  s.skipped = (s.skipped ?? 0) + 1;
}

/**
 * Cộng một dòng đã phân loại vào ô của nhóm. key: đếm theo đối tượng khác nhau (video gắn nhiều sản phẩm
 * có nhiều dòng → đếm 1, giống cách Agent / Gợi ý đếm); chi phí / doanh thu vẫn cộng mọi dòng.
 */
function addTo(
  summary: Record<string, ActionSummary>,
  groupId: string,
  cost: number | null,
  revenue: number | null,
  key?: string,
  seen?: Set<string>,
) {
  const s = (summary[groupId] ??= emptySummary());
  s.rows += 1;
  const k = key && `${groupId}|${key}`;
  if (!k || !seen?.has(k)) {
    s.count += 1;
    if (k) seen?.add(k);
  }
  s.cost += cost ?? 0;
  s.revenue += revenue ?? 0;
}

/** Tab danh sách tương ứng với cấp của nhóm */
const TAB_OF_LEVEL: Record<GroupLevel, AdsListTab> = { video: 'videos', product: 'products', campaign: 'campaigns' };

export default function AdsPage() {
  const { tab, campaignId, productId, query, action, update } = useAdsListParams();
  const { settings, save, reset } = useAdsSettings();
  // Số liệu theo khoảng ngày đang chọn (server lấy qua MCP TikTok; chưa có server → file lưu sẵn)
  const { snapshot } = useAdsData();
  const { campaignById, productByKey, productIds, campaignOptions } = useMemo(
    () => ({
      campaignById: new Map(snapshot.campaigns.map((c) => [c.id, c])),
      productByKey: new Map(snapshot.products.map((p) => [productKey(p.campaignId, p.id), p])),
      productIds: [...new Set(snapshot.products.map((p) => p.id))],
      campaignOptions: snapshot.campaigns.map<FilterOption>((c) => ({
        value: c.id,
        label: c.name,
        description: metricLine(c.roi, c.cost),
      })),
    }),
    [snapshot],
  );
  const { state: agentState } = useAgentStore();
  const pendingCount = pendingProposals(agentState.proposals).length;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const openSettings = () => setSettingsOpen(true);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  // Hộp theo dõi: nhóm ĐÃ XÁC NHẬN theo 7 · 14 · 30 ngày đến hôm qua (cùng khung Agent xét, không đổi theo ô chọn ngày).
  // Chưa xác nhận (7 ngày khác 14 ngày) → không tính, chỉ ghi chú dưới ô của nhóm 7 ngày
  const trends = useTrend();
  const inbox = useMemo(() => {
    const d7 = trends.snaps.d7;
    const campaigns7 = new Map(d7.campaigns.map((c) => [c.id, c]));
    const summary: InboxSummary = { video: {}, product: {}, campaign: {} };
    const seenVideos = new Set<string>();
    const seen = new Set<string>();
    const cutRows = new Map<string, Set<AdsVideo>>();
    const running = (id: string) => campaigns7.get(id)?.status === 'running';
    /** Nhóm đã xác nhận; chưa xác nhận → ghi chú, trả null */
    const confirmedGroup = (bucket: Record<string, ActionSummary>, t: TrendInfo | undefined, key: string) => {
      if (!t) return null;
      if (t.unconfirmed && t.g7) markIn(bucket, t.g7, key, seen, 'unconfirmed');
      if (t.group && t.long) markIn(bucket, t.group, key, seen, 'long');
      return t.group;
    };
    for (const v of d7.videos) {
      if (v.contentType !== 'video') continue;
      const key = `${v.campaignId}/${v.id}`;
      const group = confirmedGroup(summary.video, trends.video(v), key);
      if (!group) continue;
      // Video đã gỡ / thuộc chiến dịch đã tắt → Agent không làm gì được, không tính vào hộp theo dõi (bảng vẫn hiện)
      if (v.status === 'excluded' || !running(v.campaignId)) {
        skipIn(summary.video, group, key, seen);
        continue;
      }
      addTo(summary.video, group, v.cost, v.revenue, key, seenVideos);
      if (group === 'cut') (cutRows.get(key) ?? cutRows.set(key, new Set()).get(key)!).add(v);
    }
    // Cắt lỗ nhưng tổng video (gồm đơn bù ở sản phẩm khác trong chiến dịch) vẫn có lời → ghi chú dưới ô, số đếm giữ nguyên
    for (const [k, rows] of cutRows) {
      const [c, id] = k.split('/');
      if (offsetOf(d7, settings, c, id, rows)?.profitable) {
        const s = summary.video.cut;
        if (s) s.keepsProfit = (s.keepsProfit ?? 0) + 1;
      }
    }
    for (const p of d7.products) {
      const key = `${p.campaignId}/${p.id}`;
      const group = confirmedGroup(summary.product, trends.product(p), key);
      if (!group) continue;
      if (!running(p.campaignId)) skipIn(summary.product, group, key, seen);
      else addTo(summary.product, group, p.cost, p.revenue);
    }
    for (const c of d7.campaigns) {
      const group = confirmedGroup(summary.campaign, trends.campaign(c), c.id);
      if (!group) continue;
      if (c.status !== 'running') skipIn(summary.campaign, group, c.id, seen);
      else addTo(summary.campaign, group, c.cost, c.revenue);
    }
    return summary;
  }, [settings, trends]);

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

  // Drill-down: chiến dịch → sản phẩm → video. `action` là ID nhóm của tab đang xem → đổi tab thì bỏ
  const openCampaign = (id: string) => update({ tab: 'products', campaign: id, product: null, action: null });
  const openProduct = (p: AdsProduct) =>
    update({ tab: 'videos', campaign: p.campaignId, product: p.id, action: null });
  const filterProduct = (cId: string, pId: string) => update({ campaign: cId, product: pId });
  // Hộp theo dõi đếm trên toàn bộ dữ liệu → bỏ bộ lọc để danh sách khớp số
  const openAction = (level: GroupLevel, id: VideoAction, focus?: 'signals') => {
    update({ tab: TAB_OF_LEVEL[level], action: id, campaign: null, product: null, q: null });
    // Bảng nằm dưới hộp theo dõi → cuộn xuống để thấy ngay kết quả lọc (đợi bảng vẽ lại xong);
    // bấm "+N có dấu hiệu" → cuộn tới dải "Dấu hiệu" (trang 1 có dải thì tới đó, không thì tới đầu bảng)
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        (document.getElementById(focus === 'signals' ? SIGNAL_ANCHOR : LIST_ANCHOR) ?? document.getElementById(LIST_ANCHOR))?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        }),
      ),
    );
  };

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
        actions={<AdsRangeControl />}
      />
      <AdsSubNav pendingCount={pendingCount} />

      <div className="space-y-6">
        <AdsStatsGrid summary={snapshot.summary} previous={snapshot.previousSummary} />
        <SuggestionBanner />
        <ActionInbox
          summary={inbox}
          missingBreakEven={missingBreakEven}
          onOpenAction={openAction}
          onOpenSettings={openSettings}
          agent={{
            paused: agentState.paused,
            lastRunAt: agentState.lastRunAt,
            pendingCount,
            activeRules: activeRuleCount(agentState.rules),
            totalRules: agentState.rules.length,
            impact30: impactTotal(agentState.actions, agentState.guardrails.evaluateAfterHours, '30d'),
            ruleFor: (level, id) => ruleForTrigger(agentState.rules, id, level),
          }}
        />
        <GmvMaxListCard
          tab={tab}
          onTabChange={(t) => update({ tab: t, action: null })}
          filters={filters}
          counts={{
            campaigns: campaigns.length,
            products: products.length,
            videos: videos.filter((v) => v.contentType === 'video').length,
          }}
        >
          {tab === 'campaigns' && (
            <CampaignTable
              campaigns={campaigns}
              onOpenCampaign={openCampaign}
              onOpenBreakEven={openSettings}
              groupId={action === 'all' ? null : action}
              onClearGroup={() => update({ action: null })}
            />
          )}
          {tab === 'products' && (
            <ProductTable
              products={products}
              campaignById={campaignById}
              onOpenProduct={openProduct}
              onOpenCampaign={openCampaign}
              settings={settings}
              onOpenSettings={openSettings}
              action={action}
              onActionChange={(a) => update({ action: a })}
            />
          )}
          {tab === 'videos' && (
            <VideoTable
              videos={videos}
              productByKey={productByKey}
              campaignById={campaignById}
              onFilterProduct={filterProduct}
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
