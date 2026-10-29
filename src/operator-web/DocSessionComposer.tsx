import { useCallback, useEffect, useId, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { Button, cn } from '@cloudflare/kumo';
import { XIcon } from '@phosphor-icons/react';
import { DOC_SESSION_MAX_CITATIONS, DOC_SESSION_MAX_INSTRUCTION, type OperatorDocSessionCreatedV1 } from '../core/operator/doc-session-api';
import { circled } from './Conversation';
import { citationLabel } from './doc-citation';
import { EMPTY_DOC_DRAFT, withoutCitation, type DocDraft } from './doc-draft';
import {
  docSessionReadText, docSessionStartState, localizeDocSessionRefusal, useSessionWrite,
  type DocSessionCreateRequest, type DocSessionCreateWriter, type DocSessions,
} from './doc-sessions';
import type { OperatorTranslate } from './i18n';
import { docsRuntimes, type AgentsSettingsReader } from './settings';
import { PageLink } from './ui';
import { useObservationRefresh } from './useObservationRefresh';
import type { WorkspaceLocation } from './workspace-location';

const SETTINGS: WorkspaceLocation = { workspace: 'settings', module: null, item: null };
const DOCS: WorkspaceLocation = { workspace: 'docs', module: null, item: null };
/** Refusals that the Settings page resolves. */
const SETTINGS_REFUSALS: ReadonlySet<string> = new Set(['runtime_not_enabled', 'docs_isolation_unverified']);

/** What the Home page and the Docs page need to start a doc session; absent where the server cannot start one. */
export interface DocSessionStart {
  readonly docSessions: DocSessions;
  readonly readAgentsSettings: AgentsSettingsReader;
  readonly createDocSession: DocSessionCreateWriter;
  readonly draft: DocDraft;
  readonly onDraft: Dispatch<SetStateAction<DocDraft>>;
  /** 「新会话」 asked for the composer; it takes focus once and then calls `onFocusHandled`. */
  readonly focusRequested: boolean;
  readonly onFocusHandled: () => void;
}

type DocsRuntimes =
  | { readonly kind: 'loading' }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'ready'; readonly ids: readonly string[]; readonly defaultDocs: string | null };

/** The runtimes that are enabled with the docs use. A failed refresh keeps the list already read. */
function useDocsRuntimes(read: AgentsSettingsReader): DocsRuntimes {
  const [state, setState] = useState<DocsRuntimes>({ kind: 'loading' });
  const observe = useCallback(async (signal: AbortSignal): Promise<boolean> => {
    const result = await read(signal);
    if (signal.aborted) return false;
    if (result.state === 'unavailable') {
      setState(current => current.kind === 'ready' ? current : { kind: 'unavailable' });
      return false;
    }
    setState({ kind: 'ready', ...docsRuntimes(result.settings.config) });
    return true;
  }, [read]);
  useObservationRefresh(observe, 'doc-composer-runtimes');
  return state;
}

export function DocSessionComposer({ start, currentRepositoryId, onOpen, openDocsOnCite, t }: {
  readonly start: DocSessionStart;
  /** The repository of the page; a draft of another repository is named in the composer. */
  readonly currentRepositoryId: string | null;
  readonly onOpen: (next: WorkspaceLocation) => void;
  /** Home has no document to select from: its cite control opens the Docs page. The Docs page explains how to cite. */
  readonly openDocsOnCite: boolean;
  readonly t: OperatorTranslate;
}) {
  const { docSessions, readAgentsSettings, createDocSession, draft, onDraft, focusRequested, onFocusHandled } = start;
  const { failure } = docSessionStartState(docSessions.view);
  const runtimes = useDocsRuntimes(readAgentsSettings);
  const write = useSessionWrite<DocSessionCreateRequest, OperatorDocSessionCreatedV1>(createDocSession);
  const [hint, setHint] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const headingId = useId();
  useEffect(() => {
    if (!focusRequested) return;
    inputRef.current?.focus();
    onFocusHandled();
  }, [focusRequested, onFocusHandled]);
  // A refusal describes the request as it was sent, so changing any part of the draft clears it.
  const { reset } = write;
  const draftKey = JSON.stringify(draft);
  useEffect(() => reset(), [draftKey, reset]);

  const ids = runtimes.kind === 'ready' ? runtimes.ids : [];
  const runtime = draft.runtime !== null && ids.includes(draft.runtime) ? draft.runtime
    : runtimes.kind === 'ready' ? runtimes.defaultDocs : null;
  const sending = write.state.kind === 'sending';
  const answered = write.state.kind === 'answered' ? write.state.outcome : null;
  const refusal = answered?.state === 'refused' ? answered.refusal : null;
  const stale = refusal?.code === 'citation_stale';
  const ready = failure === null && draft.repositoryId !== null && draft.citations.length > 0 && runtime !== null
    && draft.instruction.trim() !== '' && draft.instruction.length <= DOC_SESSION_MAX_INSTRUCTION && !sending;

  const submit = async () => {
    if (!ready || draft.repositoryId === null || runtime === null) return;
    const outcome = await write.submit({ kind: 'docs', repository_id: draft.repositoryId, runtime, citations: draft.citations, instruction: draft.instruction });
    if (outcome?.state !== 'ok') return;
    onDraft(EMPTY_DOC_DRAFT);
    docSessions.reload();
    onOpen({ workspace: 'session', module: null, item: outcome.result.session_id });
  };

  const refusalText = refusal === null ? null : localizeDocSessionRefusal(refusal, t);
  const failureText = failure === null ? null : docSessionReadText(failure, t);
  return (
    <section aria-labelledby={headingId} data-doc-composer
      className="flex w-full max-w-2xl min-w-0 flex-col gap-3 rounded-[18px] border border-kumo-line bg-kumo-control p-3 shadow-xs focus-within:border-(--rh-accent)">
      <h2 id={headingId} className="sr-only">{t('composer.title')}</h2>
      {draft.citations.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {draft.repositoryId !== null && draft.repositoryId !== currentRepositoryId && (
            <p className="type-caption text-kumo-subtle" data-composer-repository={draft.repositoryId}>{t('composer.repository')} <span className="font-mono">{draft.repositoryId}</span></p>
          )}
          <ul className="flex flex-wrap gap-1.5" data-composer-citations>
            {draft.citations.map((citation, index) => (
              <li key={`${citation.path}:${citation.start_line}:${citation.end_line}`} data-composer-citation={citationLabel(citation)} data-stale={stale ? '' : undefined}
                className={cn('inline-flex max-w-full items-center gap-1 rounded-full bg-(--rh-accent-tint) py-0.5 pr-0.5 pl-2 font-mono text-xs text-kumo-default', stale && 'ring-1 ring-kumo-warning')}>
                <span aria-hidden="true">{circled(index)}</span>
                <span className="min-w-0 truncate" title={citationLabel(citation)}>{citationLabel(citation)}</span>
                {stale && <span className="shrink-0 font-sans text-kumo-warning">· {t('composer.citation.stale')}</span>}
                <button type="button" aria-label={t('composer.citation.remove', { label: citationLabel(citation) })}
                  onClick={() => onDraft(current => withoutCitation(current, index))}
                  className="grid size-5 shrink-0 cursor-pointer place-items-center rounded-full text-kumo-subtle hover:bg-kumo-tint hover:text-kumo-default">
                  <XIcon size={12} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <textarea ref={inputRef} rows={3} value={draft.instruction} maxLength={DOC_SESSION_MAX_INSTRUCTION} data-composer-input
        aria-label={t('composer.instruction')} placeholder={t('composer.instruction')}
        onChange={event => { const instruction = event.target.value; onDraft(current => ({ ...current, instruction })); }}
        className="w-full resize-y bg-transparent text-sm text-kumo-default placeholder:text-kumo-placeholder focus-visible:outline-none" />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {openDocsOnCite
          ? <PageLink to={DOCS} onOpen={onOpen} data-composer-cite className="text-sm text-kumo-link hover:underline">{t('composer.cite')}</PageLink>
          : <button type="button" aria-expanded={hint} data-composer-cite onClick={() => setHint(value => !value)} className="cursor-pointer text-sm text-kumo-link hover:underline">{t('composer.cite')}</button>}
        <span className="inline-flex min-w-0 items-center gap-1.5 text-sm">
          {runtimes.kind === 'ready' && ids.length > 0 && (
            <select aria-label={t('composer.agent')} data-composer-agent value={runtime ?? ''}
              onChange={event => { const next = event.target.value; onDraft(current => ({ ...current, runtime: next })); }}
              className="h-8 rounded-md border border-kumo-line bg-kumo-base px-2 text-sm text-kumo-default">
              {runtime === null && <option value="" disabled>{t('composer.agent.choose')}</option>}
              {ids.map(id => <option key={id} value={id}>{id}</option>)}
            </select>
          )}
          {runtimes.kind === 'ready' && ids.length === 0 && <span className="text-kumo-subtle" data-composer-agent-empty>{t('composer.agent.none')}</span>}
          {runtimes.kind === 'unavailable' && <span className="text-kumo-danger" data-composer-agent-failed>{t('composer.agent.unavailable')}</span>}
          <PageLink to={SETTINGS} onOpen={onOpen} data-composer-manage className="shrink-0 text-kumo-link hover:underline">{t('composer.agent.manage')}</PageLink>
        </span>
        <Button variant="primary" className="ml-auto" disabled={!ready} onClick={() => void submit()} data-composer-start>
          {sending ? t('composer.starting') : t('composer.start')}
        </Button>
      </div>
      {hint && !openDocsOnCite && <p className="type-caption text-kumo-subtle" data-composer-hint>{t('composer.cite.select')}</p>}
      {draft.citations.length === 0 && <p className="type-caption text-kumo-subtle" data-composer-need-citation>{t('composer.needCitation')}</p>}
      {draft.citations.length >= DOC_SESSION_MAX_CITATIONS && <p className="type-caption text-kumo-subtle">{t('composer.limit.citations', { count: DOC_SESSION_MAX_CITATIONS })}</p>}
      {failureText !== null && (
        <p role="alert" className="type-caption text-kumo-danger" data-composer-sessions-failure={failure}>{failureText.message} {failureText.next_action}</p>
      )}
      {refusalText !== null && refusal !== null && (
        <p role="alert" className="flex flex-col gap-0.5 text-sm text-kumo-default" data-composer-refusal={refusal.code}>
          <span>{refusalText.localized ? null : `${t('docSession.serverText')} `}{refusalText.message}</span>
          <span className="text-kumo-subtle">{refusalText.next_action}</span>
          {SETTINGS_REFUSALS.has(refusal.code) && <PageLink to={SETTINGS} onOpen={onOpen} data-composer-settings className="text-kumo-link hover:underline">{t('nav.settings')} ›</PageLink>}
        </p>
      )}
      {answered?.state === 'unreachable' && <p role="alert" className="text-sm text-kumo-default" data-composer-refusal="unreachable">{t('docSession.write.unreachable')}</p>}
      {answered?.state === 'unreadable' && <p role="alert" className="text-sm text-kumo-default" data-composer-refusal="unreadable">{t('docSession.write.unreadable')}</p>}
    </section>
  );
}
