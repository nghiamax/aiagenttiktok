#!/usr/bin/env bash
# Cài web TikTok Shop Admin lên VPS Ubuntu/Debian (chạy 1 lần):
#   sudo bash setup.sh ads.tenmien.vn
# Làm: cài Node 22 + Caddy (HTTPS tự động) → tải code về /opt/tiktok-admin → build → chạy nền (systemd)
#      → mở tường lửa 22/80/443 → sao lưu dữ liệu mỗi ngày.
# Không chứa mật khẩu / token nào. Tài khoản web tạo sau bằng: sudo -u app npm run user -- add <tên>
set -euo pipefail

DOMAIN="${1:-}"
REPO="${REPO:-https://github.com/nghiamax/aiagenttiktok.git}"
APP_DIR=/opt/tiktok-admin
APP_USER=app

if [[ -z "$DOMAIN" ]]; then echo "Cách dùng: sudo bash setup.sh <tên miền, vd ads.tenmien.vn>"; exit 1; fi
if [[ $EUID -ne 0 ]]; then echo "Cần chạy bằng sudo"; exit 1; fi
if ! grep -qiE 'ubuntu|debian' /etc/os-release; then echo "Script này dành cho Ubuntu/Debian"; exit 1; fi

echo "▶ 1/7 Cài gói cơ bản"
apt-get update -y
apt-get install -y curl git ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https ufw

echo "▶ 2/7 Cài Node.js 22"
if ! command -v node >/dev/null || [[ "$(node -v | cut -d. -f1)" != "v22" ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
node -v

echo "▶ 3/7 Cài Caddy (HTTPS tự cấp chứng chỉ)"
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi

echo "▶ 4/7 Tải code + build"
id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --shell /bin/bash "$APP_USER"
if [[ ! -d "$APP_DIR/.git" ]]; then
  git clone "$REPO" "$APP_DIR"
fi
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
sudo -u "$APP_USER" bash -c "cd $APP_DIR && git pull --ff-only && npm ci && npm run build"

echo "▶ 5/7 Cấu hình .env"
if [[ ! -f "$APP_DIR/.env" ]]; then
  sed "s#<TEN_MIEN>#$DOMAIN#g" "$APP_DIR/deploy/env.example" > "$APP_DIR/.env"
  chown "$APP_USER:$APP_USER" "$APP_DIR/.env"
  chmod 600 "$APP_DIR/.env"
fi
sudo -u "$APP_USER" mkdir -p "$APP_DIR/server-data" "$APP_DIR/.secrets"
chmod 700 "$APP_DIR/server-data" "$APP_DIR/.secrets"

echo "▶ 6/7 Chạy nền + HTTPS"
cp "$APP_DIR/deploy/tiktok-admin.service" /etc/systemd/system/tiktok-admin.service
systemctl daemon-reload
systemctl enable --now tiktok-admin
sed "s#<TEN_MIEN>#$DOMAIN#g" "$APP_DIR/deploy/Caddyfile" > /etc/caddy/Caddyfile
systemctl reload caddy || systemctl restart caddy

ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "▶ 7/7 Sao lưu dữ liệu mỗi ngày (giữ 14 bản, /var/backups/tiktok-admin)"
install -m 755 "$APP_DIR/deploy/backup.sh" /usr/local/bin/tiktok-admin-backup
echo "15 3 * * * root /usr/local/bin/tiktok-admin-backup" > /etc/cron.d/tiktok-admin-backup

echo
echo "✔ Xong. Bước tiếp theo:"
echo "  1. (Nếu mang dữ liệu cũ lên) copy file vào $APP_DIR/server-data rồi: sudo systemctl restart tiktok-admin"
echo "  2. Chưa có tài khoản web: cd $APP_DIR && sudo -u $APP_USER npm run user -- add <tên đăng nhập>"
echo "  3. Mở https://$DOMAIN → đăng nhập → bấm tên shop → Kết nối TikTok"
