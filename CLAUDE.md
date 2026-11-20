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
npm run dev       # web http://localhost:5173
npm run server    # API http://127.0.0.1:8787 (Express + tsx watch)
npm run dev:all   # chạy cả web + API
npm run login     # đăng nhập TikTok for Business cho server (mở trình duyệt, lưu .secrets/tiktok-mcp.json)
npm test          # kiểm thử tự động (Vitest, tests/) — không gọi TikTok, không đụng server-data thật
npm run build     # tsc kiểm tra type (web + server + tests) + build production
npm run preview
```

- Server: **Express 4 + TypeScript** chạy bằng `tsx`. Vite proxy `/api` → `127.0.0.1:8787`.
- `node_modules/`, `dist/`, `.secrets/`, `server-data/` **không** nằm trong Git. Máy khác sau khi pull: `npm install` → `npm run login` (đăng nhập TikTok riêng cho máy đó) → `npm run dev:all`.

---

## 2. Cấu trúc thư mục

```
shared/
  adsSnapshot.ts              # kiểu AdsSnapshot/Campaign/AdsProduct/AdsVideo dùng chung web + server
                              # (src/pages/ads/types.ts re-export)
server/                       # API Node (xem mục 6)
  index.ts  config.ts  login.ts  tsconfig.json
  tiktok/auth.ts              # token, tự gia hạn
  tiktok/mcpClient.ts         # gọi MCP, READ_TOOLS (chỉ tool đọc)
  tiktok/writeTools.ts        # WRITE_TOOLS (3 tool ghi) — chỉ agent/executor.ts gọi
  agent/engine.ts scheduler.ts executor.ts  # quét → đề xuất; thực thi khi Sếp duyệt + xác nhận
  ads/buildSnapshot.ts        # dựng AdsSnapshot theo khoảng ngày
  ads/mapping.ts  ads/cache.ts  ads/authors.ts
  routes/ads.ts               # /api/ads/status, /api/ads/snapshot
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
- `PageHeader` có `actions` bên phải → `AdsRangeControl` (dùng ở cả Tổng quan và AI Agent): `DateRangeSelect` (`src/components/ui/`, lưới ngày `CalendarMonth`, tiện ích `src/lib/dates.ts`) = 1 nút "Tên khoảng · dd/MM/yyyy – dd/MM/yyyy" → bảng: cột nút nhanh (Hôm nay / Hôm qua / 7 · 14 · 30 ngày qua — tính đến hôm qua, giờ VN) + lịch 2 tháng (thứ Hai đầu tuần, « ‹ › » đổi năm/tháng, bấm ngày đầu rồi ngày cuối, tô khoảng khi rê chuột, khoá ngày tương lai và ngày vượt 90 ngày, chấm dưới hôm nay; màn hình nhỏ 1 tháng). Bấm ra ngoài / Esc để đóng. Cạnh đó là nút tải lại (`refresh=1`). Dòng phụ: tên shop · giờ cập nhật / "Đang tải…" / lỗi (chưa đăng nhập TikTok, server chưa chạy) kèm khoảng ngày đang hiện.
- **Nguồn số liệu** `src/pages/ads/data.tsx`: `AdsDataProvider` (bọc trong `AdsLayout`, ngoài `AdsSettingsProvider`) + `useAdsData()` → `{ snapshot, range, setRange, status, source, error, loginRequired, reload, days }`. Đổi ngày → đợi 500 ms → `GET /api/ads/snapshot`. Khoảng ngày lưu localStorage (`ads-range`): chọn nút nhanh → lưu tên khoảng (`{preset:"7d"}`…), mở lại trang tự tính theo hôm nay; chọn trên lịch → lưu ngày cố định (`preset:"custom"`). Mặc định 7 ngày gần nhất (đến hôm qua). Server lỗi / chưa chạy → giữ số liệu đang có (lần đầu là `src/data/ads-snapshot.json`, `source: 'static'`). **Không import thẳng `ads-snapshot.json` trong component** — lấy `snapshot` từ `useAdsData()`; hàm thuần nhận `snapshot` / `days` qua tham số (`classifyCampaign(c, settings, days)`, `contextForCampaign(c, days)`, `matchRuleTargets(rule, settings, snapshot)`, `agent/lookup.ts`).
- `AdsStatsGrid` — 4 KPI chính dạng `StatCard` (Tổng chi phí, Tổng doanh thu, Tổng đơn hàng, ROI — icon `Gauge`, ROI là hệ số không phải %). Mỗi ô có dòng **▲/▼ % so với kỳ liền trước** (`snapshot.previousSummary`; `StatChange.direction`: chi phí trung tính màu xám, còn lại tăng = xanh); thiếu số kỳ trước thì ẩn dòng này. Ô Chi phí có hint "N video có chi tiêu". **Không còn dải chỉ số phụ** (đã bỏ ô "Video đang tăng cường"; quy tắc đang bật + chờ duyệt nằm ở dòng trạng thái hộp Agent).
- `AdsSubNav` (dưới `PageHeader`): **Tổng quan** (`/ads`) | **AI Agent** (`/ads/agent`, kèm số đề xuất chờ duyệt).
- `ActionInbox` — hộp **Agent đang theo dõi** (giữa KPI và card danh sách): trạng thái Agent, tab cấp **Video | Sản phẩm | Chiến dịch** (kèm tổng số, mặc định Video), nút "Sửa định nghĩa nhóm" (tới đúng cấp) + "Mở AI Agent". Mỗi nhóm của cấp đang xem có `showInInbox` là một ô (số đối tượng, chi phí, doanh thu, mô tả điều kiện, quy tắc Agent cùng cấp đang xử lý — `ruleForTrigger(rules, id, level)`); bấm nội dung ô → tab danh sách tương ứng + `action=<id nhóm>` (xoá bộ lọc chiến dịch/sản phẩm/tìm kiếm) và **cuộn xuống card danh sách** (`LIST_ANCHOR`, `scroll-mt-20`). Chip quy tắc dưới ô là link riêng: đã có quy tắc → `/ads/agent?view=rules`; chưa có → "+ Tạo quy tắc" → `/ads/agent?view=rules&add=<level>:<id nhóm>` (AgentPage mở `RuleFormModal` với `initialLevel` / `initialTrigger` rồi xoá `add` khỏi URL). Số liệu 3 cấp tính trong `AdsPage` (`InboxSummary`). Đối tượng Agent không làm gì được — video đã gỡ (`status: excluded`), sản phẩm / video / chiến dịch thuộc **chiến dịch đã tắt** — không tính vào số / chi / DT của ô (`ActionSummary.skipped`, ô ghi "+N … (không tính)"); bảng danh sách vẫn hiện đủ. Cảnh báo thiếu ROI hoà vốn (ẩn ở tab Chiến dịch); ô của nhóm so với hoà vốn mà đang trống vì thiếu hoà vốn → ghi "Chưa tính được — thiếu ROI hoà vốn" thay vì "0". Nhóm không bật "Hiện ở Tổng quan" thì không hiện ở hộp (xem qua bộ lọc nhóm của bảng danh sách).
  - **Nhóm video do Sếp tự định nghĩa** (`src/pages/ads/groups.ts`, kiểu `GroupDef`). `VideoAction` = id nhóm (string). `classifyVideo` (`classify.ts`) xét `settings.groups` từ trên xuống, khớp nhóm nào trước thì lấy. Loại nhóm: `platform` (Cần ủy quyền — trạng thái TikTok `authorization_needed` + có chi/đơn/DT, **khoá**; **trừ dòng cần ủy quyền giả**: TikTok báo theo cặp (sản phẩm, video) nên video gắn sản phẩm B vẫn có dòng `authorization_needed` ở sản phẩm A — cùng chiến dịch hoặc **ở chiến dịch khác** — dù đang chạy ở B → `annotateCrossProduct` (`shared/videoStatus.ts`, gọi trong `getSnapshot` và `data.tsx`) gắn `crossProduct` / `mainCampaignId` / `mainProductId` / `mainStatus` (ưu tiên dòng cùng chiến dịch, không có thì chiến dịch khác), không đổi `status` gốc; dòng đó không vào nhóm này, điều kiện TikTok dùng `effectiveStatus`, bảng Video hiện badge xám "Gắn SP khác" / "Chạy ở CD khác" (`isOtherCampaign`) + tooltip nơi chạy thật, nút thao tác dùng chiến dịch + sản phẩm thật), `custom` (điều kiện sửa được), `fallback` (Ổn định — còn lại, luôn cuối). Điều kiện: các **cách** nối HOẶC, mỗi cách gồm điều kiện nối VÀ; điều kiện = chỉ số (Chi phí/Doanh thu/Đơn/ROI/CPA) + phép so (≥ > ≤ < =) + số cố định hoặc (chỉ với ROI) `k lần ROI hoà vốn` / `k lần ROI mục tiêu` (UI: `ROI < [1,2] [lần ROI hoà vốn ▾]`). Thiếu hoà vốn/mục tiêu → điều kiện không khớp. Lý do tự sinh từ cách khớp (`reasonFor`). Thẻ sản phẩm và video không chi/không đơn → không phân loại.
  - **Nhóm có ở cả 3 cấp** (cùng kiểu `GroupDef`, cùng cách xét từ trên xuống, mỗi cấp 1 nhóm fallback cuối): `groups` (video), `productGroups` (sản phẩm trong từng chiến dịch — `classifyProduct`), `campaignGroups` (chiến dịch — `classifyCampaign`, có chỉ số **Mức tiêu ngân sách (%)**, không so hoà vốn). `platform` chỉ có ở video. Bối cảnh so điều kiện: `contextForProduct` / `contextForCampaign` trong `classify.ts`.
  - Thiết lập (`src/pages/ads/settings.tsx`, `AdsSettingsProvider` bọc route `ads` qua `AdsLayout` → Tổng quan và AI Agent dùng chung): `breakEvenRoi` theo ID sản phẩm + `groups` / `productGroups` / `campaignGroups` (`groupsOf(settings, level)`, `findGroup(settings, id, level)`). Mặc định từ `src/data/ads-settings.json` (video: Cần ủy quyền, Cắt lỗ, Nhân rộng, Theo dõi, Ổn định · sản phẩm: Lỗ, Sát hoà vốn, Lời, Chưa xác định · chiến dịch: Tiêu hết NS ROI tốt, ROI dưới mục tiêu, Tiêu chậm, Ổn định), lưu **trên server** (`server-data/settings.json`, API `/api/settings`; bản cũ trong localStorage `ads-settings-v1` được đẩy lên 1 lần rồi xoá). Server không chạy → hiện mặc định, `syncError` báo lỗi, **tự thử tải lại mỗi 5 giây**; chưa tải được (`loaded = false`) thì **không lưu** (tránh ghi đè ROI hoà vốn / nhóm trên server bằng mặc định) — `BreakEvenModal` khoá nút Lưu / Xoá hết và điền lại số khi tải xong. `agentStore` cũng vậy: chưa kết nối thì không lưu cấu hình, thử lại mỗi 5 giây. ROI hoà vốn sửa qua `BreakEvenModal`; định nghĩa nhóm sửa ở **AI Agent → tab Nhóm** (chọn cấp Video | Sản phẩm | Chiến dịch). **Không tự điền ROI hoà vốn** — phải do Sếp cung cấp.
- `GmvMaxListCard` — card "Chiến dịch GMV Max", thứ tự: tiêu đề → hàng bộ lọc → 3 tab **Chiến dịch | Sản phẩm | Video** (`ListViewTabs`, ngay trên bảng). Hàng bộ lọc gồm 2 ô chọn có tìm kiếm `FilterSelect` (`src/components/ui/FilterSelect.tsx`): **Chiến dịch** và **Sản phẩm** (chỉ liệt kê sản phẩm của chiến dịch đang chọn; chọn sản phẩm tự đặt chiến dịch; ✕ để bỏ). Tab Video có thêm ô tìm video theo tiêu đề/tài khoản (`q`). Không còn ô tìm theo ID chung. Card không `overflow-hidden` để danh sách thả xuống không bị cắt.
  - Trạng thái nằm trên URL (`useAdsListParams`): `/ads?tab=campaigns|products|videos&campaign=<id>&product=<id>&q=&action=<id nhóm>`. `action` là ID nhóm **của tab đang xem** (video / sản phẩm / chiến dịch) → đổi tab hoặc drill-down thì xoá `action`. Bảng Chiến dịch lọc theo `action` và hiện chip "Nhóm: … ✕" (không có ô chọn nhóm); bảng Sản phẩm / Video lọc bằng segmented nhóm.
  - Drill-down: bấm chiến dịch → tab Sản phẩm lọc theo chiến dịch; bấm sản phẩm → tab Video lọc theo sản phẩm.
  - Card tên "Danh sách GMV Max", dưới tiêu đề có "N chiến dịch · N sản phẩm · N video" theo bộ lọc hiện tại.
  - `CampaignTable` — `CampaignFilterBar` (segmented Tất cả / Đang chạy / Đã tắt kèm số đếm + nút ROI hoà vốn; **không** có nút Quy tắc / Lịch ngân sách / lọc "Có đề xuất" vì chưa có nghiệp vụ), cột: Chiến dịch (+ ID), Trạng thái, Nhóm (badge; chưa chi tiêu → "Chưa chi tiêu"), Video, Ngân sách/ngày, Tiêu NS (% = chi TB/ngày ÷ ngân sách, `contextForCampaign`), Chi phí, Doanh thu, Đơn hàng, ROI (đỏ khi dưới mục tiêu), ROI mục tiêu. Sắp xếp cột số.
  - `ProductTable` — cột: Sản phẩm, Chiến dịch, Video, Chi phí, Doanh thu, Đơn hàng, CPA, ROI, ROI hoà vốn (chưa nhập → nút "Nhập" mở `BreakEvenModal`), Nhóm (badge nhóm sản phẩm, tooltip = lý do). Lọc theo nhóm (kèm số đếm), link "Sửa nhóm sản phẩm", sắp xếp cột số.
  - `ActionBadge` nhận `level` (`video` mặc định / `product` / `campaign`).
  - `VideoTable` (tầng quan trọng nhất) — cột: Video (dòng phụ `@authorUsername` nếu có, không thì tên hiển thị không kèm @), Sản phẩm, Nhóm (badge, tooltip = lý do), Trạng thái, Chi phí, Doanh thu, Đơn hàng, CPA, ROI, **Thao tác** (`VideoActions`: **Gỡ** / **Thêm lại** (video đã gỡ) / **Tăng cường ⚡** (`BoostDialog`: ngân sách ≥ 260k/ngày, 1–7 ngày, báo trần hôm nay) → `ConfirmExecuteModal` → `runManual` → server chạy thật, Nhật ký `actor: manual`, hoàn tác được; nút mờ + tooltip lý do theo `ineligibleReason`; sau khi chạy dòng hiện trạng thái tạm "Đang gỡ… / Đã gỡ" từ nhật ký tới khi số liệu cập nhật; + nút mở TikTok). Lọc theo nhóm (kèm số đếm) + mục "Thẻ sản phẩm (N)" (`action=product_card`) + mục **"Không khả dụng (N)"** (`action=unavailable`; video TikTok báo `unavailable` — chưa có cách xử lý nên `classifyVideo` trả null: không vào nhóm nào, không tính ở hộp Tổng quan, Agent / Gợi ý không đề xuất, `ineligibleReason` chặn Gỡ; cột Nhóm hiện "--". Sếp chốt 20/11: **không** tạo nhóm cho loại này); dòng thẻ sản phẩm nền nhạt; dòng Cắt lỗ có vạch đỏ. Bấm tiêu đề video hoặc nút ↗ → mở `tiktok.com/@<authorUsername>/video/<id>` ở tab mới. TikTok **bắt buộc username** (`@/video/<id>` không chạy); thiếu `authorUsername` thì link bị khoá. Không dùng player nhúng `player/v1` (video shop bị "Player authentication failed"). **Bảng Video không có ảnh** (đã thử tải ảnh bìa từ trang TikTok công khai: ~5 giây/ảnh, hay bị chống bot — Sếp chốt bỏ 20/11/2026, không thử lại cách này). Ô Video dạng chữ (`VideoTitleCell`): tiêu đề đậm (link TikTok) + "@tài khoản · ID" kèm nút sao chép ID; thẻ sản phẩm = nhãn "Thẻ sản phẩm" + tên sản phẩm. Bảng Sản phẩm vẫn có ảnh sản phẩm (`imageUrl` từ MCP, `MediaThumb` lỗi ảnh → icon).
  - Phân trang phía client 20 dòng/trang. Rỗng thì hiện empty state. CPA tính trong `src/pages/ads/metrics.ts`.
- **Không** có nút "Quét đề xuất" / tự quét (đã bỏ theo yêu cầu, chưa xác định nghiệp vụ).
- Kiểu dữ liệu ở `src/pages/ads/types.ts`. Chưa có dữ liệu → số liệu hiển thị `--` (dùng `formatVnd` / `formatNumber` trong `src/lib/format.ts`).
- Khi kết nối MCP TikTok for Business: thay `campaigns` / `summary` trong `AdsPage.tsx` bằng dữ liệu thật.

### Trang ADS 24/7 → AI Agent (`src/pages/ads/agent/`, route `/ads/agent?view=pending|log|rules`)

**Quy định (Sếp chốt 18/11, cập nhật 19/11/2026): MỌI VIỆC CẦN SẾP DUYỆT — Duyệt → hộp xác nhận → server CHẠY THẬT trên TikTok.** Chế độ Tự chạy bị khoá (`AUTO_MODE_ENABLED = false` trong `shared/agentPolicy.ts`): UI chỉ có Tắt / Cần duyệt, server ép quy tắc `auto` → `approve`. Chỉ mở khi Sếp yêu cầu rõ ràng.

**Giai đoạn hiện tại: C — Duyệt + xác nhận → chạy thật (Sếp bật 19/11/2026).** Lộ trình: A ✔ → B (đề xuất, chỉ đọc) ✔ → **C (thực thi khi Sếp duyệt + xác nhận, kiểm tra kết quả, Hoàn tác)** ✔ → D (Tự chạy trong giới hạn — **chưa mở**, cần Sếp yêu cầu rõ). Bộ máy quét vẫn chỉ đọc + tạo đề xuất; quy tắc "Tự chạy" cũng chỉ tạo đề xuất. Tắt nhanh mọi thao tác ghi: `EXECUTION_ENABLED = false` trong `shared/agentPolicy.ts`. **Claude trong cuộc trò chuyện vẫn không tự gọi tool ghi MCP** — chỉ server gọi, chỉ khi Sếp bấm xác nhận trên web.
- **Thực thi** (`server/agent/executor.ts`; tool ghi chỉ ở `server/tiktok/writeTools.ts` — `WRITE_TOOLS` đúng 3 tool, chỉ executor gọi `callWriteTool`, lệnh ghi chỉ thử lại khi bị giới hạn tần suất): `POST /api/agent/proposals/:id/approve` bắt buộc `{confirm:true}` (thiếu → 400) → hàng đợi 1 việc/lần → kiểm tra lại bằng số liệu mới (đề xuất pending + còn hạn; `maxActionsPerDay` / `dailyBoostCap` theo thao tác thật hôm nay; `recheckProposal` (engine.ts) với snapshot `lookbackDays` (cache): không còn khớp quy tắc → đề xuất `outdated`, 409, không gửi lệnh; `campaign_gmv_max_info_get`: chiến dịch `ENABLE`) → không đạt: 409 `PRECHECK_FAILED`, không gửi lệnh, đề xuất vẫn chờ + `note` "Chưa chạy được: …" → đạt: ghi nhật ký (`actor: approved`, `params.prev/next`, `proposalId`), đề xuất `approved` + `actionId`, gửi lệnh (lỗi TikTok → nhật ký `failed` + `error`).
  - Gỡ / thêm video: `gmv_max_creative_update` REMOVE/ADD; cần `AUTO_SELECTION`; trạng thái video mới nhất (`gmv_max_report_get` 7 ngày đến hôm nay); `spu_id_list` = mọi sản phẩm của video trong chiến dịch (snapshot). TikTok nhận lệnh là trả kết quả ngay (`running`, hộp xác nhận đóng); trạng thái video đọc ở nền (`followUpCreative` 3 · 8 · 15 giây), rồi mỗi 20 giây trong 10 phút đầu, sau đó giãn dần tối đa 5 phút (scheduler 10 giây/lần); quá 90 phút = `failed`. Báo cáo TikTok có thể trễ hơn Ads Manager vài phút. Web tải lại state mỗi 5 giây khi có dòng `running`; nút **Kiểm tra ngay** → `POST /api/agent/actions/:id/verify` (chỉ đọc, `verifyAction`).
  - Tăng cường: `campaign_gmv_max_session_create` `CREATIVE_NO_BID`, `SCHEDULE_START_END` hết hạn sau `boostDays` (UTC), ngân sách ≥ `MIN_BOOST_BUDGET_VND` (gửi VND), video không ở trạng thái cần ủy quyền/bị gỡ/từ chối/không khả dụng. Không hoàn tác được.
  - Ngân sách: `campaign_gmv_max_update` `budget` = ngân sách **đọc từ TikTok** × (1 + % đã kẹp), làm tròn 1.000đ. ROI mục tiêu: `roas_bid` 1 chữ số, cần `VO_MIN_ROAS`. Tắt/bật sản phẩm: `item_group_ids` (danh sách hiện tại bớt/thêm 1), cần `CUSTOMIZED_PRODUCTS`, không tắt sản phẩm duy nhất. Cả 3 cần quyền GMV Max độc quyền (`gmv_max_store_list_get`); sau khi ghi đọc lại info đối chiếu (lệch → vẫn `success` + ghi chú).
  - **Thủ công từ bảng Video** `POST /api/agent/actions/manual` (`{confirm:true, actionType, target, params}`, `executeManual`): chỉ `remove_creative` / `add_creative` / `boost_creative` (ngân sách ≥ `MIN_BOOST_BUDGET_VND`, 1–7 ngày); vẫn qua `checkGuardrails` + `buildPlan`; nhật ký `actor: manual`, `ruleId: null`, `before` = số liệu `lookbackDays` của video; tính thời gian chờ cho Agent như thao tác khác.
  - **Hoàn tác** `POST /api/agent/actions/:id/undo` (`{confirm:true}`): gỡ ↔ thêm lại, ngân sách/ROI → giá trị `prev`, tắt ↔ bật sản phẩm. Dòng mới `actor: manual` + `undoOf`; thành công thì dòng gốc `undone`.
  - Shop hiện tại (đọc 19/11): chiến dịch `AUTO_SELECTION` + `CUSTOMIZED_PRODUCTS` + `VO_MIN_ROAS`; shop đã cấp quyền độc quyền cho tài khoản.
  - Web: `ConfirmExecuteModal` (mỗi việc bằng lời qua `agent/execText.ts`; duyệt nhiều → 1 hộp + tổng tiền tăng cường), `ProposalList` hiện kết quả (đã chạy / chờ TikTok xác nhận / không chạy được + lý do), `ProposalItem` hiện trạng thái thực thi theo `actionId`, `ActionLogItem` có nút Hoàn tác (hộp xác nhận). `useAgentStore`: `decide` / `undo` trả `ExecOutcome`.
- Bộ máy (`server/agent/engine.ts`, lịch `scheduler.ts` mỗi `AGENT_INTERVAL_MINUTES` = 60 phút, lượt đầu 30 giây sau khi bật server, không chạy chồng; `POST /api/agent/run` = Quét ngay — **lấy số liệu mới từ TikTok, bỏ qua cache**; lượt theo lịch dùng cache): bỏ qua khi tạm dừng → snapshot `guardrails.lookbackDays` (mặc định 7) ngày đến hôm qua → **xét lại mọi đề xuất `pending`** (`recheckProposal`): quy tắc tắt/xoá hoặc số mới không còn khớp / không đủ điều kiện → `outdated` + `note` lý do (vd "Số liệu 12/11–18/11: chi … · ROI 4,76 — không còn khớp quy tắc …"); còn khớp → cập nhật `before` + `reason` → mỗi quy tắc bật: `findRuleTargets` (`shared/agentMatch.ts`, cấp video gộp theo chiến dịch + video) → bỏ qua nếu đã có đề xuất chờ / trong `cooldownHours` / không đủ điều kiện TikTok (gỡ: chiến dịch phải chạy, video chưa bị gỡ; tăng cường: không ở trạng thái cần ủy quyền/bị loại/từ chối/không khả dụng) / vượt `maxActionsPerDay` / vượt `dailyBoostCap` → Nhắc việc ghi thẳng Nhật ký, còn lại tạo đề xuất hạn 24h. % ngân sách vượt giới hạn → đề xuất đúng mức giới hạn. Đề xuất quá hạn → `expired`. Thời gian chờ chỉ tính đề xuất còn hiệu lực/đã xử lý (không tính `expired` / `outdated`) và nhật ký không lỗi (lệnh `failed` không tính).
- Điều kiện tool ghi: `gmv_max_creative_update` cần chiến dịch đang chạy + `AUTO_SELECTION` + `spu_id_list`, kiểm tra trạng thái ngay sau khi gửi (gỡ → `EXCLUDED`); `campaign_gmv_max_session_create` (`CREATIVE_NO_BID`) ngân sách ≥ ~10 USD/ngày (`MIN_BOOST_BUDGET_VND` = 260.000đ, thẻ quy tắc cảnh báo); `campaign_gmv_max_update` (`budget`, `roas_bid` 1 chữ số thập phân) cần quyền GMV Max độc quyền; bật/tắt sản phẩm chỉ khi chiến dịch `CUSTOMIZED_PRODUCTS`.
- Ý tưởng: phân loại video (`classify.ts`) = Agent "nhìn"; **Quy tắc** biến nhóm thành hành động; quy tắc chế độ **Tắt / Cần duyệt / Tự chạy** (bật Tự chạy luôn hỏi xác nhận). Cần duyệt → **Chờ duyệt**; thực hiện xong → **Nhật ký**.
- `AgentStatusBar`: tiêu đề + badge "Đang quét…" khi server đang chạy lượt; dòng phụ theo trạng thái (chưa kết nối server / đã tắt / chưa có quy tắc bật / "N quy tắc · tự quét mỗi giờ · lượt tới lúc HH:mm" — `nextRunAt`, `intervalMinutes` từ `/api/agent/state`). Bên phải: nút phụ **Quét ngay** (viền, chỉ bật khi Agent bật) + **công tắc Bật/Tắt** (`role=switch`, xanh = đang bật; thay cho nút Tạm dừng/Tiếp tục, ghi `paused`). Lỗi lượt chạy gần nhất / kết quả Quét ngay hiện dưới. Hàng chỉ số: lần chạy gần nhất, tăng cường hôm nay / trần, thao tác hôm nay (đề xuất còn hiệu lực + thao tác thật, không tính nhắc việc) / tối đa, hiệu quả 30 ngày.
- **Gợi ý** (`?view=suggest`, tab đầu; không có `view` + chưa bật quy tắc nào → mở tab này): hệ thống đọc số liệu 7 ngày đến hôm qua → gợi ý bằng lời cho người mới. **Bộ gợi ý CHUNG cho mọi shop** (Sếp chốt 20/11/2026, đúng 10 gợi ý — thêm gợi ý mới phải Sếp duyệt): mỗi gợi ý **tự mang điều kiện riêng, không phụ thuộc nhóm** Sếp định nghĩa, **không dùng số tiền cố định theo 1 shop** — ngưỡng tính theo mốc của từng shop. Hệ số mặc định ở `shared/suggestRules.ts` (`SUGGESTION_PARAMS`, `suggestParams`); từng shop tắt / đổi hệ số qua `settings.suggestOverrides` (`{ [id]: { off?, params? } }`, chưa có giao diện chỉnh). Mốc chính: **CPA hoà vốn** = giá trị đơn TB của sản phẩm (mọi chiến dịch) ÷ ROI hoà vốn = tiền tối đa cho 1 đơn (`cpaBreakEvenMap`); thiếu đơn / hoà vốn → `FALLBACK_CPA_VND` 100k. Logic thuần `shared/suggest.ts` (`buildSuggestions(snapshot, settings, rules, guardrails)`; cấp video gom bằng `collectVideoTargets` (`shared/agentMatch.ts`, dùng chung với `findRuleTargets`: gộp (chiến dịch, video), cộng số liệu dòng khớp, đơn bù) rồi lọc `ineligibleReason`; luật cố định, không AI) — để Telegram / AI dùng lại sau. 10 gợi ý: **break-even** thiếu ROI hoà vốn (luôn đầu, mở `BreakEvenModal`) · **video-cut** chi ≥ 1× CPA hoà vốn + 0 đơn, hoặc chi ≥ 2× + ROI < hoà vốn → Gỡ video · **product-loss** ROI < hoà vốn + chi ≥ 2× CPA hoà vốn → Nhắc · **campaign-low-roi** ROI < 0,8× mục tiêu + chi ≥ 1 ngày ngân sách → giảm NS 20% · **video-scale** ≥ 3 đơn + ROI ≥ mục tiêu → Tăng cường 260k × 1 ngày (nâng trần nếu thấp; tài khoản không phải VND → không gợi ý) · **campaign-scale** tiêu ≥ 90% NS + ROI ≥ mục tiêu → tăng NS 20% · **campaign-slow** tiêu < 50% NS → giảm ROI mục tiêu 10% · **video-authorize** cần ủy quyền + có chi/đơn/DT → Nhắc · **video-concentration** 3 video DT cao nhất ≥ 60% DT quảng cáo (≥ 5 video có DT) · **product-few-videos** SP ở chiến dịch đang chạy, có chi, ≥ 50% video không khả dụng hoặc ≤ 2 video đang chạy (`delivering`/`learning`). Gợi ý chiến dịch chỉ xét chiến dịch đang chạy, mỗi chiến dịch 1 loại (ưu tiên tiêu hết NS → ROI thấp → tiêu chậm). 2 gợi ý cuối là `action.kind: 'info'` (chỉ lời khuyên, chưa có quy tắc Agent cấp shop). Mức: Đang mất tiền / Cơ hội / Nên làm, sắp theo số tiền. Nút **Bật quy tắc (Cần duyệt)** (`useSuggestions.apply`) vẫn tạo quy tắc Agent theo **nhóm mặc định** tương ứng (`cut`, `scale`, `authorize`, `p-loss`, `c-low-roi`, `c-scale`, `c-slow`) — nên số Agent bắt có thể khác số gợi ý; có quy tắc cùng cấp + nhóm + hành động thì đổi sang Cần duyệt, chưa có thì tạo `sg-<cấp>-<nhóm>-<hành động>` (Tự tạo) → hiện "bấm Quét ngay". Shop đã xoá nhóm đó → `groupMissing`, nút thành "Chưa có nhóm phù hợp" (link tab Nhóm). Đã bật → "Đã bật quy tắc". Ví dụ cấp sản phẩm link sang bảng Video lọc theo sản phẩm. Ẩn gợi ý: localStorage `ads-suggest-dismissed` (hiện lại khi số đối tượng tăng). Tổng quan có `SuggestionBanner` ("Có N gợi ý · X việc đang làm mất tiền") trên hộp Agent.
- **Đơn bù ở sản phẩm khác** (Sếp chốt 20/11: vẫn đề xuất, nói rõ để Sếp tự quyết): video lỗ ở dòng đang xét nhưng có DT / đơn ở dòng sản phẩm khác **trong cùng chiến dịch** (gỡ = mất cả phần đó vì gỡ gửi mọi sản phẩm của video trong chiến dịch; dòng ở chiến dịch khác không tính vì gỡ ở đây không ảnh hưởng bên kia). `offsetOf` (`shared/agentMatch.ts`) → `RuleTarget.offset` / `AgentProposal.offset` (`VideoOffset`: phần bù, tổng, hoà vốn tổng = ΣDT ÷ Σ(DT_i ÷ hoà vốn_i), `profitable`), cập nhật mỗi lượt quét. Câu chữ ở `shared/offsetText.ts`. **Không thêm nhóm** (Sếp chốt 20/11: chỉ sửa UI/UX). Hiện ở: Chờ duyệt (nhãn `offsetBadge` cạnh hành động — vàng "Tổng vẫn có lời" / xám "Tổng vẫn lỗ", bấm mở `OffsetNotice`; ô Lúc đề xuất thêm dòng "Tổng video (gồm đơn bù)"; **"Chọn tất cả" bỏ qua gỡ video tổng vẫn có lời** (`bulkSelectable`), tích tay vẫn được), hộp xác nhận (dòng ⚠ sau `
` + `topWarning` vàng đầu hộp khi có video tổng vẫn có lời — cả nút Gỡ thủ công), Gợi ý (tiêu đề "(N video có đơn bù…)", video có đơn bù lên đầu + nhãn), bảng Video (dòng `offsetTotalLine` dưới badge Cắt lỗ: "Tổng: ROI 5,88 ✓ có lời" xanh / "· vẫn lỗ" xám), hộp Tổng quan (ô Cắt lỗ: "trong đó N video tổng vẫn có lời", số đếm giữ nguyên).
- **Chờ duyệt** (`ProposalList`/`ProposalItem`): **chỉ việc cần Sếp quyết** — đề xuất `pending` (+ đã duyệt trước khi bật chạy thật, chưa có `actionId`): thời gian + hạn, hành động, video, số liệu lúc đề xuất + "Vì sao", Duyệt/Bỏ qua, chọn nhiều. Không còn segmented trạng thái, không còn mục Đã duyệt (kết quả chạy xem ở **Nhật ký**, dòng Sếp duyệt có "Đề xuất lúc …"). Dưới cùng: khối thu gọn **Đề xuất đã đóng (N)** (`ClosedProposalRow`, bỏ qua / hết hạn / không còn khớp + lý do, tối đa 50). Duyệt xong hiện dòng kết quả kèm link "Xem ở Nhật ký".
- **Nhật ký** (`ActionLogList`/`ActionLogItem`): thời gian + người làm (Agent tự chạy / Sếp duyệt / Thủ công), hành động + quy tắc + tham số, video (link TikTok, sao chép ID), **Lúc quyết định** vs **Sau thao tác**. **Số liệu sau thao tác theo khối 24h** (`server/agent/afterMetrics.ts`, CHỈ ĐỌC `gmv_max_report_get` + `stat_time_hour`, scheduler 1 phút sau khi bật rồi mỗi 15 phút): Ngày k = giờ [T+(k−1)·24h, T+k·24h), T = giờ tròn kế tiếp sau thao tác (bỏ giờ lẫn phút trước thao tác), tối đa 7; khối có số khi hết khối + 1h; khối kết thúc trong 48h gần nhất lấy lại mỗi lượt (đơn về trễ); báo cáo theo giờ cache `server-data/cache/hourly/` (ngày đã chốt giữ mãi, ngày gần 1h); video cộng mọi sản phẩm của video trong chiến dịch; giờ báo cáo giả định múi giờ tài khoản = Asia/Ho_Chi_Minh; ghi `after` (tổng) + `after.days` (`from`/`to`); thao tác `success`/`undone` trong 30 ngày, bỏ nhắc việc / lỗi / hoàn tác. **Một câu chờ duy nhất** trong ô Sau thao tác: "Có số 24h đầu lúc ~HH:mm dd/MM" (`firstAfterReadyAt`, khớp server) / "Đang lấy số 24h đầu từ TikTok…". Có khối rồi mới hiện `AfterDaysStrip` (Trước TB/ngày · Ngày 1 (đến HH:mm dd/MM), 2… ROI + đơn) + **câu kết luận** `summarizeAction` (`agent/evaluate.ts`: ✓ Gỡ đúng / ✗ Gỡ chưa đúng → cân nhắc Thêm lại / ✓ Hiệu quả / ✗ Chưa hiệu quả, "24h sau" / "N ngày sau", lợi/lỗ ước tính "~"; xanh/đỏ/xám), trạng thái + Hoàn tác. Lọc theo thời gian / hành động / quy tắc / người làm.
- **Hiệu quả** (`?view=impact`, `ImpactView`, `RuleImpactTable`, `LessonList`, `VerdictBadge`; logic thuần ở `agent/evaluate.ts`): chấm từng thao tác từ nhật ký thật — **Đúng/Sai/Chờ đánh giá/Chưa chấm được** + lợi nhuận tác động **ước tính**. Mốc "nếu không làm gì" = chi/DT mỗi ngày trước × số ngày sau; lợi nhuận QC = DT ÷ ROI hoà vốn (ghi lúc quyết định) − chi. Gỡ video: chi tránh được − DT mất ÷ hoà vốn; tăng cường/thêm lại/đổi ngân sách: DT thêm ÷ hoà vốn − chi thêm. Chỉ chấm sau `evaluateAfterHours`; bỏ qua thao tác lỗi/hoàn tác/nhắc việc. KPI (lợi nhuận tác động, tỷ lệ đúng, chi tránh được, DT thêm, số thao tác), bảng theo quy tắc, **Rút kinh nghiệm** (gợi ý khi ≥ 5 thao tác đã chấm: gỡ sai ≥ 30%, tăng cường sai ≥ 40%, Cần duyệt đúng ≥ 80%/≥ 10 → gợi ý Tự chạy, bị bỏ qua ≥ 50%, thiếu hoà vốn), top 3 tốt/sai. Nhật ký có nhãn Đúng/Sai; `AgentStatusBar` và hộp Tổng quan có "Hiệu quả 30 ngày". **Không tạo nhật ký giả để minh hoạ.**
- **Quy tắc** (`RuleCard`, `GuardrailsCard`): mỗi quy tắc có **cấp** `level` (`video` | `product` | `campaign`, thiếu = video). **Mọi cấp đều có dạng Khi [thuộc nhóm cùng cấp] (`trigger`, chọn bằng `GroupPicker`) → Thì [hành động]**; điều kiện chỉ sửa ở tab Nhóm. `conditionSets` trong quy tắc là bản cũ (deprecated) → `trigger` rỗng, thẻ báo "Chưa chọn nhóm" và mở sẵn ô chọn nhóm.
  - Video: Thì = Gỡ video / Tăng cường (đ/ngày × ngày) / Nhắc việc.
  - Sản phẩm: Thì = **Tắt sản phẩm** / **Bật sản phẩm** / Nhắc việc.
  - Chiến dịch: Thì = **Tăng/Giảm ngân sách X%** (`budgetChangePct`, âm = giảm) / **Đổi ROI mục tiêu ±X%** (`roiTargetChangePct`) / Nhắc việc. Mức tiêu ngân sách (%) = chi TB/ngày ÷ ngân sách ngày × 100 (số ngày theo `snapshot.range`).
  - Thẻ quy tắc hiện badge nhóm + mô tả, nút "Đổi nhóm", "N … khớp theo số liệu hiện tại" (`matchRuleTargets` — `findRuleTargets` rồi lọc `ineligibleReason` như Agent; đối tượng bị lọc hiện "+N bỏ qua: lý do", cả ở `RuleFormModal`), cảnh báo khi % ngân sách vượt giới hạn (`budgetLimitWarning`).
  - Giới hạn an toàn: trần tăng cường/ngày, thao tác tối đa/ngày, chờ mặc định, đánh giá sau N giờ, **tăng ngân sách tối đa %/ngày**, **giảm ngân sách tối đa %/ngày** (mặc định 30%).
  - Ánh xạ MCP (khi có thực thi): Gỡ/Thêm lại video → `gmv_max_creative_update`; Tăng cường → `campaign_gmv_max_session_create`; ngân sách, ROI mục tiêu, bật/tắt sản phẩm → `campaign_gmv_max_update`.
  - Chỉnh trên UI → server (`AgentStoreProvider` trong `agent/agentStore.tsx`, bọc qua `AdsLayout`; `useAgentConfig` / `useAgentStore`; tự tải lại mỗi 60 giây), mặc định từ `src/data/agent.json`; bản cũ localStorage `ads-agent-config-v1` đẩy lên 1 lần. Nút **+ Thêm quy tắc** (`RuleFormModal`): Áp dụng cho (Video/Sản phẩm/Chiến dịch) · Tên · Khi · Thì (theo cấp, `ACTIONS_BY_LEVEL`) · Phạm vi (cấp chiến dịch ẩn ô sản phẩm) (chiến dịch + sản phẩm; chọn sản phẩm tự đặt chiến dịch) · Thời gian chờ · chế độ ban đầu Tắt/Cần duyệt/Tự chạy (Tự chạy hiện cảnh báo vàng). Quy tắc tự tạo có `custom: true`, nhãn "Tự tạo", xoá được; quy tắc mẫu không xoá được. "Khôi phục mặc định" xoá cả quy tắc tự tạo.
- Dữ liệu: kiểu ở `shared/agentTypes.ts` (`agent/types.ts` re-export). `AgentConfig` (`paused`, `rules`, `guardrails`) → `server-data/agent-config.json`; `AgentRuntime` (`lastRunAt`, `lastRunError`, `proposals`, `actions`, tối đa 2000 dòng) → `server-data/agent-state.json` (ghi nguyên tử, `server/store.ts`). Mặc định `src/data/agent.json` (3 quy tắc mẫu, mặc định Tắt). API: `GET /api/agent/state`, `PUT /api/agent/config`, `POST /api/agent/config/reset`, `POST /api/agent/run`, `POST /api/agent/proposals/:id/approve|reject`. **Không tạo đề xuất/nhật ký mẫu.**
- Logic dùng chung web + server ở `shared/`: `groups.ts` (không icon; `src/pages/ads/groups.ts` thêm icon/màu + re-export), `classify.ts`, `settings.ts` (`normalizeSettings`, `breakEvenOf`, `findGroup`…), `agentTypes.ts`, `agentMatch.ts`, `format.ts`. Import trong `shared/` dùng đuôi `.js` (NodeNext).
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
- **Server dùng bản flat** (`config.tiktok.mcpUrl`, đổi được bằng `TIKTOK_MCP_URL`), gọi thẳng tool theo tên (`mcpCallArgs` trong `mcpClient.ts`). Lý do (19/11/2026): đi đường layer + `tool_execute` thì lệnh ghi GMV Max bị trả `NOT_AVAILABLE / IN_ROLL_OUT`, gọi thẳng tool thì ghi được (Sếp đã gỡ video thành công qua Claude desktop). Token gắn với URL MCP → đổi URL thì phải `npm run login` lại.
- Xác thực OAuth bằng tài khoản TikTok for Business qua lệnh `/mcp` (quyền có thể hết hạn sau ~30 ngày → đăng nhập lại).
- **Claude (trong cuộc trò chuyện) chỉ đọc dữ liệu.** Thao tác ghi đi qua quy trình trên web (Duyệt → hộp xác nhận → server chạy). Claude không gọi tool tạo/sửa/xoá chiến dịch, đổi ngân sách hay bật/tắt quảng cáo nếu Sếp chưa xác nhận rõ ràng trong cuộc trò chuyện.
- Quy tắc đặt "Tự chạy" trên UI **không** phải là sự cho phép để Claude thao tác: mọi thao tác ghi (`gmv_max_creative_update`, `campaign_gmv_max_session_create`, `campaign_gmv_max_update`…) vẫn cần Sếp xác nhận rõ ràng từng lần trong cuộc trò chuyện.
- Web app **không** gọi MCP trực tiếp từ frontend. Số liệu thật đi qua server (`server/`) giữ token.

### Server API (`server/`)

Lộ trình: **1. Server + API lấy số liệu theo ngày (đã xong)** → **2. Ô chọn ngày trên web đổ dữ liệu từ API (đã xong)** → 3. Đăng nhập người dùng web, đăng nhập TikTok trên web, bảo mật token, HTTPS → 4. Deploy VPS (server phục vụ cả API lẫn `dist/`). Host cần ổ đĩa lâu dài + Node chạy liên tục (không dùng serverless).

- Đăng nhập TikTok: `npm run login` (dynamic registration + OAuth PKCE, cùng cách `scripts/mcp-probe.mjs`). Token ở `.secrets/tiktok-mcp.json`, tự gia hạn bằng `refresh_token`. Token có quyền cả ghi → **không copy `.secrets/` sang máy khác**, mỗi máy tự đăng nhập.
- **Chỉ tool đọc**: `READ_TOOLS` trong `server/tiktok/mcpClient.ts` (`gmv_max_report_get`, `gmv_max_campaign_get`, `gmv_max_store_list_get`, `campaign_gmv_max_info_get`); tool khác bị chặn trước khi gửi. Không thêm tool ghi vào đây — tool ghi chỉ ở `writeTools.ts` (xem AI Agent → Thực thi).
- API:
  - `GET /api/ads/status` → `{ connected, expiresAt, canRefresh, advertiser }` (không trả token).
  - `GET /api/ads/snapshot?from=&to=[&refresh=1]` → `{ snapshot: AdsSnapshot, cached }`. Tối đa 90 ngày, không quá hôm nay (giờ VN). Lỗi `{ code, error }`: `TIKTOK_LOGIN_REQUIRED` (401), `TIKTOK_ERROR` (502), `BAD_DATE`/`BAD_RANGE`/`FUTURE_DATE`/`RANGE_TOO_LONG` (400).
- Dựng snapshot (`buildSnapshot.ts`): 1 lời gọi chiến dịch (kèm `target_roi_budget`, `roas_bid`, `operation_status`, tổng) + 1 lời gọi kỳ trước + 1/chiến dịch cho sản phẩm + 1/(chiến dịch, sản phẩm) cho video, tối đa 3 lời gọi song song. `videoCount` = số dòng video giữ lại; `selectedVideos` / `videosWithSpend7d` = số video khác nhau có chi phí > 0. `authorUsername` lấy từ `server-data/authors.json` (lần đầu tạo từ snapshot tĩnh).
- Cache `server-data/cache/<from>_<to>.json`: khoảng có hôm nay 15 phút, 2 ngày gần 6 giờ, cũ hơn giữ mãi. Yêu cầu trùng dùng chung 1 lần gọi. `server-data/` không commit.
- Bảo mật bước 1: chỉ nghe `127.0.0.1` (`HOST`), chặn `Origin`/`Referer` ngoài `ALLOWED_ORIGINS` (403), không gửi CORS. **Chưa có đăng nhập người dùng → không mở server ra mạng ngoài, không chạy `vite --host`.** Biến môi trường: `PORT`, `HOST`, `SECRETS_DIR`, `DATA_DIR`, `ALLOWED_ORIGINS`, `TIKTOK_ADVERTISER_ID`, `TIKTOK_STORE_ID`, `TIKTOK_ADVERTISER_NAME`.

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
- Chạy `npm test` và `npm run build` (bao gồm kiểm tra TypeScript) trước khi báo xong.
- Kiểm thử ở `tests/` (`fixtures.ts` = dữ liệu mẫu nhỏ, chỉ cho test): `classify` (nhóm, hoà vốn), `agentMatch-suggest` (gộp video nhiều sản phẩm — **cộng số liệu các dòng**, gợi ý, lọc nhiễu), `suggestRules` (bộ gợi ý chung: ngưỡng co giãn theo giá đơn / hoà vốn của shop, ngưỡng dự phòng, shop xoá nhóm, ghi đè / tắt gợi ý, 2 gợi ý thông tin), `server-mapping` (chuyển dữ liệu TikTok), `engine` (bộ máy Agent với số liệu giả: tạm dừng, không trùng, thời gian chờ, hết hạn, giới hạn, kẹp % ngân sách), `safety` (chỉ tool đọc, tool ghi bị chặn trước khi gửi, tool ghi chỉ nằm trong writeTools/executor, `WRITE_TOOLS` đúng 3 tool, Duyệt/Hoàn tác bắt buộc `confirm`, Tự chạy bị ép về Cần duyệt), `executor` (TikTok giả lập: tham số từng tool ghi, kiểm tra điều kiện, xác nhận ngay / giãn dần, Kiểm tra ngay chỉ đọc, hoàn tác, không chạy 2 lần, giới hạn). Sửa logic ở `shared/` hoặc `server/` thì thêm / sửa test tương ứng. **Thêm tool ghi mới phải có test trong `executor.test.ts`.**
