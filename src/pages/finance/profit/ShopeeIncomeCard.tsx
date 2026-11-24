import { useState } from 'react';
import Card from '../../../components/ui/Card';
import { formatNumber } from '../../../lib/format';
import type { ProfitResult } from './profitCalc';
import { FEE_GROUPS } from './profitImport';

const vnd = (n: number) => `${n < 0 ? '−' : ''}${formatNumber(Math.abs(Math.round(n)))}đ`;
const pct = (part: number, whole: number) => (whole > 0 ? `${formatNumber((Math.abs(part) / whole) * 100, 1)}%` : '');

/** Thứ tự & tên khoản đúng trang "Summary" của báo cáo thu nhập Shopee */
const SURCHARGE: { key: string; label: string; children?: { key: string; label: string }[] }[] = [
  { key: 'spAffiliate', label: 'Phí hoa hồng Tiếp thị liên kết' },
  { key: 'spFixed', label: 'Phí cố định' },
  {
    key: 'spService',
    label: 'Phí Dịch Vụ',
    children: [
      { key: 'spInfra', label: 'Phí hạ tầng' },
      { key: 'spVoucherXtra', label: 'Voucher Xtra' },
    ],
  },
  { key: 'spPiship', label: 'Phí dịch vụ PiShip' },
  { key: 'spTransaction', label: 'Phí xử lý giao dịch' },
  { key: 'spTopup', label: 'Phí DVHT Nạp Tiền Tự Động' },
];
const TAX = [
  { key: 'spVat', label: 'Thuế GTGT' },
  { key: 'spPit', label: 'Thuế TNCN' },
  { key: 'spTax', label: 'Thuế GTGT + TNCN' },
];
const KNOWN = new Set([
  'spShipping',
  'spInstall',
  ...SURCHARGE.flatMap((s) => [s.key, ...(s.children ?? []).map((c) => c.key)]),
  ...TAX.map((t) => t.key),
]);

function Row({
  label,
  amount,
  base,
  level = 0,
  strong,
  note,
}: {
  label: string;
  amount: number;
  base?: number;
  level?: 0 | 1 | 2;
  strong?: boolean;
  note?: string;
}) {
  return (
    <li className={level === 0 ? 'py-2' : 'py-1'}>
      <div
        className={`flex items-baseline gap-3 text-sm ${level === 1 ? 'pl-4' : level === 2 ? 'pl-8 text-muted' : ''}`}
      >
        <span className={`min-w-0 flex-1 ${strong ? 'font-semibold text-ink' : level === 2 ? '' : 'text-ink'}`}>
          {label}
        </span>
        <span
          className={`shrink-0 tabular-nums ${strong ? 'font-bold text-ink' : level === 2 ? '' : 'font-semibold text-ink'}`}
        >
          {vnd(amount)}
        </span>
        <span className="w-12 shrink-0 text-right text-xs text-muted">{base ? pct(amount, base) : ''}</span>
      </div>
      {note && <p className={`text-xs text-muted ${level === 0 ? '' : 'pl-4'}`}>{note}</p>}
    </li>
  );
}

/**
 * Shopee: khoản thu / chi xếp đúng như trang "Summary" của file "Đã thanh toán" (1. Tổng doanh thu → 2. Tổng chi phí
 * → 3. Tổng số tiền), tách theo từng file (Shop / Shopee Xử Lý) để đối chiếu, + 4. Điều chỉnh (trang Adjustment)
 */
export default function ShopeeIncomeCard({ result }: { result: ProfitResult }) {
  const sources = result.incomeBySource.filter((s) => s.label);
  const [view, setView] = useState('');
  const src = sources.find((s) => s.label === view);
  // Xem 1 file → số đúng như file đó (để so với trang Summary của chính file); không chọn → cộng mọi file
  const r = src
    ? {
        revenue: src.revenue,
        fees: src.fees,
        feeLines: Object.entries(src.feeParts).map(([key, amount]) => ({
          key,
          label: FEE_GROUPS.find((g) => g.key === key)?.label ?? key,
          amount,
        })),
        adjustmentLines: src.adjustmentLines,
        payout: src.settlement + src.adjustmentLines.reduce((s, a) => s + a.amount, 0),
        basis: result.basis,
      }
    : {
        revenue: result.revenue,
        fees: result.fees,
        feeLines: result.feeLines,
        adjustmentLines: result.adjustmentLines,
        payout: result.settled + result.unsettled,
        basis: result.basis,
      };
  const fee = (key: string) => r.feeLines.find((f) => f.key === key)?.amount ?? 0;
  const bySource = (pick: (s: (typeof sources)[number]) => number) =>
    !src && sources.length > 1 ? sources.map((s) => `${s.label} ${vnd(pick(s))}`).join(' · ') : undefined;
  const surcharge = SURCHARGE.reduce(
    (s, x) => s + fee(x.key) + (x.children ?? []).reduce((a, c) => a + fee(c.key), 0),
    0,
  );
  const tax = TAX.reduce((s, t) => s + fee(t.key), 0);
  const others = r.feeLines.filter((f) => !KNOWN.has(f.key));
  const total = r.revenue + r.fees;
  const adjust = r.adjustmentLines.reduce((s, a) => s + a.amount, 0);
  const payout = r.payout;
  const fileName = (label: string) => (label === 'Shopee Xử Lý' ? 'File shopee_xi_Income' : 'File Income (Shop)');

  return (
    <Card className="p-5">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h3 className="font-semibold">Phí sàn & khấu trừ</h3>
        <span className="text-sm text-muted">
          {vnd(r.fees)} · {pct(r.fees, r.revenue)} doanh thu
        </span>
      </div>
      {sources.length > 1 && (
        <div className="mb-2 flex flex-wrap gap-1" role="radiogroup" aria-label="Xem theo file">
          {[
            { id: '', label: `Cả ${sources.length} file` },
            ...sources.map((s) => ({ id: s.label, label: fileName(s.label) })),
          ].map((o) => (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={view === o.id}
              onClick={() => setView(o.id)}
              className={`rounded-lg border px-2.5 py-1 text-sm font-medium transition ${
                view === o.id
                  ? 'border-primary bg-primary-soft text-primary'
                  : 'border-line text-muted hover:bg-canvas hover:text-ink'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
      <p className="mb-2 text-sm text-muted">
        {src
          ? `Số riêng của ${fileName(src.label)} (${formatNumber(src.count)} đơn) — trùng từng dòng với trang "Summary" của file này.`
          : r.basis === 'payment' && sources.length > 1
            ? `Cộng ${sources.length} file Đã thanh toán (+ điều chỉnh). Bấm từng file để so đúng với trang "Summary" của file đó.`
            : r.basis === 'payment'
              ? 'Xếp đúng trang "Summary" của file Đã thanh toán — so từng dòng với file của Shopee.'
              : 'Theo ngày đặt đơn — số khác trang "Summary" của Shopee (Shopee tính theo ngày trả tiền).'}
      </p>
      <ul className="divide-y divide-line">
        <Row label="1. Tổng doanh thu" amount={r.revenue} strong note={bySource((s) => s.revenue)} />
        <li className="py-1">
          <ul>
            <Row label="2. Tổng chi phí" amount={r.fees} base={r.revenue} strong note={bySource((s) => s.fees)} />
            {fee('spShipping') !== 0 && (
              <Row
                label="Tổng vận chuyển"
                amount={fee('spShipping')}
                base={r.revenue}
                level={1}
                note="Phí ship người mua trả + Shopee trợ giá − phí ship thực tế − ship trả hàng + PiShip hoàn"
              />
            )}
            <Row label="Phụ phí" amount={surcharge} base={r.revenue} level={1} />
            {SURCHARGE.map((x) => {
              const own = fee(x.key) + (x.children ?? []).reduce((a, c) => a + fee(c.key), 0);
              if (own === 0) return null;
              return (
                <li key={x.key}>
                  <ul>
                    <Row label={x.label} amount={own} base={r.revenue} level={2} />
                    {(x.children ?? []).map(
                      (c) =>
                        fee(c.key) !== 0 && <Row key={c.key} label={`  └ ${c.label}`} amount={fee(c.key)} level={2} />,
                    )}
                  </ul>
                </li>
              );
            })}
            {fee('spInstall') !== 0 && (
              <Row label="Tổng phụ dịch vụ GTGT cho người mua" amount={fee('spInstall')} base={r.revenue} level={1} />
            )}
            {tax !== 0 && <Row label="Thuế" amount={tax} base={r.revenue} level={1} />}
            {TAX.map((t) => fee(t.key) !== 0 && <Row key={t.key} label={t.label} amount={fee(t.key)} level={2} />)}
            {others.map((f) => (
              <Row
                key={f.key}
                label={f.label}
                amount={f.amount}
                base={r.revenue}
                level={1}
                note="Ước tính từ file đơn hàng"
              />
            ))}
          </ul>
        </li>
        <li className="py-1">
          <ul>
            <Row label="3. Tổng số tiền" amount={total} strong />
            {!src &&
              sources.length > 1 &&
              sources.map((s) => (
                <Row
                  key={s.label}
                  label={s.label === 'Shopee Xử Lý' ? 'File shopee_xi_Income (Shopee Xử Lý)' : 'File Income (Shop)'}
                  amount={s.settlement}
                  level={1}
                  note={`${formatNumber(s.count)} đơn · = mục "3. Tổng số tiền" trong file`}
                />
              ))}
          </ul>
        </li>
        {r.adjustmentLines.length > 0 && (
          <li className="py-1">
            <ul>
              <Row label="4. Điều chỉnh (trang Adjustment — chưa trừ trong mục 3)" amount={adjust} strong />
              {r.adjustmentLines.map((a) => (
                <Row key={a.label} label={`${a.label} · ${formatNumber(a.count)} khoản`} amount={a.amount} level={1} />
              ))}
            </ul>
          </li>
        )}
        <li className="flex items-baseline justify-between gap-3 py-2.5 text-sm">
          <span className="font-semibold text-ink">= Tiền về tài khoản</span>
          <span className="text-base font-bold tabular-nums text-ink">{vnd(payout)}</span>
        </li>
      </ul>
    </Card>
  );
}
