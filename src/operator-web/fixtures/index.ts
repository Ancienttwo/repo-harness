// Development-only fixture wiring for `?fixture=<name>`. Every reader is
// injected so the dev server needs no running operator service. Fixtures go
// through the same decoder the browser applies to served snapshots.
import { decodeDevActivitySnapshot } from '../../core/dev-activity/decode';
import type { DevActivitySnapshotV2 } from '../../core/dev-activity/types';
import type { OperatorFleetSnapshotV1 } from '../../core/operator/fleet-snapshot';
import type { NotifyStatusV1 } from '../../core/operator/notify-status';
import { NOTIFY_PLUGIN_ID } from '../../core/operator/notify-status';
import { unavailableRuntimeOverlay, type RuntimeOverlay } from '../../core/operator/runtime-status';
import type { OperatorAppProps } from '../App';
import {
  repositorySnapshot,
  degradedSnapshot,
  emptySnapshot,
  stableSnapshot,
  taskActivityFixture,
  admittedTaskContextFixture,
} from '../fixture';
import { decodeSetupSnapshot } from '../../core/setup/decode';
import { decodeWorktrees } from '../../core/operator/worktrees';
import { decodeBotAccessSnapshot } from '../../core/operator/bot-access';
import type { BotAccessRead } from '../bots';
import { busyBotAccess, degradedBotAccess } from './bots';
import type { CiRepairsRead, ExecutionRead } from '../repository-reads';
import { busyDevActivity, busyExecution, busyRuntimeOverlay, degradedDevActivity, emptyDevActivity, emptyExecution, HARNESS_ID } from './dev-activity';
import { degradedSetup, loadingSetup, readySetup } from './setup';
import { busyWorktrees, degradedWorktrees, emptyWorktrees } from './worktrees';
import { agentsSettingsStore } from './settings';
import { decodeArchitectureMap } from '../../core/operator/architecture-map';
import type { ArchitectureMapRead } from '../ArchitectureMap';
// A recorded `operator serve` map of this repository: the model, git line counts and archctx import counts.
import architectureMap from './architecture-map.json';

export const FIXTURE_NAMES = ['busy', 'empty', 'degraded'] as const;
export type FixtureName = typeof FIXTURE_NAMES[number];

/** The Fleet fixtures name their repository `repo-harness`; the board fixtures use a registry id. */
function retarget<T>(value: T): T {
  const text = JSON.stringify(value).replaceAll('"repo-harness"', `"${HARNESS_ID}"`);
  const result = JSON.parse(text) as T;
  return result;
}

function fleet(snapshot: OperatorFleetSnapshotV1): OperatorFleetSnapshotV1 {
  const moved = retarget(snapshot);
  return { ...moved, repositories: moved.repositories.map(row => row.repository_id === HARNESS_ID ? { ...row, display_name: 'repo-harness' } : row) };
}

function notify(now: number, healthy: boolean): NotifyStatusV1 {
  return {
    protocol: 1, kind: 'operator_notify_status', plugin_id: NOTIFY_PLUGIN_ID,
    linked: healthy ? 'linked' : 'missing', enabled: healthy ? 'enabled' : 'missing',
    config: { WEBHOOK_URL: healthy ? 'configured' : 'missing', WEBHOOK_KEY: healthy ? 'configured' : 'missing', SLACK_WEBHOOK_URL: 'missing' },
    last_delivery: healthy ? { at: new Date(now - 40 * 60_000).toISOString(), result: 'succeeded' } : { at: null, result: 'missing' },
    observed_at: new Date(now - 30_000).toISOString(),
  };
}

const unavailable = (what: string) => () => Promise.reject(new Error(`fixture ${what} unavailable`));

export function fixtureProps(name: string): OperatorAppProps {
  if (!(FIXTURE_NAMES as readonly string[]).includes(name)) throw new Error(`unknown operator fixture "${name}"; use one of ${FIXTURE_NAMES.join(', ')}`);
  const now = Date.now();
  const fixture = name as FixtureName;
  const activity: DevActivitySnapshotV2 = decodeDevActivitySnapshot(
    fixture === 'busy' ? busyDevActivity(now) : fixture === 'empty' ? emptyDevActivity(now) : degradedDevActivity(now));
  const runtime: RuntimeOverlay = fixture === 'busy' ? busyRuntimeOverlay(now) : unavailableRuntimeOverlay();
  const snapshot = fleet(fixture === 'busy' ? stableSnapshot : fixture === 'empty' ? emptySnapshot : degradedSnapshot);
  const notifyStatus = notify(now, fixture !== 'degraded');
  // busy: a ready setup check; empty: the first run has not finished; degraded: a timed-out run over drifted data.
  const setup = decodeSetupSnapshot(fixture === 'busy' ? readySetup(now) : fixture === 'empty' ? loadingSetup() : degradedSetup(now));
  // busy: every judgment; empty: the first collection has not finished; degraded: one repository unreadable, sizes unknown.
  const worktrees = decodeWorktrees(fixture === 'busy' ? busyWorktrees(now) : fixture === 'empty' ? emptyWorktrees() : degradedWorktrees(now));
  // busy: one open CI repair issue in repo-harness and no daily run elsewhere; degraded: the daily run uploaded nothing.
  const repairs = (repositoryId: string): CiRepairsRead => fixture === 'degraded' ? { state: 'unavailable', reason: 'artifacts_missing' }
    : repositoryId !== HARNESS_ID ? { state: 'unavailable', reason: 'no_daily_run' }
      : { state: 'ok', issues: fixture === 'busy' ? [{ number: 1101, title: '[CI repair] daily full run failed', url: 'https://github.com/Ancienttwo/repo-harness/issues/1101' }] : [] };
  // degraded: the task session records could not be read.
  const execution = (repositoryId: string): ExecutionRead => fixture === 'busy' ? busyExecution(repositoryId, now)
    : fixture === 'empty' ? emptyExecution(repositoryId, now) : { state: 'unavailable', reason: 'execution_state_unavailable' };
  // degraded: the model is served with no line or import counts and no layer data; empty: the first collection has not finished.
  const noCodeFacts = { state: 'unavailable', reason: 'code_facts_unavailable' } as const;
  const map = (repositoryId: string): ArchitectureMapRead => fixture === 'empty' || repositoryId !== HARNESS_ID ? { state: 'unavailable', reason: 'architecture_map_pending' }
    : { state: 'ok', map: decodeArchitectureMap(fixture === 'busy' ? architectureMap : {
      ...architectureMap,
      sizes: { state: 'unavailable', reason: 'model_worktree_dirty' },
      dependencies: noCodeFacts,
      layers: {
        ...architectureMap.layers,
        changes: { state: 'unavailable', reason: 'model_worktree_dirty' },
        violations: { ...architectureMap.layers.violations, debt: noCodeFacts, anchors: noCodeFacts, dependencies: noCodeFacts },
        pull_requests: { state: 'unavailable', reason: 'dev_activity_unavailable' },
        tests: { state: 'unavailable', reason: 'github_unavailable' },
      },
    }) };
  // empty: the first Bot access collection has not finished.
  const botAccess: BotAccessRead = fixture === 'empty' ? { state: 'unavailable', reason: 'bot_access_pending' }
    : { state: 'ok', snapshot: decodeBotAccessSnapshot(fixture === 'busy' ? busyBotAccess(now) : degradedBotAccess(now)) };
  // busy: saves apply in the page; degraded: a timed-out probe, a runtime that left the list, and saves that end in reconcile_required.
  const agentsSettings = agentsSettingsStore(now, fixture);
  return {
    fetchDevActivity: () => Promise.resolve(activity),
    initialDevActivity: activity,
    readRuntimeStatus: fixture === 'degraded' ? unavailable('runtime') : () => Promise.resolve(runtime),
    initialRuntimeOverlay: runtime,
    fetchSnapshot: () => Promise.resolve(snapshot),
    initialSnapshot: snapshot,
    fetchRepositorySnapshot: (repositoryId: string) => repositoryId === HARNESS_ID && fixture === 'busy'
      ? Promise.resolve(repositorySnapshot) : Promise.reject(new Error('fixture repository snapshot unavailable')),
    readTaskContext: request => Promise.resolve(admittedTaskContextFixture(request)),
    readTaskActivity: request => Promise.resolve(taskActivityFixture(request)),
    readTaskHistory: unavailable('task history'),
    readNotifyStatus: () => Promise.resolve(notifyStatus),
    initialNotifyStatus: notifyStatus,
    readSetup: () => Promise.resolve(setup),
    initialSetup: setup,
    readWorktrees: () => Promise.resolve(worktrees),
    initialWorktrees: worktrees,
    readRepositoryHead: fixture === 'degraded' ? unavailable('docs tree') : () => Promise.resolve('49f7ba6fa3c1d2e4b5a6978877665544332211aa'),
    readCiRepairs: repositoryId => Promise.resolve(repairs(repositoryId)),
    readExecution: repositoryId => Promise.resolve(execution(repositoryId)),
    readArchitectureMap: repositoryId => Promise.resolve(map(repositoryId)),
    readBotAccess: () => Promise.resolve(botAccess),
    readAgentsSettings: agentsSettings.read,
    writeAgentsSettings: agentsSettings.write,
  };
}
