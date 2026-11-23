import { parseCsv } from './categoryImport';
import { pdfPagesToRows } from './pdfTable';
import { readXlsx, type Sheet } from './xlsx';

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
  return [{ name: file.name, rows: parseCsv(await file.text()) }];
}
