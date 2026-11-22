import { Navigate, Route, Routes } from 'react-router-dom';
import RequireAuth from './auth/RequireAuth';
import AppLayout from './components/layout/AppLayout';
import AdsPage from './pages/ads/AdsPage';
import AgentPage from './pages/ads/agent/AgentPage';
import AdsLayout from './pages/ads/AdsLayout';
import OrdersPage from './pages/orders/OrdersPage';
import KocBookingPage from './pages/koc-booking/KocBookingPage';
import FinancePage from './pages/finance/FinancePage';
import LoginPage from './pages/LoginPage';
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
        <Route index element={<Navigate to="/ads" replace />} />
        <Route path="ads" element={<AdsLayout />}>
          <Route index element={<AdsPage />} />
          <Route path="agent" element={<AgentPage />} />
        </Route>
        <Route path="orders" element={<OrdersPage />} />
        <Route path="koc-booking" element={<KocBookingPage />} />
        <Route path="finance" element={<FinancePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
