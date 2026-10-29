import { useMemo, useState, type ReactNode } from 'react';
import { Banner, Button, Loader } from '@cloudflare/kumo';
import { CaretRightIcon } from '@phosphor-icons/react';
import { WORKTREE_CLEANUP_MAX_IDS } from '../core/operator/worktree-cleanup';
import {
  CLEANUP_ARCHIVE_STEPS,
  type CleanupArchiveV1,
  type CleanupPlanItemV1,
  type CleanupSessionItemV1,
  type CleanupSessionRequestV1,
  type OperatorCleanupPlanV1,
} from '../core/operator/worktree-cleanup-plan';
import type { WorktreesSnapshot, WorktreeView } from '../core/operator/worktrees';
import { cleanupSessionRequest, useCleanupPlan, type CleanupPlanReader, type CleanupSessionWriter } from './cleanup-session';
import { SessionReadFailure, SessionRecord } from './DocSessionPage';
import {
  localizeDocSessionRefusal,
  useDocSessionEvents,
  useSessionWrite,
  type DocSessionEventsReader,
} from './doc-sessions';
import { isOperatorMessageKey, type OperatorTranslate } from './i18n';
import { ExternalLink, StatusDot } from './ui';
import { DiskBar, JUDGMENT_TONE, OUTCOME_TONE } from './WorktreesPage';
import { allWorktrees, formatBytes, spaceTotal, spaceWords, worktreesOf, type WorktreesView } from './worktrees';

export interface CleanupSessionPageProps {
  /** The 32-hex id from `#cleanup/<id>`. */
  readonly sessionId: string;
  readonly readEvents: DocSessionEventsReader;
  readonly readPlan: CleanupPlanReader;
  readonly writeCleanup: CleanupSessionWriter;
  /** The collector rows the approval digest binds, and their re-read after a cleanup. */
  readonly worktrees: WorktreesView;
  readonly reloadWorktrees: () => void;
  readonly generation: number;
  readonly t: OperatorTranslate;
}

type Judgment = WorktreeView['judgment'];
const GROUPS: readonly Judgment[] = ['green', 'yellow', 'red'];

/** What the checked ids ran so far. A removed item stays removed; any other outcome describes only the plan it answered. */
interface Ran {
  readonly plan: string | null;
  readonly items: ReadonlyMap<string, CleanupSessionItemV1>;
}
const NOTHING_RAN: Ran = { plan: null, items: new Map() };

/** What this item would lose, from the plan's counts. */
function lossWords(loss: CleanupPlanItemV1['loss'], t: OperatorTranslate): string {
  const parts: string[] = [];
  if (loss.unpushed_commits > 0) parts.push(t('worktrees.loss.unpushed', { count: loss.unpushed_commits }));
  if (loss.dirty_files > 0) parts.push(t('worktrees.loss.dirty', { count: loss.dirty_files }));
  if (loss.ignored_entries > 0) parts.push(t('worktrees.loss.ignored', { count: loss.ignored_entries }));
  return parts.length > 0 ? parts.join(' · ') : t('worktrees.loss.none');
}

function sizeWords(row: WorktreeView, t: OperatorTranslate): string {
  return row.size_bytes === null ? t('worktrees.size.unknown') : formatBytes(row.size_bytes);
}

/** Refusal copy: the cleanup codes first, then the session codes they share with the doc session. */
function refusalText(refusal: Parameters<typeof localizeDocSessionRefusal>[0], t: OperatorTranslate) {
  const message = `worktrees.error.${refusal.code}.message`;
  const action = `worktrees.error.${refusal.code}.action`;
  return isOperatorMessageKey(message) && isOperatorMessageKey(action)
    ? { message: t(message), next_action: t(action), localized: true }
    : localizeDocSessionRefusal(refusal, t);
}

function ItemOutcome({ outcome, t }: { readonly outcome: CleanupSessionItemV1; readonly t: OperatorTranslate }) {
  return (
    <p className="flex flex-wrap items-center gap-x-2 text-xs text-kumo-default" data-item-outcome={outcome.outcome} data-reason={outcome.reason ?? undefined}>
      <span className="inline-flex items-center gap-1.5 font-medium text-kumo-strong"><StatusDot tone={OUTCOME_TONE[outcome.outcome]} />{t(`worktrees.outcome.${outcome.outcome}`)}</span>
      {outcome.reason !== null && <span className="text-kumo-subtle">· {t(`worktrees.reason.${outcome.reason}`)}</span>}
      {outcome.reason === 'reapproval_required' && <span className="rounded-full bg-kumo-recessed px-2 py-0.5 font-medium text-kumo-warning" data-reapprove>{t('cleanupSession.reapprove')}</span>}
    </p>
  );
}

function ArchiveLocation({ archive, t }: { readonly archive: NonNullable<CleanupPlanItemV1['archive']>; readonly t: OperatorTranslate }) {
  return (
    <ul className="flex flex-col gap-0.5 text-xs text-kumo-default" data-archive>
      {archive.branch !== null && <li>{t('cleanupSession.archive.branch', { branch: archive.branch })}</li>}
      {archive.private_directory !== null && <li>{t('cleanupSession.archive.private', { directory: archive.private_directory })}</li>}
    </ul>
  );
}

function PlanItem({ item, row, checked, selectable, outcome, onToggle, t }: {
  readonly item: CleanupPlanItemV1; readonly row: WorktreeView | undefined; readonly checked: boolean; readonly selectable: boolean;
  readonly outcome: CleanupSessionItemV1 | undefined; readonly onToggle: (id: string, on: boolean) => void; readonly t: OperatorTranslate;
}) {
  const red = item.judgment === 'red';
  const removed = outcome?.outcome === 'removed';
  return (
    <li className="flex gap-3 border-b border-kumo-hairline px-4 py-3 last:border-b-0" data-plan-item={item.id} data-judgment={item.judgment}>
      {/* A red item is in use and has no delete entry, so it has no checkbox at all. */}
      {!red && (
        <input type="checkbox" className="mt-0.5 size-4 shrink-0 cursor-pointer accent-[var(--color-kumo-brand)] disabled:cursor-not-allowed disabled:opacity-40"
          aria-label={t('worktrees.select', { directory: item.directory })} data-select={item.id}
          checked={checked} disabled={!selectable} onChange={event => onToggle(item.id, event.target.checked)} />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
          <code className="min-w-0 truncate font-mono text-sm text-kumo-strong" data-directory>{item.directory}</code>
          <span className="min-w-0 truncate font-mono text-xs text-kumo-subtle">{item.branch ?? t('worktrees.noBranch')}</span>
          {row !== undefined && <span className="ml-auto shrink-0 font-mono text-xs tabular-nums text-kumo-default" data-size={row.size_bytes ?? 'unknown'}>{sizeWords(row, t)}</span>}
        </div>
        {red && row !== undefined && row.reasons.length > 0 && (
          <ul className="flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-kumo-default">
            {row.reasons.map(reason => <li key={reason} data-reason={reason}>{t(`worktrees.reason.${reason}`)}</li>)}
          </ul>
        )}
        {item.advice !== null && (
          <div className="flex flex-col gap-1" data-advice={item.advice}>
            <p className="text-sm text-kumo-default"><span className="font-medium text-kumo-strong">{t('cleanupSession.advised', { advice: t(`cleanupSession.advice.${item.advice}`) })}</span></p>
            {item.advice === 'keep' && <p className="text-xs text-kumo-warning" data-advice-keep>{t('cleanupSession.advisedKeep')}</p>}
            {item.reason !== null && <p className="type-reading text-sm text-kumo-default [overflow-wrap:anywhere]" data-reason-text>{item.reason}</p>}
          </div>
        )}
        {!red && item.evidence.length > 0 && (
          <ul className="flex list-disc flex-col gap-0.5 pl-4 text-xs text-kumo-default" aria-label={t('cleanupSession.evidence')} data-evidence>
            {item.evidence.map(line => <li key={line} className="[overflow-wrap:anywhere]">{line}</li>)}
          </ul>
        )}
        {!red && <p className="text-xs text-kumo-default" data-loss>{t('worktrees.loss')}: {lossWords(item.loss, t)}</p>}
        {item.archive !== null && <ArchiveLocation archive={item.archive} t={t} />}
        {!red && row === undefined && !removed && <p className="text-xs text-kumo-warning" data-gone>{t('cleanupSession.gone')}</p>}
        {outcome !== undefined && <ItemOutcome outcome={outcome} t={t} />}
      </div>
    </li>
  );
}

function PlanGroup({ judgment, items, children, t }: {
  readonly judgment: Judgment; readonly items: readonly CleanupPlanItemV1[]; readonly children: ReactNode; readonly t: OperatorTranslate;
}) {
  const heading = `cleanup-group-${judgment}`;
  return (
    <section aria-labelledby={heading} className="overflow-hidden rounded-xl border border-kumo-line bg-kumo-base" data-plan-group={judgment} data-count={items.length}>
      <div className="flex flex-col gap-0.5 border-b border-kumo-hairline px-4 py-3">
        <h2 id={heading} className="flex items-center gap-2 text-sm font-semibold text-kumo-strong">
          <StatusDot tone={JUDGMENT_TONE[judgment]} />{t(`cleanupSession.group.${judgment}`)}
          <span className="rounded-full bg-kumo-recessed px-1.5 text-xs font-medium tabular-nums text-kumo-subtle">{items.length}</span>
        </h2>
        {judgment !== 'green' && <p className="text-xs text-kumo-subtle">{t(`cleanupSession.group.${judgment}.hint`)}</p>}
      </div>
      <ul>{children}</ul>
    </section>
  );
}

/** Disk use before and after the checked items go. A bar shows measured bytes only; unknown sizes are counted beside it. */
function DiskCompare({ all, selected, t }: { readonly all: readonly WorktreeView[]; readonly selected: readonly WorktreeView[]; readonly t: OperatorTranslate }) {
  const gone = new Set(selected.map(row => row.id));
  const before = spaceTotal(all).bytes;
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-kumo-line bg-kumo-base px-4 py-3" data-disk-compare>
      <p className="text-sm font-medium text-kumo-strong" data-frees>{t('cleanupSession.frees', { space: spaceWords(spaceTotal(selected), t) })}</p>
      <div className="flex flex-col gap-1" data-disk="before"><span className="text-xs font-medium text-kumo-subtle">{t('cleanupSession.before')}</span><DiskBar worktrees={all} scale={before} t={t} /></div>
      <div className="flex flex-col gap-1" data-disk="after"><span className="text-xs font-medium text-kumo-subtle">{t('cleanupSession.after')}</span><DiskBar worktrees={all.filter(row => !gone.has(row.id))} scale={before} t={t} /></div>
    </section>
  );
}

function ExecutionSteps({ archiving, t }: { readonly archiving: boolean; readonly t: OperatorTranslate }) {
  const steps = [...(archiving ? CLEANUP_ARCHIVE_STEPS : []), 'remove'] as const;
  return (
    <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-kumo-default" data-steps={steps.join(',')}>
      {steps.map((step, index) => (
        <li key={step} className="inline-flex items-center gap-1.5" data-step={step}>
          {index > 0 && <CaretRightIcon size={12} aria-hidden="true" className="text-kumo-subtle" />}
          {t(`cleanupSession.step.${step}`)}
        </li>
      ))}
    </ol>
  );
}

function ArchiveResult({ archive, onRetry, t }: { readonly archive: CleanupArchiveV1; readonly onRetry: () => void; readonly t: OperatorTranslate }) {
  if (archive.state === 'failed') {
    return (
      <Banner variant="error" data-archive-state="failed" data-failed-step={archive.failed_step ?? undefined}
        description={t('cleanupSession.archiveFailed', { step: t(`cleanupSession.step.${archive.failed_step!}`) })}
        action={<Banner.Action variant="secondary" onClick={onRetry}>{t('cleanupSession.retry')}</Banner.Action>} />
    );
  }
  if (archive.pull_request === null) return null;
  return <p className="text-sm" data-archive-state="done"><ExternalLink href={archive.pull_request.url}>{t('cleanupSession.archivePull', { number: archive.pull_request.number })}</ExternalLink></p>;
}

/**
 * The plan the agent handed in, and the approval of the checked items. The
 * browser sends ids and the digests the plan gave it; the service re-checks each
 * item before it archives or deletes anything, and this page claims no success
 * the service has not answered.
 */
function PlanReview({ plan, snapshot, writeCleanup, reloadPlan, reloadWorktrees, t }: {
  readonly plan: OperatorCleanupPlanV1; readonly snapshot: WorktreesSnapshot | null; readonly writeCleanup: CleanupSessionWriter;
  readonly reloadPlan: () => void; readonly reloadWorktrees: () => void; readonly t: OperatorTranslate;
}) {
  const planKey = plan.plan_sha256;
  const all = useMemo(() => snapshot === null ? [] : allWorktrees(snapshot), [snapshot]);
  const rows = useMemo(() => new Map(all.map(row => [row.id, row])), [all]);
  // Choices belong to one plan: a plan the agent hands in again starts from the defaults.
  const [choice, setChoice] = useState<{ readonly plan: string | null; readonly checked: ReadonlyMap<string, boolean> }>({ plan: planKey, checked: new Map() });
  const [ran, setRan] = useState<Ran>(NOTHING_RAN);
  const [stale, setStale] = useState(false);
  const write = useSessionWrite(writeCleanup);

  const checkedBy = choice.plan === planKey ? choice.checked : new Map<string, boolean>();
  const outcomeOf = (id: string): CleanupSessionItemV1 | undefined => {
    const outcome = ran.items.get(id);
    return outcome !== undefined && (outcome.outcome === 'removed' || ran.plan === planKey) ? outcome : undefined;
  };
  // The plan and the collector judge the same worktree; an item is selectable only where they agree, and red never.
  const selectable = (item: CleanupPlanItemV1) => item.judgment !== 'red' && rows.get(item.id)?.judgment === item.judgment && outcomeOf(item.id)?.outcome !== 'removed';
  const isChecked = (item: CleanupPlanItemV1) => selectable(item) && (checkedBy.get(item.id) ?? item.judgment === 'green');
  const selected = plan.items.filter(isChecked);
  const selectedRows = selected.map(item => rows.get(item.id)!);
  const count = selected.length;

  const toggle = (id: string, on: boolean) => setChoice(current => ({ plan: planKey, checked: new Map(current.plan === planKey ? current.checked : []).set(id, on) }));
  const reselect = () => {
    setChoice({ plan: planKey, checked: new Map() });
    setStale(false);
    write.reset();
    reloadPlan();
    reloadWorktrees();
  };
  const execute = async () => {
    if (snapshot === null) return;
    let request: CleanupSessionRequestV1;
    try { request = await cleanupSessionRequest(plan, selected.map(item => item.id), snapshot); } catch { setStale(true); reloadWorktrees(); return; }
    setStale(false);
    const outcome = await write.submit(request);
    if (outcome === null) return;
    if (outcome.state === 'ok') {
      const { items } = outcome.result;
      setRan(current => ({ plan: planKey, items: new Map([...current.items, ...items.map(item => [item.id, item] as const)]) }));
      // A skipped-for-reapproval item stays unchecked until the user approves it again.
      const again = items.filter(item => item.reason === 'reapproval_required').map(item => item.id);
      if (again.length > 0) setChoice(current => ({ plan: planKey, checked: new Map([...(current.plan === planKey ? current.checked : []), ...again.map(id => [id, false] as const)]) }));
    }
    reloadPlan();
    reloadWorktrees();
  };

  const sending = write.state.kind === 'sending';
  const overLimit = count > WORKTREE_CLEANUP_MAX_IDS;
  const answered = write.state.kind === 'answered' ? write.state.outcome : null;
  const archiving = selected.some(item => item.archive !== null);
  const refused = answered?.state === 'refused' ? refusalText(answered.refusal, t) : null;
  const reselectAction = <Banner.Action variant="secondary" onClick={reselect}>{t('worktrees.reselect')}</Banner.Action>;
  return (
    <div className="flex flex-col gap-5" data-plan-state={plan.state}>
      {plan.state === 'executing' && <p role="status" className="flex items-center gap-1.5 text-sm text-kumo-subtle" data-executing><Loader size={12} />{t('cleanupSession.executing')}</p>}
      {snapshot === null && <Banner variant="error" data-worktrees-unavailable description={t('cleanupSession.worktreesUnavailable')} />}
      {GROUPS.map((judgment) => {
        const items = plan.items.filter(item => item.judgment === judgment);
        return items.length === 0 ? null : (
          <PlanGroup key={judgment} judgment={judgment} items={items} t={t}>
            {items.map(item => (
              <PlanItem key={item.id} item={item} row={rows.get(item.id)} checked={isChecked(item)} selectable={selectable(item) && !sending}
                outcome={outcomeOf(item.id)} onToggle={toggle} t={t} />
            ))}
          </PlanGroup>
        );
      })}
      {count > 0 && <DiskCompare all={all} selected={selectedRows} t={t} />}
      <section className="flex flex-col gap-3 rounded-xl border border-kumo-line bg-kumo-base px-4 py-3" data-authorize>
        <ExecutionSteps archiving={archiving} t={t} />
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" onClick={() => void execute()} data-authorize-count={count}
            disabled={sending || count === 0 || overLimit || plan.state === 'executing' || snapshot === null}>
            {sending ? t('cleanupSession.running', { count }) : t('cleanupSession.authorize', { count })}
          </Button>
          {overLimit && <p className="text-sm text-kumo-warning" data-clean-limit>{t('worktrees.cleanLimit', { max: WORKTREE_CLEANUP_MAX_IDS })}</p>}
        </div>
      </section>
      {stale && <Banner variant="alert" data-cleanup-result="stale" description={t('cleanupSession.stale')} action={reselectAction} />}
      {answered?.state === 'ok' && <ResultSummary result={answered.result} onRetry={() => void execute()} t={t} />}
      {refused !== null && answered?.state === 'refused' && (
        <Banner variant="error" data-cleanup-result={answered.refusal.code} title={`${t('worktrees.refused.title')} · ${answered.refusal.code}`}
          description={<>{!refused.localized && <span className="block text-xs">{t('worktrees.serverText')}</span>}
            <span className="block">{refused.message}</span><span className="block">{refused.next_action}</span></>}
          action={reselectAction} />
      )}
      {(answered?.state === 'unreachable' || answered?.state === 'unreadable') && (
        <Banner variant={answered.state === 'unreachable' ? 'error' : 'alert'} data-cleanup-result={answered.state}
          description={t(answered.state === 'unreachable' ? 'worktrees.unreachable' : 'worktrees.unreadable')} action={reselectAction} />
      )}
    </div>
  );
}

function ResultSummary({ result, onRetry, t }: {
  readonly result: { readonly archive: CleanupArchiveV1; readonly items: readonly CleanupSessionItemV1[] }; readonly onRetry: () => void; readonly t: OperatorTranslate;
}) {
  const counts = (['removed', 'skipped', 'failed'] as const).map(outcome => [outcome, result.items.filter(item => item.outcome === outcome).length] as const).filter(([, count]) => count > 0);
  return (
    <section role="status" className="flex flex-col gap-2" data-cleanup-result="answered">
      <p className="text-sm font-medium text-kumo-strong">{counts.map(([outcome, count]) => t(`worktrees.result.${outcome}`, { count })).join(' · ')}</p>
      <ArchiveResult archive={result.archive} onRetry={onRetry} t={t} />
    </section>
  );
}

/** One worktree cleanup session (5-WTC): the record while the agent investigates, then the plan to review and approve. */
export function CleanupSessionPage({ sessionId, readEvents, readPlan, writeCleanup, worktrees, reloadWorktrees, generation, t }: CleanupSessionPageProps) {
  const { view: plan, reload: reloadPlan } = useCleanupPlan(readPlan, sessionId, generation);
  const events = useDocSessionEvents(readEvents, sessionId);
  const header = (
    <header className="border-b border-kumo-hairline pb-4">
      <h1 className="text-xl font-semibold text-kumo-strong">{t('cleanupSession.title')}</h1>
    </header>
  );
  const ready = plan.kind === 'ready' ? plan.plan : null;
  return (
    <div className="flex min-w-0 flex-col gap-5" data-cleanup-session-page={sessionId}>
      {header}
      {plan.kind === 'unavailable' && <SessionReadFailure source={t('cleanupSession.source.plan')} reason={plan.reason} t={t} />}
      {plan.kind === 'ready' && plan.refreshFailed && <SessionReadFailure source={t('cleanupSession.source.plan')} reason="unreachable" t={t} />}
      {ready !== null && ready.state === 'investigating' && (
        <p role="status" className="flex items-center gap-1.5 text-sm text-kumo-subtle" data-investigating><Loader size={12} />{t('cleanupSession.investigating')}</p>
      )}
      {ready !== null && ready.state !== 'investigating' && (
        <PlanReview key={ready.session_id} plan={ready} snapshot={worktreesOf(worktrees)} writeCleanup={writeCleanup} reloadPlan={reloadPlan} reloadWorktrees={reloadWorktrees} t={t} />
      )}
      <SessionRecord sessionId={sessionId} events={events} runtime={ready?.runtime ?? null} t={t} />
    </div>
  );
}
