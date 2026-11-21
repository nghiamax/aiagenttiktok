# Đưa web lên VPS

Thời gian: khoảng 15–20 phút. Cần: VPS (Ubuntu/Debian), tên miền, máy tính có PowerShell.

## 0. Kiểm tra VPS
Đăng nhập VPS (PowerShell trên máy):
```
ssh root@<IP VPS>
cat /etc/os-release
```
Dòng `NAME=` phải là **Ubuntu** hoặc **Debian**. Nếu là hệ khác, báo lại để đổi cách cài.
RAM nên từ 1 GB trở lên (`free -h`).

## 1. Trỏ tên miền về VPS
Vào trang quản lý tên miền, tạo bản ghi:
| Loại | Tên | Giá trị |
|---|---|---|
| A | `ads` (hoặc tên con tuỳ chọn) | `<IP VPS>` |

Đợi vài phút. Kiểm tra trên máy bằng lệnh `nslookup ads.tenmien.vn`: phải ra đúng IP VPS. **Cần trỏ xong trước bước 2** để HTTPS tự cấp được.

## 2. Cài đặt (trên VPS)
```
curl -fsSL https://raw.githubusercontent.com/nghiamax/aiagenttiktok/master/deploy/setup.sh -o setup.sh
sudo bash setup.sh ads.tenmien.vn
```
Script làm những việc sau:
- cài Node 22 và Caddy (HTTPS);
- tải code về `/opt/tiktok-admin`, build;
- chạy nền và tự bật lại khi VPS khởi động lại;
- mở tường lửa cổng 22, 80, 443;
- sao lưu dữ liệu lúc 3h15 mỗi ngày.

## 3. Mang dữ liệu đang có lên (chạy trên máy tính)
Gồm ROI hoà vốn, nhóm, quy tắc Agent, nhật ký và tài khoản web. **Không mang chìa khoá TikTok.**

Mở PowerShell trong thư mục dự án:
```
scp server-data/settings.json server-data/agent-config.json server-data/agent-state.json server-data/users.json root@<IP VPS>:/opt/tiktok-admin/server-data/
```
Sau đó chạy trên VPS:
```
sudo chown -R app:app /opt/tiktok-admin/server-data && sudo systemctl restart tiktok-admin
```
Nếu bắt đầu mới (không mang dữ liệu), tạo tài khoản web trên VPS:
```
cd /opt/tiktok-admin && sudo -u app npm run user -- add <tên đăng nhập>
```

## 4. Kết nối TikTok
1. Mở `https://ads.tenmien.vn` và đăng nhập.
2. Bấm **Kết nối TikTok** rồi đăng nhập TikTok for Business.

Nên **ngắt kết nối trên máy tính** sau khi VPS đã kết nối (bấm tên shop → Ngắt kết nối ở bản chạy trên máy), để không có 2 server cùng chạy Agent.

## Việc thường gặp
| Việc | Lệnh trên VPS |
|---|---|
| Cập nhật code mới | `sudo bash /opt/tiktok-admin/deploy/update.sh` |
| Xem log | `journalctl -u tiktok-admin -f` |
| Khởi động lại | `sudo systemctl restart tiktok-admin` |
| Đổi mật khẩu web | `cd /opt/tiktok-admin && sudo -u app npm run user -- passwd <tên>` |
| Bản sao lưu | `/var/backups/tiktok-admin/` |

## An toàn
- Server chỉ nghe trong máy (127.0.0.1); từ ngoài vào phải qua Caddy (HTTPS).
- Cookie đăng nhập chỉ gửi qua HTTPS (`COOKIE_SECURE=1`).
- Chìa khoá TikTok nằm trong `/opt/tiktok-admin/.secrets` (chỉ user `app` đọc được) và không sao lưu.
- Nên đăng nhập SSH bằng khoá thay cho mật khẩu.
