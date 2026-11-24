// Đọc file Excel .xlsx không cần thư viện: .xlsx là file zip chứa XML.
// Giải nén bằng DecompressionStream('deflate-raw') có sẵn trong trình duyệt (và Node 18+).

export interface Sheet {
  name: string;
  rows: string[][];
}

interface ZipEntry {
  method: number;
  compSize: number;
  localOffset: number;
}

function readZipEntries(buf: Uint8Array): Map<string, ZipEntry> {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Không phải file Excel .xlsx hợp lệ');
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const entries = new Map<string, ZipEntry>();
  const dec = new TextDecoder();
  for (let i = 0; i < count; i++) {
    if (view.getUint32(p, true) !== 0x02014b50) break;
    const method = view.getUint16(p + 10, true);
    const compSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen));
    entries.set(name, { method, compSize, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function readEntry(buf: Uint8Array, entry: ZipEntry): Promise<string> {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const o = entry.localOffset;
  const start = o + 30 + view.getUint16(o + 26, true) + view.getUint16(o + 28, true);
  const data = buf.slice(start, start + entry.compSize);
  if (entry.method === 0) return new TextDecoder().decode(data);
  if (entry.method !== 8) throw new Error('File Excel dùng kiểu nén không hỗ trợ');
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(stream).text();
}

async function readEntryBytes(buf: Uint8Array, entry: ZipEntry): Promise<Uint8Array> {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const o = entry.localOffset;
  const start = o + 30 + view.getUint16(o + 26, true) + view.getUint16(o + 28, true);
  const data = buf.slice(start, start + entry.compSize);
  if (entry.method === 0) return data;
  if (entry.method !== 8) throw new Error('File nén dùng kiểu nén không hỗ trợ');
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Giải nén file .zip (vd Shopee gửi nhiều file Excel trong 1 zip) → các file bên trong (bỏ thư mục / file ẩn) */
export async function readZip(data: ArrayBuffer): Promise<{ name: string; data: ArrayBuffer }[]> {
  const buf = new Uint8Array(data);
  const out: { name: string; data: ArrayBuffer }[] = [];
  for (const [name, entry] of readZipEntries(buf)) {
    const base = name.split('/').pop() ?? '';
    if (!base || name.endsWith('/') || base.startsWith('.') || name.startsWith('__MACOSX')) continue;
    const bytes = await readEntryBytes(buf, entry);
    out.push({
      name: base,
      data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    });
  }
  return out;
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(Number.parseInt(n, 16)))
    .replace(/&amp;/g, '&');
}

/** Gộp mọi <t>…</t> trong một khối (chuỗi có nhiều đoạn định dạng) */
function textOf(xml: string): string {
  let out = '';
  for (const m of xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) out += m[1];
  return decodeXml(out);
}

function attr(attrs: string, name: string): string | null {
  const m = new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(attrs);
  return m ? m[1] : null;
}

function colIndex(ref: string): number {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, '')) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function parseSheetXml(xml: string, shared: string[]): string[][] {
  const rows: string[][] = [];
  for (const rm of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const r = Number(attr(rm[1], 'r')) - 1;
    const idx = Number.isFinite(r) && r >= 0 ? r : rows.length;
    // File xuất của TikTok ("Tất cả đơn hàng.xlsx") ghi mỗi ô thành 1 thẻ <row> riêng cùng số dòng → gộp vào dòng đã có
    const row: string[] = rows[idx] ?? [];
    let next = row.length;
    for (const cm of rm[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = attr(cm[1], 'r');
      const c = ref ? colIndex(ref) : next;
      next = c + 1;
      const body = cm[2] ?? '';
      const t = attr(cm[1], 't');
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let value = '';
      if (t === 's' && v != null) value = shared[Number(v)] ?? '';
      else if (t === 'inlineStr') value = textOf(body);
      else if (v != null) value = decodeXml(v);
      row[c] = value;
    }
    rows[idx] = Array.from(row, (x) => x ?? '');
  }
  return Array.from(rows, (x) => x ?? []);
}

/** Đọc mọi trang tính của file .xlsx thành bảng chữ */
export async function readXlsx(data: ArrayBuffer): Promise<Sheet[]> {
  const buf = new Uint8Array(data);
  const entries = readZipEntries(buf);
  const get = async (name: string) => {
    const e = entries.get(name);
    return e ? readEntry(buf, e) : null;
  };

  const sharedXml = await get('xl/sharedStrings.xml');
  const shared = sharedXml ? [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1])) : [];

  const workbook = (await get('xl/workbook.xml')) ?? '';
  const rels = (await get('xl/_rels/workbook.xml.rels')) ?? '';
  const targets = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const id = attr(m[1], 'Id');
    const target = attr(m[1], 'Target');
    if (id && target) targets.set(id, target.replace(/^\/?(xl\/)?/, 'xl/'));
  }

  const sheets: Sheet[] = [];
  for (const m of workbook.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const name = decodeXml(attr(m[1], 'name') ?? `Trang ${sheets.length + 1}`);
    const target = targets.get(attr(m[1], 'r:id') ?? '');
    const xml = target ? await get(target) : null;
    if (xml) sheets.push({ name, rows: parseSheetXml(xml, shared) });
  }
  if (sheets.length === 0) throw new Error('Không đọc được trang tính nào trong file');
  return sheets;
}
