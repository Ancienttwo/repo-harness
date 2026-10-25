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
import { busyDevActivity, busyRuntimeOverlay, degradedDevActivity, emptyDevActivity, HARNESS_ID } from './dev-activity';
import { degradedSetup, loadingSetup, readySetup } from './setup';

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
  };
}
