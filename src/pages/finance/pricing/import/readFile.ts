import { parseCsv } from './categoryImport';
import { pdfPagesToRows } from './pdfTable';
import { readXlsx, readZip, type Sheet } from './xlsx';

export const ACCEPTED_FILES = '.pdf,.xlsx,.csv,.tsv,.txt';

/** Đọc file người dùng chọn thành các trang tính (PDF gộp mọi trang thành 1 bảng) */
export async function readTableFile(file: File): Promise<Sheet[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.xls')) {
    throw new Error('File .xls (Excel cũ) chưa hỗ trợ — mở bằng Excel rồi "Lưu thành" .xlsx hoặc .csv.');
  }
  if (name.endsWith('.pdf')) {
    const { readPdfItems } = await import('./readPdf');
    const rows = pdfPagesToRows(await readPdfItems(await file.arrayBuffer()));
    if (rows.length === 0) {
      throw new Error(
        'Không thấy bảng chữ trong file PDF (có thể là ảnh scan). Hãy dùng file PDF/Excel tải trực tiếp từ sàn.',
      );
    }
    return [{ name: file.name, rows }];
  }
  if (name.endsWith('.xlsx')) return readXlsx(await file.arrayBuffer());
  // File nén (Shopee gửi đơn hàng nhiều file Excel trong 1 zip) → gộp mọi trang tính của các file bên trong
  if (name.endsWith('.zip')) {
    const sheets: Sheet[] = [];
    for (const f of await readZip(await file.arrayBuffer())) {
      const n = f.name.toLowerCase();
      if (n.endsWith('.xlsx'))
        sheets.push(...(await readXlsx(f.data)).map((s) => ({ ...s, name: `${f.name} · ${s.name}` })));
      else if (/\.(csv|tsv|txt)$/.test(n))
        sheets.push({ name: f.name, rows: parseCsv(new TextDecoder().decode(f.data)) });
    }
    if (sheets.length === 0) throw new Error('File .zip không có file Excel / CSV nào bên trong');
    return sheets;
  }
  return [{ name: file.name, rows: parseCsv(await file.text()) }];
}
