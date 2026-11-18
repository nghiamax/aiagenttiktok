import { Outlet } from 'react-router-dom';
import { AgentStoreProvider } from './agent/agentStore';
import { AdsDataProvider } from './data';
import { AdsSettingsProvider } from './settings';

/** Khung chung của ADS 24/7 (Tổng quan + AI Agent): số liệu theo ngày + thiết lập phân loại + dữ liệu Agent (server) */
export default function AdsLayout() {
  return (
    <AdsDataProvider>
      <AdsSettingsProvider>
        <AgentStoreProvider>
          <Outlet />
        </AgentStoreProvider>
      </AdsSettingsProvider>
    </AdsDataProvider>
  );
}
