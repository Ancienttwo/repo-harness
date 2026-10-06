import { useCallback, useEffect, useRef, useState } from 'react';
import type { Json } from 'archctx-contracts';
import type { ModuleDetailV1, ModuleIndexV1, ModuleState } from '../core/architecture/module-view';
import type { ModuleReviewPromptV1 } from '../core/review/module-review-prompt';
import { decodeArchitectureModuleDetail, decodeArchitectureModuleIndex, decodeArchitectureReviewPrompt } from '../core/operator/architecture';
import { copyOperatorIdentifier } from './App';
import { Icon } from './icons';
import type { OperatorMessageKey, OperatorTranslate } from './i18n';
import { ModuleGraph } from './ModuleGraph';
import { useObservationRefresh } from './useObservationRefresh';

/** A typed failure code from the route. The board shows it and never parses messages. */
function failureCode(body: unknown): string {
  const code = (body as { code?: unknown } | null)?.code;
  return typeof code === 'string' && /^[a-z][a-z0-9_]{0,63}$/u.test(code) ? code : 'unavailable';
}

/**
 * Conditional read for the architecture routes. `null` means 304: the body the
 * caller already shows is current, so the caller must not update state.
 */
export async function fetchArchitecture(path: string, etag: string | null, signal: AbortSignal): Promise<{ body: unknown; etag: string | null } | null> {
  const response = await fetch(path, { signal, cache: 'no-store', headers: etag === null ? {} : { 'If-None-Match': etag } });
  if (response.status === 304) return null;
  let body: unknown = null;
  try { body = await response.json(); } catch { body = null; }
  if (!response.ok) throw new Error(failureCode(body));
  return { body, etag: response.headers.get('ETag') };
}

interface Read<T> { readonly path: string | null; readonly value: T | null; readonly error: string | null }

/** Polls one path. The ETag belongs to the value on screen, so a 304 never shows another path's data. */
function useArchitectureRead<T>(path: string | null, decode: (value: unknown) => T, generation: number): Read<T> {
  const [read, setRead] = useState<Read<T>>({ path: null, value: null, error: null });
  const shown = useRef<{ path: string; etag: string } | null>(null);
  const request = useCallback(async (signal: AbortSignal): Promise<boolean> => {
    if (path === null) return false;
    try {
      const result = await fetchArchitecture(path, shown.current?.path === path ? shown.current.etag : null, signal);
      if (signal.aborted) return false;
      if (result === null) {
        // Same object when there is no error to clear, so React skips the render.
        setRead(current => current.error === null ? current : { ...current, error: null });
        return true;
      }
      const value = decode(result.body);
      shown.current = result.etag === null ? null : { path, etag: result.etag };
      setRead({ path, value, error: null });
      return true;
    } catch (error) {
      if (signal.aborted) return false;
      const code = error instanceof Error && /^[a-z][a-z0-9_]{0,63}$/u.test(error.message) ? error.message : 'unavailable';
      setRead(current => ({ path, value: current.path === path ? current.value : null, error: code }));
      return false;
    }
  }, [path, decode]);
  useObservationRefresh(request, JSON.stringify([path, generation]), { enabled: path !== null });
  return read.path === path ? read : { path, value: null, error: null };
}

function repositoryPath(repositoryId: string): string {
  return `/api/v1/repositories/${encodeURIComponent(repositoryId)}/architecture/modules`;
}

/** The exact command the Bot runs for the shard on screen. */
export function reviewPromptCommand(prompt: Pick<ModuleReviewPromptV1, 'capability_id' | 'shard' | 'mode' | 'base' | 'head'>): string {
  const command = `repo-harness module review-prompt ${prompt.capability_id} --shard ${prompt.shard.index}`;
  return prompt.mode === 'diff' ? `${command} --base ${prompt.base} --head ${prompt.head}` : command;
}

function ReadStatus({ read, loading, t }: { readonly read: Read<unknown>; readonly loading: OperatorMessageKey; readonly t: OperatorTranslate }) {
  if (read.error !== null) {
    return <p className="architecture-notice" role="alert" data-error-code={read.error}>
      {t(read.value === null ? 'architecture.failed' : 'architecture.refreshFailed', { code: read.error })}
    </p>;
  }
  return read.value === null ? <p role="status">{t(loading)}</p> : null;
}

const STATE_TONE: Readonly<Record<string, string>> = {
  valid: 'tone-ok', fresh: 'tone-ok', present: 'tone-ok', invalid: 'tone-danger', stale: 'tone-user', pending: 'tone-user', unknown: 'tone-unknown',
};

/** Three separate facts. They are never merged into one synced state. */
function ModuleStates({ state, t }: { readonly state: ModuleState; readonly t: OperatorTranslate }) {
  return <ul className="module-states" aria-label={t('architecture.states')}>
    {(['model_valid', 'generated_summary', 'section3'] as const).map(kind => (
      <li key={kind} className={`operator-badge ${STATE_TONE[state[kind]]}`} data-state-kind={kind} data-state-value={state[kind]}>
        {t(`architecture.state.${kind}`)}: <strong>{t(`architecture.value.${state[kind]}`)}</strong>
      </li>
    ))}
  </ul>;
}

function ModuleList({ index, onModule, t }: { readonly index: ModuleIndexV1; readonly onModule: (id: string) => void; readonly t: OperatorTranslate }) {
  const domains = new Map<string, ModuleIndexV1['modules']>();
  for (const module of index.modules) domains.set(module.domain, [...(domains.get(module.domain) ?? []), module]);
  if (domains.size === 0) return <p className="empty-inline">{t('architecture.empty')}</p>;
  return <div className="module-domains">
    {[...domains].map(([domain, modules]) => (
      <section key={domain} className="module-domain" data-domain={domain} aria-labelledby={`domain-${domain}`}>
        <h3 id={`domain-${domain}`}>{domain} <span>{modules.length}</span></h3>
        <ul>
          {modules.map(module => <li key={module.id} className="module-row" data-module-id={module.id}>
            <button type="button" className="module-row__open" onClick={() => onModule(module.id)}>
              <strong>{module.name}</strong>
              <code>{module.id}</code>
            </button>
            <span className="module-row__meta">{module.status} · {t('architecture.components', { count: module.components })}</span>
            <ModuleStates state={module.state} t={t} />
          </li>)}
        </ul>
      </section>
    ))}
  </div>;
}

function CopyButton({ label, value, t }: { readonly label: string; readonly value: string; readonly t: OperatorTranslate }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  useEffect(() => setStatus('idle'), [value]);
  return <>
    <button className="copy-value__button" type="button" aria-label={t('copy.action', { label })}
      onClick={() => void copyOperatorIdentifier(value).then(copied => setStatus(copied ? 'copied' : 'failed'))}>
      <Icon name="copy" size={14} />
      <span>{status === 'copied' ? t('copy.copied') : status === 'failed' ? t('copy.failed') : t('copy.idle')}</span>
    </button>
    <span className="copy-value__status" role="status" aria-live="polite">
      {status === 'copied' ? t('copy.copiedStatus', { label }) : status === 'failed' ? t('copy.failedStatus', { label }) : ''}
    </span>
  </>;
}

function ReviewPromptPanel({ base, generation, t }: { readonly base: string; readonly generation: number; readonly t: OperatorTranslate }) {
  const [shard, setShard] = useState(1);
  const read = useArchitectureRead(`${base}/review-prompt?shard=${shard}`, decodeArchitectureReviewPrompt, generation);
  const prompt = read.value;
  const command = prompt ? reviewPromptCommand(prompt) : null;
  return <section className="architecture-card review-prompt" aria-labelledby="review-prompt-heading">
    <h3 id="review-prompt-heading">{t('architecture.prompt.title')}</h3>
    <p className="detail-quiet">{t('architecture.prompt.boundary')}</p>
    <ReadStatus read={read} loading="architecture.prompt.loading" t={t} />
    {prompt && command && <>
      <dl className="detail-list">
        <div><dt>{t('architecture.prompt.digest')}</dt><dd><code className="mono-value review-prompt__digest">{prompt.digest}</code></dd></div>
        <div><dt>{t('architecture.prompt.budget')}</dt><dd>{t('architecture.prompt.budgetValue', { used: prompt.budget.used_bytes, cap: prompt.budget.input_cap_bytes })}</dd></div>
        <div><dt>{t('architecture.prompt.omitted')}</dt><dd>{prompt.budget.omitted_sections.length ? prompt.budget.omitted_sections.join(', ') : t('architecture.prompt.omittedNone')}</dd></div>
        <div><dt><label htmlFor="review-prompt-shard">{t('architecture.prompt.shard')}</label></dt><dd>
          <select id="review-prompt-shard" value={prompt.shard.index} onChange={event => setShard(Number(event.target.value))}>
            {Array.from({ length: prompt.shard.count }, (_, index) => index + 1).map(index => (
              <option key={index} value={index}>{t('architecture.prompt.shardOf', { index, count: prompt.shard.count })}</option>
            ))}
          </select>
        </dd></div>
      </dl>
      {prompt.budget.incomplete && <p className="detail-quiet">{t('architecture.prompt.incomplete', { count: prompt.shard.count })}</p>}
      <div className="copy-value review-prompt__command">
        <code data-bot-command>{command}</code>
        <CopyButton label={t('architecture.prompt.command')} value={command} t={t} />
      </div>
      <details className="review-prompt__text">
        <summary>{t('architecture.prompt.text', { index: prompt.shard.index })}</summary>
        <pre>{prompt.prompt}</pre>
      </details>
      <div className="review-prompt__actions">
        <CopyButton label={t('architecture.prompt.textLabel', { index: prompt.shard.index })} value={prompt.prompt} t={t} />
      </div>
    </>}
  </section>;
}

/** Flow steps and outcomes are model JSON. Only their string fields are shown, as text. */
function field(value: Json, key: string): string | null {
  const item = typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, Json>)[key] : undefined;
  return typeof item === 'string' ? item : null;
}

function FlowLine({ value, outcome }: { readonly value: Json; readonly outcome: boolean }) {
  const label = field(value, 'label') ?? field(value, 'id') ?? JSON.stringify(value);
  const lead = outcome ? field(value, 'kind') : [field(value, 'from'), field(value, 'to')].every(Boolean) ? `${field(value, 'from')} → ${field(value, 'to')}` : null;
  return <li>{lead && <code>{lead}</code>} {label}</li>;
}

function TextList({ items, empty }: { readonly items: readonly string[]; readonly empty: string }) {
  return items.length ? <ul>{items.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p className="detail-quiet">{empty}</p>;
}

function ModulePage({ detail, base, generation, onModule, t }: {
  readonly detail: ModuleDetailV1;
  readonly base: string;
  readonly generation: number;
  readonly onModule: (id: string) => void;
  readonly t: OperatorTranslate;
}) {
  const { module } = detail;
  const none = t('architecture.none');
  return <article className="module-page" aria-labelledby="module-page-title">
    <header className="module-page__header">
      <p className="detail-eyebrow">{module.status} · <code>{module.id}</code></p>
      <h2 id="module-page-title">{module.name}</h2>
      <p>{module.summary}</p>
      <ModuleStates state={detail.state} t={t} />
    </header>
    <ModuleGraph graph={detail.graph} onSelect={onModule} t={t} />
    <div className="module-page__grid">
      <section className="architecture-card" aria-labelledby="module-facts-heading">
        <h3 id="module-facts-heading">{t('architecture.facts')}</h3>
        <h4>{t('architecture.responsibilities')}</h4>
        <TextList items={module.responsibilities} empty={none} />
        <h4>{t('architecture.entrypoints')}</h4>
        {module.entrypoints?.length ? <ul className="module-entrypoints">
          {module.entrypoints.flatMap(entry => entry.symbols.map(symbol => <li key={`${entry.id}:${symbol.name}`}>
            <code>{entry.path}</code> {symbol.name}
            {symbol.sinks.map(sink => <span key={sink.id}> → <code>{sink.path}</code> {sink.symbol}</span>)}
          </li>))}
        </ul> : <p className="detail-quiet">{none}</p>}
        <h4>{t('architecture.verification')}</h4>
        {module.verification.length ? <ul>{module.verification.map(command => <li key={command}><code>{command}</code></li>)}</ul> : <p className="detail-quiet">{none}</p>}
      </section>
      <section className="architecture-card" aria-labelledby="module-flows-heading">
        <h3 id="module-flows-heading">{t('architecture.flows')}</h3>
        {detail.flows.length === 0 && <p className="detail-quiet">{none}</p>}
        {detail.flows.map(flow => <div key={flow.id} className="module-flow">
          <h4>{flow.name} <code>{flow.id}</code></h4>
          {flow.applicability === 'not-applicable' ? <p>{t('architecture.flow.notApplicable', { rationale: flow.rationale })}</p> : <>
            <p className="detail-eyebrow">{t('architecture.flow.steps')}</p>
            <ul>{flow.steps.map((step, index) => <FlowLine key={index} value={step} outcome={false} />)}</ul>
            <p className="detail-eyebrow">{t('architecture.flow.outcomes')}</p>
            <ul>{flow.outcomes.map((outcome, index) => <FlowLine key={index} value={outcome} outcome />)}</ul>
          </>}
        </div>)}
      </section>
      <section className="architecture-card" aria-labelledby="module-section3-heading">
        <h3 id="module-section3-heading">{t('architecture.section3')}</h3>
        {detail.section3 === null ? <p className="detail-quiet">{t('architecture.section3.pending')}</p> : <pre className="module-section3">{detail.section3}</pre>}
      </section>
      <section className="architecture-card" aria-labelledby="module-docs-heading">
        <h3 id="module-docs-heading">{t('architecture.docs')}</h3>
        {detail.linked_docs.length === 0 ? <p className="detail-quiet">{t('architecture.docs.none')}</p>
          : <ul className="module-docs">{detail.linked_docs.map(doc => <li key={doc.path}>
            <code>{doc.path}</code> <span className="operator-badge tone-neutral">{doc.kind}</span> <span className="operator-badge tone-neutral">{doc.status ?? t('architecture.value.unknown')}</span>
          </li>)}</ul>}
      </section>
      <ReviewPromptPanel key={module.id} base={base} generation={generation} t={t} />
    </div>
  </article>;
}

/**
 * Read-only view of the committed architecture model. Every action is a command
 * for the Bot to copy; the board sends no request that acts on it.
 */
export function ArchitectureWorkspace({ repositoryId, moduleId, onModule, refreshGeneration, t }: {
  readonly repositoryId: string;
  readonly moduleId: string | null;
  readonly onModule: (id: string | null) => void;
  readonly refreshGeneration: number;
  readonly t: OperatorTranslate;
}) {
  const root = repositoryPath(repositoryId);
  const modulePath = moduleId === null ? null : `${root}/${moduleId}`;
  const index = useArchitectureRead(moduleId === null ? root : null, decodeArchitectureModuleIndex, refreshGeneration);
  const detail = useArchitectureRead(modulePath, decodeArchitectureModuleDetail, refreshGeneration);
  return <section className="architecture-workspace" aria-labelledby="architecture-heading">
    <header className="architecture-workspace__heading">
      <p className="detail-eyebrow">{t('architecture.eyebrow')}</p>
      <h2 id="architecture-heading">{t('workspace.architecture')}</h2>
      {moduleId !== null && <button type="button" className="operator-button operator-button--secondary" onClick={() => onModule(null)}>{t('architecture.back')}</button>}
      {(index.value ?? detail.value) && <p className="detail-quiet">{t('architecture.commit')} <code>{(index.value ?? detail.value)!.commit}</code></p>}
    </header>
    {moduleId === null ? <>
      <ReadStatus read={index} loading="architecture.loading" t={t} />
      {index.value && <ModuleList index={index.value} onModule={onModule} t={t} />}
    </> : <>
      <ReadStatus read={detail} loading="architecture.module.loading" t={t} />
      {detail.value && modulePath && <ModulePage detail={detail.value} base={modulePath} generation={refreshGeneration} onModule={onModule} t={t} />}
    </>}
  </section>;
}
