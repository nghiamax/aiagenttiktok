import { Navigate, Route, Routes } from 'react-router-dom';
import RequireAuth from './auth/RequireAuth';
import RequirePermission, { HomeRedirect } from './auth/RequirePermission';
import AppLayout from './components/layout/AppLayout';
import AdsPage from './pages/ads/AdsPage';
import AgentPage from './pages/ads/agent/AgentPage';
import AdsLayout from './pages/ads/AdsLayout';
import OrdersPage from './pages/orders/OrdersPage';
import KocBookingPage from './pages/koc-booking/KocBookingPage';
import FinancePage from './pages/finance/FinancePage';
import PriceCalculator from './pages/finance/pricing/PriceCalculator';
import ProfitPage from './pages/finance/profit/ProfitPage';
import LoginPage from './pages/LoginPage';
import UsersPage from './pages/admin/UsersPage';
import PlansPage from './pages/upgrade/PlansPage';
import AccountsLayout, { ShopeeAccountsPage, TikTokAccountsPage } from './pages/accounts/AccountsPages';
import NotFoundPage from './pages/NotFoundPage';
import CareAdsLayout from './pages/care-ads/CareAdsLayout';
import LivestreamPage from './pages/care-ads/LivestreamPage';
import LegacyAgentRedirect from './pages/care-ads/LegacyAgentRedirect';
import TikTokDonePage from './pages/TikTokDonePage';

export default function App() {
  return (
    <Routes>
      <Route path="login" element={<LoginPage />} />
      {/* TikTok chuyển về sau khi cho phép — không cần đăng nhập web (tab mới / trình duyệt khác) */}
      <Route path="tiktok/done" element={<TikTokDonePage />} />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<HomeRedirect />} />
        {/* Quản lí chiến dịch + Care Ads 24/7 dùng chung AdsLayout (số liệu, thiết lập, dữ liệu Agent) */}
        <Route
          element={
            <RequirePermission permission="view">
              <AdsLayout />
            </RequirePermission>
          }
        >
          <Route path="ads" element={<AdsPage />} />
          {/* Link cũ AI Agent → Care Ads 24/7 / GMV Max sản phẩm (giữ ?view=) */}
          <Route path="ads/agent" element={<LegacyAgentRedirect />} />
          <Route path="care-ads" element={<CareAdsLayout />}>
            <Route index element={<Navigate to="product" replace />} />
            <Route path="product" element={<AgentPage />} />
            <Route path="live" element={<LivestreamPage />} />
          </Route>
        </Route>
        <Route
          path="orders"
          element={
            <RequirePermission permission="view">
              <OrdersPage />
            </RequirePermission>
          }
        />
        <Route
          path="koc-booking"
          element={
            <RequirePermission permission="view">
              <KocBookingPage />
            </RequirePermission>
          }
        />
        <Route
          path="accounts"
          element={
            <RequirePermission permission="finance">
              <AccountsLayout />
            </RequirePermission>
          }
        >
          <Route index element={<Navigate to="tiktok" replace />} />
          <Route path="tiktok" element={<TikTokAccountsPage />} />
          <Route path="shopee" element={<ShopeeAccountsPage />} />
        </Route>
        <Route
          path="upgrade"
          element={
            <RequirePermission permission="finance">
              <PlansPage />
            </RequirePermission>
          }
        />
        <Route
          path="admin/users"
          element={
            <RequirePermission permission="manage_users">
              <UsersPage />
            </RequirePermission>
          }
        />
        <Route
          path="finance"
          element={
            <RequirePermission permission="finance">
              <FinancePage />
            </RequirePermission>
          }
        >
          <Route index element={<Navigate to="pricing" replace />} />
          <Route path="pricing" element={<PriceCalculator />} />
          <Route path="profit" element={<ProfitPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
