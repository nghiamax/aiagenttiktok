#!/usr/bin/env bash
# Sao lưu dữ liệu app mỗi ngày (cron 03:15): database (tài khoản, shop, quy tắc, nhật ký…) + file khác — bỏ cache số liệu (tải lại được)
# Không sao lưu .secrets (chìa khoá TikTok — mất thì Kết nối TikTok lại trên web)
set -euo pipefail
SRC=/opt/tiktok-admin/server-data
DST=/var/backups/tiktok-admin
KEEP=14
mkdir -p "$DST"
chmod 700 "$DST"
# Database đang chạy (WAL) → chụp bản nhất quán bằng VACUUM INTO rồi mới nén (không nén thẳng app.db đang ghi)
rm -f "$SRC/app-backup.db"
if [ -f "$SRC/app.db" ]; then
  node -e "const{DatabaseSync}=require('node:sqlite');const d=new DatabaseSync(process.argv[1]);d.exec(\"VACUUM INTO '\"+process.argv[2]+\"'\");d.close()" "$SRC/app.db" "$SRC/app-backup.db"
fi
tar -czf "$DST/server-data-$(date +%Y%m%d-%H%M).tar.gz" -C "$SRC" --exclude=./cache --exclude=./app.db --exclude=./app.db-wal --exclude=./app.db-shm .
rm -f "$SRC/app-backup.db"
ls -1t "$DST"/server-data-*.tar.gz | tail -n +$((KEEP + 1)) | xargs -r rm -f
