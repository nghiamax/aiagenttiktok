// Cập nhật bảng phí ngành cho hệ thống (chỉ admin chạy — khách không tự tải bảng phí trên web).
//
//   npm run fees:update -- --platform tiktok --file "C:/…/Phí hoa hồng nền Tảng.pdf"
//   npm run fees:update -- --platform shopee --file "shopee thường.pdf"
//   npm run fees:update -- --platform shopee --file "shopee mall.pdf" [--shop mall]
//
// Đọc PDF / Excel / CSV bằng đúng bộ đọc của trang (pdfTable + categoryImport), ghi vào
// src/data/category-fees.json (chỉ thay bảng của sàn × loại shop có trong file). Sau đó build / deploy để đẩy lên.
// 1 file có thể chứa cả Shop tiêu chuẩn + Mall (TikTok); Shopee Shop thường có thêm cột ưu đãi người bán mới.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { pdfPagesToRows, type PdfTextItem } from '../src/pages/finance/pricing/import/pdfTable';
import {
  attachPromo,
  buildCategories,
  detectMapping,
  effectiveDateOf,
  parseCsv,
  prepareTable,
  shopFromFileName,
} from '../src/pages/finance/pricing/import/categoryImport';
import { readXlsx } from '../src/pages/finance/pricing/import/xlsx';
import { encodeTable, type RawCategoryFees } from '../src/pages/finance/pricing/categoryTables';
import type { Platform, ShopType } from '../src/pages/finance/pricing/calc';

const OUT = resolve(import.meta.dirname, '../src/data/category-fees.json');

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function readRows(file: string): Promise<string[][]> {
  const lower = file.toLowerCase();
  const buf = readFileSync(file);
  if (lower.endsWith('.pdf')) {
    const doc = await getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise;
    const pages: PdfTextItem[][] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const content = await (await doc.getPage(p)).getTextContent();
      const items: PdfTextItem[] = [];
      for (const it of content.items) {
        if (!('str' in it) || !it.str.trim()) continue;
        items.push({ str: it.str, x: it.transform[4], y: it.transform[5], width: it.width });
      }
      pages.push(items);
    }
    await doc.destroy();
    return pdfPagesToRows(pages);
  }
  if (lower.endsWith('.xlsx')) {
    const sheets = await readXlsx(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
    return sheets.sort((a, b) => b.rows.length - a.rows.length)[0].rows;
  }
  return parseCsv(buf.toString('utf8'));
}

async function main() {
  const platform = arg('platform') as Platform | undefined;
  const file = arg('file');
  const shopArg = arg('shop') as ShopType | undefined;
  if ((platform !== 'tiktok' && platform !== 'shopee') || !file) {
    console.error(
      'Cách dùng: npm run fees:update -- --platform tiktok|shopee --file <đường dẫn> [--shop standard|mall]',
    );
    process.exit(1);
  }
  const name = basename(file);
  const { rows, defaults } = prepareTable(await readRows(file));
  const mapping = detectMapping(rows, shopArg ?? shopFromFileName(name) ?? 'standard');
  if (!mapping) throw new Error('Không nhận ra cột tên ngành / cột phí trong file.');

  const data: RawCategoryFees = existsSync(OUT)
    ? (JSON.parse(readFileSync(OUT, 'utf8')) as RawCategoryFees)
    : { version: 1, tables: {} };
  const updatedAt = new Date().toISOString();
  const header = rows[0] ?? [];

  for (const shop of ['standard', 'mall'] as ShopType[]) {
    const col = mapping.feeCols[shop];
    if (col == null) continue;
    let { categories, skipped } = buildCategories(rows, mapping.nameCols, col);
    if (shop === 'standard' && mapping.feeCols.promo != null) {
      categories = attachPromo(categories, buildCategories(rows, mapping.nameCols, mapping.feeCols.promo).categories);
    }
    if (!categories.length) continue;
    data.tables[`${platform}:${shop}`] = encodeTable(categories, {
      source: name,
      updatedAt,
      effectiveFrom: effectiveDateOf(header[col] ?? ''),
      defaultPct: defaults[col] ?? null,
    });
    const promo = categories.filter((c) => c.promoPct != null).length;
    console.log(
      `✔ ${platform}:${shop} — ${categories.length} ngành${promo ? ` (${promo} có ưu đãi NB mới)` : ''}` +
        `${skipped ? ` · bỏ qua ${skipped} dòng` : ''} · mặc định ${defaults[col] ?? '--'}% · từ ${effectiveDateOf(header[col] ?? '') ?? '--'}`,
    );
  }
  writeFileSync(OUT, JSON.stringify(data));
  console.log(`Đã ghi ${OUT}. Build / deploy để đẩy lên hệ thống.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
