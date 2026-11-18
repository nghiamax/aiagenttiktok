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
- `PageHeader` có `actions` bên phải → `SnapshotInfo` (khoảng ngày của số liệu + giờ cập nhật). Không dùng `DateRangePicker` vì số liệu là snapshot cố định, chọn ngày không có tác dụng.
- `AdsStatsGrid` — 4 KPI chính dạng `StatCard` (Tổng chi phí, Tổng doanh thu, Tổng đơn hàng, ROI — icon `Gauge`, ROI là hệ số không phải %). Mỗi ô có dòng **▲/▼ % so với kỳ liền trước** (`snapshot.previousSummary`; `StatChange.direction`: chi phí trung tính màu xám, còn lại tăng = xanh); thiếu số kỳ trước thì ẩn dòng này. Ô Chi phí có hint "N video có chi tiêu". **Không còn dải chỉ số phụ** (đã bỏ ô "Video đang tăng cường"; quy tắc đang bật + chờ duyệt nằm ở dòng trạng thái hộp Agent).
- `AdsSubNav` (dưới `PageHeader`): **Tổng quan** (`/ads`) | **AI Agent** (`/ads/agent`, kèm số đề xuất chờ duyệt).
- `ActionInbox` — hộp **Agent đang theo dõi** (giữa KPI và card danh sách): trạng thái Agent, tab cấp **Video | Sản phẩm | Chiến dịch** (kèm tổng số, mặc định Video), nút "Sửa định nghĩa nhóm" (tới đúng cấp) + "Mở AI Agent". Mỗi nhóm của cấp đang xem có `showInInbox` là một ô (số đối tượng, chi phí, doanh thu, mô tả điều kiện, quy tắc Agent cùng cấp đang xử lý — `ruleForTrigger(rules, id, level)`); bấm nội dung ô → tab danh sách tương ứng + `action=<id nhóm>` (xoá bộ lọc chiến dịch/sản phẩm/tìm kiếm) và **cuộn xuống card danh sách** (`LIST_ANCHOR`, `scroll-mt-20`). Chip quy tắc dưới ô là link riêng: đã có quy tắc → `/ads/agent?view=rules`; chưa có → "+ Tạo quy tắc" → `/ads/agent?view=rules&add=<level>:<id nhóm>` (AgentPage mở `RuleFormModal` với `initialLevel` / `initialTrigger` rồi xoá `add` khỏi URL). Số liệu 3 cấp tính trong `AdsPage` (`InboxSummary`). Cảnh báo thiếu ROI hoà vốn (ẩn ở tab Chiến dịch); ô của nhóm so với hoà vốn mà đang trống vì thiếu hoà vốn → ghi "Chưa tính được — thiếu ROI hoà vốn" thay vì "0". Nhóm không bật "Hiện ở Tổng quan" thì không hiện ở hộp (xem qua bộ lọc nhóm của bảng danh sách).
  - **Nhóm video do Sếp tự định nghĩa** (`src/pages/ads/groups.ts`, kiểu `GroupDef`). `VideoAction` = id nhóm (string). `classifyVideo` (`classify.ts`) xét `settings.groups` từ trên xuống, khớp nhóm nào trước thì lấy. Loại nhóm: `platform` (Cần ủy quyền — trạng thái TikTok `authorization_needed` + có chi/đơn/DT, **khoá**), `custom` (điều kiện sửa được), `fallback` (Ổn định — còn lại, luôn cuối). Điều kiện: các **cách** nối HOẶC, mỗi cách gồm điều kiện nối VÀ; điều kiện = chỉ số (Chi phí/Doanh thu/Đơn/ROI/CPA) + phép so (≥ > ≤ < =) + số cố định hoặc (chỉ với ROI) `k lần ROI hoà vốn` / `k lần ROI mục tiêu` (UI: `ROI < [1,2] [lần ROI hoà vốn ▾]`). Thiếu hoà vốn/mục tiêu → điều kiện không khớp. Lý do tự sinh từ cách khớp (`reasonFor`). Thẻ sản phẩm và video không chi/không đơn → không phân loại.
  - **Nhóm có ở cả 3 cấp** (cùng kiểu `GroupDef`, cùng cách xét từ trên xuống, mỗi cấp 1 nhóm fallback cuối): `groups` (video), `productGroups` (sản phẩm trong từng chiến dịch — `classifyProduct`), `campaignGroups` (chiến dịch — `classifyCampaign`, có chỉ số **Mức tiêu ngân sách (%)**, không so hoà vốn). `platform` chỉ có ở video. Bối cảnh so điều kiện: `contextForProduct` / `contextForCampaign` trong `classify.ts`.
  - Thiết lập (`src/pages/ads/settings.tsx`, `AdsSettingsProvider` bọc route `ads` qua `AdsLayout` → Tổng quan và AI Agent dùng chung): `breakEvenRoi` theo ID sản phẩm + `groups` / `productGroups` / `campaignGroups` (`groupsOf(settings, level)`, `findGroup(settings, id, level)`). Mặc định từ `src/data/ads-settings.json` (video: Cần ủy quyền, Cắt lỗ, Nhân rộng, Theo dõi, Ổn định · sản phẩm: Lỗ, Sát hoà vốn, Lời, Chưa xác định · chiến dịch: Tiêu hết NS ROI tốt, ROI dưới mục tiêu, Tiêu chậm, Ổn định), lưu **localStorage**. ROI hoà vốn sửa qua `BreakEvenModal`; định nghĩa nhóm sửa ở **AI Agent → tab Nhóm** (chọn cấp Video | Sản phẩm | Chiến dịch). **Không tự điền ROI hoà vốn** — phải do Sếp cung cấp.
- `GmvMaxListCard` — card "Chiến dịch GMV Max", thứ tự: tiêu đề → hàng bộ lọc → 3 tab **Chiến dịch | Sản phẩm | Video** (`ListViewTabs`, ngay trên bảng). Hàng bộ lọc gồm 2 ô chọn có tìm kiếm `FilterSelect` (`src/components/ui/FilterSelect.tsx`): **Chiến dịch** và **Sản phẩm** (chỉ liệt kê sản phẩm của chiến dịch đang chọn; chọn sản phẩm tự đặt chiến dịch; ✕ để bỏ). Tab Video có thêm ô tìm video theo tiêu đề/tài khoản (`q`). Không còn ô tìm theo ID chung. Card không `overflow-hidden` để danh sách thả xuống không bị cắt.
  - Trạng thái nằm trên URL (`useAdsListParams`): `/ads?tab=campaigns|products|videos&campaign=<id>&product=<id>&q=&action=<id nhóm>`. `action` là ID nhóm **của tab đang xem** (video / sản phẩm / chiến dịch) → đổi tab hoặc drill-down thì xoá `action`. Bảng Chiến dịch lọc theo `action` và hiện chip "Nhóm: … ✕" (không có ô chọn nhóm); bảng Sản phẩm / Video lọc bằng segmented nhóm.
  - Drill-down: bấm chiến dịch → tab Sản phẩm lọc theo chiến dịch; bấm sản phẩm → tab Video lọc theo sản phẩm.
  - Card tên "Danh sách GMV Max", dưới tiêu đề có "N chiến dịch · N sản phẩm · N video" theo bộ lọc hiện tại.
  - `CampaignTable` — `CampaignFilterBar` (segmented Tất cả / Đang chạy / Đã tắt kèm số đếm + nút ROI hoà vốn; **không** có nút Quy tắc / Lịch ngân sách / lọc "Có đề xuất" vì chưa có nghiệp vụ), cột: Chiến dịch (+ ID), Trạng thái, Nhóm (badge; chưa chi tiêu → "Chưa chi tiêu"), Video, Ngân sách/ngày, Tiêu NS (% = chi TB/ngày ÷ ngân sách, `contextForCampaign`), Chi phí, Doanh thu, Đơn hàng, ROI (đỏ khi dưới mục tiêu), ROI mục tiêu. Sắp xếp cột số.
  - `ProductTable` — cột: Sản phẩm, Chiến dịch, Video, Chi phí, Doanh thu, Đơn hàng, CPA, ROI, ROI hoà vốn (chưa nhập → nút "Nhập" mở `BreakEvenModal`), Nhóm (badge nhóm sản phẩm, tooltip = lý do). Lọc theo nhóm (kèm số đếm), link "Sửa nhóm sản phẩm", sắp xếp cột số.
  - `ActionBadge` nhận `level` (`video` mặc định / `product` / `campaign`).
  - `VideoTable` (tầng quan trọng nhất) — cột: Video (dòng phụ `@authorUsername` nếu có, không thì tên hiển thị không kèm @), Sản phẩm, Nhóm (badge, tooltip = lý do), Trạng thái, Chi phí, Doanh thu, Đơn hàng, CPA, ROI, TikTok (chỉ nút mở video). Lọc theo nhóm (kèm số đếm) + mục "Thẻ sản phẩm (N)" (`action=product_card`); dòng thẻ sản phẩm nền nhạt; dòng Cắt lỗ có vạch đỏ. Bấm tiêu đề video hoặc nút ↗ → mở `tiktok.com/@<authorUsername>/video/<id>` ở tab mới. TikTok **bắt buộc username** (`@/video/<id>` không chạy); thiếu `authorUsername` thì link bị khoá. Không dùng player nhúng `player/v1` (video shop bị "Player authentication failed"). Đã bỏ nút Tăng cường / Tắt video (chưa có nghiệp vụ) — thêm lại khi có backend thực thi. Không có thumbnail: MCP chỉ trả ảnh bìa khi tra từng video của tài khoản shop, link hết hạn ~1 ngày.
  - Phân trang phía client 20 dòng/trang. Rỗng thì hiện empty state. CPA tính trong `src/pages/ads/metrics.ts`.
- **Không** có nút "Quét đề xuất" / tự quét (đã bỏ theo yêu cầu, chưa xác định nghiệp vụ).
- Kiểu dữ liệu ở `src/pages/ads/types.ts`. Chưa có dữ liệu → số liệu hiển thị `--` (dùng `formatVnd` / `formatNumber` trong `src/lib/format.ts`).
- Khi kết nối MCP TikTok for Business: thay `campaigns` / `summary` trong `AdsPage.tsx` bằng dữ liệu thật.

### Trang ADS 24/7 → AI Agent (`src/pages/ads/agent/`, route `/ads/agent?view=pending|log|rules`)

**Giai đoạn hiện tại: chỉ giao diện.** Agent chưa tự chạy (cần backend). Nút Duyệt / Bỏ qua / Hoàn tác / Tạm dừng đều khoá ("Chưa kết nối backend").
- Ý tưởng: phân loại video (`classify.ts`) = Agent "nhìn"; **Quy tắc** biến nhóm thành hành động; quy tắc chế độ **Tắt / Cần duyệt / Tự chạy** (bật Tự chạy luôn hỏi xác nhận). Cần duyệt → **Chờ duyệt**; thực hiện xong → **Nhật ký**.
- `AgentStatusBar`: trạng thái, lần chạy gần nhất, tăng cường hôm nay / trần, thao tác hôm nay / tối đa.
- **Chờ duyệt** (`ProposalList`/`ProposalItem`): thời gian + hạn, hành động, video, số liệu lúc đề xuất + "Vì sao", Duyệt/Bỏ qua, chọn nhiều.
- **Nhật ký** (`ActionLogList`/`ActionLogItem`): thời gian + người làm (Agent tự chạy / Sếp duyệt / Thủ công), hành động + quy tắc + tham số, video (link TikTok, sao chép ID), **Lúc quyết định** vs **Sau thao tác** (ROI ▲▼, "Chờ đủ Nh" nếu chưa qua `evaluateAfterHours`), trạng thái + Hoàn tác. Lọc theo thời gian / hành động / quy tắc / người làm.
- **Hiệu quả** (`?view=impact`, `ImpactView`, `RuleImpactTable`, `LessonList`, `VerdictBadge`; logic thuần ở `agent/evaluate.ts`): chấm từng thao tác từ nhật ký thật — **Đúng/Sai/Chờ đánh giá/Chưa chấm được** + lợi nhuận tác động **ước tính**. Mốc "nếu không làm gì" = chi/DT mỗi ngày trước × số ngày sau; lợi nhuận QC = DT ÷ ROI hoà vốn (ghi lúc quyết định) − chi. Gỡ video: chi tránh được − DT mất ÷ hoà vốn; tăng cường/thêm lại/đổi ngân sách: DT thêm ÷ hoà vốn − chi thêm. Chỉ chấm sau `evaluateAfterHours`; bỏ qua thao tác lỗi/hoàn tác/nhắc việc. KPI (lợi nhuận tác động, tỷ lệ đúng, chi tránh được, DT thêm, số thao tác), bảng theo quy tắc, **Rút kinh nghiệm** (gợi ý khi ≥ 5 thao tác đã chấm: gỡ sai ≥ 30%, tăng cường sai ≥ 40%, Cần duyệt đúng ≥ 80%/≥ 10 → gợi ý Tự chạy, bị bỏ qua ≥ 50%, thiếu hoà vốn), top 3 tốt/sai. Nhật ký có nhãn Đúng/Sai; `AgentStatusBar` và hộp Tổng quan có "Hiệu quả 30 ngày". **Không tạo nhật ký giả để minh hoạ.**
- **Quy tắc** (`RuleCard`, `GuardrailsCard`): mỗi quy tắc có **cấp** `level` (`video` | `product` | `campaign`, thiếu = video). **Mọi cấp đều có dạng Khi [thuộc nhóm cùng cấp] (`trigger`, chọn bằng `GroupPicker`) → Thì [hành động]**; điều kiện chỉ sửa ở tab Nhóm. `conditionSets` trong quy tắc là bản cũ (deprecated) → `trigger` rỗng, thẻ báo "Chưa chọn nhóm" và mở sẵn ô chọn nhóm.
  - Video: Thì = Gỡ video / Tăng cường (đ/ngày × ngày) / Nhắc việc.
  - Sản phẩm: Thì = **Tắt sản phẩm** / **Bật sản phẩm** / Nhắc việc.
  - Chiến dịch: Thì = **Tăng/Giảm ngân sách X%** (`budgetChangePct`, âm = giảm) / **Đổi ROI mục tiêu ±X%** (`roiTargetChangePct`) / Nhắc việc. Mức tiêu ngân sách (%) = chi TB/ngày ÷ ngân sách ngày × 100 (số ngày theo `snapshot.range`).
  - Thẻ quy tắc hiện badge nhóm + mô tả, nút "Đổi nhóm", "N … khớp theo số liệu hiện tại" (`matchRuleTargets` — dùng `classifyVideo/Product/Campaign`), cảnh báo khi % ngân sách vượt giới hạn (`budgetLimitWarning`).
  - Giới hạn an toàn: trần tăng cường/ngày, thao tác tối đa/ngày, chờ mặc định, đánh giá sau N giờ, **tăng ngân sách tối đa %/ngày**, **giảm ngân sách tối đa %/ngày** (mặc định 30%).
  - Ánh xạ MCP (khi có thực thi): Gỡ/Thêm lại video → `gmv_max_creative_update`; Tăng cường → `campaign_gmv_max_session_create`; ngân sách, ROI mục tiêu, bật/tắt sản phẩm → `campaign_gmv_max_update`.
  - Chỉnh trên UI → localStorage (`useAgentConfig`), mặc định từ `src/data/agent.json`. Nút **+ Thêm quy tắc** (`RuleFormModal`): Áp dụng cho (Video/Sản phẩm/Chiến dịch) · Tên · Khi · Thì (theo cấp, `ACTIONS_BY_LEVEL`) · Phạm vi (cấp chiến dịch ẩn ô sản phẩm) (chiến dịch + sản phẩm; chọn sản phẩm tự đặt chiến dịch) · Thời gian chờ · chế độ ban đầu Tắt/Cần duyệt/Tự chạy (Tự chạy hiện cảnh báo vàng). Quy tắc tự tạo có `custom: true`, nhãn "Tự tạo", xoá được; quy tắc mẫu không xoá được. "Khôi phục mặc định" xoá cả quy tắc tự tạo.
- Dữ liệu: `src/data/agent.json` (kiểu `AgentState` trong `agent/types.ts`): `paused`, `lastRunAt`, `guardrails`, `rules` (3 quy tắc mẫu, mặc định Tắt), `proposals`, `actions`. **Không tạo đề xuất/nhật ký mẫu.** Backend/Claude sau này ghi vào đúng cấu trúc này.
- **Nhóm** (`?view=groups&level=video|product|campaign`; `GroupsEditor`, `GroupCard`, `ClauseEditor`): segmented chọn cấp (đổi cấp khi có thay đổi chưa lưu → hỏi), phần ROI hoà vốn theo sản phẩm (ẩn ở cấp chiến dịch) + danh sách nhóm của cấp đó. Chỉ số / mốc so sánh theo `METRICS_BY_LEVEL` / `VALUE_TYPES_BY_LEVEL`. Mỗi nhóm: icon/màu, tên, "Hiện ở Tổng quan" (ô ở tab cấp tương ứng của hộp theo dõi), ↑↓ thứ tự ưu tiên, xoá (chỉ nhóm tự tạo; cảnh báo nếu quy tắc đang dùng), số video khớp tính ngay theo bản nháp, sửa điều kiện. Sửa trên bản nháp → thanh "Có thay đổi chưa lưu" → Lưu. Nút Thêm nhóm (chèn trên nhóm fallback), Khôi phục mặc định. Quy tắc trỏ tới nhóm đã xoá → thẻ quy tắc báo "Nhóm đã bị xoá".
- Số "quy tắc đang bật / tổng" và "chờ duyệt" ở dòng trạng thái hộp "Agent đang theo dõi" (Tổng quan) lấy từ dữ liệu Agent.

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
- Mục **AI Agent** trên web chỉ hiển thị. Quy tắc đặt "Tự chạy" trên UI **không** phải là sự cho phép để Claude thao tác: mọi thao tác ghi (`gmv_max_creative_update`, `campaign_gmv_max_session_create`, `campaign_gmv_max_update`…) vẫn cần Sếp xác nhận rõ ràng từng lần trong cuộc trò chuyện.
- Web app **không** gọi MCP trực tiếp từ frontend. Hiển thị số liệu thật tự động cần backend giữ token (giai đoạn sau).

### Cập nhật số liệu trang ADS 24/7 (giai đoạn hiện tại)

Trang ADS 24/7 đọc `src/data/ads-snapshot.json` (kiểu `AdsSnapshot` trong `src/pages/ads/types.ts`). Khi Sếp yêu cầu "cập nhật số liệu ADS":
1. Dùng MCP `tiktok-ads` (**chỉ tool đọc**) lấy dữ liệu chiến dịch GMV Max sản phẩm trong khoảng ngày được yêu cầu (mặc định 7 ngày gần nhất, tính đến hôm qua).
2. Ghi đè `src/data/ads-snapshot.json`: `updatedAt` (ISO), `range`, `advertiser`, `summary`, `previousSummary` (tổng của kỳ liền trước cùng số ngày — gọi `gmv_max_report_get` `dimensions:["campaign_id"]` + `enable_total_metrics`, lấy `total_metrics`; kèm `range`, `roi` = DT ÷ chi), `campaigns`, `products` (theo `item_group_id` từng chiến dịch), `videos` (theo `item_id`, kèm `campaignId` + `productId`).
   - `roi` = doanh thu / chi phí. `status`: `running` nếu chiến dịch đang bật, ngược lại `paused`.
   - Chỉ số **không lấy được từ MCP → để `null`** (UI hiện `--`). **Không bịa / ước lượng số liệu.**
   - `pendingSuggestions`, `activeRules`, `totalRules`, `hasSuggestion` là tính năng của app (chưa có) → giữ `null` / `false`.
   - Cách lấy (đã chạy được 17/11/2026): advertiser `7579465349544869906`, store `7496093946365052968` (từ `gmv_max_store_list_get`). Dùng `tool_execute` → `gmv_max_report_get` (GMV Max **không** có trong `report_integrated_get`), metric dùng `cost` / `gross_revenue` / `orders`.
     - Chiến dịch: `dimensions:["campaign_id"]`, `filtering.gmv_max_promotion_types:["PRODUCT"]`, `enable_total_metrics:true` (tổng cho `summary`). Ngân sách = `target_roi_budget`, ROI mục tiêu `targetRoi` = `roas_bid`.
     - Sản phẩm: `dimensions:["item_group_id"]` + `filtering.campaign_ids:[1 chiến dịch]`, metric `product_name`, `product_image_url`.
     - Video: `dimensions:["item_id"]` + `filtering.campaign_ids` **và** `item_group_ids` (gọi riêng từng sản phẩm), metric `title`, `tt_account_name`, `creative_delivery_status`, `shop_content_type`. Kết quả rất lớn (hàng trăm dòng) → xử lý bằng script, không đọc tay.
     - `item_id = -1` / `PRODUCT_CARD` là **thẻ sản phẩm** (không phải video) → `contentType: "product_card"`. Chỉ giữ dòng có chi phí/đơn/doanh thu > 0 hoặc đang phân phối/học/chờ.
     - API trả `roi = 0.00` khi chi phí 0 → tự tính lại `roi`, chi phí 0 thì `null`.
     - Sau khi ghi snapshot, chạy `node scripts/resolve-video-authors.mjs` để điền `authorUsername` (đọc trang video công khai của TikTok, chạy chậm để tránh bị chặn, chỉ tra video còn thiếu). Video riêng tư/đã xoá sẽ không tra được → để `null`. Giữ lại `authorUsername` cũ khi ghi đè snapshot để khỏi tra lại.
3. Nếu MCP trả về thêm chỉ số hữu ích chưa có trên UI, đề xuất với Sếp trước khi thêm cột/ô mới.
4. Chạy `npm run build` để kiểm tra.

---

## 7. Nguyên tắc khi làm việc trong repo

- Không thêm nghiệp vụ, dữ liệu giả, biểu đồ nếu chưa được yêu cầu.
- Giữ phong cách: sáng, tối giản, bo góc mềm, hover nhẹ.
- Mọi text hiển thị bằng tiếng Việt.
- Icon-only button phải có `aria-label`.
- Chạy `npm run build` (bao gồm kiểm tra TypeScript) trước khi báo xong.
