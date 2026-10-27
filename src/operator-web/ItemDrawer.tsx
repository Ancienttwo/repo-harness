import { useRef, type ReactNode } from 'react';
import { Badge, cn } from '@cloudflare/kumo';
import { XIcon } from '@phosphor-icons/react';
import type { DevActivityItem, DevActivitySnapshotV2 } from '../core/dev-activity/types';
import { ageWords } from './labels';
import { repositoryLabel } from './dev-activity';
import { DrawerFrame, useModalFocus } from './Drawer';
import type { OperatorMessageKey, OperatorTranslate } from './i18n';
import { itemOwner, type ExecutionResult, type ItemOwner, type VerifiedTask } from './repository-reads';
import { Age, CommandLine, CopyButton, ExternalLink, StatusDot } from './ui';

function Section({ id, title, children }: { readonly id: string; readonly title: string; readonly children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2 border-b border-kumo-hairline py-4 last:border-b-0">
      <h3 id={id} className="text-xs font-semibold tracking-wide text-kumo-subtle uppercase">{title}</h3>
      {children}
    </section>
  );
}

function Facts({ children }: { readonly children: ReactNode }) {
  return <dl className="grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-4 gap-y-1.5 text-sm">{children}</dl>;
}

function Fact({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return <><dt className="text-kumo-subtle">{label}</dt><dd className="min-w-0 break-words text-kumo-default">{children}</dd></>;
}

/** Copyable locations and commands only: the console never writes to the session (1-TASK-N1). */
function VerifiedSession({ task, t }: { readonly task: VerifiedTask; readonly t: OperatorTranslate }) {
  const { herdr_pane: pane, resume, task_id } = task.follow_up;
  return (
    <div className="flex flex-col gap-2" data-owner="verified">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <StatusDot tone="active" />
        <span className="font-medium text-kumo-strong">{t(`setup.host.${task.agent}`)}</span>
        <span className="text-kumo-subtle">{t('drawer.followUp.verified')} · <code className="font-mono text-xs">{task.role}</code></span>
        <Badge variant="secondary">{t('drawer.followUp.readOnly')}</Badge>
      </p>
      <Facts>
        {pane && <Fact label={t('drawer.followUp.pane')}>
          <span className="flex flex-wrap items-center gap-x-2">
            <code className="break-all font-mono text-xs">{pane.pane_id}</code>
            <span className="text-xs text-kumo-subtle">{pane.session} · {pane.workspace_id}</span>
            <CopyButton label={t('drawer.followUp.pane')} value={pane.pane_id} t={t} />
          </span>
        </Fact>}
        {resume && <Fact label={t('drawer.followUp.resume')}><CommandLine command={resume.command} t={t} /></Fact>}
        <Fact label={t('drawer.followUp.handoff')}>
          <span className="flex flex-wrap items-center gap-x-2">
            <code className="break-all font-mono text-xs">{task_id}</code>
            <CopyButton label={t('drawer.followUp.taskId')} value={task_id} t={t} />
          </span>
        </Fact>
      </Facts>
    </div>
  );
}

/** G2 and G15: the agent and its follow-up come only from a verified session on this item's branch. */
function FollowUp({ owner, t }: { readonly owner: ItemOwner; readonly t: OperatorTranslate }) {
  const quiet = 'flex items-center gap-2 text-sm text-kumo-subtle';
  return (
    <Section id="drawer-follow-up" title={t('drawer.followUp')}>
      {owner.state === 'verified' ? <div className="flex flex-col gap-4">{owner.tasks.map(task => <VerifiedSession key={`${task.task}:${task.role}`} task={task} t={t} />)}</div>
        : owner.state === 'none' ? <p className={quiet} data-owner="none"><StatusDot tone="unknown" />{t('drawer.followUp.none')}</p>
          : owner.state === 'reading' ? <p className={quiet} data-owner="reading">{t('drawer.followUp.reading')}</p>
            // The collector has not finished its first pass: this is a wait, not a failure.
            : owner.reason === 'execution_state_pending' ? <p className={quiet} data-owner="pending"><StatusDot tone="unknown" />{t('execution.reason.execution_state_pending')}</p>
              : <p className="text-sm text-kumo-danger" data-owner="unavailable" data-execution-reason={owner.reason}>
                {t('drawer.followUp.unavailable', { reason: t(`execution.reason.${owner.reason}`) })}
              </p>}
    </Section>
  );
}

interface HistoryEntry { readonly at: string; readonly label: string }

/** Only dated facts the snapshot carries; nothing is reconstructed. */
function historyOf(item: DevActivityItem, t: OperatorTranslate): readonly HistoryEntry[] {
  const entries: HistoryEntry[] = [];
  const pr = item.pull_request;
  if (item.column_since) {
    entries.push({ at: item.column_since, label: pr?.state === 'open'
      ? t('drawer.history.prOpened', { number: pr.number })
      : t('drawer.history.column', { column: t(`column.${item.column}` as OperatorMessageKey) }) });
  }
  if (pr) {
    entries.push({ at: pr.updated_at, label: t('drawer.history.prUpdated', { number: pr.number }) });
    if (pr.merged_at) entries.push({ at: pr.merged_at, label: t('drawer.history.prMerged', { number: pr.number }) });
    if (pr.closed_at && !pr.merged_at) entries.push({ at: pr.closed_at, label: t('drawer.history.prClosed', { number: pr.number }) });
  }
  return entries.sort((left, right) => Date.parse(right.at) - Date.parse(left.at));
}

function ItemBody({ item, snapshot, executions, now, t }: {
  readonly item: DevActivityItem; readonly snapshot: DevActivitySnapshotV2; readonly executions: readonly ExecutionResult[] | null; readonly now: number; readonly t: OperatorTranslate;
}) {
  const pr = item.pull_request;
  const attention = snapshot.attention.filter(row => row.subject_id === item.id);
  const history = historyOf(item, t);
  return (
    <>
      {attention.length > 0 && <Section id="drawer-now" title={t('drawer.now')}>
        {attention.map(row => (
          <p key={row.kind} className="text-sm font-medium text-kumo-warning" data-attention-kind={row.kind}>
            {t(`attention.kind.${row.kind}` as OperatorMessageKey)} · {t('attention.waiting', { age: ageWords(row.waiting_since, now, t) })}
          </p>
        ))}
      </Section>}
      <FollowUp owner={itemOwner(executions, item)} t={t} />
      <Section id="drawer-delivery" title={t('drawer.delivery')}>
        <Facts>
          <Fact label={t('drawer.repository')}>{repositoryLabel(snapshot.repositories, item.repository_id)}</Fact>
          <Fact label={t('drawer.branch')}><code className="font-mono text-xs">{item.branch}</code></Fact>
          <Fact label={t('drawer.worktrees')}>
            {item.worktrees.length === 0 ? t('drawer.none') : (
              <ul className="flex flex-col gap-1">
                {item.worktrees.map(tree => (
                  <li key={tree.directory} className="flex flex-wrap items-center gap-x-2 text-xs">
                    <code className="font-mono">{tree.directory}</code>
                    {tree.dirty && <Badge variant="warning">{t('card.dirty')}</Badge>}
                    {tree.ahead !== null && tree.behind !== null
                      ? <span className="text-kumo-subtle">{t('card.ahead', { count: tree.ahead })} · {t('card.behind', { count: tree.behind })}</span>
                      : <span className="text-kumo-subtle">{t('drawer.noUpstream')}</span>}
                  </li>
                ))}
              </ul>
            )}
          </Fact>
          {pr ? <>
            <Fact label={t('drawer.pullRequest')}><ExternalLink href={pr.url}>#{pr.number} {pr.title}</ExternalLink></Fact>
            <Fact label={t('drawer.prState')}>{t(`drawer.prState.${pr.state}`)}{pr.is_draft ? ` · ${t('card.draft')}` : ''}</Fact>
            <Fact label={t('drawer.base')}><code className="font-mono text-xs">{pr.base_branch}</code></Fact>
            <Fact label={t('drawer.mergeState')}><code className="font-mono text-xs">{pr.merge_state}</code></Fact>
            {pr.ci !== null && <Fact label={t('drawer.ci')}>{t(`card.ci.${pr.ci}`)}</Fact>}
            <Fact label={t('drawer.review')}>{t(`card.review.${pr.review}`)}</Fact>
          </> : <Fact label={t('drawer.pullRequest')}>{t('drawer.noPullRequest')}</Fact>}
        </Facts>
        {item.cleanup_pending && (
          <div className="mt-1 flex flex-col gap-1.5 rounded-lg bg-kumo-recessed p-3 text-sm">
            <p>{t('drawer.cleanup', { directories: item.worktrees.map(tree => tree.directory).join(', ') })}</p>
            <CommandLine command="git worktree list" t={t} />
          </div>
        )}
      </Section>
      <Section id="drawer-history" title={t('drawer.history')}>
        {history.length === 0 ? <p className="text-sm text-kumo-subtle">{t('drawer.historyEmpty')}</p> : (
          <ol className="flex flex-col gap-1.5">
            {history.map((entry, index) => (
              <li key={`${entry.at}:${index}`} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 text-kumo-default">{entry.label}</span>
                <span className="shrink-0 text-xs text-kumo-subtle"><Age at={entry.at} now={now} t={t} bare /></span>
              </li>
            ))}
          </ol>
        )}
      </Section>
      <details className="group py-4">
        <summary className="cursor-pointer text-xs font-semibold tracking-wide text-kumo-subtle uppercase">{t('drawer.technical')}</summary>
        <dl className="mt-3 flex flex-col gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-2"><dt className="text-kumo-subtle">{t('drawer.itemId')}</dt><dd className="min-w-0 break-all font-mono">{item.id}</dd><CopyButton label={t('drawer.itemId')} value={item.id} t={t} /></div>
          <div className="flex flex-wrap items-center gap-2"><dt className="text-kumo-subtle">{t('drawer.repositoryId')}</dt><dd className="font-mono">{item.repository_id}</dd><CopyButton label={t('drawer.repositoryId')} value={item.repository_id} t={t} /></div>
          {item.worktrees.map(tree => <div key={tree.directory} className="flex flex-wrap items-center gap-2"><dt className="text-kumo-subtle">{t('drawer.head', { directory: tree.directory })}</dt><dd className="break-all font-mono">{tree.head_sha}</dd></div>)}
        </dl>
      </details>
    </>
  );
}

/** Read-only detail for one board item. Esc closes; j/k move through the visible order. */
export function ItemDrawer({ item, snapshot, executions, itemId, now, onClose, t }: {
  readonly item: DevActivityItem | null;
  readonly snapshot: DevActivitySnapshotV2;
  readonly executions: readonly ExecutionResult[] | null;
  readonly itemId: string;
  readonly now: number;
  readonly onClose: () => void;
  readonly t: OperatorTranslate;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useModalFocus({ dialogRef, closeRef, identity: itemId, onClose });
  const header = (
    <div className="flex items-start justify-between gap-3 border-b border-kumo-hairline px-5 py-4 sm:px-6">
      <div className="min-w-0">
        <p className="text-xs text-kumo-subtle">
          {item ? `${t(`column.${item.column}` as OperatorMessageKey)} · ${repositoryLabel(snapshot.repositories, item.repository_id)}` : t('drawer.eyebrow')}
        </p>
        <h2 id="item-drawer-title" className="text-lg font-semibold leading-snug text-kumo-strong">{item?.title ?? t('drawer.missing')}</h2>
        {item?.pull_request && <ExternalLink href={item.pull_request.url} className="mt-1 text-sm">{t('drawer.openPr', { number: item.pull_request.number })}</ExternalLink>}
      </div>
      <button ref={closeRef} type="button" aria-label={t('drawer.close')} onClick={onClose}
        className={cn('inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-kumo-subtle hover:bg-kumo-tint focus-visible:ring-2 focus-visible:ring-kumo-brand focus-visible:outline-none')}>
        <XIcon size={18} />
      </button>
    </div>
  );
  return (
    <DrawerFrame dialogRef={dialogRef} labelledBy="item-drawer-title" className="item-drawer max-w-[min(560px,100vw)]" closeLabel={t('drawer.close')} onClose={onClose} header={header}>
      {item ? <ItemBody item={item} snapshot={snapshot} executions={executions} now={now} t={t} /> : <p className="py-6 text-sm text-kumo-subtle">{t('drawer.missingBody')}</p>}
      <p className="pb-2 text-xs text-kumo-inactive">{t('drawer.keys')}</p>
    </DrawerFrame>
  );
}
