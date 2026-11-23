// Đọc chữ (kèm vị trí) trong file PDF bằng pdf.js — chỉ nạp thư viện khi người dùng chọn file PDF.
import type { PdfTextItem } from './pdfTable';

export async function readPdfItems(data: ArrayBuffer): Promise<PdfTextItem[][]> {
  const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  const doc = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
  try {
    const pages: PdfTextItem[][] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const items: PdfTextItem[] = [];
      for (const it of content.items) {
        if (!('str' in it) || !it.str.trim()) continue;
        items.push({ str: it.str, x: it.transform[4], y: it.transform[5], width: it.width });
      }
      pages.push(items);
      page.cleanup();
    }
    return pages;
  } finally {
    await doc.destroy();
  }
}
