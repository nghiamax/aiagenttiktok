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
        <Route
          path="ads"
          element={
            <RequirePermission permission="view">
              <AdsLayout />
            </RequirePermission>
          }
        >
          <Route index element={<AdsPage />} />
          <Route path="agent" element={<AgentPage />} />
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
