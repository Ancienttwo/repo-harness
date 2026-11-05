import type { BoardPlanV1 } from '../core/board/board';
import { isTruncatedDevActivityReason, type DevActivitySourceHealth } from '../core/dev-activity/types';
import { HC_MIN_VERSION } from '../core/operator/herdr-pin';
import type { OfficeCard, OfficeRepositoryView } from './board-office';
import type { BoardParentsReason } from './board-view';
import type { BotAccessView } from './bots';
import type { DevActivityView } from './dev-activity';
import type { OperatorMessageKey, OperatorTranslate } from './i18n';
import type { RepositoriesView } from './repositories';
import { hcRepairCommands } from './RuntimeBadges';
import { ARGV } from './SeatsPage';
import { SKILL_UPDATE_COMMAND } from './setup';
import { CopyButton, StatusDot, type DotTone } from './ui';

/** The two reads of the App that no Board read carries. Each row names its read; no row runs a check of its own. */
export interface OfficeSetupReads {
  readonly repositories: RepositoriesView;
  readonly devActivity: DevActivityView;
  readonly botAccess: BotAccessView;
}

/** The rooms of the overview, or the one repository of a room. */
export type OfficeSetupScope =
  | { readonly kind: 'overview'; readonly rooms: readonly { readonly view: OfficeRepositoryView; readonly card: OfficeCard | null }[] }
  | {
    readonly kind: 'room'; readonly repositoryId: string; readonly parent: number | null;
    /** `empty`: the parents read answered and no seat is live. */
    readonly seats: 'empty' | BoardParentsReason;
    /** `unread`: the parents read failed, so no read reached a plan. */
    readonly plan: BoardPlanV1 | 'no_parent' | 'unread';
  };

export type OfficeSetupRowId = 'hc' | 'gh' | 'repository' | 'seats' | 'plan';
export type OfficeSetupState = 'ok' | 'partial' | 'missing' | 'failed' | 'unknown' | 'optional';

export interface OfficeSetupRow {
  readonly id: OfficeSetupRowId;
  readonly state: OfficeSetupState;
  readonly detail: string;
  /** One command; two only for an hc version mismatch, where `hcRepairCommands` is an if/else pair. */
  readonly commands: readonly string[];
}

const HC_STATUS_COMMAND = 'hc server status';
const GH_STATUS_COMMAND = 'gh auth status';
const REGISTER_COMMAND = 'repo-harness init';
const ADD_REMOTE_COMMAND = 'git remote add origin <url>';
/** `--repository-id` takes this GitHub numeric id, and the registry id of the console matches no seat label. */
const GITHUB_ID_COMMAND = 'gh api repos/{owner}/{repo} --jq .id';
const SEAT_ARGV_COMMAND = ARGV.advisor.replace('advisor', '<seat>').replace('<repository-id>', '<id>');
/** The keys are `RH_LABEL` of the terminal effects, which the browser bundle cannot import; a test compares them. */
export const SEAT_LABEL_COMMAND = 'hc label <t> repo-harness.repository=<id> repo-harness.seat=<seat>';

const FAILING: ReadonlySet<OfficeSetupState> = new Set(['missing', 'failed']);

function hcRow(view: BotAccessView, t: OperatorTranslate): OfficeSetupRow {
  const row = (state: OfficeSetupState, detail: string, commands: readonly string[]): OfficeSetupRow => ({ id: 'hc', state, detail, commands });
  if (view.kind === 'loading') return row('unknown', t('board.office.setup.pending'), [HC_STATUS_COMMAND]);
  if (view.kind === 'unavailable') return row('unknown', view.reason === 'bot_access_pending' ? t('board.office.setup.pending') : t(`bots.reason.${view.reason}`), [HC_STATUS_COMMAND]);
  const { hc } = view.snapshot;
  if (hc.state === 'unavailable') {
    const detail = t(`bots.hc.reason.${hc.reason}`);
    return hc.reason === 'hc_missing' ? row('missing', detail, [SKILL_UPDATE_COMMAND]) : row('failed', detail, [hcRepairCommands(HC_MIN_VERSION)[1]]);
  }
  const { state, expected, actual } = hc.version.value;
  const words = { version: actual.version, min: expected.min_version };
  if (state === 'mismatch') return row('failed', `${t('bots.hc.mismatch', words)} ${t('bots.hc.reason.hc_version_mismatch', words)}`, hcRepairCommands(expected.min_version));
  if (hc.terminals.state !== 'ok') return row('failed', t('bots.hc.reason.hc_terminals_failed'), [HC_STATUS_COMMAND]);
  return row('ok', t('bots.hc.aligned', words), [HC_STATUS_COMMAND]);
}

const githubSource = (repository: { readonly sources: readonly DevActivitySourceHealth[] }) => repository.sources.find(source => source.kind === 'github');

function ghRow(sources: readonly DevActivitySourceHealth[] | null, t: OperatorTranslate): OfficeSetupRow {
  const row = (state: OfficeSetupState, detail: string): OfficeSetupRow => ({ id: 'gh', state, detail, commands: [GH_STATUS_COMMAND] });
  if (sources === null) return row('unknown', t('board.office.setup.gh.unread'));
  // A truncated list is an answer of gh: it names how many rows the query dropped.
  if (sources.some(source => source.status === 'ok' || isTruncatedDevActivityReason(source.reason))) return row('ok', t('board.office.setup.gh.ok'));
  if (sources.some(source => source.reason === 'gh_not_installed')) return row('missing', t('board.office.setup.gh.missing'));
  const failure = sources.find(source => source.reason?.startsWith('gh_'));
  if (failure !== undefined) return row('failed', t('board.office.setup.gh.failed', { reason: failure.reason! }));
  return row('unknown', t(sources.some(source => source.status === 'not_configured') ? 'board.office.setup.gh.noRemote' : 'board.office.setup.gh.unread'));
}

type Remote = 'github' | 'none' | 'unknown';

/**
 * A failed gh read also leaves `github` null, so only the `not_configured`
 * source says that a repository has no GitHub remote.
 */
function repositoryRemote(devActivity: DevActivityView, id: string): Remote {
  const repository = devActivity.kind === 'ready' ? devActivity.snapshot.repositories.find(entry => entry.repository_id === id) : undefined;
  if (repository === undefined) return 'unknown';
  if (repository.github !== null) return 'github';
  return githubSource(repository)?.status === 'not_configured' ? 'none' : 'unknown';
}

function repositoryRow({ repositories, devActivity }: OfficeSetupReads, scope: OfficeSetupScope, t: OperatorTranslate): OfficeSetupRow {
  const row = (state: OfficeSetupState, detail: string, command: string): OfficeSetupRow => ({ id: 'repository', state, detail, commands: [command] });
  if (repositories.kind === 'loading') return row('unknown', t('board.office.setup.pending'), REGISTER_COMMAND);
  if (repositories.kind === 'failed') return row('failed', t('board.reason.registry_unavailable'), REGISTER_COMMAND);
  const registered = repositories.list.repositories;
  if (scope.kind === 'room') {
    if (!registered.some(entry => entry.repository_id === scope.repositoryId)) return row('missing', t('board.reason.repository_not_found'), REGISTER_COMMAND);
    const remote = repositoryRemote(devActivity, scope.repositoryId);
    if (remote === 'none') return row('missing', t('board.office.setup.repository.noRemote'), ADD_REMOTE_COMMAND);
    return row(remote === 'github' ? 'ok' : 'unknown', t(remote === 'github' ? 'board.office.setup.repository.github' : 'board.office.setup.repository.unread'), GITHUB_ID_COMMAND);
  }
  if (registered.length === 0) return row('missing', t('board.office.setup.repository.none'), REGISTER_COMMAND);
  const remotes = registered.map(entry => repositoryRemote(devActivity, entry.repository_id));
  const github = remotes.filter(remote => remote === 'github').length;
  const detail = t('board.office.setup.repository.count', { github, total: registered.length });
  if (remotes.includes('unknown')) return row('unknown', detail, GITHUB_ID_COMMAND);
  if (github === 0) return row('missing', detail, ADD_REMOTE_COMMAND);
  return row(github === registered.length ? 'ok' : 'partial', detail, GITHUB_ID_COMMAND);
}

function seatsRow(scope: OfficeSetupScope, t: OperatorTranslate): OfficeSetupRow {
  const row = (state: OfficeSetupState, detail: string): OfficeSetupRow => ({ id: 'seats', state, detail, commands: [SEAT_ARGV_COMMAND, SEAT_LABEL_COMMAND] });
  const reasonText = (reason: BoardParentsReason) => t(`board.reason.${reason}` as OperatorMessageKey);
  if (scope.kind === 'room') {
    if (scope.seats === 'empty') return row('missing', t('board.office.setup.seats.none'));
    return row(scope.seats === 'parents_hc_failed' ? 'failed' : 'unknown', reasonText(scope.seats));
  }
  const { rooms } = scope;
  const lit = rooms.filter(room => room.card?.lit === true).length;
  if (lit > 0) return row('ok', t('board.office.setup.seats.rooms', { count: lit, total: rooms.length }));
  const failed = rooms.flatMap(room => (room.view.kind === 'failed' ? [room.view.reason] : []));
  if (failed[0] !== undefined) return row(failed[0] === 'parents_hc_failed' ? 'failed' : 'unknown', reasonText(failed[0]));
  return rooms.some(room => room.card === null) ? row('unknown', t('board.office.setup.pending')) : row('missing', t('board.office.setup.seats.none'));
}

function planRow(scope: OfficeSetupScope, t: OperatorTranslate): OfficeSetupRow {
  const number = scope.kind === 'room' && scope.parent !== null ? String(scope.parent) : '<n>';
  const write = `gh issue comment ${number} --body-file <plan-file>`;
  const read = `repo-harness board --parent ${number}`;
  const row = (state: OfficeSetupState, detail: string, command: string): OfficeSetupRow => ({ id: 'plan', state, detail, commands: [command] });
  if (scope.kind === 'overview') {
    const planned = scope.rooms.filter(({ card }) => card?.summary.status === 'observed' && card.summary.summary.batch.size !== null).length;
    return planned > 0 ? row('ok', t('board.office.setup.plan.count', { count: planned }), read) : row('optional', t('board.office.setup.plan.none'), write);
  }
  const { plan } = scope;
  if (plan === 'no_parent') return row('optional', t('board.office.setup.plan.none'), write);
  if (plan === 'unread') return row('unknown', t('board.office.setup.plan.unread'), read);
  if (plan.status === 'observed') return row('ok', t('board.office.setup.plan.observed', { parent: number }), read);
  if (plan.status === 'unavailable') return row('unknown', t('board.office.setup.plan.unavailable', { reason: plan.reason }), read);
  return plan.truncated ? row('unknown', t('board.office.setup.plan.truncated'), read) : row('optional', t('board.office.setup.plan.absent', { parent: number }), write);
}

function aged(row: OfficeSetupRow, refreshFailed: boolean, t: OperatorTranslate): OfficeSetupRow {
  return refreshFailed ? { ...row, detail: `${row.detail} ${t('board.office.setup.stale')}` } : row;
}

/** The five rows, in dependency order. A read that has no answer gives an unknown row, never a guessed state. */
export function officeSetupRows(reads: OfficeSetupReads, scope: OfficeSetupScope, t: OperatorTranslate): readonly OfficeSetupRow[] {
  const { botAccess, devActivity } = reads;
  const ids = scope.kind === 'room' ? [scope.repositoryId] : null;
  const repositories = devActivity.kind === 'ready' ? devActivity.snapshot.repositories.filter(entry => ids === null || ids.includes(entry.repository_id)) : [];
  const sources = repositories.flatMap(entry => githubSource(entry) ?? []);
  return [
    aged(hcRow(botAccess, t), botAccess.kind === 'ready' && botAccess.refreshFailed, t),
    aged(ghRow(sources.length === 0 ? null : sources, t), devActivity.kind === 'ready' && devActivity.refreshFailed, t),
    repositoryRow(reads, scope, t),
    seatsRow(scope, t),
    planRow(scope, t),
  ];
}

/** Rows 1 and 2 hold every repository: the overview shows the checklist when one of them fails. */
export const officeToolingFails = (rows: readonly OfficeSetupRow[]): boolean =>
  rows.some(row => (row.id === 'hc' || row.id === 'gh') && FAILING.has(row.state));

const STATE_TONE: Readonly<Record<OfficeSetupState, DotTone>> = { ok: 'ok', partial: 'warn', missing: 'warn', failed: 'danger', unknown: 'unknown', optional: 'neutral' };

/** The setup guide of the Office. It copies commands and runs none. */
export function OfficeSetupChecklist({ rows, t }: { readonly rows: readonly OfficeSetupRow[]; readonly t: OperatorTranslate }) {
  return (
    <section className="board-office__panel board-office__setup" aria-labelledby="board-office-setup" data-office-setup>
      <div>
        <h2 id="board-office-setup">{t('board.office.setup.title')}</h2>
        <p>{t('board.office.setup.body')}</p>
      </div>
      <ol>
        {rows.map(row => (
          <li key={row.id} data-setup-row={row.id} data-setup-state={row.state}>
            <div className="board-office__setup-text">
              <strong>{t(`board.office.setup.row.${row.id}`)}</strong>
              <span className="board-office__setup-state"><StatusDot tone={STATE_TONE[row.state]} />{t(`board.office.setup.state.${row.state}`)}</span>
              <p>{row.detail}</p>
            </div>
            <div className="board-office__setup-commands">
              {row.commands.map(command => (
                <div key={command} className="board-office__command" data-command>
                  <span aria-hidden="true">$</span>
                  <code>{command}</code>
                  <CopyButton label={t('copy.commandLabel')} value={command} t={t} className="board-office__copy" />
                </div>
              ))}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
