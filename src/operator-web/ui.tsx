import { useEffect, useState, type ReactNode } from 'react';
import { CopyIcon, ArrowSquareOutIcon } from '@phosphor-icons/react';
import { cn } from '@cloudflare/kumo';
import { copyOperatorIdentifier } from './clipboard';
import { formatRelativeAge, relativeAge, type OperatorTranslate } from './i18n';

export type DotTone = 'ok' | 'active' | 'warn' | 'danger' | 'neutral';

const DOT: Readonly<Record<DotTone, string>> = {
  ok: 'bg-kumo-success',
  active: 'bg-kumo-info',
  warn: 'bg-kumo-warning',
  danger: 'bg-kumo-danger',
  neutral: 'bg-kumo-fill',
};

/** Colour is never the only signal: every dot sits next to a text label. */
export function StatusDot({ tone, pulse = false, className }: { readonly tone: DotTone; readonly pulse?: boolean; readonly className?: string }) {
  return (
    <span className={cn('relative inline-flex size-2 shrink-0 rounded-full', DOT[tone], className)} data-dot={tone}>
      {pulse && <span className={cn('absolute inset-0 rounded-full opacity-60 motion-safe:animate-ping', DOT[tone])} />}
    </span>
  );
}

/** A relative age with the exact instant on hover. */
export function Age({ at, now, t, bare = false }: { readonly at: string; readonly now: number; readonly t: OperatorTranslate; readonly bare?: boolean }) {
  const age = relativeAge(at, now);
  const text = bare ? (age ? t(age.key, { count: age.count }) : t('status.observedUnknown')) : formatRelativeAge(at, now, t);
  return <time dateTime={at} title={at}>{text}</time>;
}

export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/** Copies one value. The only side effect is the clipboard write. */
export function CopyButton({ label, value, t, className }: {
  readonly label: string; readonly value: string; readonly t: OperatorTranslate; readonly className?: string;
}) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  useEffect(() => setStatus('idle'), [value]);
  return (
    <>
      <button
        className={cn('copy-value__button inline-flex min-h-7 shrink-0 cursor-pointer items-center gap-1 rounded-md px-1.5 text-xs text-kumo-subtle hover:bg-kumo-tint hover:text-kumo-default focus-visible:ring-2 focus-visible:ring-kumo-brand focus-visible:outline-none', className)}
        type="button"
        aria-label={t('copy.action', { label })}
        onClick={() => void copyOperatorIdentifier(value).then((copied) => setStatus(copied ? 'copied' : 'failed'))}
      >
        <CopyIcon size={14} aria-hidden="true" />
        <span>{status === 'copied' ? t('copy.copied') : status === 'failed' ? t('copy.failed') : t('copy.idle')}</span>
      </button>
      <span className="copy-value__status sr-only" role="status" aria-live="polite">
        {status === 'copied' ? t('copy.copiedStatus', { label }) : status === 'failed' ? t('copy.failedStatus', { label }) : ''}
      </span>
    </>
  );
}

/** One exact command to copy. The board never runs it. */
export function CommandLine({ command, t, className }: { readonly command: string; readonly t: OperatorTranslate; readonly className?: string }) {
  return (
    <div className={cn('flex min-w-0 items-start gap-2 rounded-md bg-kumo-recessed px-2 py-1 font-mono text-xs leading-5 text-kumo-default', className)} data-command>
      <span aria-hidden="true" className="select-none text-kumo-subtle">$</span>
      {/* The whole command stays readable: it wraps at spaces first, never truncates. */}
      <code className="min-w-0 flex-1 whitespace-normal [overflow-wrap:anywhere]">{command}</code>
      <CopyButton label={t('copy.commandLabel')} value={command} t={t} />
    </div>
  );
}

export function ExternalLink({ href, children, className }: { readonly href: string; readonly children: ReactNode; readonly className?: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer noopener" className={cn('inline-flex items-center gap-1 text-kumo-link hover:underline', className)}>
      {children}
      <ArrowSquareOutIcon size={12} aria-hidden="true" />
    </a>
  );
}

export function SectionTitle({ id, children, count, className }: { readonly id?: string; readonly children: ReactNode; readonly count?: number; readonly className?: string }) {
  return (
    <h2 id={id} className={cn('flex items-center gap-2 text-sm font-semibold text-kumo-strong', className)}>
      {children}
      {count !== undefined && <span className="rounded-full bg-kumo-recessed px-1.5 text-xs font-medium tabular-nums text-kumo-subtle">{count}</span>}
    </h2>
  );
}
