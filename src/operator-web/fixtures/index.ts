// Development-only fixture wiring for `?fixture=<name>`. Every reader is
// injected so the dev server needs no running operator service. Fixtures go
// through the same decoder the browser applies to served snapshots.
import { decodeDevActivitySnapshot } from '../../core/dev-activity/decode';
import type { DevActivitySnapshotV2 } from '../../core/dev-activity/types';
import { decodeOperatorRepositories, type OperatorRepositoriesV1 } from '../../core/operator/repositories';
import type { NotifyStatusV1 } from '../../core/operator/notify-status';
import { unavailableRuntimeOverlay, type RuntimeOverlay } from '../../core/operator/runtime-status';
import type { OperatorAppProps } from '../App';
import { decodeSetupSnapshot } from '../../core/setup/decode';
import { decodeWorktrees } from '../../core/operator/worktrees';
import { decodeBotAccessSnapshot } from '../../core/operator/bot-access';
import { decodeSlackReviews, slackReviewsUnavailable } from '../../core/operator/slack-review';
import type { BotAccessRead, BotReviewsRead } from '../bots';
import { busyBotAccess, busyBotReviews, degradedBotAccess, degradedBotReviews } from './bots';
import { decodeTestsSnapshot } from '../../core/operator/tests';
import { docsAnswer, type CiRepairsRead, type ExecutionRead, type TestsRead } from '../repository-reads';
import { decodeDocsFile, decodeDocsTree } from '../../core/operator/docs';
import { docsFileAnswer, docsPendingAnswer, docsTreeAnswer, type DocsWireAnswer } from './docs';
import { busyDevActivity, busyExecution, busyRuntimeOverlay, busyTaskMessages, degradedDevActivity, DOCS_ID, emptyDevActivity, emptyExecution, HARNESS_ID, SITE_ID } from './dev-activity';
import { degradedSetup, loadingSetup, readySetup } from './setup';
import { busyWorktrees, cleanupPlanFixture, degradedWorktrees, emptyWorktrees, worktreeCleanupFixture } from './worktrees';
import { readyRepairIssue, readyTests } from './tests';
import { settingsStores } from './settings';
import { officeProps } from './office';
import { busyQuota, degradedQuota } from './quota';
import type { QuotaReader } from '../quota';
import { decodeArchitectureMap } from '../../core/operator/architecture-map';
import type { ArchitectureMapRead } from '../ArchitectureMap';
// A recorded `operator serve` map of this repository: the model, git line counts and archctx import counts.
import architectureMap from './architecture-map.json';
// The board of #1474 projected from the recorded GitHub and hc reads in tests/fixtures/board.
import board1474 from './board-1474.json';
// The parent list projected from the recorded GitHub read and the same hc reads (tests/board.test.ts, parent list).
import boardParents from './board-parents.json';
import { decodeBoard } from '../../core/board/board';
import { decodeBoardParents } from '../../core/board/parents';
import { boardSummary } from '../../core/board/summary';
import type { BoardSummariesRead } from '../board-office';
import type { BoardParentsRead, BoardRead } from '../board-view';

export const FIXTURE_NAMES = ['busy', 'empty', 'degraded'] as const;
export type FixtureName = typeof FIXTURE_NAMES[number];
/** `busy` with the board reads of the S0 mockup sample state. The other pages have no separate state in it. */
export const OFFICE_FIXTURE = 'office';

const registered = (repository_id: string, display_name: string, access_mode: 'read_only' | 'read_write' = 'read_write') =>
  ({ repository_id, display_name, access_mode });

/** A registry list whose display names are the ids, for page tests that need only the repository choice. */
export function registryOf(ids: readonly string[], stale = 0): OperatorRepositoriesV1 {
  return decodeOperatorRepositories({ protocol: 1, kind: 'operator_repositories', repositories: ids.map(id => registered(id, id)), stale_registrations: stale });
}

/**
 * busy: the three Dev Activity repositories and four that Dev Activity has not
 * collected yet, so the page folds rows and says "not collected"; empty: one
 * repository; degraded: two repositories and many registrations whose root is gone.
 */
function registry(fixture: FixtureName): OperatorRepositoriesV1 {
  const harness = registered(HARNESS_ID, 'repo-harness');
  const site = registered(SITE_ID, 'operator-site');
  const repositories = fixture === 'busy' ? [harness, site, registered(DOCS_ID, 'field-notes', 'read_only'),
    registered('repo_2b3c4d5e6f708192', 'service-api'), registered('repo_3c4d5e6f70819203', 'web-app'),
    registered('repo_4d5e6f7081920314', 'infra', 'read_only'), registered('repo_5e6f708192031425', 'docs-site', 'read_only')]
    : fixture === 'empty' ? [harness] : [harness, site];
  return decodeOperatorRepositories({ protocol: 1, kind: 'operator_repositories',
    repositories: repositories.sort((left, right) => left.display_name.localeCompare(right.display_name)),
    stale_registrations: fixture === 'degraded' ? 2489 : 0 });
}

function notify(now: number, healthy: boolean): NotifyStatusV1 {
  return {
    protocol: 2, kind: 'operator_notify_status', relay: 'live',
    config: { WEBHOOK_URL: healthy ? 'configured' : 'missing', WEBHOOK_KEY: healthy ? 'configured' : 'missing', SLACK_WEBHOOK_URL: 'missing' },
    last_delivery: healthy ? { at: new Date(now - 40 * 60_000).toISOString(), result: 'succeeded' } : { at: null, result: 'missing' },
    observed_at: new Date(now - 30_000).toISOString(),
  };
}

/** A wire answer goes through the browser's own response handling and decoder. */
const answer = ({ status, body }: DocsWireAnswer) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const unavailable = (what: string) => () => Promise.reject(new Error(`fixture ${what} unavailable`));

export function fixtureProps(name: string): OperatorAppProps {
  if (name === OFFICE_FIXTURE) return officeProps(fixtureProps('busy'));
  if (!(FIXTURE_NAMES as readonly string[]).includes(name)) throw new Error(`unknown operator fixture "${name}"; use one of ${[...FIXTURE_NAMES, OFFICE_FIXTURE].join(', ')}`);
  const now = Date.now();
  const fixture = name as FixtureName;
  const activity: DevActivitySnapshotV2 = decodeDevActivitySnapshot(
    fixture === 'busy' ? busyDevActivity(now) : fixture === 'empty' ? emptyDevActivity(now) : degradedDevActivity(now));
  // degraded: the hc core is below the pin, as in the Bots fixture.
  const runtime: RuntimeOverlay = fixture === 'busy' ? busyRuntimeOverlay(now) : fixture === 'empty' ? unavailableRuntimeOverlay()
    : unavailableRuntimeOverlay(0, { code: 'hc_version_mismatch', expected: { min_version: '0.1.17' }, actual: { version: '0.1.15' } });
  const repositories = registry(fixture);
  const notifyStatus = notify(now, fixture !== 'degraded');
  // busy: a ready setup check; empty: the first run has not finished; degraded: a timed-out run over drifted data.
  const setup = decodeSetupSnapshot(fixture === 'busy' ? readySetup(now) : fixture === 'empty' ? loadingSetup() : degradedSetup(now));
  // busy: every judgment; empty: the first collection has not finished; degraded: one repository unreadable, sizes unknown.
  const worktrees = decodeWorktrees(fixture === 'busy' ? busyWorktrees(now) : fixture === 'empty' ? emptyWorktrees() : degradedWorktrees(now));
  // busy: one open CI repair issue in repo-harness and no daily run elsewhere; degraded: the daily run uploaded nothing.
  const repairs = (repositoryId: string): CiRepairsRead => fixture === 'degraded' ? { state: 'unavailable', reason: 'artifacts_missing' }
    : repositoryId !== HARNESS_ID ? { state: 'unavailable', reason: 'no_daily_run' }
      : { state: 'ok', issues: fixture === 'busy' ? [readyRepairIssue] : [] };
  // degraded: the task session records could not be read.
  const execution = (repositoryId: string): ExecutionRead => fixture === 'busy' ? busyExecution(repositoryId, now)
    : fixture === 'empty' ? emptyExecution(repositoryId, now) : { state: 'unavailable', reason: 'execution_state_unavailable' };
  // degraded: the model is served with no line or import counts and no layer data, and archctx finds no committed model
  // in the other repositories; empty: the first collection has not finished.
  const noCodeFacts = { state: 'unavailable', reason: 'code_facts_unavailable' } as const;
  // busy: one tight account; empty: the quota read failed; degraded: an unknown and an exhausted account.
  const quota: QuotaReader = () => Promise.resolve(fixture === 'empty' ? { state: 'unavailable', reason: 'unreachable' }
    : { state: 'ok', settings: fixture === 'busy' ? busyQuota(now) : degradedQuota(now) });
  const map = (repositoryId: string): ArchitectureMapRead => fixture === 'empty' ? { state: 'unavailable', reason: 'architecture_map_pending' }
    : repositoryId !== HARNESS_ID ? (fixture === 'degraded'
      ? { state: 'unavailable', reason: 'archctx_error', code: 'AC_MODEL_ADOPTION_REQUIRED', reason_code: 'native-context-model-missing' }
      : { state: 'unavailable', reason: 'architecture_map_pending' })
    : { state: 'ok', map: decodeArchitectureMap(fixture === 'busy' ? architectureMap : {
      ...architectureMap,
      sizes: { state: 'unavailable', reason: 'model_worktree_dirty' },
      dependencies: noCodeFacts,
      layers: {
        ...architectureMap.layers,
        // archctx refuses a base commit whose model fails its own schema.
        changes: { state: 'unavailable', reason: 'archctx_error', code: 'AC_SCHEMA_INVALID', reason_code: 'native-document-marker-invalid' },
        violations: { ...architectureMap.layers.violations, debt: noCodeFacts, anchors: noCodeFacts, dependencies: noCodeFacts },
        pull_requests: { state: 'unavailable', reason: 'dev_activity_unavailable' },
        tests: { state: 'unavailable', reason: 'github_unavailable' },
      },
    }) };
  // empty: the first Bot access collection has not finished.
  const botAccess: BotAccessRead = fixture === 'empty' ? { state: 'unavailable', reason: 'bot_access_pending' }
    : { state: 'ok', snapshot: decodeBotAccessSnapshot(fixture === 'busy' ? busyBotAccess(now) : degradedBotAccess(now)) };
  // busy: one thread per state; empty: the first Slack read has not finished; degraded: rate-limited, stale threads.
  const botReviews: BotReviewsRead = { state: 'ok', snapshot: decodeSlackReviews(fixture === 'busy' ? busyBotReviews(now)
    : fixture === 'empty' ? slackReviewsUnavailable('slack_pending') : degradedBotReviews(now)) };
  // busy: saves apply in the page; degraded: a timed-out probe, a runtime that left the list, and saves that end in reconcile_required.
  const { agents: agentsSettings, seats: seatsSettings } = settingsStores(now, fixture);
  // busy: the latest daily run with one failing file and one file without results; empty: no collection yet; degraded: the run uploaded nothing.
  const tests = (repositoryId: string): TestsRead => fixture === 'busy'
    ? { state: 'ok', snapshot: decodeTestsSnapshot({ ...readyTests(now), repository_id: repositoryId }) }
    : { state: 'unavailable', reason: fixture === 'empty' ? 'tests_pending' : 'artifacts_missing' };
  // busy: the recorded board of #1474 in repo-harness; empty: the board command failed; degraded: the hc seats could not be read.
  const recorded = decodeBoard(board1474);
  const board = (repositoryId: string, parent: number): BoardRead => fixture === 'empty' || repositoryId !== HARNESS_ID || parent !== recorded.parent.number
    ? { state: 'unavailable', reason: 'board_collect_failed' }
    : { state: 'ok', board: fixture === 'busy' ? recorded : { ...recorded, execution: { status: 'unavailable', reason: 'hc_unavailable' } } };
  // busy: the recorded parents of repo-harness, none elsewhere; empty: no open parent issue; degraded: hc could not list the seats.
  const recordedParents = decodeBoardParents(boardParents);
  const parents = (repositoryId: string): BoardParentsRead => fixture === 'degraded' ? { state: 'unavailable', reason: 'parents_hc_failed' }
    : { state: 'ok', list: fixture === 'busy' && repositoryId === HARNESS_ID ? recordedParents : { ...recordedParents, parents: [], seats: [] } };
  // busy: the board route has read #1474 and no other parent.
  const summaries = (repositoryId: string): BoardSummariesRead => ({ state: 'ok', summaries: {
    protocol: 1, kind: 'repo-harness.board-summaries', repository_id: repositoryId,
    parents: recordedParents.parents.map(({ number }) => (number === recorded.parent.number
      ? { parent: number, status: 'observed', observed_at: recorded.observed_at, summary: boardSummary(recorded) } : { parent: number, status: 'not_read' })),
  } });
  return {
    readBoard: subject => Promise.resolve(board(subject.repository_id, subject.parent)),
    readBoardParents: repositoryId => Promise.resolve(parents(repositoryId)),
    readBoardSummaries: repositoryId => Promise.resolve(summaries(repositoryId)),
    fetchDevActivity: () => Promise.resolve(activity),
    initialDevActivity: activity,
    readRuntimeStatus: fixture === 'degraded' ? unavailable('runtime') : () => Promise.resolve(runtime),
    initialRuntimeOverlay: runtime,
    readRepositories: () => Promise.resolve(repositories),
    initialRepositories: repositories,
    readNotifyStatus: () => Promise.resolve(notifyStatus),
    initialNotifyStatus: notifyStatus,
    readSetup: () => Promise.resolve(setup),
    initialSetup: setup,
    readWorktrees: () => Promise.resolve(worktrees),
    initialWorktrees: worktrees,
    writeWorktreeCleanup: worktreeCleanupFixture(worktrees),
    // busy: a plan with each judgment; the execution gives one removal and then each refusal reason once.
    worktreeCleanupPlan: fixture === 'busy' ? cleanupPlanFixture(now) : undefined,
    readRepositoryHead: fixture === 'degraded' ? unavailable('docs tree') : () => Promise.resolve('49f7ba6fa3c1d2e4b5a6978877665544332211aa'),
    readCiRepairs: repositoryId => Promise.resolve(repairs(repositoryId)),
    readExecution: repositoryId => Promise.resolve(execution(repositoryId)),
    // Only the busy execution view has a verified task with a 64-hex id, so only busy reads an inbox.
    readTaskMessages: request => Promise.resolve(busyTaskMessages(request, now)),
    readArchitectureMap: repositoryId => Promise.resolve(map(repositoryId)),
    readBotAccess: () => Promise.resolve(botAccess),
    readBotReviews: () => Promise.resolve(botReviews),
    readAgentsSettings: agentsSettings.read,
    writeAgentsSettings: agentsSettings.write,
    readSeatsSettings: seatsSettings.read,
    writeSeatsSettings: seatsSettings.write,
    readQuota: quota,
    readTests: repositoryId => Promise.resolve(tests(repositoryId)),
    // busy: a tree with a dirty file, a diagram and a refused symlink; empty: no collection yet; degraded: the reader is down.
    readDocsTree: repositoryId => docsAnswer(answer(fixture === 'busy' ? docsTreeAnswer(repositoryId, now) : fixture === 'empty' ? docsPendingAnswer
      : { status: 503, body: { error: { code: 'docs_reader_unavailable', message: 'The docs reader is unavailable.', next_action: 'Retry after the next collection.' } } }), decodeDocsTree),
    readDocsFile: (repositoryId, path) => docsAnswer(answer(docsFileAnswer(repositoryId, path)), decodeDocsFile),
  };
}
