import { useEffect, useState, type ReactNode } from 'react';
import { Banner, Button } from '@cloudflare/kumo';
import { WarningIcon } from '@phosphor-icons/react';
import { WORKTREE_CLEANUP_MAX_IDS, type WorktreeCleanupItem, type WorktreeCleanupResult } from '../core/operator/worktree-cleanup';
import type { WorktreeView } from '../core/operator/worktrees';
import type { OperatorApiErrorV1 } from './types';
import { BoardState } from './Board';
import { isOperatorMessageKey, type OperatorMessageKey, type OperatorTranslate } from './i18n';
import type { CleanupSessionCreateWriter } from './cleanup-session';
import { docSessionReadText, docSessionsLive, localizeDocSessionRefusal, useSessionWrite, type DocSessions } from './doc-sessions';
import { ageWords } from './labels';
import type { AgentsSettingsV1 } from '../core/operator/agents-settings';
import { docsRuntimes, type AgentsSettingsRead, type AgentsSettingsReader } from './settings';
import { Age, CommandLine, PageLink, SectionTitle, StatusDot, type DotTone } from './ui';
import {
  allWorktrees, cleanupCommand, formatBytes, reclaimableSpace, spaceTotal, spaceWords, useRowDigests, worktreesOf,
  type SpaceTotal, type WorktreeCleanup, type WorktreesView,
} from './worktrees';
import type { WorkspaceLocation } from './workspace-location';

type Judgment = WorktreeView['judgment'];

const JUDGMENTS: readonly Judgment[] = ['green', 'yellow', 'red'];
export const JUDGMENT_TONE: Readonly<Record<Judgment, DotTone>> = { green: 'ok', yellow: 'warn', red: 'danger' };
const BAR: Readonly<Record<Judgment, string>> = { green: 'bg-kumo-success', yellow: 'bg-kumo-warning', red: 'bg-kumo-danger' };

/**
 * The disk bar shares only measured bytes; each judgment's count stays next to its words.
 * `scale` is the byte total a full-width bar stands for, so a bar for fewer bytes is shorter.
 */
export function DiskBar({ worktrees, scale, t }: { readonly worktrees: readonly WorktreeView[]; readonly scale?: number; readonly t: OperatorTranslate }) {
  const totals = Object.fromEntries(JUDGMENTS.map(judgment => [judgment, spaceTotal(worktrees.filter(tree => tree.judgment === judgment))])) as Record<Judgment, SpaceTotal>;
  const measured = JUDGMENTS.reduce((sum, judgment) => sum + totals[judgment].bytes, 0);
  return (
    <div className="flex flex-col gap-1.5">
      {measured > 0
        ? <div className="flex h-2 overflow-hidden rounded-full bg-kumo-recessed" style={{ width: scale === undefined || scale <= 0 ? '100%' : `${Math.min(100, (measured / scale) * 100)}%` }} data-disk-bar>
          {JUDGMENTS.filter(judgment => totals[judgment].bytes > 0).map(judgment => (
            <span key={judgment} className={BAR[judgment]} style={{ width: `${(totals[judgment].bytes / measured) * 100}%` }} data-disk-segment={judgment} data-bytes={totals[judgment].bytes} />
          ))}
        </div>
        : <p className="text-xs text-kumo-subtle">{t('worktrees.repository.unmeasured')}</p>}
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-kumo-default">
        {JUDGMENTS.map(judgment => {
          const count = totals[judgment].measured + totals[judgment].unknown;
          return (
            <li key={judgment} className="inline-flex items-center gap-1.5" data-judgment-count={judgment} data-count={count}>
              <StatusDot tone={JUDGMENT_TONE[judgment]} />
              {t(`worktrees.judgment.${judgment}`)} {count}
              {count > 0 && <span className="text-kumo-subtle">· {spaceWords(totals[judgment], t)}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function sizeWords(tree: WorktreeView, now: number, t: OperatorTranslate): string {
  if (tree.size_bytes !== null) return formatBytes(tree.size_bytes);
  return tree.size_observed_at ? t('worktrees.size.lastMeasured', { age: ageWords(tree.size_observed_at, now, t) }) : t('worktrees.size.unknown');
}

/** What a delete would lose, from the collector's counts; an unread count says unknown. */
function lossWords(tree: WorktreeView, t: OperatorTranslate): string {
  const parts: string[] = [];
  const count = (value: number | null, known: OperatorMessageKey, unknown: OperatorMessageKey) => {
    if (value === null) parts.push(t(unknown));
    else if (value > 0) parts.push(t(known, { count: value }));
  };
  count(tree.unpushed_commits, 'worktrees.loss.unpushed', 'worktrees.loss.unpushedUnknown');
  count(tree.dirty_files, 'worktrees.loss.dirty', 'worktrees.loss.dirtyUnknown');
  count(tree.ignored_entries, 'worktrees.loss.ignored', 'worktrees.loss.ignoredUnknown');
  return parts.length > 0 ? parts.join(' · ') : t('worktrees.loss.none');
}

function Lifecycle({ tree, now, t }: { readonly tree: WorktreeView; readonly now: number; readonly t: OperatorTranslate }) {
  const record = tree.record;
  if (record === null) return <p className="text-xs text-kumo-subtle" data-record="none">{t('worktrees.record.none')}</p>;
  const fact = (label: string, value: ReactNode) => <><dt className="text-kumo-subtle">{label}</dt><dd className="min-w-0 break-words">{value}</dd></>;
  return (
    <details className="text-xs" data-record={record.end_state}>
      <summary className="cursor-pointer text-kumo-subtle">{t('worktrees.record')} · {record.purpose}</summary>
      <dl className="mt-1.5 grid grid-cols-[minmax(6rem,auto)_1fr] gap-x-4 gap-y-1">
        {fact(t('worktrees.record.creator'), t(`worktrees.source.${record.creator}`))}
        {fact(t('worktrees.record.purpose'), record.purpose)}
        {record.task_id !== null && fact(t('worktrees.record.task'), <code className="font-mono">{record.task_id}</code>)}
        {record.pull_request !== null && fact(t('worktrees.record.pullRequest'), `#${record.pull_request}`)}
        {fact(t('worktrees.record.created'), <Age at={record.created_at} now={now} t={t} />)}
        {fact(t('worktrees.record.state'), t(`worktrees.record.state.${record.end_state}`))}
        {record.ended_at !== null && fact(t('worktrees.record.ended'), <Age at={record.ended_at} now={now} t={t} />)}
      </dl>
    </details>
  );
}

/** What the row offers for cleanup: its checkbox state and, for a green row, the terminal command. */
interface RowCleanup {
  readonly selectable: boolean;
  readonly checked: boolean;
  readonly removed: boolean;
  readonly locked: boolean;
  readonly digest: string | undefined;
  readonly toggle: (id: string, on: boolean) => void;
}

function WorktreeRow({ tree, cleanup, now, t }: { readonly tree: WorktreeView; readonly cleanup: RowCleanup; readonly now: number; readonly t: OperatorTranslate }) {
  const occupancy = tree.process_count === null ? t('worktrees.processesUnknown') : tree.process_count > 0 ? t('worktrees.processes', { count: tree.process_count }) : null;
  return (
    <li className="flex gap-3 border-b border-kumo-hairline px-4 py-3 last:border-b-0" data-worktree={tree.id} data-judgment={tree.judgment}>
      {/* Only a green row can be selected; the server refuses any other id. */}
      <input type="checkbox" className="mt-0.5 size-4 shrink-0 cursor-pointer accent-[var(--color-kumo-brand)] disabled:cursor-not-allowed disabled:opacity-40"
        aria-label={t('worktrees.select', { directory: tree.directory })} data-select={tree.id}
        checked={cleanup.selectable && cleanup.checked} disabled={!cleanup.selectable || cleanup.locked}
        onChange={event => cleanup.toggle(tree.id, event.target.checked)} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-kumo-strong"><StatusDot tone={JUDGMENT_TONE[tree.judgment]} />{t(`worktrees.judgment.${tree.judgment}`)}</span>
          <code className="min-w-0 truncate font-mono text-sm text-kumo-strong" data-directory>{tree.directory}</code>
          <span className="min-w-0 truncate font-mono text-xs text-kumo-subtle">{tree.branch ?? t('worktrees.noBranch')}</span>
          <span className="ml-auto shrink-0 font-mono text-xs tabular-nums text-kumo-default" data-size={tree.size_bytes ?? 'unknown'}>{sizeWords(tree, now, t)}</span>
        </div>
        <p className="flex flex-wrap gap-x-2 text-xs text-kumo-subtle">
          <span data-source={tree.source}>{t(`worktrees.source.${tree.source}`)}</span>
          <span>· <span data-merge={tree.merge}>{t(`worktrees.merge.${tree.merge}`)}</span></span>
          {occupancy && <span className={tree.process_count === null ? '' : 'text-kumo-warning'} data-processes={tree.process_count ?? 'unknown'}>· {occupancy}</span>}
        </p>
        {tree.reasons.length > 0 && (
          <ul className="flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-kumo-default" aria-label={t(`worktrees.judgment.${tree.judgment}`)}>
            {tree.reasons.map(reason => <li key={reason} data-reason={reason}>{t(`worktrees.reason.${reason}`)}</li>)}
          </ul>
        )}
        <p className="text-xs text-kumo-default" data-loss>{t('worktrees.loss')}: {lossWords(tree, t)}</p>
        {cleanup.removed && <p className="text-xs font-medium text-kumo-success" data-removed>{t('worktrees.removedPending')}</p>}
        <Lifecycle tree={tree} now={now} t={t} />
        {cleanup.selectable && cleanup.digest !== undefined && (
          <details className="text-xs" data-clean-command>
            <summary className="cursor-pointer text-kumo-subtle">{t('worktrees.command')}</summary>
            <CommandLine className="mt-1.5" command={cleanupCommand(tree.id, cleanup.digest)} t={t} />
          </details>
        )}
      </div>
    </li>
  );
}

/** One registered repository, or the directories no repository can claim (`group` null). */
function WorktreeGroup({ group, title, status, worktrees, rowCleanup, now, t }: {
  readonly group: string | null; readonly title: string; readonly status: 'ready' | 'unavailable';
  readonly worktrees: readonly WorktreeView[]; readonly rowCleanup: (tree: WorktreeView) => RowCleanup; readonly now: number; readonly t: OperatorTranslate;
}) {
  const heading = `worktrees-${group ?? 'unassigned'}`;
  return (
    <section aria-labelledby={heading} className="overflow-hidden rounded-xl border border-kumo-line bg-kumo-base"
      data-worktree-group={group ?? 'unassigned'} data-status={status}>
      <div className="flex flex-col gap-2 border-b border-kumo-hairline px-4 py-3">
        <SectionTitle id={heading} count={status === 'ready' ? worktrees.length : undefined}>{title}</SectionTitle>
        {status === 'ready' && worktrees.length > 0 && <DiskBar worktrees={worktrees} t={t} />}
      </div>
      {status === 'unavailable'
        ? <p className="px-4 py-3 text-sm text-kumo-danger">{t('worktrees.repository.unavailable')}</p>
        : worktrees.length === 0
          ? <p className="px-4 py-3 text-sm text-kumo-subtle">{t('worktrees.repository.empty')}</p>
          : <ul>{worktrees.map(tree => <WorktreeRow key={tree.id} tree={tree} cleanup={rowCleanup(tree)} now={now} t={t} />)}</ul>}
    </section>
  );
}

/** The runtime a cleanup session starts with: the default docs agent, or the one runtime enabled for docs. Null when the choice is open. */
function cleanupRuntime({ config }: AgentsSettingsV1): string | null {
  const { ids, defaultDocs } = docsRuntimes(config);
  return defaultDocs ?? (ids.length === 1 ? ids[0]! : null);
}

/**
 * The 「让 agent 清理」 entry. It reads the agent settings itself, starts with the
 * runtime they name and opens the new session; with no usable runtime it links
 * to the settings instead of starting.
 */
function CleanupSessionEntry({ readAgentsSettings, startCleanupSession, onOpen, t }: {
  readonly readAgentsSettings: AgentsSettingsReader; readonly startCleanupSession: CleanupSessionCreateWriter;
  readonly onOpen: (next: WorkspaceLocation) => void; readonly t: OperatorTranslate;
}) {
  const [read, setRead] = useState<AgentsSettingsRead | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    readAgentsSettings(controller.signal).then(
      result => { if (!controller.signal.aborted) setRead(result); },
      () => { if (!controller.signal.aborted) setRead({ state: 'unavailable', reason: 'unreachable' }); },
    );
    return () => controller.abort();
  }, [readAgentsSettings]);
  const write = useSessionWrite(startCleanupSession);
  if (read === null) return null;
  if (read.state === 'unavailable') return <p className="text-sm text-kumo-subtle" data-cleanup-entry="settings-unavailable">{t('cleanupSession.entry.settingsUnavailable')}</p>;
  const runtime = cleanupRuntime(read.settings);
  if (runtime === null) {
    return (
      <p className="text-sm text-kumo-default" data-cleanup-entry="setup">
        {t('cleanupSession.entry.setup')}{' '}
        <PageLink to={{ workspace: 'settings', module: null, item: null }} onOpen={onOpen} className="text-kumo-link hover:underline">{t('cleanupSession.entry.settings')}</PageLink>
      </p>
    );
  }
  const sending = write.state.kind === 'sending';
  const start = () => {
    void write.submit({ kind: 'worktree_cleanup', runtime }).then((outcome) => {
      if (outcome?.state === 'ok') onOpen({ workspace: 'cleanup', module: null, item: outcome.result.session_id });
    });
  };
  const answered = write.state.kind === 'answered' ? write.state.outcome : null;
  const failure = answered === null || answered.state === 'ok' ? null
    : answered.state === 'refused' ? localizeDocSessionRefusal(answered.refusal, t) : docSessionReadText(answered.state, t);
  return (
    <>
      <Button variant="secondary" onClick={start} disabled={sending} data-cleanup-entry="start">
        {sending ? t('cleanupSession.entry.starting') : t('cleanupSession.entry')}
      </Button>
      {failure !== null && (
        <Banner variant="error" className="basis-full" data-cleanup-entry-failure={answered?.state === 'refused' ? answered.refusal.code : answered?.state}
          title={t('cleanupSession.entry.refused')} description={<><span className="block">{failure.message}</span><span className="block">{failure.next_action}</span></>} />
      )}
    </>
  );
}

/** Copy for a refusal is keyed by its code; a code this bundle does not know shows the server's sentence, marked as such. */
function refusalText(error: OperatorApiErrorV1, t: OperatorTranslate): { readonly message: string; readonly next_action: string; readonly localized: boolean } {
  const message = `worktrees.error.${error.code}.message`;
  const action = `worktrees.error.${error.code}.action`;
  return isOperatorMessageKey(message) && isOperatorMessageKey(action)
    ? { message: t(message), next_action: t(action), localized: true }
    : { message: error.message, next_action: error.next_action, localized: false };
}

const OUTCOME_TONE: Readonly<Record<WorktreeCleanupItem['outcome'], DotTone>> = { removed: 'ok', skipped: 'warn', failed: 'danger' };

function ResultList({ result, t }: { readonly result: WorktreeCleanupResult; readonly t: OperatorTranslate }) {
  const counts = (['removed', 'skipped', 'failed'] as const).map(outcome => [outcome, result.items.filter(item => item.outcome === outcome).length] as const).filter(([, count]) => count > 0);
  return (
    <section role="status" className="flex flex-col gap-2 rounded-xl border border-kumo-line bg-kumo-base px-4 py-3" data-cleanup-result="cleaned">
      <p className="text-sm font-medium text-kumo-strong">{counts.map(([outcome, count]) => t(`worktrees.result.${outcome}`, { count })).join(' · ')}</p>
      <ul className="flex flex-col gap-1 text-xs">
        {result.items.map(item => (
          <li key={item.id} className="flex min-w-0 flex-wrap items-baseline gap-x-2" data-cleanup-item={item.id} data-outcome={item.outcome} data-reason={item.reason ?? undefined}>
            <span className="inline-flex items-center gap-1.5 font-medium text-kumo-strong"><StatusDot tone={OUTCOME_TONE[item.outcome]} />{t(`worktrees.outcome.${item.outcome}`)}</span>
            <code className="min-w-0 truncate font-mono text-kumo-default">{item.directory}</code>
            {item.reason !== null && <span className="text-kumo-subtle">· {t(`worktrees.reason.${item.reason}`)}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function CleanupResult({ cleanup, t }: { readonly cleanup: WorktreeCleanup; readonly t: OperatorTranslate }) {
  const { state } = cleanup;
  const reselect = <Banner.Action variant="secondary" onClick={cleanup.reselect}>{t('worktrees.reselect')}</Banner.Action>;
  if (state.kind === 'cleaned') return <ResultList result={state.result} t={t} />;
  if (state.kind === 'refused') {
    const text = refusalText(state.error, t);
    return (
      <Banner variant="error" data-cleanup-result={state.error.code} title={`${t('worktrees.refused.title')} · ${state.error.code}`}
        description={<>{!text.localized && <span className="block text-xs">{t('worktrees.serverText')}</span>}
          <span className="block">{text.message}</span><span className="block">{text.next_action}</span></>}
        action={reselect} />
    );
  }
  if (state.kind === 'unreachable') return <Banner variant="error" data-cleanup-result="unreachable" description={t('worktrees.unreachable')} action={reselect} />;
  if (state.kind === 'unreadable') return <Banner variant="alert" data-cleanup-result="unreadable" description={t('worktrees.unreadable')} action={reselect} />;
  return null;
}

/**
 * Every worktree the collector found. Green rows start checked and one click
 * cleans the checked ones; yellow and red rows cannot be selected (5.1).
 */
export function WorktreesPage({ view, cleanup, now, t, docSessions, readAgentsSettings, startCleanupSession, onOpen }: {
  readonly view: WorktreesView; readonly cleanup: WorktreeCleanup; readonly now: number; readonly t: OperatorTranslate;
  /**
   * The doc session list; the cleanup session entry shows while it answers. No field names the kinds a
   * server starts, so a server that does not accept `worktree_cleanup` says so in its create refusal.
   */
  readonly docSessions?: DocSessions;
  readonly readAgentsSettings?: AgentsSettingsReader;
  readonly startCleanupSession?: CleanupSessionCreateWriter;
  readonly onOpen?: (next: WorkspaceLocation) => void;
}) {
  const digests = useRowDigests(cleanup.selectable);
  const header = <header className="border-b border-kumo-hairline pb-4"><h1 className="text-xl font-semibold text-kumo-strong">{t('worktrees.title')}</h1></header>;
  if (view.kind === 'loading') return <div data-worktrees-page="pending">{header}<BoardState loading title={t('freshness.worktrees.loading')} description={t('worktrees.pending.body')} /></div>;
  if (view.kind === 'unreachable') return <div data-worktrees-page="unreachable">{header}<BoardState title={t('board.unreachable.title')} description={t('board.unreachable.body')} command="repo-harness operator serve" /></div>;
  const snapshot = worktreesOf(view);
  if (snapshot === null) return <div data-worktrees-page="pending">{header}<BoardState title={t('worktrees.pending.title')} description={t('worktrees.pending.body')} /></div>;
  if (snapshot.repositories.length === 0 && snapshot.unassigned.length === 0) return <div data-worktrees-page="empty">{header}<BoardState title={t('board.noRepositories.title')} description={t('board.noRepositories.body')} command="repo-harness adopt --help" /></div>;
  const reclaimable = reclaimableSpace(snapshot);
  const running = cleanup.state.kind === 'running';
  const count = cleanup.state.kind === 'running' ? cleanup.state.count : cleanup.selected.length;
  const overLimit = cleanup.selected.length > WORKTREE_CLEANUP_MAX_IDS;
  // A yellow row is the only thing a session can decide; without one there is nothing to ask the agent.
  const offerSession = docSessions !== undefined && readAgentsSettings !== undefined && startCleanupSession !== undefined && onOpen !== undefined
    && docSessionsLive(docSessions.view) && allWorktrees(snapshot).some(tree => tree.judgment === 'yellow');
  const selectable = new Set(cleanup.selectable.map(tree => tree.id));
  const checked = new Set(cleanup.selected.map(tree => tree.id));
  const rowCleanup = (tree: WorktreeView): RowCleanup => ({
    selectable: selectable.has(tree.id), checked: checked.has(tree.id), removed: cleanup.removed.has(tree.id),
    locked: running, digest: digests[tree.id], toggle: cleanup.toggle,
  });
  return (
    <div className="flex flex-col gap-5" data-worktrees-page={view.refreshFailed ? 'refresh-failed' : snapshot.status}>
      {header}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-kumo-default" data-reclaimable={reclaimable.bytes} data-reclaimable-unknown={reclaimable.unknown}>
          <span className="font-medium text-kumo-strong">{t('worktrees.reclaimable')}</span> · <span className="font-mono">{spaceWords(reclaimable, t)}</span>
        </p>
        <div className="flex flex-wrap items-center gap-3">
          {offerSession && <CleanupSessionEntry readAgentsSettings={readAgentsSettings} startCleanupSession={startCleanupSession} onOpen={onOpen} t={t} />}
          {cleanup.selectable.length > 0 && (
            <Button variant="primary" onClick={cleanup.submit} disabled={running || count === 0 || overLimit} data-clean={count}>
              {running ? t('worktrees.cleaning', { count }) : t('worktrees.clean', { count })}
            </Button>
          )}
        </div>
      </div>
      {overLimit && <p className="text-sm text-kumo-warning" data-clean-limit>{t('worktrees.cleanLimit', { max: WORKTREE_CLEANUP_MAX_IDS })}</p>}
      <CleanupResult cleanup={cleanup} t={t} />
      {snapshot.status === 'partial' && <Banner variant="secondary" icon={<WarningIcon />} title={t('worktrees.partial.title')} description={t('worktrees.partial.body')} />}
      {snapshot.repositories.map(repository => <WorktreeGroup key={repository.repository_id} group={repository.repository_id} title={repository.display_name}
        status={repository.status} worktrees={repository.worktrees} rowCleanup={rowCleanup} now={now} t={t} />)}
      {snapshot.unassigned.length > 0 && <WorktreeGroup group={null} title={t('worktrees.unassigned')} status="ready" worktrees={snapshot.unassigned} rowCleanup={rowCleanup} now={now} t={t} />}
    </div>
  );
}
