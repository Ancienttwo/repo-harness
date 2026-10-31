import type { ReactNode } from 'react';
import { Banner, Loader } from '@cloudflare/kumo';
import type { CleanupPlanPreview } from '../core/operator/doc-session-api';
import { cleanupSelection, type CleanupPlan, type CleanupPlanItem } from '../core/operator/worktree-cleanup-plan';
import type { WorktreeView } from '../core/operator/worktrees';
import { useCleanupPlan, type CleanupPlanReader } from './cleanup-session';
import { SessionReadFailure, SessionRecord } from './DocSessionPage';
import { useDocSessionEvents, type DocSessionEventsReader } from './doc-sessions';
import type { OperatorTranslate } from './i18n';
import { StatusDot } from './ui';
import { DiskBar, JUDGMENT_TONE } from './WorktreesPage';
import { formatBytes, spaceTotal, spaceWords } from './worktrees';

export interface CleanupSessionPageProps {
  /** The 32-hex id from `#cleanup/<id>`. */
  readonly sessionId: string;
  readonly readEvents: DocSessionEventsReader;
  readonly readPlan: CleanupPlanReader;
  readonly generation: number;
  readonly t: OperatorTranslate;
}

type Judgment = WorktreeView['judgment'];
const GROUPS: readonly Judgment[] = ['green', 'yellow', 'red'];

function sizeWords(row: WorktreeView, t: OperatorTranslate): string {
  return row.size_bytes === null ? t('worktrees.size.unknown') : formatBytes(row.size_bytes);
}

function Paths({ title, items, name }: { readonly title: string; readonly items: readonly string[]; readonly name: string }) {
  return items.length === 0 ? null : (
    <div className="flex flex-col gap-0.5">
      <h4 className="type-caption text-kumo-subtle">{title}</h4>
      <ul className="flex flex-col gap-0.5" data-loss={name}>
        {items.map(item => <li key={item}><code className="font-mono text-xs [overflow-wrap:anywhere]">{item}</code></li>)}
      </ul>
    </div>
  );
}

/** What removing the item loses, as the server observed it. A red item has no observation. */
function Loss({ loss, t }: { readonly loss: NonNullable<CleanupPlanItem['loss']>; readonly t: OperatorTranslate }) {
  if (loss.files.length === 0 && loss.ignored.length === 0 && loss.commits.length === 0) {
    return <p className="text-xs text-kumo-default" data-loss="none">{t('cleanupSession.loss.none')}</p>;
  }
  return (
    <div className="flex flex-col gap-1.5" data-loss="some">
      <Paths title={t('docSession.discard.files')} items={loss.files} name="files" />
      <Paths title={t('docSession.discard.ignored')} items={loss.ignored} name="ignored" />
      <Paths title={t('docSession.discard.commits')} items={loss.commits.map(commit => commit.slice(0, 12))} name="commits" />
    </div>
  );
}

/** Where the archive goes; names only, never a host path. */
function ArchiveLocation({ archive, t }: { readonly archive: CleanupPlanItem['advice']['archive']; readonly t: OperatorTranslate }) {
  if (archive.git === null && archive.private === null) return null;
  return (
    <ul className="flex flex-col gap-0.5 text-xs text-kumo-default" data-archive>
      {archive.git !== null && <li data-archive-git>{t('cleanupSession.archive.branch', { branch: archive.git.branch, directory: archive.git.directory })}</li>}
      {archive.private !== null && <li data-archive-private>{t('cleanupSession.archive.private', { directory: archive.private.directory })}</li>}
    </ul>
  );
}

function PlanItem({ item, checked, selectable, t }: {
  readonly item: CleanupPlanItem; readonly checked: boolean; readonly selectable: boolean; readonly t: OperatorTranslate;
}) {
  const { worktree: row, advice } = item;
  const red = row.judgment === 'red';
  return (
    <li className="flex gap-3 border-b border-kumo-hairline px-4 py-3 last:border-b-0" data-plan-item={row.id} data-judgment={row.judgment}>
      {/* A red item is in use and has no delete entry, so it has no checkbox at all. */}
      {!red && (
        <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-[var(--color-kumo-brand)] disabled:opacity-40"
          aria-label={t('worktrees.select', { directory: row.directory })} data-select={row.id} checked={checked} disabled={!selectable} readOnly />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
          <code className="min-w-0 truncate font-mono text-sm text-kumo-strong" data-directory>{row.directory}</code>
          <span className="min-w-0 truncate font-mono text-xs text-kumo-subtle">{row.branch ?? t('worktrees.noBranch')}</span>
          <span className="ml-auto shrink-0 font-mono text-xs tabular-nums text-kumo-default" data-size={row.size_bytes ?? 'unknown'}>{sizeWords(row, t)}</span>
        </div>
        {red && row.reasons.length > 0 && (
          <ul className="flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-kumo-default">
            {row.reasons.map(reason => <li key={reason} data-reason={reason}>{t(`worktrees.reason.${reason}`)}</li>)}
          </ul>
        )}
        <div className="flex flex-col gap-1" data-advice={advice.recommendation}>
          <p className="text-sm font-medium text-kumo-strong">{t('cleanupSession.advised', { advice: t(`cleanupSession.advice.${advice.recommendation}`) })}</p>
          <p className="type-reading text-sm text-kumo-default [overflow-wrap:anywhere]" data-reason-text>{advice.reason}</p>
        </div>
        <ul className="flex list-disc flex-col gap-0.5 pl-4 text-xs text-kumo-default" aria-label={t('cleanupSession.evidence')} data-evidence>
          {advice.evidence.map(line => <li key={line} className="[overflow-wrap:anywhere]">{line}</li>)}
        </ul>
        {item.loss !== null && <Loss loss={item.loss} t={t} />}
        {item.loss === null && !red && <p className="text-xs text-kumo-warning" data-loss="unobserved">{t('cleanupSession.loss.unobserved')}</p>}
        <ArchiveLocation archive={advice.archive} t={t} />
      </div>
    </li>
  );
}

function PlanGroup({ judgment, count, children, t }: {
  readonly judgment: Judgment; readonly count: number; readonly children: ReactNode; readonly t: OperatorTranslate;
}) {
  const heading = `cleanup-group-${judgment}`;
  return (
    <section aria-labelledby={heading} className="overflow-hidden rounded-xl border border-kumo-line bg-kumo-base" data-plan-group={judgment} data-count={count}>
      <div className="flex flex-col gap-0.5 border-b border-kumo-hairline px-4 py-3">
        <h2 id={heading} className="flex items-center gap-2 text-sm font-semibold text-kumo-strong">
          <StatusDot tone={JUDGMENT_TONE[judgment]} />{t(`cleanupSession.group.${judgment}`)}
          <span className="rounded-full bg-kumo-recessed px-1.5 text-xs font-medium tabular-nums text-kumo-subtle">{count}</span>
        </h2>
        {judgment !== 'green' && <p className="text-xs text-kumo-subtle">{t(`cleanupSession.group.${judgment}.hint`)}</p>}
      </div>
      <ul>{children}</ul>
    </section>
  );
}

/** Disk use of the plan's worktrees before and after the selected items go. A bar shows measured bytes only. */
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

/**
 * The plan the agent handed in. Each checkbox shows `cleanupSelection`: which
 * items the server lets a person select, and which start selected. The server
 * declares whether it runs a cleanup from the plan; while it does not, the
 * selection cannot change and no control runs anything.
 */
function PlanReview({ plan, execution, t }: { readonly plan: CleanupPlan; readonly execution: CleanupPlanPreview['execution']; readonly t: OperatorTranslate }) {
  const selection = new Map(plan.items.map(item => [item.worktree.id, cleanupSelection(item)]));
  const selected = plan.items.filter(item => selection.get(item.worktree.id)!.selected_by_default);
  return (
    <div className="flex flex-col gap-5">
      {GROUPS.map((judgment) => {
        const items = plan.items.filter(item => item.worktree.judgment === judgment);
        return items.length === 0 ? null : (
          <PlanGroup key={judgment} judgment={judgment} count={items.length} t={t}>
            {items.map(item => (
              <PlanItem key={item.worktree.id} item={item} checked={selection.get(item.worktree.id)!.selected_by_default}
                selectable={execution.enabled && selection.get(item.worktree.id)!.selectable} t={t} />
            ))}
          </PlanGroup>
        );
      })}
      {selected.length > 0 && <DiskCompare all={plan.items.map(item => item.worktree)} selected={selected.map(item => item.worktree)} t={t} />}
      {!execution.enabled && <Banner variant="alert" data-execution={execution.code}
        title={t(`cleanupSession.execution.${execution.code}.message`)} description={t(`cleanupSession.execution.${execution.code}.action`)} />}
    </div>
  );
}

/** One worktree cleanup session (5-WTC): the record while the agent investigates, then the plan it handed in. */
export function CleanupSessionPage({ sessionId, readEvents, readPlan, generation, t }: CleanupSessionPageProps) {
  const view = useCleanupPlan(readPlan, sessionId, generation);
  const events = useDocSessionEvents(readEvents, sessionId);
  const preview = view.kind === 'ready' ? view.preview : null;
  return (
    <div className="flex min-w-0 flex-col gap-5" data-cleanup-session-page={sessionId}>
      <header className="border-b border-kumo-hairline pb-4">
        <h1 className="text-xl font-semibold text-kumo-strong">{t('cleanupSession.title')}</h1>
      </header>
      {view.kind === 'unavailable' && <SessionReadFailure source={t('cleanupSession.source.plan')} reason={view.reason} t={t} />}
      {view.kind === 'ready' && view.refreshFailed && <SessionReadFailure source={t('cleanupSession.source.plan')} reason="unreachable" t={t} />}
      {preview?.state === 'investigating' && (
        <p role="status" className="flex items-center gap-1.5 text-sm text-kumo-subtle" data-investigating><Loader size={12} />{t('cleanupSession.investigating')}</p>
      )}
      {preview?.state === 'unavailable' && <Banner variant="error" data-plan-unavailable description={t('cleanupSession.planUnavailable')} />}
      {preview?.plan != null && <PlanReview key={preview.session_id} plan={preview.plan} execution={preview.execution} t={t} />}
      <SessionRecord sessionId={sessionId} events={events} runtime={preview?.runtime ?? null} t={t} />
    </div>
  );
}
