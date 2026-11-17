// Tra username tác giả cho video trong src/data/ads-snapshot.json để tạo link
// https://www.tiktok.com/@<username>/video/<id>. Đọc trang công khai của TikTok.
// Chạy: node scripts/resolve-video-authors.mjs   (chỉ tra video chưa có authorUsername)
import fs from 'node:fs';

const FILE = new URL('../src/data/ads-snapshot.json', import.meta.url);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';
// TikTok chặn nếu gọi dồn dập (trả trang ~1,5KB) → chạy tuần tự, nghỉ giữa các lần, thử lại khi bị chặn
const CONCURRENCY = 1;
const DELAY_MS = 1500;
const RETRIES = 3;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const snapshot = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const known = new Map();
for (const v of snapshot.videos) if (v.authorUsername) known.set(v.id, v.authorUsername);

const ids = [
  ...new Set(snapshot.videos.filter((v) => v.contentType === 'video' && !known.has(v.id)).map((v) => v.id)),
];
console.log(`Cần tra ${ids.length} video`);

async function resolve(id) {
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    try {
      const res = await fetch(`https://www.tiktok.com/@_/video/${id}`, { headers: { 'User-Agent': UA } });
      const html = await res.text();
      // Lấy uniqueId trong khối author của chính video này
      const m = html.match(/"author":\{[^}]*?"uniqueId":"([^"]+)"/) ?? html.match(/"uniqueId":"([^"]+)"/);
      if (m) return m[1];
      // Trang lớn mà không có uniqueId → video riêng tư/đã xoá, không thử lại
      if (html.length > 50_000) return null;
    } catch {
      // lỗi mạng → thử lại
    }
    await sleep(5000 * (attempt + 1));
  }
  return null;
}

let done = 0;
let failed = 0;
const queue = [...ids];
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      const id = queue.shift();
      const name = await resolve(id);
      if (name) known.set(id, name);
      else failed++;
      done++;
      if (done % 25 === 0) console.log(`${done}/${ids.length}`);
      await sleep(DELAY_MS);
    }
  }),
);

snapshot.videos = snapshot.videos.map((v) => ({ ...v, authorUsername: known.get(v.id) ?? v.authorUsername ?? null }));
fs.writeFileSync(FILE, JSON.stringify(snapshot, null, 2) + '\n');
console.log(`Xong. Không tra được: ${failed}`);
