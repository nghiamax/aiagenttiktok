// Xuất bảng tính hàng loạt ra Excel
import type { XlsxCell } from './writeXlsx';
import type { BulkRow } from './bulkRows';
import type { BulkStatus } from './bulkCalc';

export const STATUS_TEXT: Record<BulkStatus, string> = {
  'missing-cost': 'Thiếu giá vốn',
  'missing-price': 'Chưa có giá bán',
  impossible: 'Tổng % phí + lãi ≥ 100%',
  loss: 'Đang lỗ',
  'below-target': 'Lãi dưới mục tiêu',
  ok: 'Đạt mục tiêu',
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function categoryLabel(r: BulkRow): string {
  if ('category' in r.category) return r.category.category.name;
  if (r.category.kind === 'default') return 'Mặc định (không khớp ngành)';
  return '';
}

export function bulkExportTable(
  rows: BulkRow[],
  marginPct: number,
): { header: string[]; rows: XlsxCell[][]; widths: number[] } {
  const header = [
    'ID sản phẩm',
    'ID SKU',
    'SKU người bán',
    'Tên sản phẩm',
    'Biến thể',
    'Ngành trong file',
    'Ngành áp dụng',
    'Phí ngành (%)',
    'Trọng lượng (g)',
    'Giá vốn',
    'Giá bán',
    'Tồn kho',
    'Tổng phí + QC + thuế',
    'Tiền về',
    'Lãi / đơn',
    'Lãi (% giá bán)',
    `Giá đề xuất (lãi ${marginPct}%)`,
    'Chênh lệch (đề xuất − giá bán)',
    'Ghi chú',
  ];
  const out = rows.map((r): XlsxCell[] => {
    const c = r.result.current;
    return [
      r.item.productId,
      r.item.skuId,
      r.item.sellerSku,
      r.item.name,
      r.item.variant,
      r.item.category,
      categoryLabel(r),
      round2(r.categoryPct),
      r.item.weightG,
      r.cost,
      r.price,
      r.item.stock,
      c ? Math.round(c.totalDeductions) : null,
      c ? Math.round(c.netReceived) : null,
      c ? Math.round(c.profit) : null,
      c?.marginPct != null ? round2(c.marginPct) : null,
      r.result.suggested,
      r.result.diff,
      STATUS_TEXT[r.result.status],
    ];
  });
  return {
    header,
    rows: out,
    widths: [20, 20, 14, 48, 18, 30, 40, 12, 14, 12, 12, 10, 16, 12, 12, 14, 18, 18, 18],
  };
}
