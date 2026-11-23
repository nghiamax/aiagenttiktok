# Cài lên hosting cPanel (InterData) — tool.necomax.com

> ⚠ **KHÔNG up thư mục code vào `public_html` / thư mục của subdomain** (sự cố 21/11: lộ chìa khoá TikTok).
> Code nằm ở `/home/necomaxc/tiktok-admin` (ngoài thư mục web). Người ngoài chỉ vào được qua app.
> Server tự **từ chối chạy** nếu thấy dữ liệu bí mật nằm trong thư mục web.

Khoảng 20 phút. Làm lần lượt từ trên xuống.

## 1. Kiểm tra subdomain
cPanel → **Domains**: phải có `tool.necomax.com`. Thư mục gốc của nó (vd `/home/necomaxc/tool.necomax.com`) phải **trống**, vì hôm trước đã xoá hết.

## 2. Tải code về (Terminal)
cPanel → **Terminal**, gõ:
```
cd ~
git clone https://github.com/nghiamax/aiagenttiktok.git tiktok-admin
```

## 3. Tạo app Node
cPanel → **Setup Node.js App** → **Create Application**:

| Ô | Điền |
|---|---|
| Node.js version | **22** — cần **22.13 trở lên** (database SQLite có sẵn trong Node). Chạy `node -v` để xem |
| Application mode | Production |
| Application root | `tiktok-admin` |
| Application URL | `tool.necomax.com` (để trống phần sau dấu /) |
| Application startup file | `app.mjs` |

**Environment variables** (bấm Add Variable cho từng dòng):

| Name | Value |
|---|---|
| `PUBLIC_URL` | `https://tool.necomax.com` |
| `COOKIE_SECURE` | `1` |
| `TRUST_PROXY` | `1` |

Bấm **Create**.
⚠ **Đừng bấm "Run NPM Install"**: nút này bỏ qua các gói cần để chạy. Làm bước 4 thay cho nút đó.

## 4. Cài thư viện + build (Terminal)
Đầu trang app vừa tạo có một dòng lệnh dạng:
`source /home/necomaxc/nodevenv/tiktok-admin/22/bin/activate && cd /home/necomaxc/tiktok-admin`

Copy dòng đó, dán vào Terminal, Enter. Sau đó chạy:
```
npm install --include=dev
npx vite build
```
Nếu `vite build` báo thiếu bộ nhớ (Killed / out of memory): build trên máy tính bằng `npm run build`, nén thư mục `dist` thành zip, rồi dùng File Manager up vào `~/tiktok-admin/` và giải nén ra `~/tiktok-admin/dist`.

## 5. Mang dữ liệu lên (File Manager)
1. File Manager → mở `tiktok-admin` → tạo thư mục **`server-data`**.
2. Up 4 file từ máy (`D:\CODE\aiagenttiktok\server-data\`): `settings.json`, `agent-config.json`, `agent-state.json`, `users.json`.

**Không up** `sessions.json`, `cache`, `.secrets`.

## 6. Khởi động
Setup Node.js App → app `tool.necomax.com` → **Restart**.

## 7. HTTPS
cPanel → **SSL/TLS Status**: `tool.necomax.com` phải có ổ khoá xanh. Nếu chưa có thì bấm **Run AutoSSL**.

## 8. Giữ app luôn chạy + sao lưu (Cron Jobs)
cPanel → **Cron Jobs** → Add New Cron Job:

| Lịch | Lệnh |
|---|---|
| Every 5 minutes (`*/5 * * * *`) | `curl -fsS https://tool.necomax.com/api/health > /dev/null 2>&1` |
| Once per day (`15 3 * * *`) | `mkdir -p ~/backups && tar -czf ~/backups/server-data-$(date +\%Y\%m\%d).tar.gz -C ~/tiktok-admin --exclude=server-data/cache server-data && find ~/backups -name 'server-data-*' -mtime +14 -delete` |

Dòng đầu là để hosting không tắt app khi vắng người dùng. App có chạy thì Agent mới quét mỗi giờ được.

## 9. Dùng
1. Mở `https://tool.necomax.com` → đăng nhập.
2. **Đổi mật khẩu ngay**, vì file tài khoản đã bị lộ hôm 21/11: bấm avatar → Đổi mật khẩu.
3. Bấm tên shop → **Kết nối TikTok**.
4. Báo Claude kiểm tra từ ngoài: các file bí mật (`.secrets/…`, `server-data/app.db`, `server-data/users.json`) không tải được.

## Cập nhật code mới
Terminal:
```
source /home/necomaxc/nodevenv/tiktok-admin/22/bin/activate && cd ~/tiktok-admin
cp -a server-data ~/server-data-backup-$(date +%Y%m%d-%H%M)     # sao lưu trước mỗi lần cập nhật
git checkout -- package-lock.json                                # bỏ thay đổi npm tự ghi (nếu có)
git pull && npm install --include=dev && npx vite build
```
Sau đó vào Setup Node.js App → **Restart**.
- Luôn dùng `npm install --include=dev` (hosting chạy chế độ production — thiếu `--include=dev` sẽ mất vite / tsx, server không khởi động).
- `npx vite build` hỏi "Need to install vite@…" → bấm **n** (thiếu bước `--include=dev` ở trên).

### Lần đầu lên bản nhiều shop (database, 23/11/2026)
- Cần Node **≥ 22.13** (`node -v`). Thấp hơn → Setup Node.js App chọn bản 22 mới hơn (hoặc 24) rồi làm lại các lệnh trên.
- Khi Restart, server tự tạo `server-data/app.db` và **chép dữ liệu cũ** (tài khoản, phiên, token TikTok, thiết lập, quy tắc, đề xuất, nhật ký, theo dõi, số liệu lưu sẵn) sang shop "Phụ Kiện NECOTECH". File JSON cũ giữ nguyên. Xem `stderr.log` / log có dòng `[db] Đã chép dữ liệu cũ…`.
- Khoá mã hoá token tự sinh ở `.secrets/app-secret` (không xoá file này — mất thì phải Kết nối TikTok lại).
- Quay lại bản cũ: `git checkout <commit trước>` + build + Restart (bản cũ vẫn đọc file JSON; thay đổi làm sau khi lên bản mới sẽ không có ở bản cũ).

## Khi có lỗi
- Trang báo lỗi 503 / "Incomplete response": xem file `~/tiktok-admin/stderr.log` trong File Manager.
- Dòng "✖ KHÔNG KHỞI ĐỘNG: … thư mục web công khai" nghĩa là code đang nằm trong `public_html`. Chuyển code ra `~/tiktok-admin`.
