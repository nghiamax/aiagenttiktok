#!/usr/bin/env bash
# Cập nhật code mới nhất trên VPS:  sudo bash /opt/tiktok-admin/deploy/update.sh
# Sao lưu dữ liệu trước → tải code → build → chạy test → khởi động lại. Build / test lỗi thì giữ bản đang chạy.
set -euo pipefail
APP_DIR=/opt/tiktok-admin
/usr/local/bin/tiktok-admin-backup || true
sudo -u app bash -c "cd $APP_DIR && git pull --ff-only && npm ci && npm test && npm run build"
systemctl restart tiktok-admin
sleep 3
curl -fsS http://127.0.0.1:8787/api/health >/dev/null && echo "✔ Đã cập nhật, server chạy bình thường" || { echo "✖ Server chưa lên — xem: journalctl -u tiktok-admin -n 50"; exit 1; }
