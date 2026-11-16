# CLAUDE.md — TikTok Shop Admin Dashboard

Web app quản lý & tự động hóa vận hành kinh doanh trên **TikTok Shop**. Giao diện tiếng Việt, phong cách Admin Dashboard hiện đại, tối giản.

> **Giai đoạn hiện tại: chỉ dựng khung giao diện, bố cục và điều hướng.**
> Không triển khai nghiệp vụ, không kết nối API/MCP, **không tạo dữ liệu giả hay biểu đồ minh họa**, không tự thêm chức năng ngoài phạm vi.

---

## 1. Tech stack & lệnh

- **Vite + React 18 + TypeScript**
- **React Router v6** — routing phía client (không reload trang, URL đổi theo tab)
- **Tailwind CSS v3** — styling
- **lucide-react** — icon
- **Font:** `Be Vietnam Pro` (Google Fonts, nạp trong `index.html`)

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # tsc kiểm tra type + build production
npm run preview
```

---

## 2. Cấu trúc thư mục

```
src/
  main.tsx                    # entry, BrowserRouter
  App.tsx                     # khai báo routes
  index.css                   # Tailwind + style nền
  config/
    navigation.ts             # DANH SÁCH TAB (nguồn duy nhất cho sidebar + tiêu đề)
  components/
    layout/
      AppLayout.tsx           # khung chung: Sidebar + Header + <Outlet/>
      Sidebar.tsx
      Header.tsx
    ui/
      Card.tsx
      PageHeader.tsx          # tiêu đề + mô tả trang
      PlaceholderCard.tsx     # khu vực "đang phát triển"
  pages/
    ads/AdsPage.tsx
    orders/OrdersPage.tsx
    koc-booking/KocBookingPage.tsx
    finance/FinancePage.tsx
    NotFoundPage.tsx
```

Quy tắc:
- Mỗi trang chức năng nằm trong thư mục riêng ở `src/pages/`, độc lập với nhau.
- Không viết nhiều component lớn trong một file. Component dùng chung đặt trong `components/ui/`.
- Tên file component `PascalCase.tsx`, props có type rõ ràng.

---

## 3. Các tab chức năng

| Tab | Route | Icon (lucide) | Mục đích |
|---|---|---|---|
| ADS 24/7 | `/ads` | `Megaphone` | Quản lý & tự động hóa TikTok Ads (sau này dùng MCP TikTok for Business + AI Agent chạy 24/7) |
| Đơn hàng | `/orders` | `ShoppingBag` | Theo dõi đơn hàng TikTok Shop |
| Booking KOC | `/koc-booking` | `Users` | Quản lý booking KOC, tiến độ hợp tác, hiệu quả nội dung |
| Tài chính | `/finance` | `Wallet` | Doanh thu, chi phí, lợi nhuận |

- `/` chuyển hướng về `/ads`. Route không tồn tại → `NotFoundPage`.
- **Thêm tab mới:** thêm 1 mục vào `src/config/navigation.ts` + tạo trang trong `src/pages/` + khai báo route trong `App.tsx`.
- Các trang Đơn hàng, Booking KOC, Tài chính hiện chỉ gồm `PageHeader` + `PlaceholderCard`.

### Trang ADS 24/7 — Auto GMV Product (`src/pages/ads/`)

Đã có giao diện (chưa có nghiệp vụ / dữ liệu). Không bám y hệt ảnh tham chiếu — ưu tiên gọn, thoáng.
- `PageHeader` có `actions` bên phải → đặt `DateRangePicker` (chọn khoảng ngày).
- `AdsStatsGrid` — 4 KPI chính dạng `StatCard` có icon (Tổng chi phí, Tổng doanh thu, Tổng đơn hàng, ROI) + 1 dải chỉ số phụ (Video có chi tiêu 7 ngày, Video đang tăng cường, Đề xuất chờ duyệt, Quy tắc đang bật).
- `CampaignTable` — card có tiêu đề "Chiến dịch GMV Max", `CampaignFilterBar` (segmented: Tất cả / Đang chạy / Đã tắt / Có đề xuất + nút Quy tắc, ROI hoà vốn, Lịch ngân sách), bảng cột: Chiến dịch, Trạng thái, Video, Ngân sách, Chi phí, Doanh thu, Đơn hàng, ROI. Rỗng thì hiện empty state.
- **Không** có nút "Quét đề xuất" / tự quét (đã bỏ theo yêu cầu, chưa xác định nghiệp vụ).
- Kiểu dữ liệu ở `src/pages/ads/types.ts`. Chưa có dữ liệu → số liệu hiển thị `--` (dùng `formatVnd` / `formatNumber` trong `src/lib/format.ts`).
- Khi kết nối MCP TikTok for Business: thay `campaigns` / `summary` trong `AdsPage.tsx` bằng dữ liệu thật.

---

## 4. Thiết kế (bám theo ảnh tham chiếu)

**Light mode, nền trắng/xám rất nhạt, card trắng bo góc, nhiều khoảng trắng, chữ to rõ.**

### Màu (token trong `tailwind.config.js`)

| Token | Giá trị | Dùng cho |
|---|---|---|
| `canvas` | `#F7F8FA` | Nền vùng nội dung |
| `white` | `#FFFFFF` | Sidebar, header, card |
| `line` | `#ECEEF2` | Viền, đường phân cách |
| `ink` | `#111827` | Chữ chính |
| `muted` | `#6B7280` | Chữ phụ |
| `primary` | `#2563EB` (xanh dương) | Màu chủ đạo, tab active, nút chính |
| `primary-soft` | `#EFF4FF` | Nền tab active |
| `accent-violet` | `#7C3AED` | Màu nhấn |
| `accent-green` | `#16A34A` | Màu nhấn |
| `danger` | `#E11D48` | Badge thông báo |

Không hard-code mã màu trong component — dùng token.

### Typography
- `Be Vietnam Pro`, fallback `Inter, system-ui, sans-serif`. Cỡ cơ bản **15–16px**, không dùng dưới 12px.
- Tiêu đề trang `text-2xl md:text-3xl font-bold`, mô tả `text-muted`.

### Hình khối
- Card: `rounded-2xl border border-line bg-white shadow-sm`, hover: `shadow-md`.
- Khoảng cách nội dung: `p-4 md:p-8`, giữa card `gap-6`.
- Mọi phần tử tương tác có hover nhẹ (`transition`, đổi nền/bóng).

---

## 5. Layout

```
┌───────────────┬────────────────────────────────────────────┐
│ Logo + tên    │ [≡] Tên shop/tài khoản     ⚙  🔔•  Avatar   │ ← Header sticky, cao 64px
│               ├────────────────────────────────────────────┤
│ ▣ ADS 24/7    │ Tiêu đề trang                               │
│ ▢ Đơn hàng    │ Mô tả ngắn                                  │
│ ▢ Booking KOC │ ┌──────────── Card ────────────┐            │
│ ▢ Tài chính   │ │ Khu vực đang phát triển       │            │
│               │ └───────────────────────────────┘            │
│ [« Thu gọn]   │                                              │
└───────────────┴────────────────────────────────────────────┘
```

- **Sidebar:** nền trắng, rộng `256px`, thu gọn còn `76px` (chỉ icon, có tooltip `title`). Tab active: nền `primary-soft`, chữ/icon `primary`, `font-semibold`.
- **Header:** sticky, nền trắng, viền dưới; có tên tài khoản, nút cài đặt, chuông thông báo, avatar.
- **Responsive:** desktop ưu tiên. `< lg (1024px)`: sidebar ẩn, mở dạng drawer bằng nút `≡` trên header, có lớp phủ mờ, tự đóng khi chuyển trang.
- Cả 4 tab dùng chung `AppLayout`.

---

## 6. MCP TikTok Ads (dùng trong Claude Code)

- Khai báo ở `.mcp.json`: server `tiktok-ads`, MCP chính thức của TikTok for Business (`tt-ads-mcp-layer`, ~40 tool lõi, tool khác nạp khi cần). Bản đầy đủ ~400 tool: `tt-ads-mcp-flat`.
- Xác thực OAuth bằng tài khoản TikTok for Business qua lệnh `/mcp` (quyền có thể hết hạn sau ~30 ngày → đăng nhập lại).
- **Chỉ đọc dữ liệu** khi chưa có quy trình duyệt. Không gọi tool tạo/sửa/xoá chiến dịch, đổi ngân sách hay bật/tắt quảng cáo nếu Sếp chưa xác nhận rõ ràng trong cuộc trò chuyện.
- Web app **không** gọi MCP trực tiếp từ frontend. Hiển thị số liệu thật tự động cần backend giữ token (giai đoạn sau).

### Cập nhật số liệu trang ADS 24/7 (giai đoạn hiện tại)

Trang ADS 24/7 đọc `src/data/ads-snapshot.json` (kiểu `AdsSnapshot` trong `src/pages/ads/types.ts`). Khi Sếp yêu cầu "cập nhật số liệu ADS":
1. Dùng MCP `tiktok-ads` (**chỉ tool đọc**) lấy dữ liệu chiến dịch GMV Max sản phẩm trong khoảng ngày được yêu cầu (mặc định 7 ngày gần nhất, tính đến hôm qua).
2. Ghi đè `src/data/ads-snapshot.json`: `updatedAt` (ISO), `range`, `advertiser`, `summary`, `campaigns`.
   - `roi` = doanh thu / chi phí. `status`: `running` nếu chiến dịch đang bật, ngược lại `paused`.
   - Chỉ số **không lấy được từ MCP → để `null`** (UI hiện `--`). **Không bịa / ước lượng số liệu.**
   - `pendingSuggestions`, `activeRules`, `totalRules`, `hasSuggestion` là tính năng của app (chưa có) → giữ `null` / `false`.
3. Nếu MCP trả về thêm chỉ số hữu ích chưa có trên UI, đề xuất với Sếp trước khi thêm cột/ô mới.
4. Chạy `npm run build` để kiểm tra.

---

## 7. Nguyên tắc khi làm việc trong repo

- Không thêm nghiệp vụ, dữ liệu giả, biểu đồ nếu chưa được yêu cầu.
- Giữ phong cách: sáng, tối giản, bo góc mềm, hover nhẹ.
- Mọi text hiển thị bằng tiếng Việt.
- Icon-only button phải có `aria-label`.
- Chạy `npm run build` (bao gồm kiểm tra TypeScript) trước khi báo xong.
