import { useCallback, useMemo, useState } from 'react';
import { useFinanceQuota } from '../useFinanceQuota';
import { Link } from 'react-router-dom';
import { AlertTriangle, Crown, Info, Loader2 } from 'lucide-react';
import Card from '../../../components/ui/Card';
import { formatNumber } from '../../../lib/format';
import ProfitUpload from './ProfitUpload';
import SellerFetchCard from './SellerFetchCard';
import ProfitStatement from './ProfitStatement';
import ProfitDetails from './ProfitDetails';
import OtherCostsEditor from './OtherCostsEditor';
import SkuProfitTable from './SkuProfitTable';
import { computeProfit, limitOrders, mergeData, profitOrderIds, type ProfitResult } from './profitCalc';
import { useProfitAllowance } from './useProfitAllowance';
import { useProfitStore, useSharedCosts } from './useProfitStore';
import type { ProfitFile } from './useProfitStore';

const vnd = (n: number) => `${n < 0 ? '−' : ''}${formatNumber(Math.abs(Math.round(n)))}đ`;
const dateVi = (iso: string) => iso.split('-').reverse().join('/');

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <Card className="p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums md:text-2xl ${tone ?? 'text-ink'}`}>{value}</p>
      {sub && <p className="mt-0.5 text-sm text-muted">{sub}</p>}
    </Card>
  );
}

/** Cảnh báo để Sếp biết số đang thiếu gì */
function notesOf(r: ProfitResult, files: ProfitFile[]): { warn: boolean; text: string }[] {
  const out: { warn: boolean; text: string }[] = [];
  if (!r.hasIncome) out.push({ warn: true, text: 'Chưa có file quyết toán → chưa có doanh thu, phí và tiền về thật.' });
  if (!r.hasOrders)
    out.push({ warn: true, text: 'Chưa có file đơn hàng → không biết bán SKU nào, chưa trừ được giá vốn.' });
  if (r.missingCost.skus > 0)
    out.push({
      warn: true,
      text: `${r.missingCost.skus} SKU đã bán chưa có giá vốn (${formatNumber(r.missingCost.qty)} sản phẩm) → lợi nhuận đang cao hơn thực tế. Nhập ở bảng cuối trang.`,
    });
  if (r.noMoney.count > 0)
    out.push({
      warn: true,
      text: `${r.noMoney.count} đơn chưa có số quyết toán (giá trị hàng ~${vnd(r.noMoney.goodsValue)}) → chưa tính vào doanh thu. Tải file quyết toán / chờ quyết toán mới hơn.`,
    });
  if (r.outOfPeriod.count > 0)
    out.push({
      warn: false,
      text: `${r.outOfPeriod.count} dòng quyết toán (${vnd(r.outOfPeriod.settlement)}) thuộc đơn không có trong file đơn hàng (ngoài kỳ) → không tính.`,
    });
  if (!r.hasAds) out.push({ warn: false, text: 'Chưa có file quảng cáo → chưa trừ chi phí quảng cáo.' });
  const adsFile = files.find((f) => f.kind === 'ads' && f.range);
  if (adsFile?.range && r.period && (adsFile.range.from > r.period.to || adsFile.range.to < r.period.from))
    out.push({
      warn: true,
      text: `File quảng cáo (${dateVi(adsFile.range.from)} – ${dateVi(adsFile.range.to)}) không trùng kỳ đơn hàng (${dateVi(r.period.from)} – ${dateVi(r.period.to)}).`,
    });
  return out;
}

/** Tài chính → Tính lợi nhuận: đối chiếu đơn hàng + quyết toán + quảng cáo + giá vốn */
export default function ProfitPage() {
  const { state, setState, saveError } = useProfitStore();
  const shared = useSharedCosts();
  const [tempCosts, setTempCosts] = useState<Record<string, number>>({});
  const { quota: planQuota } = useFinanceQuota();
  // Pro: nhớ giá vốn theo SKU (lần sau tự điền) · Miễn phí: chỉ giữ trong lần mở trang này
  const remember = !!planQuota?.rememberCosts;
  const costs = remember ? shared.costs : tempCosts;
  const setCost = useCallback(
    (key: string, value: number) =>
      remember
        ? shared.setCost(key, value)
        : setTempCosts((c) => {
            const next = { ...c };
            if (value > 0) next[key] = value;
            else delete next[key];
            return next;
          }),
    [remember, shared],
  );

  const allData = useMemo(() => mergeData(state.files.map((f) => f.data)), [state.files]);
  // Gói Miễn phí: chỉ tính các đơn server cho phép (tối đa 100 đơn, mỗi mã đơn đếm 1 lần)
  const orderIds = useMemo(() => profitOrderIds(allData), [allData]);
  const { allowed, ready, blocked, quota } = useProfitAllowance(orderIds);
  const data = useMemo(() => (allowed ? limitOrders(allData, allowed) : allData), [allData, allowed]);
  const result = useMemo(
    () => computeProfit(data, costs, state.otherCosts, state.options),
    [data, costs, state.otherCosts, state.options],
  );
  const notes = notesOf(result, state.files);
  const addFiles = useCallback(
    (files: ProfitFile[]) => setState((s) => ({ ...s, files: [...s.files, ...files] })),
    [setState],
  );
  const hasUnsettledFile = state.files.some((f) => f.kind === 'income' && !f.settled);

  return (
    <div className="space-y-6">
      <SellerFetchCard onAdd={addFiles} />
      <ProfitUpload
        files={state.files}
        onAdd={addFiles}
        onRemove={(id) => setState((s) => ({ ...s, files: s.files.filter((f) => f.id !== id) }))}
        onClear={() => setState((s) => ({ ...s, files: [] }))}
      />
      {saveError && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          File quá lớn để trình duyệt nhớ — vẫn tính bình thường, nhưng tải lại trang thì phải chọn lại file.
        </p>
      )}

      {state.files.length > 0 && !ready && (
        <div className="flex items-center justify-center gap-2 p-8 text-muted">
          <Loader2 className="size-5 animate-spin" /> Đang kiểm tra số đơn của gói…
        </div>
      )}

      {state.files.length > 0 && ready && blocked > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-accent-violet/30 bg-accent-violet/5 px-4 py-3 text-sm">
          <Crown className="size-5 shrink-0 text-accent-violet" />
          <p className="min-w-0 flex-1">
            <b>Gói Miễn phí tính tối đa {formatNumber(quota?.profitLimit ?? 0)} đơn</b> — {formatNumber(blocked)} đơn
            trong file chưa được tính (số liệu bên dưới chỉ gồm các đơn đã tính). Nâng cấp Pro để tính hết, không giới
            hạn.
          </p>
          <Link
            to="/upgrade"
            className="shrink-0 rounded-lg bg-accent-violet px-3.5 py-2 font-semibold text-white transition hover:opacity-90"
          >
            Nâng cấp Pro
          </Link>
        </div>
      )}

      {state.files.length > 0 && ready && (
        <>
          {result.period && (
            <p className="text-sm text-muted">
              Kỳ tính theo ngày đặt đơn:{' '}
              <b className="text-ink">
                {dateVi(result.period.from)} – {dateVi(result.period.to)}
              </b>
              {result.hasOrders && ` · ${formatNumber(result.counts.total)} đơn`}
            </p>
          )}

          {notes.length > 0 && (
            <ul className="space-y-2">
              {notes.map((n) => (
                <li
                  key={n.text}
                  className={`flex items-start gap-2.5 rounded-xl px-4 py-2.5 text-sm ${
                    n.warn ? 'bg-amber-50 text-amber-900' : 'bg-canvas text-muted'
                  }`}
                >
                  {n.warn ? (
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  ) : (
                    <Info className="mt-0.5 size-4 shrink-0" />
                  )}
                  {n.text}
                </li>
              ))}
            </ul>
          )}

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <Kpi
              label="Doanh thu"
              value={vnd(result.revenue)}
              sub={`${formatNumber(result.counts.settled + result.counts.unsettled)} đơn có số`}
            />
            <Kpi
              label="Tiền về"
              value={vnd(result.settled + result.unsettled)}
              sub={result.unsettled ? `chờ về ${vnd(result.unsettled)}` : 'đã quyết toán'}
            />
            <Kpi
              label="Giá vốn"
              value={vnd(result.cogs)}
              sub={result.missingCost.skus ? `thiếu ${result.missingCost.skus} SKU` : undefined}
            />
            <Kpi label="Quảng cáo" value={vnd(result.ads)} sub={result.hasAds ? undefined : 'chưa có file'} />
            <Kpi
              label="Lợi nhuận"
              value={vnd(result.profit)}
              sub={result.marginPct != null ? `${formatNumber(result.marginPct, 1)}% doanh thu` : undefined}
              tone={result.profit < 0 ? 'text-danger' : 'text-accent-green'}
            />
          </div>

          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <ProfitStatement
              result={result}
              options={state.options}
              hasUnsettledFile={hasUnsettledFile}
              onOptions={(options) => setState((s) => ({ ...s, options }))}
            />
            <ProfitDetails result={result} />
          </div>

          <OtherCostsEditor
            costs={state.otherCosts}
            onChange={(otherCosts) => setState((s) => ({ ...s, otherCosts }))}
          />

          {result.skus.length > 0 && (
            <SkuProfitTable skus={result.skus} costs={costs} onCost={setCost} remember={remember} />
          )}
        </>
      )}
    </div>
  );
}
