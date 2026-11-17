import { Outlet } from 'react-router-dom';
import { AdsSettingsProvider } from './settings';

/** Khung chung của ADS 24/7 (Tổng quan + AI Agent): dùng chung thiết lập phân loại */
export default function AdsLayout() {
  return (
    <AdsSettingsProvider>
      <Outlet />
    </AdsSettingsProvider>
  );
}
