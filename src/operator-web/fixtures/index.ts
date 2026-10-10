// Development-only fixture wiring for `?fixture=<name>`. Every reader is
// injected so the dev server needs no running operator service. Fixtures go
// through the same decoder the browser applies to served snapshots.
import { decodeDevActivitySnapshot } from '../../core/dev-activity/decode';
import type { DevActivitySnapshotV1 } from '../../core/dev-activity/types';
import type { OperatorFleetSnapshotV1 } from '../../core/operator/fleet-snapshot';
import type { NotifyStatusV1 } from '../../core/operator/notify-status';
import { NOTIFY_PLUGIN_ID } from '../../core/operator/notify-status';
import { unavailableRuntimeOverlay, type RuntimeOverlay } from '../../core/operator/runtime-status';
import { unavailableBoard, type PipelineBoardV2 } from '../../core/pipeline/board';
import type { OperatorAppProps } from '../App';
import {
  collaborationSnapshot,
  degradedSnapshot,
  emptySnapshot,
  repositoryObservationFixture,
  stableSnapshot,
  taskActivityFixture,
  taskContextFixture,
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

function pipeline(now: number): PipelineBoardV2 {
  const generated = new Date(now - 60_000).toISOString();
  return {
    projection_version: 'repo-harness.pipeline-board.v2', status: 'ready', generated_at: generated, last_reconciled_at: generated, epoch: 3, commit_seq: 41,
    source_observed_at: { 'max:git': generated }, coverage: { counted: 1, skipped: 0, errors: 0, registration_incomplete: 0 },
    cards: [{
      source_host: 'max', repository_id: `sha256:${'d'.repeat(64)}`, task: 'task-pipeline-observer', id: 'pl-0009', repo: 'repo-harness',
      title: 'Observe pipeline phases on the board', phase: 'cross-review', admission: 'gate_qualified', state_version: 7,
      record_updated_at: generated, phase_since: new Date(now - 7 * 3_600_000).toISOString(),
      runs: [{ role: 'implementer', round: 1, status: 'ended', result_state: 'validated' }], blocked: null,
      subject: { base_sha: '866abc31aaaa', head_sha: 'a0326d33bbbb', tree_digest: 'sha256:0123456789ab', environment: 'bun-1.3' },
      approval: null, external_fact: null,
      evidence: [{ kind: 'typecheck', source: 'verified', verdict: 'pass', current: true, count: 2 }], flags: [],
    }],
  };
}

const unavailable = (what: string) => () => Promise.reject(new Error(`fixture ${what} unavailable`));

export function fixtureProps(name: string): OperatorAppProps {
  if (!(FIXTURE_NAMES as readonly string[]).includes(name)) throw new Error(`unknown operator fixture "${name}"; use one of ${FIXTURE_NAMES.join(', ')}`);
  const now = Date.now();
  const fixture = name as FixtureName;
  const activity: DevActivitySnapshotV1 = decodeDevActivitySnapshot(
    fixture === 'busy' ? busyDevActivity(now) : fixture === 'empty' ? emptyDevActivity(now) : degradedDevActivity(now));
  const runtime: RuntimeOverlay = fixture === 'busy' ? busyRuntimeOverlay(now) : unavailableRuntimeOverlay();
  const snapshot = fleet(fixture === 'busy' ? stableSnapshot : fixture === 'empty' ? emptySnapshot : degradedSnapshot);
  const board = fixture === 'degraded' ? unavailableBoard() : pipeline(now);
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
    fetchCollaboration: (repositoryId: string) => repositoryId === HARNESS_ID && fixture === 'busy'
      ? Promise.resolve(collaborationSnapshot) : Promise.reject(new Error('fixture collaboration unavailable')),
    fetchRepositoryObservation: (repositoryId: string) => Promise.resolve({ ...retarget(repositoryObservationFixture('repo-harness')), repository_id: repositoryId }),
    readTaskContext: request => Promise.resolve(taskContextFixture(request)),
    readTaskActivity: request => Promise.resolve(taskActivityFixture(request)),
    readTaskHistory: unavailable('task history'),
    readNotifyStatus: () => Promise.resolve(notifyStatus),
    initialNotifyStatus: notifyStatus,
    readPipelineBoard: () => Promise.resolve(board),
    initialPipelineBoard: board,
    readSetup: () => Promise.resolve(setup),
    initialSetup: setup,
  };
}
