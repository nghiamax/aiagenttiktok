import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

/*
 * Mã hoá token TikTok trong database (AES-256-GCM). Khoá: APP_SECRET (biến môi trường) hoặc tự sinh 1 lần
 * vào .secrets/app-secret (0600, không commit, nằm ngoài thư mục web) — lộ riêng file DB không dùng được token.
 * Mất khoá = phải Kết nối TikTok lại (không mất dữ liệu khác).
 */

const PREFIX = 'v1';
let key: Buffer | null = null;

function loadKey(): Buffer {
  if (key) return key;
  const fromEnv = process.env.APP_SECRET;
  let secret: string;
  if (fromEnv && fromEnv.length >= 32) {
    secret = fromEnv;
  } else {
    const file = path.join(config.secretsDir, 'app-secret');
    try {
      secret = fs.readFileSync(file, 'utf8').trim();
    } catch {
      secret = '';
    }
    if (secret.length < 32) {
      secret = crypto.randomBytes(32).toString('base64');
      fs.mkdirSync(config.secretsDir, { recursive: true });
      // wx: tiến trình khác vừa tạo trước → đọc lại khoá của nó
      try {
        fs.writeFileSync(file, secret, { mode: 0o600, flag: 'wx' });
      } catch {
        secret = fs.readFileSync(file, 'utf8').trim();
      }
    }
  }
  key = crypto.createHash('sha256').update(secret).digest();
  return key;
}

export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', loadKey(), iv);
  const data = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [PREFIX, iv.toString('base64'), c.getAuthTag().toString('base64'), data.toString('base64')].join(':');
}

/** null = sai khoá / hỏng dữ liệu */
export function decrypt(enc: string): string | null {
  const [v, iv, tag, data] = enc.split(':');
  if (v !== PREFIX || !iv || !tag || !data) return null;
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', loadKey(), Buffer.from(iv, 'base64'));
    d.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8');
  } catch {
    return null;
  }
}

/** Test: quên khoá đã nạp */
export function resetSecretCache() {
  key = null;
}
