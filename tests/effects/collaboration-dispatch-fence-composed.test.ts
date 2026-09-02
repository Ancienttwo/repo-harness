/**
 * Issue #278 — the composed dispatch surfaces fence exactly once.
 *
 * Moving the fence into `dispatchDelegatedRun()` is only half the change: the
 * two surfaces that already fenced — the delegation CLI and the C9 canary
 * runner — must drop their pre-step, or every collaboration dispatch would read
 * the live run and its binding twice and the "one fence" claim would be a
 * coincidence of the call order rather than a property of the effect.
 *
 * Counting is done from outside production code. Each surface runs in its own
 * `bun` process where `mock.module()` replaces
 * `src/effects/collaboration/context-delivery.ts` with a wrapper that counts and
 * then calls the real fence, which is the same worker-script shape
 * `tests/cli/registry.test.ts` uses to observe a module the parent process must
 * not have patched. Provider calls are counted from the launch-claim store,
 * because one persisted launch claim is what permits one Codex process.
 */
import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';

import { engineerPrincipalAuthorization } from '../../src/effects/collaboration/actor';
import { admitCollaborationDelegation } from '../../src/effects/collaboration/admission-bridge';
import {
  deliverCollaborationContext,
  recordCollaborationRunContextBinding,
  type CollaborationContextDeliveryV1,
} from '../../src/effects/collaboration/context-delivery';
import { publishCoordinationSignal } from '../../src/effects/collaboration/signal-store';
import { collectCollaborativeWorkExchange } from '../../src/effects/collaboration/work-exchange';
import { resolveGitCommonDirectory } from '../../src/effects/git/common-directory';
import {
  DELEGATED_RUN_STORE_RELATIVE_ROOT,
  readDelegatedRunStatus,
} from '../../src/effects/engineers/delegated-run-store';
import {
  createCollaborationDelegationFixture,
  delegationParticipant,
  liveParentFor,
  setWorkerStdout,
  type CollaborationDelegationFixture as Fixture,
} from '../helpers/collaboration-delegation-fixture';
import { removeFixtureRoots } from '../helpers/collaboration-store-fixture';

const sourceRoot = process.cwd();
const roots: string[] = [];
const CAPABILITY_REF = {
  kind: 'capability',
  capability_id: 'capability.runtime-harness.collaboration',
  capability_revision: `sha256:${'7'.repeat(64)}`,
} as const;
const BASE_GOAL = 'Explain why the fourth writer never observes the published token.';
const OBSERVED_AT = '2026-08-30T00:00:05.000Z';
const FENCE_MODULE = resolve(import.meta.dir, '../../src/effects/collaboration/context-delivery.ts');
const DELEGATION_MODULE = resolve(import.meta.dir, '../../src/cli/commands/delegation.ts');
const C9_RUNNER_MODULE = resolve(import.meta.dir, '../../scripts/c9-collaboration-dispatch-runner.ts');

afterEach(() => removeFixtureRoots(roots));

interface Observation {
  readonly fence_calls: number;
  readonly failure: string;
  readonly exit_code: number;
}

function fixture(): Fixture {
  const value = createCollaborationDelegationFixture(sourceRoot, roots, 'shadow');
  setWorkerStdout(value.repoRoot, 'worker prose\n');
  return value;
}

function publishSignal(value: Fixture, key: string, threadKey: string): string {
  return publishCoordinationSignal({
    repo_root: value.repoRoot,
    authorization: engineerPrincipalAuthorization(value.actors[0]!.authorization_id),
    destination: { kind: 'public' },
    idempotency_key: key,
    thread_key: threadKey,
    reply_to_signal_id: null,
    scope_refs: [CAPABILITY_REF],
    labels: ['NEED-REPRO'],
    title: `observation ${key}`,
    body: `body for ${key}`,
    artifact_refs: [],
    source_signal_ids: [],
    supersedes_signal_id: null,
    recorded_time: { kind: 'persisted_observation', observed_at: '2026-08-30T09:00:00.000Z' },
    env: value.env,
  }).signal.signal_id;
}

function deliver(value: Fixture): CollaborationContextDeliveryV1 {
  return deliverCollaborationContext({
    repo_root: value.repoRoot,
    collection: collectCollaborativeWorkExchange({
      repo_root: value.repoRoot,
      read_execution_offers: () => [],
    }),
    subject_refs: [CAPABILITY_REF],
    base_goal: BASE_GOAL,
  });
}

function admit(value: Fixture, index: number, goal: string): string {
  const participant = delegationParticipant(value, index, goal);
  const result = admitCollaborationDelegation({
    repo_root: value.repoRoot,
    round_index: 0,
    decided_at: '2026-08-30T00:00:02.000Z',
    idempotency_key: participant.idempotency_key,
    observed_at: '2026-08-30T00:00:03.000Z',
    delegation: {
      repo_root: value.repoRoot,
      envelope: participant.envelope,
      role_profile: value.role_profile,
      capability: value.capability,
      execution_packet: participant.packet,
      work_envelope: {} as never,
      claim_actor_receipt: value.claim_actor_receipt,
      decided_at: '2026-08-30T00:00:02.000Z',
      validate_parent: liveParentFor(value),
    },
  });
  if (result.run === null) {
    throw new Error(`fixture seat was refused: ${result.admission.rejection_reason ?? 'unknown'}`);
  }
  return result.run.intent.dispatch_id;
}

function hostActionsPermitted(repoRoot: string): number {
  const directory = join(
    resolveGitCommonDirectory(repoRoot),
    ...DELEGATED_RUN_STORE_RELATIVE_ROOT.split('/'),
    'launch-claims',
  );
  return existsSync(directory)
    ? readdirSync(directory).filter((entry) => entry.endsWith('.json')).length
    : 0;
}

/**
 * The counting shim, shared by both surfaces.
 *
 * The real fence is captured *before* the mock is installed, because
 * `mock.module()` updates the live bindings of modules that already imported it
 * — including the namespace object this script holds — and a wrapper that read
 * the fence back through that namespace would call itself forever.
 */
const COUNTING_PRELUDE = `
  import { mock } from 'bun:test';
  import { writeFileSync } from 'fs';
  const fenceModule = process.env.FENCE_MODULE;
  const fenceExports = await import(fenceModule);
  const realFence = fenceExports.fenceCollaborationDispatch;
  let fenceCalls = 0;
  mock.module(fenceModule, () => ({
    ...fenceExports,
    fenceCollaborationDispatch(input) {
      fenceCalls += 1;
      return realFence(input);
    },
  }));
`;

async function runWorker(
  value: Fixture,
  script: string,
  env: Readonly<Record<string, string>>,
): Promise<{ readonly observation: Observation; readonly stderr: string }> {
  const observationPath = join(value.repoRoot, `.fence-observation-${Object.keys(env).length}.json`);
  const worker = Bun.spawn(['bun', '-e', script], {
    cwd: value.repoRoot,
    env: {
      ...process.env,
      REPO_HARNESS_HOME: value.home,
      PATH: `${value.fake_bin}:${process.env.PATH ?? ''}`,
      FENCE_MODULE,
      OBSERVATION_PATH: observationPath,
      ...env,
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [, stderr] = await Promise.all([
    worker.exited,
    new Response(worker.stderr).text(),
  ]);
  if (!existsSync(observationPath)) throw new Error(`worker wrote no observation: ${stderr}`);
  return {
    observation: JSON.parse(readFileSync(observationPath, 'utf8')) as Observation,
    stderr,
  };
}

/** Drive `repo-harness delegation dispatch` in-process inside the worker. */
function cliWorkerScript(): string {
  return `${COUNTING_PRELUDE}
  const { buildDelegationCommand } = await import(process.env.DELEGATION_MODULE);
  let failure = '';
  try {
    await buildDelegationCommand().parseAsync(
      ['dispatch', '--input', process.env.DISPATCH_INPUT, '--format', 'json'],
      { from: 'user' },
    );
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
  }
  writeFileSync(process.env.OBSERVATION_PATH, JSON.stringify({
    fence_calls: fenceCalls,
    failure,
    exit_code: process.exitCode ?? 0,
  }));
  process.exit(0);
  `;
}

/** Run the C9 canary's dispatch runner exactly as the canary spawns it. */
function c9WorkerScript(): string {
  return `${COUNTING_PRELUDE}
  let failure = '';
  process.on('exit', (code) => {
    writeFileSync(process.env.OBSERVATION_PATH, JSON.stringify({
      fence_calls: fenceCalls,
      failure,
      exit_code: code,
    }));
  });
  process.argv = [
    process.argv[0],
    process.env.RUNNER_MODULE,
    process.env.REPO_ROOT,
    process.env.DISPATCH_ID,
    process.env.OBSERVED_AT,
  ];
  try {
    await import(process.env.RUNNER_MODULE);
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
  }
  `;
}

function writeDispatchInput(value: Fixture, name: string, dispatchId: string): string {
  writeFileSync(join(value.repoRoot, name), `${JSON.stringify({
    dispatch_id: dispatchId,
    observed_at: OBSERVED_AT,
    protected_paths: [
      'common:.repo-harness-read-only-canary-common',
      'worktree:.repo-harness-read-only-canary-worktree',
    ],
  })}\n`);
  return name;
}

describe('the composed dispatch surfaces fence exactly once', () => {
  test('the delegation CLI dispatches a bound collaboration run through one fence', async () => {
    const value = fixture();
    publishSignal(value, 'signal-a', 'merge-gate-flake');
    const delivery = deliver(value);
    const dispatchId = admit(value, 0, delivery.composed_goal);
    recordCollaborationRunContextBinding({ repo_root: value.repoRoot, dispatch_id: dispatchId, delivery });

    const { observation, stderr } = await runWorker(value, cliWorkerScript(), {
      DELEGATION_MODULE,
      DISPATCH_INPUT: writeDispatchInput(value, '.dispatch-cli-bound.json', dispatchId),
    });

    expect(observation.failure, stderr).toBe('');
    expect(observation.exit_code).toBe(0);
    expect(observation.fence_calls).toBe(1);
    expect(readDelegatedRunStatus(value.repoRoot, dispatchId).current.state).toBe('completed');
  }, 60_000);

  test('the delegation CLI refuses an unbound collaboration run with one fence and no provider call', async () => {
    const value = fixture();
    publishSignal(value, 'signal-a', 'merge-gate-flake');
    const delivery = deliver(value);
    const dispatchId = admit(value, 0, delivery.composed_goal);

    const { observation, stderr } = await runWorker(value, cliWorkerScript(), {
      DELEGATION_MODULE,
      DISPATCH_INPUT: writeDispatchInput(value, '.dispatch-cli-unbound.json', dispatchId),
    });

    expect(observation.fence_calls).toBe(1);
    expect(observation.exit_code).toBe(1);
    const error = JSON.parse(stderr.trim()) as { error: string; message: string };
    expect(error.error).toBe('collaboration_invalid');
    expect(error.message).toContain('binding_missing');
    expect(readDelegatedRunStatus(value.repoRoot, dispatchId).current.state).toBe('intent_persisted');
    expect(hostActionsPermitted(value.repoRoot)).toBe(0);
  }, 60_000);

  test('the C9 canary runner dispatches a bound collaboration run through one fence', async () => {
    const value = fixture();
    publishSignal(value, 'signal-a', 'merge-gate-flake');
    const delivery = deliver(value);
    const dispatchId = admit(value, 0, delivery.composed_goal);
    recordCollaborationRunContextBinding({ repo_root: value.repoRoot, dispatch_id: dispatchId, delivery });

    const { observation, stderr } = await runWorker(value, c9WorkerScript(), {
      RUNNER_MODULE: C9_RUNNER_MODULE,
      REPO_ROOT: value.repoRoot,
      DISPATCH_ID: dispatchId,
      OBSERVED_AT,
    });

    expect(observation.failure, stderr).toBe('');
    expect(observation.exit_code).toBe(0);
    expect(observation.fence_calls).toBe(1);
    expect(readDelegatedRunStatus(value.repoRoot, dispatchId).current.state).toBe('completed');
  }, 60_000);

  test('the C9 canary runner refuses an unbound collaboration run with one fence and no provider call', async () => {
    const value = fixture();
    publishSignal(value, 'signal-a', 'merge-gate-flake');
    const delivery = deliver(value);
    const dispatchId = admit(value, 0, delivery.composed_goal);

    const { observation } = await runWorker(value, c9WorkerScript(), {
      RUNNER_MODULE: C9_RUNNER_MODULE,
      REPO_ROOT: value.repoRoot,
      DISPATCH_ID: dispatchId,
      OBSERVED_AT,
    });

    expect(observation.fence_calls).toBe(1);
    expect(observation.failure).toContain('binding_missing');
    expect(readDelegatedRunStatus(value.repoRoot, dispatchId).current.state).toBe('intent_persisted');
    expect(hostActionsPermitted(value.repoRoot)).toBe(0);
  }, 60_000);

  test('no production dispatch surface carries its own fence pre-step', () => {
    // The count above is one because the effect fences, not because the two
    // surfaces happen to fence before an effect that does not. A surface that
    // reintroduces the pre-step would fence twice, and this states the rule the
    // count alone cannot: the fence has exactly one production call site.
    const surfacesCarryingAPreStep = [DELEGATION_MODULE, C9_RUNNER_MODULE]
      .filter((path) => readFileSync(path, 'utf8').includes('fenceCollaborationDispatch'));
    expect(surfacesCarryingAPreStep).toEqual([]);
  });
});
