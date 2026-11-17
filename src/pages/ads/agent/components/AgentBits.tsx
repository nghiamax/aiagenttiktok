import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { describeTarget } from '../lookup';
import { actionTypeMeta, paramsText } from '../meta';
import type { AgentActionType, AgentRuleParams, AgentTarget } from '../types';

/** Badge loại hành động + tên quy tắc + tham số */
export function ActionCell({
  actionType,
  ruleName,
  params,
}: {
  actionType: AgentActionType;
  ruleName: string | null;
  params: AgentRuleParams;
}) {
  const meta = actionTypeMeta(actionType, params);
  const extra = paramsText(actionType, params);
  return (
    <div className="min-w-0">
      <span
        className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${meta.className}`}
      >
        <meta.icon className="size-3.5" />
        {meta.label}
      </span>
      <p className="mt-1.5 truncate text-sm" title={ruleName ?? undefined}>
        {ruleName ?? 'Không theo quy tắc'}
      </p>
      {extra && <p className="text-xs text-muted">{extra}</p>}
    </div>
  );
}

/** Video / sản phẩm / ID (có nút sao chép) */
export function TargetCell({ target }: { target: AgentTarget }) {
  const info = describeTarget(target);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(target.videoId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // trình duyệt chặn clipboard → bỏ qua
    }
  }

  return (
    <div className="min-w-0">
      {info.url ? (
        <a
          href={info.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block truncate text-sm font-medium transition-colors hover:text-primary"
          title={`${info.title}\nBấm để mở video trên TikTok`}
        >
          {info.title}
        </a>
      ) : (
        <p className="truncate text-sm font-medium" title={info.title}>
          {info.title}
        </p>
      )}
      <p className="truncate text-xs text-muted" title={info.productName}>
        {info.identityName ? `@${info.identityName} · ` : ''}
        {info.productName}
      </p>
      {target.videoId && (
      <p className="flex items-center gap-1 text-xs text-muted">
        <span className="tabular-nums">{target.videoId}</span>
        <button
          type="button"
          onClick={copy}
          aria-label="Sao chép ID video"
          title="Sao chép ID video"
          className="flex size-5 items-center justify-center rounded transition-colors hover:bg-canvas hover:text-ink"
        >
          {copied ? <Check className="size-3 text-accent-green" /> : <Copy className="size-3" />}
        </button>
      </p>
      )}
    </div>
  );
}

/** Lưới cột chung cho thẻ Nhật ký và Chờ duyệt */
export const ITEM_GRID =
  'grid gap-4 p-5 lg:grid-cols-[150px_190px_minmax(0,1fr)_minmax(0,1.5fr)_150px] lg:items-start';
