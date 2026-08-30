/**
 * C7 — the bounded collaboration CLI, and C6's dispatch fence at its first
 * production call site.
 *
 * Acceptance for sprint row C7, command half. The load-bearing test is the first
 * one: `assertCollaborationDispatchBinding()` shipped in C6 with zero production
 * callers, so until this row it was machinery nothing ran. Here a collaboration
 * dispatch is refused *through `repo-harness delegation dispatch`*, an ordinary
 * delegated dispatch on the same command is unaffected, and the run's own state
 * proves the refusal happened before the Worker process rather than after it.
 */
import { afterEach, describe, expect, test } from 'bun:test';
import { spawnSync } from 'child_process';
import { writeFileSync } from 'fs';
import { join } from 'path';

import {
  COLLABORATION_CONTEXT_END,
  COLLABORATION_CONTEXT_START,
  COLLABORATION_CONTEXT_WARNING,
} from '../../src/core/collaboration/context-packet';
import { engineerPrincipalAuthorization } from '../../src/effects/collaboration/actor';
import { admitCollaborationDelegation } from '../../src/effects/collaboration/admission-bridge';
import {
  deliverCollaborationContext,
  readCollaborationRunContextBinding,
  recordCollaborationRunContextBinding,
  type CollaborationContextDeliveryV1,
} from '../../src/effects/collaboration/context-delivery';
import { publishCoordinationSignal } from '../../src/effects/collaboration/signal-store';
import { collectCollaborativeWorkExchange } from '../../src/effects/collaboration/work-exchange';
import { readDelegatedRunStatus } from '../../src/effects/engineers/delegated-run-store';
import { repoHarnessRepoIdFor } from '../../src/effects/repo-registry';
import {
  createCollaborationDelegationFixture,
  delegationParticipant,
  liveParentFor,
  setWorkerStdout,
  type CollaborationDelegationFixture as Fixture,
} from '../helpers/collaboration-delegation-fixture';
import { removeFixtureRoots } from '../helpers/collaboration-store-fixture';

const sourceRoot = process.cwd();
const cliEntry = join(sourceRoot, 'src/cli/index.ts');
const roots: string[] = [];
const CAPABILITY_REF = {
  kind: 'capability',
  capability_id: 'capability.runtime-harness.collaboration',
  capability_revision: `sha256:${'7'.repeat(64)}`,
} as const;
const BASE_GOAL = 'Explain why the fourth writer never observes the published token.';
const PROTECTED_PATHS = [
  'common:.repo-harness-read-only-canary-common',
  'worktree:.repo-harness-read-only-canary-worktree',
];

afterEach(() => removeFixtureRoots(roots));

/**
 * The C4/C6 delegation fixture plus a registry entry.
 *
 * The exchange surface asks the scheduling plane for this principal's offers, and
 * scheduling refuses a repository that is not a registered read_write target, so
 * without the entry every collaboration read would fail on a precondition that has
 * nothing to do with what these tests assert.
 */
function fixture(mode: string | null = 'shadow'): Fixture {
  const value = createCollaborationDelegationFixture(sourceRoot, roots, mode);
  setWorkerStdout(value.repoRoot, 'worker prose\n');
  writeFileSync(join(value.home, 'registered-repos.json'), `${JSON.stringify({
    version: 1,
    authorizationRevision: 1,
    repos: [{
      id: repoHarnessRepoIdFor(value.repoRoot),
      path: value.repoRoot,
      accessMode: 'read_write',
      source: 'manual',
      registeredAt: '2026-08-30T00:00:00.000Z',
      lastSeenAt: '2026-08-30T00:00:00.000Z',
    }],
  })}\n`);
  return value;
}

function cli(value: Fixture, ...args: string[]) {
  return spawnSync('bun', [cliEntry, ...args], {
    cwd: value.repoRoot,
    encoding: 'utf8',
    input: '',
    env: {
      ...process.env,
      REPO_HARNESS_HOME: value.home,
      PATH: `${value.fake_bin}:${process.env.PATH ?? ''}`,
    },
  });
}

function writeInput(value: Fixture, name: string, payload: unknown): string {
  writeFileSync(join(value.repoRoot, name), `${JSON.stringify(payload)}\n`);
  return name;
}

function failure(result: { stderr: string }): { error: string; message: string } {
  return JSON.parse(result.stderr) as { error: string; message: string };
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

/** Admit and prepare one real seat whose envelope carries `goal`. */
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

function dispatch(value: Fixture, dispatchId: string, name: string) {
  const input = writeInput(value, name, {
    dispatch_id: dispatchId,
    observed_at: '2026-08-30T00:00:05.000Z',
    protected_paths: PROTECTED_PATHS,
  });
  return cli(value, 'delegation', 'dispatch', '--input', input, '--format', 'json');
}

describe('C7 collaboration dispatch fence through the delegation CLI', () => {
  test('a collaboration-mode run with no binding is refused before the Worker process starts', () => {
    const value = fixture();
    publishSignal(value, 'signal-a', 'merge-gate-flake');
    const delivery = deliver(value);
    const dispatchId = admit(value, 0, delivery.composed_goal);
    expect(readCollaborationRunContextBinding(value.repoRoot, dispatchId)).toBeNull();

    const refused = dispatch(value, dispatchId, '.dispatch-unbound.json');

    expect(refused.status).toBe(1);
    const error = failure(refused);
    expect(error.error).toBe('collaboration_invalid');
    expect(error.message).toContain('binding_missing');
    // The refusal happened in front of `dispatchDelegatedRun()`, not after it:
    // the seat is still exactly as `prepareDelegatedRun()` left it.
    expect(readDelegatedRunStatus(value.repoRoot, dispatchId).current.state).toBe('intent_persisted');
  });

  test('the same run dispatches once its binding is recorded', () => {
    const value = fixture();
    publishSignal(value, 'signal-a', 'merge-gate-flake');
    const delivery = deliver(value);
    const dispatchId = admit(value, 0, delivery.composed_goal);
    recordCollaborationRunContextBinding({ repo_root: value.repoRoot, dispatch_id: dispatchId, delivery });

    const dispatched = dispatch(value, dispatchId, '.dispatch-bound.json');

    expect(dispatched.stderr).toBe('');
    expect(dispatched.status).toBe(0);
    expect(readDelegatedRunStatus(value.repoRoot, dispatchId).current.state).toBe('completed');
  });

  test('an ordinary delegated dispatch is untouched by the fence', () => {
    const value = fixture();
    // No collaboration context was ever delivered for this seat: its goal carries
    // no untrusted marker and no binding exists, which is every dispatch this
    // command served before C7.
    const dispatchId = admit(value, 1, BASE_GOAL);
    expect(readCollaborationRunContextBinding(value.repoRoot, dispatchId)).toBeNull();

    const dispatched = dispatch(value, dispatchId, '.dispatch-plain.json');

    expect(dispatched.stderr).toBe('');
    expect(dispatched.status).toBe(0);
    expect(readDelegatedRunStatus(value.repoRoot, dispatchId).current.state).toBe('completed');
  });
});

describe('C7 bounded collaboration CLI', () => {
  test('the command family is bounded and names no authority verb', () => {
    const value = fixture();
    const help = cli(value, 'collaboration', '--help');
    expect(help.status).toBe(0);
    for (const verb of ['exchange', 'threads', 'signals', 'post', 'handoff', 'packet']) {
      expect(help.stdout).toContain(verb);
    }
    for (const forbidden of ['acquire', 'release', 'publication', 'acceptance', 'merge', 'dispatch', 'shell', 'write']) {
      expect(help.stdout).not.toContain(forbidden);
    }
    // Every mutation is authorization-fenced, and none takes an actor.
    const postHelp = cli(value, 'collaboration', 'post', '--help');
    expect(postHelp.stdout).toContain('--authorization-id');
    expect(postHelp.stdout).not.toContain('--actor');
    expect(postHelp.stdout).not.toContain('--destination');
  });

  test('a posted signal carries the authenticated author and reads back through the exchange', () => {
    const value = fixture();
    const authorization = value.actors[0]!.authorization_id;
    const input = writeInput(value, '.signal.json', {
      idempotency_key: 'signal-cli-a',
      thread_key: 'merge-gate-flake',
      reply_to_signal_id: null,
      scope_refs: [CAPABILITY_REF],
      labels: ['NEED-REPRO'],
      title: 'observation from the CLI',
      body: 'the fourth writer never observes the published token',
      artifact_refs: [],
      source_signal_ids: [],
      supersedes_signal_id: null,
    });

    const posted = cli(value, 'collaboration', 'post', '--authorization-id', authorization, '--input', input);
    expect(posted.stderr).toBe('');
    expect(posted.status).toBe(0);
    const signal = (JSON.parse(posted.stdout) as { signal: Record<string, unknown> }).signal;
    expect(signal.actor).toMatchObject({ kind: 'module_engineer', engineer_id: value.actors[0]!.engineer_id });

    const exchange = cli(value, 'collaboration', 'exchange', '--authorization-id', authorization);
    expect(exchange.status).toBe(0);
    const view = JSON.parse(exchange.stdout) as {
      content_trust: Record<string, unknown>;
      snapshot: { relevant_signals: Array<{ signal_id: string }> };
    };
    expect(view.snapshot.relevant_signals.map((entry) => entry.signal_id)).toContain(signal.signal_id);
    expect(view.content_trust).toEqual({
      kind: 'untrusted_coordination_context',
      warning: COLLABORATION_CONTEXT_WARNING,
    });

    const signals = cli(value, 'collaboration', 'signals', '--authorization-id', authorization);
    expect(signals.status).toBe(0);
    expect((JSON.parse(signals.stdout) as { signals: Array<{ signal_id: string }> }).signals
      .map((entry) => entry.signal_id)).toContain(signal.signal_id);
  });

  test('a payload that declares its own author is refused with the field named', () => {
    const value = fixture();
    const input = writeInput(value, '.forged.json', {
      idempotency_key: 'signal-cli-b',
      thread_key: 'merge-gate-flake',
      reply_to_signal_id: null,
      scope_refs: [CAPABILITY_REF],
      labels: [],
      title: 'forged',
      body: 'forged',
      artifact_refs: [],
      source_signal_ids: [],
      supersedes_signal_id: null,
      actor: { kind: 'module_engineer', engineer_id: 'engineer:someone.else' },
    });

    const refused = cli(value, 'collaboration', 'post',
      '--authorization-id', value.actors[0]!.authorization_id, '--input', input);

    expect(refused.status).toBe(1);
    expect(failure(refused).message).toContain('unexpected: actor');
  });

  test('mutations fail closed with the flag off while reads stay answerable', () => {
    const value = fixture(null);
    const authorization = value.actors[0]!.authorization_id;
    const input = writeInput(value, '.signal-off.json', {
      idempotency_key: 'signal-cli-c',
      thread_key: 'merge-gate-flake',
      reply_to_signal_id: null,
      scope_refs: [CAPABILITY_REF],
      labels: [],
      title: 'blocked',
      body: 'blocked',
      artifact_refs: [],
      source_signal_ids: [],
      supersedes_signal_id: null,
    });

    const refused = cli(value, 'collaboration', 'post', '--authorization-id', authorization, '--input', input);
    expect(refused.status).toBe(1);
    expect(failure(refused).error).toBe('collaboration_disabled');

    const packetInput = writeInput(value, '.packet-off.json', {
      base_goal: BASE_GOAL,
      subject_refs: [CAPABILITY_REF],
      handoff: null,
      budget_estimated_tokens: null,
    });
    const packetRefused = cli(value, 'collaboration', 'packet', 'build',
      '--authorization-id', authorization, '--input', packetInput);
    expect(packetRefused.status).toBe(1);
    expect(failure(packetRefused).error).toBe('collaboration_disabled');

    const exchange = cli(value, 'collaboration', 'exchange', '--authorization-id', authorization);
    expect(exchange.status).toBe(0);
    expect((JSON.parse(exchange.stdout) as { mode: string }).mode).toBe('off');
  });

  test('packet build returns the untrusted rendering with its markers intact', () => {
    const value = fixture();
    publishSignal(value, 'signal-a', 'merge-gate-flake');
    const authorization = value.actors[0]!.authorization_id;
    const input = writeInput(value, '.packet.json', {
      base_goal: BASE_GOAL,
      subject_refs: [CAPABILITY_REF],
      handoff: null,
      budget_estimated_tokens: null,
    });

    const built = cli(value, 'collaboration', 'packet', 'build',
      '--authorization-id', authorization, '--input', input);

    expect(built.stderr).toBe('');
    expect(built.status).toBe(0);
    const result = JSON.parse(built.stdout) as {
      packet: { packet_sha256: string };
      rendered_context: string;
      composed_goal: string;
    };
    expect(result.rendered_context.startsWith(`${COLLABORATION_CONTEXT_START}\n`)).toBe(true);
    expect(result.rendered_context).toContain(COLLABORATION_CONTEXT_WARNING);
    expect(result.rendered_context.endsWith(`\n${COLLABORATION_CONTEXT_END}`)).toBe(true);
    expect(result.composed_goal.startsWith(BASE_GOAL)).toBe(true);
    expect(result.composed_goal.endsWith(`\n${COLLABORATION_CONTEXT_END}`)).toBe(true);

    const read = cli(value, 'collaboration', 'packet', 'read',
      '--authorization-id', authorization, '--packet-sha256', result.packet.packet_sha256);
    expect(read.status).toBe(0);
    expect((JSON.parse(read.stdout) as { packet: { packet_sha256: string } }).packet.packet_sha256)
      .toBe(result.packet.packet_sha256);
  });
});
