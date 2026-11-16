import { useState } from 'react';
import { Megaphone } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import snapshotJson from '../../data/ads-snapshot.json';
import AdsStatsGrid from './components/AdsStatsGrid';
import CampaignTable from './components/CampaignTable';
import SnapshotInfo from './components/SnapshotInfo';
import type { AdsSnapshot, Campaign, CampaignFilter } from './types';

// Dữ liệu do Claude lấy qua MCP tiktok-ads và ghi vào file JSON (xem CLAUDE.md mục 6)
const snapshot = snapshotJson as AdsSnapshot;

function filterCampaigns(list: Campaign[], filter: CampaignFilter): Campaign[] {
  switch (filter) {
    case 'running':
      return list.filter((c) => c.status === 'running');
    case 'paused':
      return list.filter((c) => c.status === 'paused');
    case 'suggested':
      return list.filter((c) => c.hasSuggestion);
    default:
      return list;
  }
}

export default function AdsPage() {
  const [filter, setFilter] = useState<CampaignFilter>('all');

  return (
    <>
      <PageHeader
        icon={Megaphone}
        title="ADS 24/7"
        description="Theo dõi và tối ưu chiến dịch GMV Max sản phẩm trên TikTok Ads."
        actions={<SnapshotInfo snapshot={snapshot} />}
      />

      <div className="space-y-6">
        <AdsStatsGrid summary={snapshot.summary} />
        <CampaignTable
          campaigns={filterCampaigns(snapshot.campaigns, filter)}
          filter={filter}
          onFilterChange={setFilter}
        />
      </div>
    </>
  );
}
