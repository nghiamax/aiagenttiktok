import { readTableFile } from '../pricing/import/readFile';
import { parseProfitRows, type ProfitFileKind } from './profitImport';
import { parseShopeeServiceFees, splitServiceFees } from './shopeeImport';
import type { ProfitFile } from './useProfitStore';

export const PROFIT_ACCEPT = '.xlsx,.csv,.tsv,.txt,.zip';

export const KIND_LABEL: Record<ProfitFileKind, string> = {
  orders: 'Đơn hàng',
  income: 'Quyết toán',
  ads: 'Quảng cáo',
};

export const fileKindLabel = (f: Pick<ProfitFile, 'kind' | 'settled' | 'platform' | 'adsType'>) => {
  if (f.platform === 'shopee') {
    if (f.kind === 'income') return 'Đã thanh toán';
    if (f.kind === 'ads') return f.adsType === 'auto' ? 'QC tự động' : 'QC nhóm';
  }
  return f.kind === 'income' ? (f.settled ? 'Đã quyết toán' : 'Chờ quyết toán') : KIND_LABEL[f.kind];
};

// Sheet có dữ liệu nằm trước: đơn hàng / quyết toán ưu tiên hơn bảng chỉ có cột "Chi phí"
const PRIORITY: Record<ProfitFileKind, number> = { orders: 0, income: 1, ads: 2 };

function rangeOf(dates: (string | null)[]): ProfitFile['range'] {
  const d = dates.filter((x): x is string => !!x).sort();
  return d.length ? { from: d[0], to: d[d.length - 1] } : null;
}

/** Đọc 1 file → dữ liệu (lấy sheet phù hợp nhất trong file Excel nhiều sheet) */
export async function readProfitFile(file: File): Promise<ProfitFile> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.pdf')) throw new Error(`${file.name}: hãy tải file Excel (.xlsx) hoặc .csv từ Seller Center.`);
  const sheets = await readTableFile(file);
  const parsed = sheets
    .map((s) => parseProfitRows(s.rows, file.name))
    .filter((p): p is NonNullable<typeof p> => !!p)
    .sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind]);
  const p = parsed.find((x) => (x.orders ?? x.income ?? x.ads ?? []).length > 0) ?? parsed[0];
  if (!p) {
    throw new Error(
      `${file.name}: không nhận ra loại file. TikTok: file "Tất cả đơn hàng", quyết toán (income / onhold), báo cáo quảng cáo. Shopee: file đơn hàng (Order.all…) hoặc báo cáo Quảng cáo Shopee.`,
    );
  }
  // File .zip (Shopee: nhiều file đơn hàng) → gộp mọi file cùng loại bên trong; file thường lấy 1 trang tính
  // Shopee "Đã thanh toán": trang Doanh thu + trang Adjustment cùng là quyết toán → gộp
  const same =
    lower.endsWith('.zip') || (p.platform === 'shopee' && p.kind === 'income')
      ? parsed.filter((x) => x.kind === p.kind && (x.platform ?? 'tiktok') === (p.platform ?? 'tiktok'))
      : [p];
  const data = {
    orders: same.flatMap((x) => x.orders ?? []),
    income: same.flatMap((x) => x.income ?? []),
    ads: same.flatMap((x) => x.ads ?? []),
  };
  // Shopee "Đã thanh toán": trang Service Fee Details → tách Phí dịch vụ = Phí hạ tầng + Voucher Xtra
  if (p.platform === 'shopee' && p.kind === 'income')
    for (const s of sheets) {
      const svc = parseShopeeServiceFees(s.rows);
      if (svc) splitServiceFees(data.income, svc);
    }
  // File đơn hàng Shopee có cả dòng tiền về ước tính (tự tính) → chỉ đếm dòng đơn hàng
  const rows = p.kind === 'orders' ? data.orders.length : data.orders.length + data.income.length + data.ads.length;
  if (rows === 0) throw new Error(`${file.name}: file ${KIND_LABEL[p.kind].toLowerCase()} chưa có dòng dữ liệu nào.`);
  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: file.name,
    kind: p.kind,
    platform: p.platform ?? 'tiktok',
    ...(p.adsType ? { adsType: p.adsType } : {}),
    settled: p.kind !== 'income' || data.income.every((r) => r.settled),
    importedAt: new Date().toISOString(),
    rows,
    range:
      p.range ??
      rangeOf([
        ...data.orders.map((o) => o.createdAt),
        ...data.income.map((r) => r.createdAt),
        ...data.ads.map((a) => a.date),
      ]),
    data,
  };
}
