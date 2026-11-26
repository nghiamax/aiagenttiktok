import { useState } from 'react';
import { Check, ChevronDown, Copy, Eye, EyeOff, KeyRound, Link2, Loader2 } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { BANKS, webhookPath, type GatewayField, type GatewayMeta, type GatewaySettings } from '../../../shared/billing';
import { inputCls, labelCls } from './PlanFields';

function randomKey(): string {
  const a = new Uint8Array(24);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
      className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-line bg-white text-muted transition hover:bg-canvas hover:text-ink"
    >
      {done ? <Check className="size-4 text-accent-green" /> : <Copy className="size-4" />}
    </button>
  );
}

/**
 * Trình duyệt hay tưởng ô khoá là form đăng nhập và tự điền tên đăng nhập / mật khẩu web vào →
 * ô khoá dùng "new-password", ô chữ "off" + tắt trình quản lý mật khẩu phổ biến.
 */
const NO_FILL = { autoComplete: 'off', 'data-1p-ignore': true, 'data-lpignore': 'true', spellCheck: false } as const;

/** 1 ô cấu hình theo `kind` khai báo trong GATEWAYS */
function FieldInput({
  id,
  field,
  value,
  onChange,
}: {
  id: string;
  field: GatewayField;
  value: string;
  onChange: (v: string) => void;
}) {
  const [show, setShow] = useState(false);
  const mono = `${inputCls} bg-white font-mono text-sm`;
  switch (field.kind) {
    case 'bank':
      return (
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={`${inputCls} bg-white`}>
          <option value="">— Chọn ngân hàng —</option>
          {BANKS.map((b) => (
            <option key={b.bin} value={b.bin}>
              {b.name}
            </option>
          ))}
        </select>
      );
    case 'name':
      return (
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          {...NO_FILL}
          className={`${inputCls} bg-white uppercase`}
        />
      );
    case 'secret':
      return (
        <div className="flex gap-2">
          <input
            id={id}
            type={show ? 'text' : 'password'}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            {...NO_FILL}
            autoComplete="new-password"
            className={mono}
          />
          <button
            type="button"
            aria-label={show ? `Ẩn ${field.label}` : `Hiện ${field.label}`}
            title={show ? 'Ẩn' : 'Hiện'}
            onClick={() => setShow((v) => !v)}
            className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-line bg-white text-muted transition hover:bg-canvas hover:text-ink"
          >
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      );
    case 'genkey':
      return (
        <div className="flex gap-2">
          <input id={id} value={value} onChange={(e) => onChange(e.target.value)} {...NO_FILL} className={mono} />
          <CopyButton text={value} label={`Sao chép ${field.label.toLowerCase()}`} />
          <button
            type="button"
            onClick={() => onChange(randomKey())}
            className="shrink-0 rounded-lg border border-line bg-white px-3 text-sm font-medium transition hover:bg-canvas"
          >
            Tạo khoá
          </button>
        </div>
      );
    default:
      return (
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          {...NO_FILL}
          className={`${inputCls} bg-white`}
        />
      );
  }
}

/** Nhãn + ô nhập + dòng gợi ý */
function FieldBox({
  gatewayId,
  field: f,
  settings,
  onChange,
}: {
  gatewayId: string;
  field: GatewayField;
  settings: GatewaySettings;
  onChange: (key: string, value: string) => void;
}) {
  const id = `gw-${gatewayId}-${f.key}`;
  return (
    <div className={f.kind === 'genkey' ? 'md:col-span-2 xl:col-span-3' : ''}>
      <label className={labelCls} htmlFor={id}>
        {f.label}
        {f.optional && <span className="font-normal text-muted"> (không bắt buộc)</span>}
      </label>
      <FieldInput id={id} field={f} value={settings[f.key] ?? ''} onChange={(v) => onChange(f.key, v)} />
      {f.help && <p className="mt-1 text-sm text-muted">{f.help}</p>}
    </div>
  );
}

interface GatewayConfigProps {
  meta: GatewayMeta;
  settings: GatewaySettings;
  onChange: (key: string, value: string) => void;
  /** Có thay đổi chưa lưu (nút Đăng ký webhook dùng cấu hình đã lưu) */
  unsaved: boolean;
}

/** Khối cấu hình của 1 cổng thanh toán: hướng dẫn + ô nhập theo `meta.fields` + URL webhook (+ nút tự đăng ký) */
export default function GatewayConfig({ meta, settings, onChange, unsaved }: GatewayConfigProps) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [advOpen, setAdvOpen] = useState(false);
  const basic = meta.fields.filter((f) => !f.advanced);
  const advanced = meta.fields.filter((f) => f.advanced);
  const webhookUrl = `${window.location.origin}${webhookPath(meta.id)}`;
  const isLocal = /localhost|127\.0\.0\.1/.test(window.location.hostname);

  const register = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const { message } = await api<{ message: string }>(`/billing/admin/gateways/${meta.id}/register-webhook`, {
        method: 'POST',
        body: { webhookUrl },
      });
      setMsg({ ok: true, text: message });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : 'Không đăng ký được' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-5 rounded-xl border border-line bg-canvas/60 p-4">
      <p className="flex items-center gap-1.5 text-sm font-semibold">
        <KeyRound className="size-4 text-primary" /> Kết nối {meta.name}
      </p>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-ink/80">
        {meta.steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      {/* form riêng + autoComplete off: trình duyệt không coi là form đăng nhập */}
      <form autoComplete="off" onSubmit={(e) => e.preventDefault()}>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {basic.map((f) => (
            <FieldBox key={f.key} gatewayId={meta.id} field={f} settings={settings} onChange={onChange} />
          ))}
        </div>
        {advanced.length > 0 && (
          <div className="mt-3">
            <button
              type="button"
              aria-expanded={advOpen}
              onClick={() => setAdvOpen((v) => !v)}
              className="inline-flex items-center gap-1 text-sm font-medium text-primary transition hover:underline"
            >
              <ChevronDown className={`size-4 transition ${advOpen ? 'rotate-180' : ''}`} />
              Nâng cao — dịch vụ gửi dữ liệu ở ô nào ({advanced.length} ô)
            </button>
            {advOpen && (
              <div className="mt-2 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {advanced.map((f) => (
                  <FieldBox key={f.key} gatewayId={meta.id} field={f} settings={settings} onChange={onChange} />
                ))}
              </div>
            )}
          </div>
        )}
      </form>
      {!meta.noWebhook && (
        <div className="mt-3">
          <p className={labelCls}>URL webhook</p>
          <div className="flex flex-wrap gap-2">
            <input
              readOnly
              value={webhookUrl}
              className={`${inputCls} min-w-0 flex-1 bg-white text-sm`}
              aria-label={`URL webhook ${meta.name}`}
            />
            <CopyButton text={webhookUrl} label="Sao chép URL webhook" />
            {meta.registerWebhook && (
              <button
                type="button"
                disabled={busy || isLocal || unsaved}
                title={
                  isLocal
                    ? 'Chỉ đăng ký được trên địa chỉ web thật (https)'
                    : unsaved
                      ? 'Bấm Lưu trước'
                      : `${meta.name} gửi thử 1 webhook tới URL này`
                }
                onClick={() => void register()}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-line bg-white px-3 text-sm font-medium transition hover:bg-canvas disabled:opacity-50"
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />}
                Đăng ký webhook
              </button>
            )}
          </div>
          {isLocal && (
            <p className="mt-1 text-sm text-amber-700">
              Đang chạy trên máy (localhost) — {meta.name} không gọi webhook tới được.
              {meta.canSync
                ? ' Khách vẫn lên Pro vì trang thanh toán tự hỏi cổng mỗi 10 giây.'
                : ' Dùng địa chỉ web thật sau khi đưa lên hosting.'}
            </p>
          )}
          {msg && <p className={`mt-1 text-sm ${msg.ok ? 'text-accent-green' : 'text-danger'}`}>{msg.text}</p>}
        </div>
      )}
    </div>
  );
}
