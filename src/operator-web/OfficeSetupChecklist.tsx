import type { BoardPlanV1 } from '../core/board/board';
import type { BoardSeatsV1 } from '../core/board/parents';
import { isTruncatedDevActivityReason, type DevActivitySourceHealth } from '../core/dev-activity/types';
import type { OfficeCard, OfficeRepositoryView } from './board-office';
import type { BoardParentsReason, BoardParentsView, BoardSeatsView } from './board-view';
import type { BotAccessView } from './bots';
import type { DevActivityView } from './dev-activity';
import type { OperatorMessageKey, OperatorTranslate } from './i18n';
import type { RepositoriesView } from './repositories';
import { HC_RESTART_COMMAND, hcRepairCommands } from './RuntimeBadges';
import { ARGV } from './SeatsPage';
import { SKILL_UPDATE_COMMAND } from './setup';
import { CopyButton, StatusDot, type DotTone } from './ui';

/** The three reads of the App that no Board read carries. No row runs a check of its own. */
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
    readonly parents: BoardParentsView;
    readonly seats: BoardSeatsView;
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
const REGISTER_COMMAND = 'rh init';
const OPERATOR_COMMAND = 'rh operator serve';
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
    return hc.reason === 'hc_missing' ? row('missing', detail, [SKILL_UPDATE_COMMAND]) : row('failed', detail, [HC_RESTART_COMMAND]);
  }
  const { state, expected, actual } = hc.version.value;
  const words = { version: actual.version, min: expected.min_version };
  if (state === 'mismatch') return row('failed', `${t('bots.hc.mismatch', words)} ${t('bots.hc.reason.hc_version_mismatch', words)}`, hcRepairCommands(expected.min_version));
  if (hc.terminals.state !== 'ok') return row('failed', t('bots.hc.reason.hc_terminals_failed'), [HC_STATUS_COMMAND]);
  return row('ok', t('bots.hc.aligned', words), [HC_STATUS_COMMAND]);
}

const githubSource = (repository: { readonly sources: readonly DevActivitySourceHealth[] }) => repository.sources.find(source => source.kind === 'github');

function ghRow(devActivity: DevActivityView, sources: readonly DevActivitySourceHealth[], t: OperatorTranslate): OfficeSetupRow {
  const row = (state: OfficeSetupState, detail: string): OfficeSetupRow => ({ id: 'gh', state, detail, commands: [GH_STATUS_COMMAND] });
  if (devActivity.kind === 'unreachable') return row('unknown', t('board.reason.unreachable'));
  if (sources.length === 0) return row('unknown', t('board.office.setup.gh.unread'));
  // A truncated list is an answer of gh: it names how many rows the query dropped.
  if (sources.some(source => source.status === 'ok' || isTruncatedDevActivityReason(source.reason))) return row('ok', t('board.office.setup.gh.ok'));
  if (sources.some(source => source.reason === 'gh_not_installed')) return row('missing', t('board.office.setup.gh.missing'));
  const failure = sources.find(source => source.reason?.startsWith('gh_'));
  if (failure !== undefined) return row('failed', t('board.office.setup.gh.failed', { reason: failure.reason! }));
  if (sources.every(source => source.status === 'not_configured')) return row('unknown', t('board.office.setup.gh.noRemote'));
  const unresolved = sources.find(source => source.status !== 'not_configured' && source.reason !== null);
  return row('unknown', unresolved === undefined ? t('board.office.setup.gh.unread') : t('board.office.setup.gh.unresolved', { reason: unresolved.reason! }));
}

/** `reason` is null while no read has answered. */
type Remote = { readonly kind: 'github' | 'none' } | { readonly kind: 'unknown'; readonly reason: string | null };

/**
 * A failed gh read also leaves `github` null, so only the `not_configured`
 * source says that a repository has no GitHub remote.
 */
function repositoryRemote(devActivity: DevActivityView, id: string): Remote {
  if (devActivity.kind === 'loading') return { kind: 'unknown', reason: null };
  if (devActivity.kind === 'unreachable') return { kind: 'unknown', reason: 'unreachable' };
  const repository = devActivity.snapshot.repositories.find(entry => entry.repository_id === id);
  if (repository === undefined) return { kind: 'unknown', reason: null };
  if (repository.github !== null) return { kind: 'github' };
  const source = githubSource(repository);
  return source?.status === 'not_configured' ? { kind: 'none' } : { kind: 'unknown', reason: source?.reason ?? null };
}

function repositoryRow({ repositories, devActivity }: OfficeSetupReads, scope: OfficeSetupScope, t: OperatorTranslate): OfficeSetupRow {
  const row = (state: OfficeSetupState, detail: string, command: string): OfficeSetupRow => ({ id: 'repository', state, detail, commands: [command] });
  if (repositories.kind === 'loading') return row('unknown', t('board.office.setup.pending'), OPERATOR_COMMAND);
  if (repositories.kind === 'failed') return row('unknown', t('repositories.failed.body'), OPERATOR_COMMAND);
  const notRead = t('board.office.setup.notRead');
  const registered = repositories.list.repositories;
  if (scope.kind === 'room') {
    if (!registered.some(entry => entry.repository_id === scope.repositoryId)) return row('missing', t('board.reason.repository_not_found'), REGISTER_COMMAND);
    const remote = repositoryRemote(devActivity, scope.repositoryId);
    if (remote.kind === 'none') return row('missing', t('board.office.setup.repository.noRemote'), ADD_REMOTE_COMMAND);
    if (remote.kind === 'unknown') return row('unknown', t('board.office.setup.repository.unread', { reason: remote.reason ?? notRead }), GITHUB_ID_COMMAND);
    return row('ok', t('board.office.setup.repository.github'), GITHUB_ID_COMMAND);
  }
  if (registered.length === 0) return row('missing', t('board.office.setup.repository.none'), REGISTER_COMMAND);
  const remotes = registered.map(entry => repositoryRemote(devActivity, entry.repository_id));
  const github = remotes.filter(remote => remote.kind === 'github').length;
  const unknown = remotes.flatMap(remote => (remote.kind === 'unknown' ? [remote] : []));
  if (unknown[0] !== undefined) {
    return row('unknown', t('board.office.setup.repository.unknownCount', { github, none: registered.length - github - unknown.length, unknown: unknown.length, reason: unknown[0].reason ?? notRead }), GITHUB_ID_COMMAND);
  }
  const detail = t('board.office.setup.repository.count', { github, total: registered.length });
  if (github === 0) return row('missing', detail, ADD_REMOTE_COMMAND);
  return row(github === registered.length ? 'ok' : 'partial', detail, GITHUB_ID_COMMAND);
}

/** A live terminal with a seat label that fails validation: the room is dark, but the label exists. */
const invalidSeat = (list: BoardSeatsV1) => list.seats.find(seat => seat.seat_status === 'unavailable' && seat.state === 'live');

function seatsRow(scope: OfficeSetupScope, t: OperatorTranslate): OfficeSetupRow {
  const row = (state: OfficeSetupState, detail: string): OfficeSetupRow => ({ id: 'seats', state, detail, commands: [SEAT_ARGV_COMMAND, SEAT_LABEL_COMMAND] });
  const failed = (reason: BoardParentsReason) => row(reason === 'parents_hc_failed' ? 'failed' : 'unknown', t(`board.reason.${reason}` as OperatorMessageKey));
  const invalid = (list: BoardSeatsV1) => row('failed', t('board.office.setup.seats.invalid', { address: invalidSeat(list)!.address }));
  if (scope.kind === 'room') {
    const { seats } = scope;
    if (seats.kind === 'failed') return failed(seats.reason);
    if (seats.kind === 'loading') return row('unknown', t('board.office.setup.pending'));
    return invalidSeat(seats.seats) === undefined ? row('missing', t('board.office.setup.seats.none')) : invalid(seats.seats);
  }
  const { rooms } = scope;
  if (rooms.length === 0) return row('unknown', t('board.office.setup.seats.noRepository'));
  const lit = rooms.filter(room => room.card?.lit === true).length;
  const reasons = rooms.flatMap(room => (room.view.kind === 'failed' ? [room.view.reason] : []));
  const unread = rooms.filter(room => room.card === null).length;
  if (lit > 0) {
    return row('ok', unread === 0 ? t('board.office.setup.seats.rooms', { count: lit, total: rooms.length })
      : t('board.office.setup.seats.roomsPartial', { count: lit, unknown: unread, reason: reasons[0] ?? t('board.office.setup.notRead') }));
  }
  const labelled = rooms.flatMap(room => (room.view.kind === 'ready' && invalidSeat(room.view.seats) !== undefined ? [room.view.seats] : []));
  if (labelled[0] !== undefined) return invalid(labelled[0]);
  if (reasons[0] !== undefined) return failed(reasons[0]);
  return unread > 0 ? row('unknown', t('board.office.setup.pending')) : row('missing', t('board.office.setup.seats.none'));
}

type RoomPlan = 'planned' | 'no_parent' | { readonly reason: string | null };

/** The plan fact of one overview room. A plan that is not observed can be unavailable, so it does not prove absence. */
function roomPlan({ view, card }: Extract<OfficeSetupScope, { readonly kind: 'overview' }>['rooms'][number]): RoomPlan {
  if (card === null) return { reason: view.kind === 'failed' ? view.reason : null };
  const { board, room } = card;
  if (board.status === 'no_parent') return 'no_parent';
  if (board.status === 'loading') return { reason: null };
  if (board.status === 'not_read') return { reason: 'not_read' };
  if (board.status === 'unavailable') return { reason: board.reason };
  return room.plan.status === 'none' ? { reason: 'plan_not_observed' } : 'planned';
}

function planRow(scope: OfficeSetupScope, t: OperatorTranslate): OfficeSetupRow {
  const number = scope.kind === 'room' && scope.parent !== null ? String(scope.parent) : '<n>';
  const write = `gh issue comment ${number} --body-file <plan-file>`;
  const read = `rh board --parent ${number}`;
  const row = (state: OfficeSetupState, detail: string, command: string): OfficeSetupRow => ({ id: 'plan', state, detail, commands: [command] });
  if (scope.kind === 'overview') {
    if (scope.rooms.length === 0) return row('unknown', t('board.office.setup.plan.noRepository'), read);
    const plans = scope.rooms.map(roomPlan);
    const planned = plans.filter(plan => plan === 'planned').length;
    const unknown = plans.flatMap(plan => (typeof plan === 'object' ? [plan] : []));
    if (unknown[0] !== undefined) return row('unknown', t('board.office.setup.plan.unknownCount', { count: planned, unknown: unknown.length, reason: unknown[0].reason ?? t('board.office.setup.notRead') }), read);
    return planned > 0 ? row('ok', t('board.office.setup.plan.count', { count: planned }), read) : row('optional', t('board.office.setup.plan.none'), write);
  }
  const { plan, parents } = scope;
  if (plan === 'no_parent') return row('optional', t('board.office.setup.plan.none'), write);
  if (plan === 'unread') return row('unknown', t('board.office.setup.plan.unread', { reason: parents.kind === 'failed' ? parents.reason : t('board.office.setup.notRead') }), read);
  if (plan.status === 'observed') return row('ok', t('board.office.setup.plan.observed', { parent: number }), read);
  if (plan.status === 'unavailable') return row('unknown', t('board.office.setup.plan.unavailable', { reason: plan.reason }), read);
  return plan.truncated ? row('unknown', t('board.office.setup.plan.truncated'), read) : row('optional', t('board.office.setup.plan.absent', { parent: number }), write);
}

function aged(row: OfficeSetupRow, refreshFailed: boolean, t: OperatorTranslate): OfficeSetupRow {
  return refreshFailed ? { ...row, detail: `${row.detail} ${t('board.office.setup.stale')}` } : row;
}

/** The five rows, in dependency order. A read that has no answer gives an unknown row, never a guessed state. */
export function officeSetupRows(reads: OfficeSetupReads, scope: OfficeSetupScope, t: OperatorTranslate): readonly OfficeSetupRow[] {
  const { botAccess, devActivity, repositories: registry } = reads;
  const activityOld = devActivity.kind === 'ready' && devActivity.refreshFailed;
  const ids = scope.kind === 'room' ? [scope.repositoryId] : null;
  const repositories = devActivity.kind === 'ready' ? devActivity.snapshot.repositories.filter(entry => ids === null || ids.includes(entry.repository_id)) : [];
  const sources = repositories.flatMap(entry => githubSource(entry) ?? []);
  return [
    aged(hcRow(botAccess, t), botAccess.kind === 'ready' && botAccess.refreshFailed, t),
    aged(ghRow(devActivity, sources, t), activityOld, t),
    aged(repositoryRow(reads, scope, t), activityOld || (registry.kind === 'ready' && registry.refreshFailed), t),
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
