import { useCallback, useEffect, useState } from 'react';
import { Banner, Button, Loader } from '@cloudflare/kumo';
import {
  cleanupEligible,
  type AuthorizedCleanupRequest, type CleanupAdvice, type CleanupChoice, type CleanupExecutionItem, type CleanupExecutionResult,
  type CleanupInvestigationStatus, type CleanupPlan, type CleanupPlanItem,
} from '../core/operator/worktree-cleanup-plan';
import type { WorktreeView } from '../core/operator/worktrees';
import type { OperatorApiErrorV1 } from './operator-api-error';
import { WriteReloadBanner, type OperatorWriteFailure } from './operator-write';
import { isOperatorMessageKey, type OperatorTranslate } from './i18n';
import { StatusDot, type DotTone } from './ui';
import { selectionDigest } from './worktrees';

export const JUDGMENT_TONE: Readonly<Record<WorktreeView['judgment'], DotTone>> = { green: 'ok', yellow: 'warn', red: 'danger' };

/** Copy for a refusal is keyed by its code; a code this bundle does not know shows the server's sentence, marked as such. */
export function refusalText(error: OperatorApiErrorV1, t: OperatorTranslate): { readonly message: string; readonly next_action: string; readonly localized: boolean } {
  const message = `worktrees.error.${error.code}.message`;
  const action = `worktrees.error.${error.code}.action`;
  return isOperatorMessageKey(message) && isOperatorMessageKey(action)
    ? { message: t(message), next_action: t(action), localized: true }
    : { message: error.message, next_action: error.next_action, localized: false };
}

export type CleanupPlanAnswer = { readonly state: 'ready'; readonly plan: CleanupPlan } | OperatorWriteFailure;
export type CleanupExecutionAnswer = { readonly state: 'done'; readonly result: CleanupExecutionResult } | OperatorWriteFailure;
export type CleanupInvestigationAnswer = { readonly state: 'investigation'; readonly status: CleanupInvestigationStatus } | OperatorWriteFailure;
export type AuthorizedCleanupPost = AuthorizedCleanupRequest & { readonly request_id: string };

/** The plan routes connect these (`cleanupPlanPorts`); each answer passed the core decoder. */
export interface CleanupPlanPorts {
  /** Pass 1: the server observes these non-green worktrees; every item is `keep`. */
  readonly open: (ids: readonly string[]) => Promise<CleanupPlanAnswer>;
  /** Pass 2: a new plan from the same observations with the user's choices. */
  readonly choose: (sessionId: string, choices: readonly CleanupChoice[]) => Promise<CleanupPlanAnswer>;
  readonly execute: (request: AuthorizedCleanupPost) => Promise<CleanupExecutionAnswer>;
  /** Starts the agent investigation of the session plan; the answer is the running job. */
  readonly investigate: (sessionId: string) => Promise<CleanupInvestigationAnswer>;
  /** The latest investigation of the session; after a job that succeeded it carries the new plan version. */
  readonly investigation: (sessionId: string) => Promise<CleanupInvestigationAnswer>;
}

/** How often the page reads the status of a running investigation. */
export const CLEANUP_INVESTIGATION_POLL_MS = 2_000;

type Destination = 'git' | 'private';
/** The user's edit of one item. Archive names are made only when the choice is sent. */
export interface Draft {
  readonly recommendation: CleanupAdvice['recommendation'];
  readonly destinations: Readonly<Record<string, Destination>>;
}

function draftOf(advice: CleanupAdvice): Draft {
  const destinations: Record<string, Destination> = {};
  for (const path of advice.archive.git?.paths ?? []) destinations[path] = 'git';
  for (const path of advice.archive.private?.paths ?? []) destinations[path] = 'private';
  return { recommendation: advice.recommendation, destinations };
}

const sameDraft = (left: Draft, right: Draft) => left.recommendation === right.recommendation
  && JSON.stringify(Object.entries(left.destinations).sort()) === JSON.stringify(Object.entries(right.destinations).sort());

/** The server names the loss paths an archive can take; the page infers nothing from a path. */
const archivable = (item: CleanupPlanItem): readonly string[] => item.loss?.archivable ?? [];

/** The server refuses every destination for a path that staging cannot read, and a Git destination for a path that Git storage refuses by name or size. */
const destinationsOf = (item: CleanupPlanItem, path: string): readonly ('none' | Destination)[] =>
  item.loss?.no_destination.includes(path) ? ['none'] : item.loss?.private_only.includes(path) ? ['none', 'private'] : ['none', 'git', 'private'];

const hasCommits = (item: CleanupPlanItem) => (item.loss?.commits.length ?? 0) > 0;

/** Why a draft cannot go to the server, or null. The server refuses a delete that would drop commits. */
function draftProblem(item: CleanupPlanItem, draft: Draft): 'commitsNeedArchive' | 'archiveEmpty' | null {
  if (draft.recommendation === 'delete' && hasCommits(item)) return 'commitsNeedArchive';
  if (draft.recommendation === 'archive_then_delete' && Object.keys(draft.destinations).length === 0 && !hasCommits(item)) return 'archiveEmpty';
  return null;
}

/** Lowercase directory words plus the id prefix, so two worktrees never share an archive branch. */
function archiveSlug(tree: WorktreeView): string {
  const words = tree.directory.toLowerCase().replace(/[^a-z0-9]+/gu, '-').slice(0, 71).replace(/^-+|-+$/gu, '');
  return [words, tree.id.slice(3, 11)].filter(Boolean).join('-');
}

/** An editable item has a repository (`cleanupEligible`); private files are stored under its id. */
export function choiceOf(item: CleanupPlanItem, draft: Draft, day: string): CleanupChoice {
  const id = item.worktree.id;
  if (draft.recommendation !== 'archive_then_delete') return { id, recommendation: draft.recommendation, archive: { git: null, private: null } };
  const pick = (destination: Destination) => archivable(item).filter(path => draft.destinations[path] === destination);
  const git = pick('git'), local = pick('private'), slug = archiveSlug(item.worktree);
  return { id, recommendation: 'archive_then_delete', archive: {
    git: git.length > 0 || hasCommits(item) ? { directory: `docs/archive/${day}-${slug}`, branch: `docs/archive-${slug}`, paths: git, include_commits: hasCommits(item) } : null,
    private: local.length > 0 ? { directory: item.worktree.repository_id!, paths: local } : null,
  } };
}

const editable = (item: CleanupPlanItem) => item.worktree.judgment !== 'green' && cleanupEligible(item);

function LossLists({ item, t }: { readonly item: CleanupPlanItem; readonly t: OperatorTranslate }) {
  const loss = item.loss;
  if (loss === null) return <p className="text-xs text-kumo-warning" data-plan-loss="unknown">{t('worktrees.plan.lossUnknown')}</p>;
  const lists = [
    ['files', loss.files], ['ignored', loss.ignored], ['commits', loss.commits.map(oid => oid.slice(0, 12))],
  ] as const;
  const shown = lists.filter(([, entries]) => entries.length > 0);
  if (shown.length === 0) return <p className="text-xs text-kumo-subtle" data-plan-loss="none">{t('worktrees.plan.loss.none')}</p>;
  return (
    <div className="flex flex-col gap-1 text-xs" data-plan-loss="known">
      {shown.map(([kind, entries]) => (
        <details key={kind} data-plan-loss-list={kind} data-count={entries.length}>
          <summary className="cursor-pointer text-kumo-default">{t(`worktrees.plan.loss.${kind}`, { count: entries.length })}</summary>
          <ul className="mt-1 flex flex-col gap-0.5 pl-4 font-mono text-kumo-subtle">{entries.map(entry => <li key={entry} className="break-all">{entry}</li>)}</ul>
        </details>
      ))}
    </div>
  );
}

/** The advice that this plan version binds, as the server wrote it. Pass 2 keeps the reason and evidence and binds the user's choice. */
function Advice({ advice, t }: { readonly advice: CleanupAdvice; readonly t: OperatorTranslate }) {
  return (
    <div className="flex flex-col gap-1 text-xs" data-plan-advice={advice.recommendation}>
      <p className="text-kumo-default">
        <span className="font-medium text-kumo-strong">{t('worktrees.plan.advice', { choice: t(`worktrees.plan.choice.${advice.recommendation}`) })}</span>
        {' '}<span data-plan-advice-reason>{advice.reason}</span>
      </p>
      <ul className="flex flex-col gap-0.5 pl-4 font-mono text-kumo-subtle" aria-label={t('worktrees.plan.advice.evidence')}>
        {advice.evidence.map((line, index) => <li key={index} className="break-all" data-plan-evidence>{line}</li>)}
      </ul>
    </div>
  );
}

/** A plan request has no progress of its own; the line counts the seconds since the page sent it. */
function PlanBuild({ count, t }: { readonly count: number; readonly t: OperatorTranslate }) {
  const [started] = useState(Date.now);
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1_000);
    return () => clearInterval(timer);
  }, [started]);
  return (
    <p role="status" className="flex items-center gap-1.5 text-sm text-kumo-default" data-plan-building={seconds}>
      <Loader size={12} />{t('worktrees.plan.building', { count, seconds })}
    </p>
  );
}

const CHOICES: readonly CleanupAdvice['recommendation'][] = ['keep', 'delete', 'archive_then_delete'];

function ChoiceEditor({ item, draft, locked, onChange, t }: {
  readonly item: CleanupPlanItem; readonly draft: Draft; readonly locked: boolean; readonly onChange: (draft: Draft) => void; readonly t: OperatorTranslate;
}) {
  const id = item.worktree.id;
  // A keep with commits also says why Delete is disabled.
  const note = draftProblem(item, draft) ?? (draft.recommendation === 'keep' && hasCommits(item) ? 'commitsNeedArchive' : null);
  const destination = (path: string, value: string) => {
    const destinations = { ...draft.destinations };
    if (value === 'git' || value === 'private') destinations[path] = value; else delete destinations[path];
    onChange({ ...draft, destinations });
  };
  return (
    <fieldset className="flex flex-col gap-2" data-plan-choice={draft.recommendation}>
      <legend className="sr-only">{t('worktrees.plan.choice', { directory: item.worktree.directory })}</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {CHOICES.map(choice => (
          <label key={choice} className="inline-flex cursor-pointer items-center gap-1.5 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-40">
            <input type="radio" name={`plan-choice-${id}`} value={choice} className="accent-[var(--color-kumo-brand)]" data-plan-option={choice}
              checked={draft.recommendation === choice} disabled={locked || (choice === 'delete' && hasCommits(item))}
              onChange={() => onChange({ ...draft, recommendation: choice })} />
            {t(`worktrees.plan.choice.${choice}`)}
          </label>
        ))}
      </div>
      {draft.recommendation === 'archive_then_delete' && (
        <ul className="flex flex-col gap-1 text-xs">
          {archivable(item).map(path => (
            <li key={path} className="flex min-w-0 items-center gap-2" data-plan-path={path}>
              <select className="rounded border border-kumo-line bg-kumo-base px-1.5 py-0.5 text-xs text-kumo-default"
                aria-label={t('worktrees.plan.destination.label', { path })} value={draft.destinations[path] ?? 'none'} disabled={locked}
                onChange={event => destination(path, event.target.value)}>
                {destinationsOf(item, path).map(value => <option key={value} value={value}>{t(`worktrees.plan.destination.${value}`)}</option>)}
              </select>
              <code className="min-w-0 break-all font-mono text-kumo-default">{path}</code>
            </li>
          ))}
          {hasCommits(item) && <li className="text-kumo-subtle" data-plan-commits>{t('worktrees.plan.commitsToGit')}</li>}
        </ul>
      )}
      {note && <p className="text-xs text-kumo-warning" data-plan-note={note}>{t(`worktrees.plan.choice.${note}`)}</p>}
    </fieldset>
  );
}

/** What the plan binds for this item, the two digests, and the box that authorizes exactly them. */
function Authorization({ item, checked, locked, onToggle, t }: {
  readonly item: CleanupPlanItem; readonly checked: boolean; readonly locked: boolean; readonly onToggle: (on: boolean) => void; readonly t: OperatorTranslate;
}) {
  const { git, private: local } = item.advice.archive;
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-kumo-hairline bg-kumo-recessed px-3 py-2 text-xs" data-plan-authorization={item.worktree.id}>
      {git && <p data-plan-bound="git">{t('worktrees.plan.bound.git', { directory: git.directory, branch: git.branch, count: git.paths.length })}</p>}
      {local && <p data-plan-bound="private">{t('worktrees.plan.bound.private', { count: local.paths.length })}</p>}
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono">
        <dt className="text-kumo-subtle">{t('worktrees.plan.digest.plan')}</dt><dd className="break-all" data-plan-digest="plan">{item.plan_sha256}</dd>
        <dt className="text-kumo-subtle">{t('worktrees.plan.digest.loss')}</dt><dd className="break-all" data-plan-digest="loss">{item.loss_sha256}</dd>
      </dl>
      <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-kumo-strong">
        <input type="checkbox" className="size-4 accent-[var(--color-kumo-brand)]" data-plan-authorize={item.worktree.id}
          checked={checked} disabled={locked} onChange={event => onToggle(event.target.checked)} />
        {t('worktrees.plan.authorize', { choice: t(`worktrees.plan.choice.${item.advice.recommendation}`), directory: item.worktree.directory })}
      </label>
    </div>
  );
}

function PlanItem({ item, draft, authorized, locked, onDraft, onAuthorize, t }: {
  readonly item: CleanupPlanItem; readonly draft: Draft; readonly authorized: boolean; readonly locked: boolean;
  readonly onDraft: (draft: Draft) => void; readonly onAuthorize: (on: boolean) => void; readonly t: OperatorTranslate;
}) {
  const tree = item.worktree;
  const canEdit = editable(item);
  const bound = canEdit && item.advice.recommendation !== 'keep' && sameDraft(draft, draftOf(item.advice));
  const occupancy = tree.process_count === null ? t('worktrees.processesUnknown') : tree.process_count > 0 ? t('worktrees.processes', { count: tree.process_count }) : null;
  return (
    <li className="flex flex-col gap-2 border-b border-kumo-hairline px-4 py-3 last:border-b-0" data-plan-item={tree.id} data-judgment={tree.judgment}
      data-editable={canEdit}>
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-kumo-strong"><StatusDot tone={JUDGMENT_TONE[tree.judgment]} />{t(`worktrees.judgment.${tree.judgment}`)}</span>
        <code className="min-w-0 truncate font-mono text-sm text-kumo-strong" data-directory>{tree.directory}</code>
        <span className="min-w-0 truncate font-mono text-xs text-kumo-subtle">{tree.branch ?? t('worktrees.noBranch')}</span>
        {occupancy && <span className="text-xs text-kumo-warning" data-processes={tree.process_count ?? 'unknown'}>{occupancy}</span>}
      </div>
      {tree.reasons.length > 0 && (
        <ul className="flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-kumo-default">
          {tree.reasons.map(reason => <li key={reason} data-reason={reason}>{t(`worktrees.reason.${reason}`)}</li>)}
        </ul>
      )}
      <Advice advice={item.advice} t={t} />
      <LossLists item={item} t={t} />
      {tree.judgment === 'green'
        ? <p className="text-xs text-kumo-subtle" data-plan-green>{t('worktrees.plan.green')}</p>
        : canEdit
          ? <ChoiceEditor item={item} draft={draft} locked={locked} onChange={onDraft} t={t} />
          : <p className="text-xs font-medium text-kumo-danger" data-plan-locked>{t('worktrees.plan.locked')}</p>}
      {bound && <Authorization item={item} checked={authorized} locked={locked} onToggle={onAuthorize} t={t} />}
      {canEdit && !bound && item.advice.recommendation !== 'keep' && <p className="text-xs text-kumo-warning" data-plan-stale>{t('worktrees.plan.stale')}</p>}
    </li>
  );
}

const OUTCOME_TONE: Readonly<Record<CleanupExecutionItem['outcome'], DotTone>> = { removed: 'ok', skipped: 'warn', reconcile_required: 'danger' };

function ExecutionResult({ plan, result, t }: { readonly plan: CleanupPlan; readonly result: CleanupExecutionResult; readonly t: OperatorTranslate }) {
  const directory = (id: string) => plan.items.find(item => item.worktree.id === id)?.worktree.directory;
  const counts = (['removed', 'skipped', 'reconcile_required'] as const).map(outcome => [outcome, result.items.filter(item => item.outcome === outcome).length] as const)
    .filter(([, count]) => count > 0);
  return (
    <section role="status" className="flex flex-col gap-2 rounded-xl border border-kumo-line bg-kumo-base px-4 py-3" data-plan-result>
      <p className="text-sm font-medium text-kumo-strong">{counts.map(([outcome, count]) => t(`worktrees.plan.result.${outcome}`, { count })).join(' · ')}</p>
      <ul className="flex flex-col gap-1.5 text-xs">
        {result.items.map(item => (
          <li key={item.id} className="flex min-w-0 flex-col gap-0.5" data-plan-result-item={item.id} data-outcome={item.outcome} data-reason={item.reason ?? undefined}>
            <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
              <span className="inline-flex items-center gap-1.5 font-medium text-kumo-strong"><StatusDot tone={OUTCOME_TONE[item.outcome]} />{t(`worktrees.plan.outcome.${item.outcome}`)}</span>
              <code className="min-w-0 truncate font-mono text-kumo-default">{directory(item.id)}</code>
              {item.archive_pr !== null && <a className="text-kumo-link underline" href={item.archive_pr} target="_blank" rel="noreferrer" data-plan-archive-pr>{t('worktrees.plan.archivePr')}</a>}
            </span>
            {item.reason !== null && <span className="text-kumo-default" data-plan-reason-text>{t(`worktrees.plan.reason.${item.reason}`)}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function FailureBanner({ failure, during, onRetry, t }: {
  readonly failure: OperatorWriteFailure; readonly during: 'plan' | 'execute'; readonly onRetry: (() => void) | null; readonly t: OperatorTranslate;
}) {
  if (failure.state === 'reload_required') return <WriteReloadBanner t={t} />;
  const action = onRetry && <Banner.Action variant="secondary" onClick={onRetry}>{t('worktrees.plan.retry')}</Banner.Action>;
  if (failure.state === 'refused') {
    const text = refusalText(failure.error, t);
    return (
      <Banner variant="error" data-plan-failure={failure.error.code} title={`${t('worktrees.refused.title')} · ${failure.error.code}`} action={action}
        description={<>{!text.localized && <span className="block text-xs">{t('worktrees.serverText')}</span>}
          <span className="block">{text.message}</span><span className="block">{text.next_action}</span></>} />
    );
  }
  const key = during === 'execute' ? `worktrees.${failure.state}` as const : `worktrees.plan.${failure.state}` as const;
  return <Banner variant={failure.state === 'unreachable' ? 'error' : 'alert'} data-plan-failure={failure.state} description={t(key)} action={action} />;
}

type Pending = 'open' | 'choose' | 'execute' | 'investigate' | null;

/** The start button and the job status. The agent's advice reaches the page only as a new plan version. */
function Investigation({ status, failure, pending, locked, onStart, onRetry, t }: {
  readonly status: CleanupInvestigationStatus | null; readonly failure: OperatorWriteFailure | null; readonly pending: boolean; readonly locked: boolean;
  readonly onStart: () => void; readonly onRetry: (() => void) | null; readonly t: OperatorTranslate;
}) {
  return (
    <section className="flex flex-col gap-2" data-plan-investigation={status?.state ?? 'none'}>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={onStart} disabled={locked} data-plan-investigate>
          {pending ? t('worktrees.plan.investigating') : t('worktrees.plan.investigate')}
        </Button>
        {status && (
          <p role="status" className={`text-sm ${status.state === 'failed' ? 'text-kumo-danger' : 'text-kumo-default'}`} data-plan-investigation-failure={status.failure ?? undefined}>
            {t(`worktrees.plan.investigation.${status.state}`)}
            {status.failure !== null && <> {t(`worktrees.plan.investigation.failure.${status.failure}`)}</>}
          </p>
        )}
      </div>
      {failure && <FailureBanner failure={failure} during="plan" onRetry={onRetry} t={t} />}
    </section>
  );
}

/**
 * The only place where a non-green worktree is authorized (#1277 S3). The user
 * chooses per item, the server makes a plan from the choices, and each approval
 * carries the two digests that the item shows.
 */
export function CleanupPlanReview({ ports, ids, now, onBack, t }: {
  readonly ports: CleanupPlanPorts; readonly ids: readonly string[]; readonly now: number; readonly onBack: () => void; readonly t: OperatorTranslate;
}) {
  const [plan, setPlan] = useState<CleanupPlan | null>(null);
  const [drafts, setDrafts] = useState<Readonly<Record<string, Draft>>>({});
  const [authorized, setAuthorized] = useState<ReadonlySet<string>>(() => new Set());
  const [pending, setPending] = useState<Pending>('open');
  const [failure, setFailure] = useState<{ readonly failure: OperatorWriteFailure; readonly during: 'plan' | 'execute' } | null>(null);
  const [result, setResult] = useState<CleanupExecutionResult | null>(null);
  const [investigation, setInvestigation] = useState<CleanupInvestigationStatus | null>(null);
  const [investigationFailure, setInvestigationFailure] = useState<OperatorWriteFailure | null>(null);

  const accept = useCallback((answer: CleanupPlanAnswer) => {
    setPending(null);
    if (answer.state !== 'ready') { setFailure({ failure: answer, during: 'plan' }); return; }
    setFailure(null);
    setPlan(answer.plan);
    setDrafts(Object.fromEntries(answer.plan.items.map(item => [item.worktree.id, draftOf(item.advice)])));
    setAuthorized(new Set());
  }, []);
  // A port that throws gave no typed answer, the same as a lost connection.
  const lost = (): OperatorWriteFailure => ({ state: 'unreachable' });

  const open = useCallback(() => {
    setPending('open');
    void ports.open(ids).catch(lost).then(accept);
  }, [ports, ids, accept]);
  useEffect(() => { open(); }, [open]);

  const draftOfItem = (item: CleanupPlanItem) => drafts[item.worktree.id] ?? draftOf(item.advice);
  const items = plan?.items ?? [];
  const editableItems = items.filter(editable);
  const changed = editableItems.some(item => !sameDraft(draftOfItem(item), draftOf(item.advice)));
  const invalid = editableItems.some(item => draftProblem(item, draftOfItem(item)) !== null);
  const authorizable = new Set(editableItems.filter(item => item.advice.recommendation !== 'keep' && sameDraft(draftOfItem(item), draftOf(item.advice))).map(item => item.worktree.id));
  const chosen = items.filter(item => authorized.has(item.worktree.id) && authorizable.has(item.worktree.id));
  const investigating = investigation?.state === 'running';
  const locked = pending !== null || result !== null || investigating;

  /** A job that succeeded replaces the plan, so drafts and authorizations start again from the new version. */
  const follow = useCallback((answer: CleanupInvestigationAnswer) => {
    if (answer.state !== 'investigation') { setInvestigationFailure(answer); return; }
    setInvestigationFailure(null);
    setInvestigation(answer.status);
    if (answer.status.plan !== null) accept({ state: 'ready', plan: answer.status.plan });
  }, [accept]);
  const sessionId = plan?.session_id ?? null;
  const poll = useCallback(() => {
    if (sessionId !== null) void ports.investigation(sessionId).catch(lost).then(follow);
  }, [ports, sessionId, follow]);
  useEffect(() => {
    if (!investigating) return;
    const timer = setTimeout(poll, CLEANUP_INVESTIGATION_POLL_MS);
    return () => clearTimeout(timer);
  }, [investigating, investigation, poll]);

  const investigate = () => {
    if (plan === null || locked) return;
    setPending('investigate');
    const sessionOf = plan.session_id;
    void ports.investigate(sessionOf).catch(lost).then(answer => {
      setPending(null);
      // No answer, an unreadable answer and a running refusal can each hide a job that exists: read its status first.
      // Only when that read finds no job does the start failure show.
      if (answer.state === 'investigation' || answer.state === 'reload_required' || (answer.state === 'refused' && answer.error.code !== 'investigation_running')) { follow(answer); return; }
      void ports.investigation(sessionOf).catch(lost).then(status => follow(status.state === 'investigation' ? status : answer));
    });
  };

  const choose = () => {
    if (plan === null || locked || !changed || invalid) return;
    const day = new Date(now).toISOString().slice(0, 10);
    setPending('choose');
    // The server takes one choice per plan item. An item the user cannot edit is not eligible, so the server keeps it.
    void ports.choose(plan.session_id, items.map(item => editable(item) ? choiceOf(item, draftOfItem(item), day)
      : { id: item.worktree.id, recommendation: 'keep' as const, archive: { git: null, private: null } })).catch(lost).then(accept);
  };

  const execute = () => {
    if (plan === null || locked || chosen.length === 0) return;
    const rows = [...chosen].sort((left, right) => left.worktree.id < right.worktree.id ? -1 : 1);
    setPending('execute');
    void selectionDigest(rows.map(item => item.worktree))
      .then(digest => ports.execute({
        request_id: crypto.randomUUID(), session_id: plan.session_id, ids: rows.map(item => item.worktree.id), expected_digest: digest,
        // An editable item has a loss, and the plan decoder pairs a loss with its digest.
        approvals: rows.map(item => ({ id: item.worktree.id, loss_sha256: item.loss_sha256!, plan_sha256: item.plan_sha256 })),
      }))
      .catch(lost)
      .then(answer => {
        setPending(null);
        if (answer.state === 'done') { setFailure(null); setResult(answer.result); } else setFailure({ failure: answer, during: 'execute' });
      });
  };

  const back = <Button variant="secondary" onClick={onBack} data-plan-back>{t('worktrees.plan.back')}</Button>;
  return (
    <div className="flex flex-col gap-5" data-plan-review={plan === null ? (pending === 'open' ? 'loading' : 'failed') : result === null ? 'ready' : 'done'}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-kumo-hairline pb-4">
        <h1 className="text-xl font-semibold text-kumo-strong">{t('worktrees.plan.title')}</h1>
        {back}
      </header>
      {(pending === 'open' || pending === 'choose') && <PlanBuild count={ids.length} t={t} />}
      {failure && <FailureBanner failure={failure.failure} during={failure.during} onRetry={plan === null ? open : null} t={t} />}
      {result !== null && plan !== null && <ExecutionResult plan={plan} result={result} t={t} />}
      {plan !== null && (
        <>
          {result === null && <Investigation status={investigation} failure={investigationFailure} pending={pending === 'investigate'} locked={locked}
            onStart={investigate} onRetry={investigating ? poll : null} t={t} />}
          <ul className="overflow-hidden rounded-xl border border-kumo-line bg-kumo-base">
            {items.map(item => (
              <PlanItem key={item.worktree.id} item={item} draft={draftOfItem(item)} authorized={authorized.has(item.worktree.id)} locked={locked} t={t}
                onDraft={draft => setDrafts(current => ({ ...current, [item.worktree.id]: draft }))}
                onAuthorize={on => setAuthorized(current => {
                  const next = new Set(current);
                  if (on) next.add(item.worktree.id); else next.delete(item.worktree.id);
                  return next;
                })} />
            ))}
          </ul>
          {result === null && (
            <div className="flex flex-wrap items-center justify-end gap-3">
              <Button variant="secondary" onClick={choose} disabled={locked || !changed || invalid} data-plan-choose>
                {pending === 'choose' ? t('worktrees.plan.choosing') : t('worktrees.plan.choose')}
              </Button>
              <Button variant="primary" onClick={execute} disabled={locked || chosen.length === 0} data-plan-execute={chosen.length}>
                {pending === 'execute' ? t('worktrees.plan.executing', { count: chosen.length }) : t('worktrees.plan.execute', { count: chosen.length })}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
