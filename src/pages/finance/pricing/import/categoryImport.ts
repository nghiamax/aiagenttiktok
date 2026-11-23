// Chuyển bảng phí ngành (PDF / Excel / CSV của sàn) thành danh sách ngành hàng. Logic thuần — test ở tests/pricing.test.ts

import type { ShopType } from '../calc';
import type { SavedCategory } from '../config';

export const PATH_SEP = ' › ';

/** Đọc CSV: tự nhận dấu phân cách , ; hoặc tab, hỗ trợ ô có ngoặc kép */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const delim = ['\t', ';', ','].reduce((best, d) =>
    firstLine.split(d).length > firstLine.split(best).length ? d : best,
  );
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === delim) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** Bỏ dấu tiếng Việt, chữ thường — dùng cho tìm kiếm & nhận diện tiêu đề cột */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim();
}

const SKIP_HEADER = /^(stt|no\.?|#|id|ma\b|ma nganh|category id)/;
const DEFAULT_ROW = /mac dinh/;
const MALL_HEADER = /mall/;
const STANDARD_HEADER = /(tieu chuan|standard|shop thuong|thong thuong|non-mall)/;
/** Cột phí ưu đãi (Shopee: "Mức phí ưu đãi cho Người bán mới") — xét trước "tiêu chuẩn" */
const PROMO_HEADER = /(uu dai|nguoi ban moi|new seller|khuyen mai)/;

/** Chữ Kirin trông giống chữ Latin (PDF của sàn có lẫn, vd "Pin ѕạc") */
const LOOKALIKE: Record<string, string> = {
  а: 'a',
  е: 'e',
  о: 'o',
  р: 'p',
  с: 'c',
  у: 'y',
  х: 'x',
  ѕ: 's',
  і: 'i',
  ј: 'j',
  А: 'A',
  В: 'B',
  Е: 'E',
  К: 'K',
  М: 'M',
  Н: 'H',
  О: 'O',
  Р: 'P',
  С: 'C',
  Т: 'T',
  Х: 'X',
};

/** Chuẩn hoá chữ đọc từ file: dấu thanh mã cũ (U+0340/0341) → dấu chuẩn, ghép dấu (NFC), chữ Kirin → Latin */
export function normalizeText(s: string): string {
  return s
    .replace(/̀/g, '̀')
    .replace(/́/g, '́')
    .normalize('NFC')
    .replace(/[Ѐ-ӿ]/g, (ch) => LOOKALIKE[ch] ?? ch);
}

const clean = (s: string | undefined) =>
  normalizeText(s ?? '')
    .replace(/\s+/g, ' ')
    .trim();

/** "12,5%" → {value: 12.5, percent: true} · "0.125" → {value: 0.125, percent: false} */
export function parseFee(raw: string): { value: number; percent: boolean } | null {
  const s = clean(raw);
  if (!s) return null;
  const percent = s.includes('%');
  let t = s.replace(/[%\s]/g, '');
  // Phí luôn < 100 → dấu chấm là ngăn nghìn chỉ khi có cả dấu phẩy ("1.234,5"); còn lại , hoặc . đều là thập phân
  if (t.includes('.') && t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else t = t.replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  const value = Number(t);
  return Number.isFinite(value) && value >= 0 ? { value, percent } : null;
}

export function columnCount(rows: string[][]): number {
  return rows.reduce((m, r) => Math.max(m, r.length), 0);
}

const isNumberOnly = (s: string) => /^\d+$/.test(clean(s));

/** Dòng dữ liệu: có ô % phí và có ô chữ (tên ngành) */
function isDataRow(r: string[]): boolean {
  const cells = r.map(clean).filter(Boolean);
  return (
    cells.length >= 2 &&
    cells.some((c) => parseFee(c)) &&
    cells.some((c) => !parseFee(c) && !isNumberOnly(c)) &&
    !cells.some((c) => DEFAULT_ROW.test(fold(c)))
  );
}

export interface PreparedTable {
  /** rows[0] là tiêu đề (đã ghép nhiều dòng), còn lại là dữ liệu */
  rows: string[][];
  /** % phí mặc định theo cột (dòng "Phí suất mặc định") */
  defaults: Record<number, number>;
}

const isDefaultRow = (r: string[]) => r.some((c) => DEFAULT_ROW.test(fold(clean(c))));
const isEmptyRow = (r: string[]) => r.every((c) => !clean(c));

/**
 * Chuẩn hoá bảng: ghép khối tiêu đề (các dòng liền nhau ngay trên dòng dữ liệu đầu tiên, dừng ở dòng
 * trống — tên bảng phía trên bị bỏ) thành 1 dòng, tách dòng "phí mặc định".
 */
export function prepareTable(raw: string[][]): PreparedTable {
  const cols = columnCount(raw);
  const first = raw.findIndex(isDataRow);
  const defaults: Record<number, number> = {};
  const header: string[] = Array.from({ length: cols }, () => '');

  for (const r of raw) {
    if (!isDefaultRow(r)) continue;
    r.forEach((c, ci) => {
      // % có thể nằm chung ô với chữ "Phí suất mặc định"
      const m = /(\d{1,2}(?:[.,]\d+)?)\s*%/.exec(clean(c));
      const fee = m ? parseFee(`${m[1]}%`) : parseFee(c);
      if (fee) defaults[ci] = fee.percent || fee.value > 1 ? fee.value : fee.value * 100;
    });
  }

  let start = first < 0 ? 0 : first;
  while (start > 0 && !isEmptyRow(raw[start - 1])) start--;
  for (const r of raw.slice(start, Math.max(first, start))) {
    if (isDefaultRow(r)) continue;
    r.forEach((c, ci) => {
      const v = clean(c);
      if (v) header[ci] = header[ci] ? `${header[ci]} ${v}` : v;
    });
  }

  // Tiêu đề lặp lại ở đầu mỗi trang PDF: mọi ô đều nằm trong tiêu đề cùng cột → bỏ
  const foldedHeader = header.map((h) => fold(h));
  const isRepeatedHeader = (r: string[]) =>
    r.some((c) => clean(c)) &&
    r.every((c, ci) => !clean(c) || (!!foldedHeader[ci] && foldedHeader[ci].includes(fold(clean(c)))));

  const body = (first < 0 ? raw : raw.slice(first)).filter(
    (r) => !isDefaultRow(r) && !isEmptyRow(r) && !isRepeatedHeader(r),
  );
  return { rows: [header, ...body], defaults };
}

/** Loại cột phí: theo loại shop, hoặc mức ưu đãi người bán mới (gắn vào Shop tiêu chuẩn) */
export type FeeColumnKey = ShopType | 'promo';

export interface ColumnMapping {
  /** Cột tên ngành, từ cấp lớn đến cấp nhỏ */
  nameCols: number[];
  /** Cột % phí cho từng loại (bỏ trống = không nhập loại đó) */
  feeCols: Partial<Record<FeeColumnKey, number>>;
}

/**
 * Đoán cột tên ngành và cột phí trên bảng đã `prepareTable`. Tiêu đề có "Mall" → Mall, "ưu đãi / người bán mới"
 * → phí ưu đãi, "tiêu chuẩn" → Shop tiêu chuẩn. Cột không ghi rõ → `preferShop` trước (vd file "shopee mall.pdf").
 */
export function detectMapping(rows: string[][], preferShop: ShopType = 'standard'): ColumnMapping | null {
  const cols = columnCount(rows);
  if (cols < 2) return null;
  const header = (rows[0] ?? []).map((c) => fold(clean(c)));
  const body = rows.slice(1);

  const share = (c: number, test: (v: string) => boolean) => {
    const vals = body.map((r) => clean(r[c])).filter(Boolean);
    return vals.length ? vals.filter(test).length / vals.length : 0;
  };
  const feeShare = (c: number) => share(c, (v) => !!parseFee(v) && !isNumberOnly(v));
  const pctShare = (c: number) => share(c, (v) => v.includes('%'));

  // Cột phí: phần lớn ô là số lẻ / %, không phải STT
  const feeCands: number[] = [];
  for (let c = 0; c < cols; c++) {
    if (SKIP_HEADER.test(header[c] ?? '')) continue;
    if (feeShare(c) + pctShare(c) >= 0.6) feeCands.push(c);
  }
  if (feeCands.length === 0) return null;

  const feeCols: Partial<Record<FeeColumnKey, number>> = {};
  for (const c of feeCands) {
    const h = header[c] ?? '';
    if (PROMO_HEADER.test(h) && feeCols.promo == null) feeCols.promo = c;
    else if (MALL_HEADER.test(h) && feeCols.mall == null) feeCols.mall = c;
    else if (STANDARD_HEADER.test(h) && feeCols.standard == null) feeCols.standard = c;
  }
  const order: ShopType[] = preferShop === 'mall' ? ['mall', 'standard'] : ['standard', 'mall'];
  for (const c of feeCands) {
    if (Object.values(feeCols).includes(c)) continue;
    const free = order.find((s) => feeCols[s] == null);
    if (free) feeCols[free] = c;
  }
  // Phí ưu đãi chỉ đi kèm Shop tiêu chuẩn
  if (feeCols.promo != null && feeCols.standard == null) delete feeCols.promo;

  // Cột tên: chủ yếu là chữ, không phải STT / mã / cột phí
  const nameCols: number[] = [];
  for (let c = 0; c < cols; c++) {
    if (feeCands.includes(c) || SKIP_HEADER.test(header[c] ?? '')) continue;
    const vals = body.map((r) => clean(r[c])).filter(Boolean);
    if (vals.length === 0 || share(c, (v) => !!parseFee(v)) > 0.5) continue;
    nameCols.push(c);
  }
  if (nameCols.length === 0) return null;
  return { nameCols, feeCols };
}

/** Ngày áp dụng ghi trong tiêu đề cột: "Từ 20-10-2026" → "2026-10-20" */
export function effectiveDateOf(headerText: string): string | null {
  const m = /(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/.exec(headerText ?? '');
  if (!m) return null;
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

/** ID ổn định theo tên → tải lại file vẫn giữ ngành đang chọn / gần đây */
export function categoryId(name: string): string {
  let h = 2166136261;
  for (const ch of fold(name)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return `cat-${(h >>> 0).toString(36)}`;
}

export interface ImportResult {
  categories: SavedCategory[];
  /** Dòng có tên nhưng không đọc được % phí */
  skipped: number;
}

/** Danh sách ngành của 1 cột phí. `rows[0]` là tiêu đề. */
export function buildCategories(rows: string[][], nameCols: number[], feeCol: number): ImportResult {
  const body = rows.slice(1);
  // Ô gộp trong Excel chỉ có chữ ở dòng đầu → điền xuống cho các dòng dưới
  const carry: string[] = nameCols.map(() => '');
  const parsed: { name: string; fee: { value: number; percent: boolean } }[] = [];
  let skipped = 0;
  for (const r of body) {
    const levels = nameCols.map((c) => clean(r[c]));
    const deepest = levels.reduce((d, v, i) => (v ? i : d), -1);
    if (deepest < 0) continue;
    levels.forEach((v, i) => {
      if (v) carry[i] = v;
      else if (i < deepest) levels[i] = carry[i];
    });
    for (let i = deepest + 1; i < carry.length; i++) carry[i] = '';
    const fee = parseFee(r[feeCol] ?? '');
    const parts = levels.slice(0, deepest + 1).filter((v, i, a) => v && v !== a[i - 1]);
    if (!fee) {
      skipped++;
      continue;
    }
    parsed.push({ name: parts.join(PATH_SEP), fee });
  }
  // Excel lưu ô định dạng % dạng phân số (0,125) → cả cột ≤ 1 thì nhân 100
  const plain = parsed.filter((p) => !p.fee.percent);
  const fractional = plain.length > 0 && plain.every((p) => p.fee.value <= 1);
  const byName = new Map<string, SavedCategory>();
  for (const p of parsed) {
    const pct = p.fee.percent || !fractional ? p.fee.value : p.fee.value * 100;
    const rounded = Math.round(pct * 1e4) / 1e4;
    if (rounded > 99) {
      skipped++;
      continue;
    }
    byName.set(fold(p.name), { id: categoryId(p.name), name: p.name, pct: rounded });
  }
  return { categories: [...byName.values()], skipped };
}

/** Gắn mức phí ưu đãi (cột riêng) vào danh sách ngành theo ID ngành */
export function attachPromo(categories: SavedCategory[], promo: SavedCategory[]): SavedCategory[] {
  const byId = new Map(promo.map((c) => [c.id, c.pct]));
  return categories.map((c) => {
    const p = byId.get(c.id);
    const { promoPct: _old, ...rest } = c;
    return p != null ? { ...rest, promoPct: p } : rest;
  });
}

/** Loại shop gợi ý theo tên file: "shopee mall.pdf" → Mall, "shopee thường.pdf" → Shop tiêu chuẩn */
export function shopFromFileName(fileName: string): ShopType | null {
  const f = fold(fileName);
  if (/mall/.test(f)) return 'mall';
  if (/(thuong|tieu chuan|standard)/.test(f)) return 'standard';
  return null;
}

/** Gộp: ngành trùng tên lấy % mới, ngành mới thêm vào, ngành cũ không có trong file giữ nguyên */
export function mergeCategories(current: SavedCategory[], incoming: SavedCategory[]): SavedCategory[] {
  const map = new Map(current.map((c) => [fold(c.name), c]));
  for (const c of incoming) map.set(fold(c.name), { ...c, id: map.get(fold(c.name))?.id ?? c.id });
  return [...map.values()];
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Tìm ngành: mọi từ khoá đều phải có (không phân biệt dấu). Xếp hạng: khớp nguyên chữ ở tên ngành cuối
 * > khớp một phần ở tên cuối > khớp nguyên chữ ở cấp trên > còn lại.
 */
export function searchCategories(categories: SavedCategory[], query: string, limit = 60): SavedCategory[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return categories.slice(0, limit);
  const whole = words.map((w) => new RegExp(`(^|[^a-z0-9])${escapeRe(w)}($|[^a-z0-9])`));
  const scored: { c: SavedCategory; score: number; i: number }[] = [];
  categories.forEach((c, i) => {
    const name = fold(c.name);
    if (!words.every((w) => name.includes(w))) return;
    const leaf = fold(c.name.split(PATH_SEP).pop() ?? '');
    const score = words.reduce(
      (s, w, wi) => s + (whole[wi].test(leaf) ? 4 : leaf.includes(w) ? 2 : whole[wi].test(name) ? 1 : 0),
      0,
    );
    scored.push({ c, score, i });
  });
  return scored
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, limit)
    .map((s) => s.c);
}

export const TEMPLATE_CSV =
  '﻿Ngành cấp 1,Ngành cấp 2,Ngành cấp 3,Phí Shop tiêu chuẩn (%),Phí Mall (%)\n' +
  'Thiết bị điện tử,Máy tính & Thiết bị văn phòng,Thiết bị ngoại vi & Phụ kiện,,\n' +
  'Thời trang nữ,Áo,Áo thun,,\n';
