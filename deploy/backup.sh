#!/usr/bin/env bash
# Sao lưu dữ liệu app mỗi ngày (cron 03:15): thiết lập, quy tắc, nhật ký, tài khoản web — bỏ cache số liệu (tải lại được)
# Không sao lưu .secrets (chìa khoá TikTok — mất thì Kết nối TikTok lại trên web)
set -euo pipefail
SRC=/opt/tiktok-admin/server-data
DST=/var/backups/tiktok-admin
KEEP=14
mkdir -p "$DST"
chmod 700 "$DST"
tar -czf "$DST/server-data-$(date +%Y%m%d-%H%M).tar.gz" -C "$SRC" --exclude=./cache .
ls -1t "$DST"/server-data-*.tar.gz | tail -n +$((KEEP + 1)) | xargs -r rm -f
