import { useRef, type ReactNode } from 'react';
import { Badge, cn } from '@cloudflare/kumo';
import { XIcon } from '@phosphor-icons/react';
import type { BoardAttentionV1 } from '../core/board/attention';
import type { BoardItemV1, BoardPullRequestV1, BoardV1 } from '../core/board/board';
import { itemFindings, itemPullRequests, itemStage, itemTerminals, primaryPullRequest, type BoardStage } from './board-view';
import { DrawerFrame, useModalFocus } from './Drawer';
import type { OperatorMessageKey, OperatorTranslate } from './i18n';
import type { ItemOwner, VerifiedTask } from './repository-reads';
import { Age, CommandLine, CopyButton, ExternalLink, StatusDot } from './ui';
import { boardLocation, type BoardPlace, type WorkspaceLocation } from './workspace-location';

const STEPS = ['plan', 'build', 'verify', 'ready', 'shipped'] as const;
const STEP_OF_STAGE: Readonly<Record<Exclude<BoardStage, 'closed'>, number>> = { building: 1, verifying: 2, ready: 3 };
const TEST_PATH = /(^|\/)tests?\//u;

function Section({ id, title, children }: { readonly id: string; readonly title: string; readonly children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h3 id={id} className="text-xs font-medium text-kumo-subtle">{title}</h3>
      {children}
    </section>
  );
}

function Row({ children, className }: { readonly children: ReactNode; readonly className?: string }) {
  return <li className={cn('flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-kumo-hairline px-3.5 py-2.5 text-sm last:border-b-0', className)}>{children}</li>;
}

function Identifiers({ pr, t }: { readonly pr: BoardPullRequestV1; readonly t: OperatorTranslate }) {
  const rows = [
    { label: t('board.drawer.branch'), value: pr.head_ref },
    { label: t('board.drawer.head'), value: pr.head_sha.slice(0, 12) },
    { label: t('board.drawer.base'), value: pr.base_ref },
  ];
  return (
    <dl className="flex flex-col gap-1 rounded-lg border border-kumo-line px-3.5 py-2">
      {rows.map(row => (
        <div key={row.label} className="flex min-w-0 items-center gap-3">
          <dt className="w-16 shrink-0 text-xs text-kumo-subtle">{row.label}</dt>
          <dd className="min-w-0 flex-1 truncate font-mono text-xs text-kumo-strong">{row.value}</dd>
          <CopyButton label={row.label} value={row.value} t={t} />
        </div>
      ))}
    </dl>
  );
}

function ChecksAndReview({ pr, t }: { readonly pr: BoardPullRequestV1; readonly t: OperatorTranslate }) {
  const check = pr.required_check;
  const acceptance = pr.acceptance;
  const readiness = pr.merge_readiness;
  return (
    <ul className="overflow-hidden rounded-lg border border-kumo-line">
      <Row>
        <StatusDot tone={check.status === 'success' ? 'ok' : check.status === 'failure' ? 'danger' : 'unknown'} />
        <span className="min-w-0 flex-1 font-mono text-xs text-kumo-strong">Required / CI</span>
        <span className="text-xs text-kumo-subtle" data-required-check={check.status}>{t(`board.check.${check.status}` as OperatorMessageKey)}</span>
      </Row>
      <Row>
        <StatusDot tone={acceptance.status === 'accepted' ? 'ok' : 'unknown'} />
        <span className="min-w-0 flex-1 text-xs text-kumo-strong">{t('board.drawer.acceptance')}</span>
        <span className="text-xs text-kumo-subtle" data-acceptance={acceptance.status}>
          {acceptance.status === 'accepted' ? t(`board.acceptance.${acceptance.via}` as OperatorMessageKey)
            : acceptance.status === 'unknown' ? t(`board.acceptance.${acceptance.reason}` as OperatorMessageKey) : t('board.acceptance.not_accepted')}
        </span>
        {acceptance.status !== 'not_accepted' && acceptance.evidence_url !== null && <ExternalLink href={acceptance.evidence_url} className="text-xs">{t('board.drawer.evidence')}</ExternalLink>}
      </Row>
      {readiness !== null && (readiness.ready
        ? <Row><StatusDot tone="ok" /><span className="text-xs text-kumo-strong" data-merge-ready>{t('board.drawer.mergeReady')}</span></Row>
        : readiness.blockers.map(blocker => (
          <Row key={blocker.code}><StatusDot tone="warn" /><span className="text-xs text-kumo-strong" data-blocker={blocker.code}>{t(`blocker.${blocker.code}` as OperatorMessageKey)}</span></Row>
        )))}
    </ul>
  );
}

function Fact({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return <><dt className="text-kumo-subtle">{label}</dt><dd className="min-w-0 break-words text-kumo-default">{children}</dd></>;
}

/** Copyable locations and commands only: the console never writes to the session (1-TASK-N1). */
function VerifiedSession({ task, t }: { readonly task: VerifiedTask; readonly t: OperatorTranslate }) {
  const { hc_terminal: terminal, resume, task_id } = task.follow_up;
  return (
    <div className="flex flex-col gap-2" data-owner="verified">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <StatusDot tone="active" />
        <span className="font-medium text-kumo-strong">{t(`setup.host.${task.agent}`)}</span>
        <span className="text-kumo-subtle">{t('drawer.followUp.verified')} · <code className="font-mono text-xs">{task.role}</code></span>
        <Badge variant="secondary">{t('drawer.followUp.readOnly')}</Badge>
      </p>
      <dl className="grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-4 gap-y-1.5 text-sm">
        {terminal && <Fact label={t('drawer.followUp.terminal')}>
          <span className="flex flex-wrap items-center gap-x-2">
            <code className="break-all font-mono text-xs">{terminal.address}</code>
            <span className="text-xs text-kumo-subtle">{terminal.name}</span>
            <CopyButton label={t('drawer.followUp.terminal')} value={terminal.address} t={t} />
          </span>
        </Fact>}
        {terminal && <Fact label={t('drawer.followUp.openInHerdrApp')}>
          <span className="flex flex-col gap-1">
            <CommandLine command={terminal.open_command} t={t} />
            <span className="text-xs text-kumo-subtle">{t('drawer.followUp.openNote')}</span>
          </span>
        </Fact>}
        {resume && <Fact label={t('drawer.followUp.resume')}><CommandLine command={resume.command} t={t} /></Fact>}
        <Fact label={t('drawer.followUp.handoff')}>
          <span className="flex flex-wrap items-center gap-x-2">
            <code className="break-all font-mono text-xs">{task_id}</code>
            <CopyButton label={t('drawer.followUp.taskId')} value={task_id} t={t} />
          </span>
        </Fact>
      </dl>
    </div>
  );
}

/** G2 and G15: the agent and its follow-up come only from a verified session on the branch of the item's pull request. */
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

function Claim({ item, now, t }: { readonly item: BoardItemV1; readonly now: number; readonly t: OperatorTranslate }) {
  const claim = item.claim_status;
  if (claim.status_kind !== 'observed') return <p className="text-sm text-kumo-subtle" data-claim={claim.status_kind}>{t(claim.status_kind === 'none' ? 'board.drawer.claimNone' : 'board.drawer.claimUnknown')}</p>;
  return (
    <p className="flex flex-wrap items-baseline gap-x-2 text-sm" data-claim="observed">
      <span className="text-kumo-strong">{claim.status}</span>
      <span className="text-xs text-kumo-subtle"><Age at={claim.created_at} now={now} t={t} bare /></span>
      <ExternalLink href={claim.url} className="text-xs">{t('board.drawer.comment')}</ExternalLink>
    </p>
  );
}

function Detail({ board, attention, item, owner, now, t }: {
  readonly board: BoardV1; readonly attention: BoardAttentionV1; readonly item: BoardItemV1; readonly owner: ItemOwner; readonly now: number; readonly t: OperatorTranslate;
}) {
  const pr = primaryPullRequest(board, item);
  const stage = itemStage(board, item);
  const findings = itemFindings(board, attention, item);
  const terminals = itemTerminals(board, item);
  const tests = pr?.files?.filter(path => TEST_PATH.test(path)) ?? null;
  // Only a merged pull request ships; an issue closed without one stops at no step.
  const step = pr?.state === 'merged' ? 4 : stage === 'closed' ? null : STEP_OF_STAGE[stage];
  return (
    <div className="flex flex-col gap-5 py-5">
      <h2 id="task-drawer-title" className="text-lg font-semibold leading-snug text-kumo-strong">
        <a href={item.url} target="_blank" rel="noreferrer noopener" className="hover:underline">{item.title}</a>
      </h2>
      <ol aria-label={t('board.drawer.steps')} className="grid grid-cols-5 gap-1.5">
        {STEPS.map((name, index) => (
          <li key={name} className="flex flex-col gap-1.5" data-step={name} aria-current={index === step ? 'step' : undefined}>
            <span className={cn('h-1 rounded-full', step !== null && index < step ? 'bg-kumo-interact' : index === step ? 'bg-(--rh-accent)' : 'bg-kumo-hairline')} />
            <span className={cn('text-xs', index === step ? 'text-kumo-strong' : 'text-kumo-subtle')}>{t(`board.drawer.step.${name}` as OperatorMessageKey)}</span>
          </li>
        ))}
      </ol>
      {pr && <Identifiers pr={pr} t={t} />}
      {findings.length > 0 && (
        <Section id="task-findings" title={t('board.attention.title')}>
          <ul className="overflow-hidden rounded-lg border border-kumo-line">
            {findings.map((finding, index) => <Row key={`${finding.rule}:${index}`}><Badge variant="warning">{t(`board.rule.${finding.rule}` as OperatorMessageKey)}</Badge><span className="min-w-0 flex-1 text-xs">{finding.message}</span></Row>)}
          </ul>
        </Section>
      )}
      {pr && <Section id="task-checks" title={t('board.drawer.checks')}><ChecksAndReview pr={pr} t={t} /></Section>}
      {item.blocked_by.length > 0 && (
        <Section id="task-blocked" title={t('board.drawer.blockedBy')}>
          <p className="flex flex-wrap gap-2 text-sm">{item.blocked_by.map(blocker => (
            <span key={blocker.number} className={cn('font-mono text-xs', blocker.state === 'closed' ? 'text-kumo-subtle line-through' : 'text-kumo-strong')} data-blocked-by={blocker.number}>#{blocker.number}</span>
          ))}</p>
        </Section>
      )}
      {tests !== null && pr && (
        <Section id="task-tests" title={t('board.drawer.tests')}>
          {tests.length === 0 ? <p className="text-sm text-kumo-subtle">{t('board.drawer.testsNone')}</p>
            : <ul className="overflow-hidden rounded-lg border border-kumo-line">{tests.map(path => <Row key={path}><span className="min-w-0 flex-1 truncate font-mono text-xs text-kumo-strong">{path}</span></Row>)}</ul>}
        </Section>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <ExternalLink href={pr?.url ?? item.url} className="rounded-lg border border-kumo-line px-3 py-1.5 text-sm">{t('board.drawer.openGitHub')}</ExternalLink>
        {pr?.state === 'open' && pr.merge_readiness?.ready === true && <CommandLine command={`gh pr merge ${pr.url} --squash`} t={t} />}
      </div>
      <div className="flex flex-col gap-4 border-t border-kumo-hairline pt-4">
        <Section id="task-owner" title={t('board.drawer.owner')}>
          {terminals.length === 0 ? <p className="text-sm text-kumo-subtle" data-owner="none">{t('board.seat.none')}</p>
            : <ul className="flex flex-col gap-2">{terminals.map(terminal => (
              <li key={terminal.address} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-kumo-recessed px-3 py-2 text-sm" data-owner={terminal.address}>
                <span className="font-medium text-kumo-strong">{terminal.name ?? terminal.address}</span>
                <span className="text-xs text-kumo-subtle">{terminal.seat}{terminal.status !== null ? ` · ${terminal.status}` : ''}</span>
                <span className="ml-auto flex items-center gap-1 text-xs text-kumo-subtle">
                  {t('board.drawer.terminal')} <code className="font-mono">{terminal.address}</code>
                  <CopyButton label={t('board.drawer.terminal')} value={terminal.address} t={t} />
                </span>
              </li>
            ))}</ul>}
          <p className="text-xs text-kumo-subtle">{t('board.drawer.readOnly')}</p>
        </Section>
        <FollowUp owner={owner} t={t} />
        <Section id="task-claim" title={t('board.drawer.claim')}><Claim item={item} now={now} t={t} /></Section>
        {itemPullRequests(board, item).length > 1 && (
          <Section id="task-prs" title={t('board.drawer.pullRequests')}>
            <p className="flex flex-wrap gap-3 text-sm">{itemPullRequests(board, item).map(entry => <ExternalLink key={entry.number} href={entry.url}>#{entry.number}</ExternalLink>)}</p>
          </Section>
        )}
      </div>
    </div>
  );
}

/** The Task drawer of one board issue: read-only facts and copyable commands, j/k moves through the board order. */
export function TaskDrawer({ board, attention, item, owner, issue, order, place, onOpen, now, t }: {
  readonly board: BoardV1; readonly attention: BoardAttentionV1; readonly item: BoardItemV1 | null; readonly issue: number;
  /** The verified sessions on the branch of the item's pull request; `none` without a pull request. */
  readonly owner: ItemOwner;
  readonly order: readonly BoardItemV1[]; readonly place: BoardPlace;
  readonly onOpen: (next: WorkspaceLocation) => void; readonly now: number; readonly t: OperatorTranslate;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const close = () => onOpen(boardLocation({ ...place, issue: null }));
  const step = (delta: number) => {
    const index = order.findIndex(entry => entry.number === issue);
    const next = order[Math.min(order.length - 1, Math.max(0, index + delta))];
    if (next && next.number !== issue) onOpen(boardLocation({ ...place, issue: next.number }));
  };
  useModalFocus({
    dialogRef, closeRef, identity: 'board-task', onClose: close,
    onKey: (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === 'j') step(1);
      if (event.key === 'k') step(-1);
    },
  });
  const findings = item ? itemFindings(board, attention, item) : [];
  const stage = item ? itemStage(board, item) : null;
  return (
    <DrawerFrame dialogRef={dialogRef} labelledBy="task-drawer-title" closeLabel={t('drawer.close')} onClose={close} header={(
      <div className="flex min-h-14 items-center gap-2.5 border-b border-kumo-hairline px-5 sm:px-6">
        {findings[0] ? <Badge variant="warning">{t(`board.rule.${findings[0].rule}` as OperatorMessageKey)}</Badge>
          : stage !== null ? <Badge variant="secondary">{t(`board.stage.${stage}` as OperatorMessageKey)}</Badge> : null}
        <span className="font-mono text-xs text-kumo-subtle">{board.repository}#{issue}</span>
        <button ref={closeRef} type="button" aria-label={t('drawer.close')} onClick={close}
          className="ml-auto grid size-8 cursor-pointer place-items-center rounded-md text-kumo-subtle hover:bg-kumo-tint focus-visible:ring-2 focus-visible:ring-kumo-brand focus-visible:outline-none">
          <XIcon size={16} />
        </button>
      </div>
    )}>
      {item ? <Detail board={board} attention={attention} item={item} owner={owner} now={now} t={t} />
        : <div className="py-5" data-task-missing><h2 id="task-drawer-title" className="text-base font-semibold text-kumo-strong">{t('board.drawer.missing', { number: issue })}</h2>
          <p className="text-sm text-kumo-subtle">{t('board.drawer.missingBody', { parent: board.parent.number })}</p></div>}
    </DrawerFrame>
  );
}
