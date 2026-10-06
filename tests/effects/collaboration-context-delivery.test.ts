/**
 * C6 — context delivery and the dispatch fence.
 *
 * Acceptance for sprint row C6, delivery half: a packet built from the real
 * stores rebuilds byte-identically and carries `source_snapshot_sha256`, the
 * estimator version, truncation evidence and a canonical render digest; a
 * non-stable snapshot fails loud instead of producing one; the rendering
 * embedded in the dispatched goal is exactly the rendering the packet names; and
 * a collaboration-mode delegated run whose `CollaborationRunContextBindingV1` is
 * missing, dangling, or describes a different goal is refused dispatch.
 */
import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync, spawn } from 'child_process';
import { existsSync, mkdtempSync, realpathSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { open, type FileHandle } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  COLLABORATION_CONTEXT_END,
  COLLABORATION_CONTEXT_START,
  COLLABORATION_ESTIMATOR_VERSION,
} from '../../src/core/collaboration/context-packet';
import { collaborationSha256 } from '../../src/core/collaboration/common';
import {
  buildCollaborationRunContextBinding,
  checkCollaborationRunContextBinding,
  composeCollaborationGoal,
  decomposeCollaborationGoal,
} from '../../src/core/collaboration/run-binding';
import { engineerPrincipalAuthorization } from '../../src/effects/collaboration/actor';
import { admitCollaborationDelegation } from '../../src/effects/collaboration/admission-bridge';
import {
  CollaborationRunContextBindingRefused,
  assertCollaborationDispatchBinding,
  contextPacketStorePaths,
  deliverCollaborationContext,
  readCollaborationRunContextBinding,
  recordCollaborationRunContextBinding,
  runContextBindingStorePaths,
  type CollaborationContextDeliveryV1,
} from '../../src/effects/collaboration/context-delivery';
import { publishCoordinationSignal } from '../../src/effects/collaboration/signal-store';
import { collaborationRecordPath } from '../../src/effects/collaboration/record-store';
import { collectCollaborativeWorkExchange } from '../../src/effects/collaboration/work-exchange';
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
const CAPABILITY = 'capability.runtime-harness.collaboration';
const BASE_GOAL = 'Explain why the fourth writer never observes the published token.';

afterEach(() => removeFixtureRoots(roots));

function fixture(mode: string | null = 'shadow'): Fixture {
  const value = createCollaborationDelegationFixture(sourceRoot, roots, mode);
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
    scope_refs: [{ kind: 'capability', capability_id: CAPABILITY, capability_revision: `sha256:${'7'.repeat(64)}` }],
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

function collect(value: Fixture) {
  return collectCollaborativeWorkExchange({
    repo_root: value.repoRoot,
    read_execution_offers: () => [],
  });
}

function deliver(value: Fixture, baseGoal = BASE_GOAL): CollaborationContextDeliveryV1 {
  return deliverCollaborationContext({
    repo_root: value.repoRoot,
    collection: collect(value),
    subject_refs: [{ kind: 'capability', capability_id: CAPABILITY, capability_revision: `sha256:${'7'.repeat(64)}` }],
    base_goal: baseGoal,
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

function refusalOf(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    if (error instanceof CollaborationRunContextBindingRefused) return error.refusal;
    throw error;
  }
  throw new Error('expected a binding refusal');
}

describe('C6 collaboration context delivery', () => {
  test('a packet built from the real stores rebuilds byte-identically', () => {
    const value = fixture();
    publishSignal(value, 'signal-a', 'merge-gate-flake');
    publishSignal(value, 'signal-b', 'archctx-drain');

    const first = deliver(value);
    const second = deliver(value);

    expect(first.packet.packet_sha256).toBe(second.packet.packet_sha256);
    expect(first.rendered_context).toBe(second.rendered_context);
    expect(first.composed_goal).toBe(second.composed_goal);
    // The evidence the row names, each present on the record itself.
    expect(first.packet.source_snapshot_sha256).toBe(collect(value).snapshot.source_snapshot_sha256);
    expect(first.packet.estimator_version).toBe(COLLABORATION_ESTIMATOR_VERSION);
    expect(first.packet.budget_estimated_tokens).toBeGreaterThan(0);
    expect(first.packet.truncated).toBe(first.packet.omitted_signal_count > 0);
    expect(first.packet.rendered_context_sha256).toBe(collaborationSha256(first.rendered_context));
    expect(first.packet.snapshot_consistency).toBe('stable');
  });

  test('the goal carries the untrusted block and splits back into exactly its two parts', () => {
    const value = fixture();
    publishSignal(value, 'signal-a', 'merge-gate-flake');

    const delivery = deliver(value);

    expect(delivery.composed_goal.startsWith(BASE_GOAL)).toBe(true);
    expect(delivery.rendered_context.startsWith(`${COLLABORATION_CONTEXT_START}\n`)).toBe(true);
    expect(delivery.composed_goal.endsWith(`\n${COLLABORATION_CONTEXT_END}`)).toBe(true);
    const parts = decomposeCollaborationGoal(delivery.composed_goal);
    expect(parts.base_goal).toBe(BASE_GOAL);
    expect(parts.rendered_context).toBe(delivery.rendered_context);
    expect(collaborationSha256(parts.base_goal)).toBe(delivery.base_goal_sha256);
  });

  test('a base goal that already carries the markers is refused', () => {
    const value = fixture();
    publishSignal(value, 'signal-a', 'merge-gate-flake');
    const rendered = deliver(value).rendered_context;

    expect(() => composeCollaborationGoal(`${BASE_GOAL} ${COLLABORATION_CONTEXT_START}`, rendered))
      .toThrow('already carries the untrusted coordination markers');
  });

  test('a non-stable snapshot fails loud instead of producing a packet', () => {
    const value = fixture();
    publishSignal(value, 'signal-a', 'merge-gate-flake');
    const collection = collect(value);

    expect(() => deliverCollaborationContext({
      repo_root: value.repoRoot,
      collection: { ...collection, snapshot_consistency: 'changed_during_read' },
      subject_refs: [{ kind: 'capability', capability_id: CAPABILITY, capability_revision: `sha256:${'7'.repeat(64)}` }],
      base_goal: BASE_GOAL,
    })).toThrow('cannot be delivered from a changed_during_read snapshot');

    expect(() => deliverCollaborationContext({
      repo_root: value.repoRoot,
      collection: { ...collection, snapshot_consistency: 'degraded', degraded_sources: ['handoffs'] },
      subject_refs: [{ kind: 'capability', capability_id: CAPABILITY, capability_revision: `sha256:${'7'.repeat(64)}` }],
      base_goal: BASE_GOAL,
    })).toThrow('degraded: handoffs');
  });
});

describe('C6 collaboration run context binding fence', () => {
  test('a recorded binding names the run, the packet and the goal that was dispatched', () => {
    const value = fixture();
    publishSignal(value, 'signal-a', 'merge-gate-flake');
    const delivery = deliver(value);
    const dispatchId = admit(value, 0, delivery.composed_goal);

    const binding = recordCollaborationRunContextBinding({
      repo_root: value.repoRoot,
      dispatch_id: dispatchId,
      delivery,
    });

    expect(binding.dispatch_id).toBe(dispatchId);
    expect(binding.collaboration_context_packet_sha256).toBe(delivery.packet.packet_sha256);
    expect(binding.rendered_context_sha256).toBe(delivery.packet.rendered_context_sha256);
    expect(binding.composed_goal_sha256).toBe(delivery.composed_goal_sha256);
    expect(binding.base_goal_sha256).toBe(delivery.base_goal_sha256);
    // The frozen D2 semantics: the run's own `context_packet_sha256` is the
    // ExecutionPacket digest, and the binding records it as such.
    expect(binding.execution_packet_sha256).not.toBe(delivery.packet.packet_sha256);
    expect(readCollaborationRunContextBinding(value.repoRoot, dispatchId)).toEqual(binding);
    // Recording twice converges rather than conflicting.
    expect(recordCollaborationRunContextBinding({ repo_root: value.repoRoot, dispatch_id: dispatchId, delivery }))
      .toEqual(binding);
    expect(assertCollaborationDispatchBinding({ repo_root: value.repoRoot, dispatch_id: dispatchId }))
      .toEqual(binding);
  });

  test('a run with no binding is refused dispatch', () => {
    const value = fixture();
    publishSignal(value, 'signal-a', 'merge-gate-flake');
    const delivery = deliver(value);
    const dispatchId = admit(value, 0, delivery.composed_goal);

    expect(readCollaborationRunContextBinding(value.repoRoot, dispatchId)).toBeNull();
    expect(refusalOf(() => assertCollaborationDispatchBinding({
      repo_root: value.repoRoot,
      dispatch_id: dispatchId,
    }))).toBe('binding_missing');
  });

  test('a binding whose packet no longer resolves is refused dispatch', () => {
    const value = fixture();
    publishSignal(value, 'signal-a', 'merge-gate-flake');
    const delivery = deliver(value);
    const dispatchId = admit(value, 0, delivery.composed_goal);
    recordCollaborationRunContextBinding({ repo_root: value.repoRoot, dispatch_id: dispatchId, delivery });

    // The binding still reads as provenance and now evidences nothing.
    rmSync(collaborationRecordPath(
      contextPacketStorePaths(value.repoRoot),
      delivery.packet.packet_sha256.slice('sha256:'.length),
      'packet_sha256',
    ));

    expect(refusalOf(() => assertCollaborationDispatchBinding({
      repo_root: value.repoRoot,
      dispatch_id: dispatchId,
    }))).toBe('binding_context_packet_unresolvable');
  });

  test('a binding is never persisted for a run carrying a different goal', () => {
    const value = fixture();
    publishSignal(value, 'signal-a', 'merge-gate-flake');
    const delivered = deliver(value);
    const other = deliver(value, 'A different base goal entirely.');
    // The seat is admitted with the second delivery's goal; the caller then tries
    // to bind the first, which is the drift the fence exists for.
    const dispatchId = admit(value, 0, other.composed_goal);

    expect(refusalOf(() => recordCollaborationRunContextBinding({
      repo_root: value.repoRoot,
      dispatch_id: dispatchId,
      delivery: delivered,
    }))).toBe('binding_composed_goal_stale');
    expect(readCollaborationRunContextBinding(value.repoRoot, dispatchId)).toBeNull();
    // And with nothing persisted, the fence refuses the dispatch outright.
    expect(refusalOf(() => assertCollaborationDispatchBinding({
      repo_root: value.repoRoot,
      dispatch_id: dispatchId,
    }))).toBe('binding_missing');
  });

  test('a run whose goal was never composed is refused', () => {
    const value = fixture();
    publishSignal(value, 'signal-a', 'merge-gate-flake');
    const delivery = deliver(value);
    // An envelope carrying the bare base goal: no untrusted block was ever
    // embedded, so no binding can honestly say one was.
    const dispatchId = admit(value, 1, BASE_GOAL);

    expect(refusalOf(() => recordCollaborationRunContextBinding({
      repo_root: value.repoRoot,
      dispatch_id: dispatchId,
      delivery,
    }))).toBe('binding_composed_goal_stale');
  });

  test('a binding naming an uncomposed goal is refused, reachable only from forged state', () => {
    // `binding_goal_not_composed` cannot be produced through the honest path:
    // `deliverCollaborationContext()` always composes, so a binding whose
    // `composed_goal_sha256` matches an uncomposed goal is a record no producer
    // in this repository writes. The refusal exists for a hand-written or
    // corrupted binding, so it is exercised against exactly that — driving the
    // pure check directly rather than through a store the producer guards.
    const plainGoal = 'A goal that was never composed with a coordination block.';
    const renderedDigest = `sha256:${'d'.repeat(64)}`;
    const binding = buildCollaborationRunContextBinding({
      dispatch_id: `sha256:${'1'.repeat(64)}`,
      delegated_run_intent_sha256: `sha256:${'2'.repeat(64)}`,
      execution_packet_sha256: `sha256:${'3'.repeat(64)}`,
      collaboration_context_packet_sha256: `sha256:${'4'.repeat(64)}`,
      rendered_context_sha256: renderedDigest,
      base_goal_sha256: `sha256:${'5'.repeat(64)}`,
      composed_goal_sha256: collaborationSha256(plainGoal),
    });

    // Every earlier check passes, so control actually reaches the decomposition.
    expect(checkCollaborationRunContextBinding(binding, {
      dispatch_id: binding.dispatch_id,
      delegated_run_intent_sha256: binding.delegated_run_intent_sha256,
      execution_packet_sha256: binding.execution_packet_sha256,
      composed_goal: plainGoal,
      context_packet_rendered_context_sha256: renderedDigest,
    })).toBe('binding_goal_not_composed');

    // And the ordering is what makes it unreachable honestly: give the same
    // binding a goal it does not digest to, and the composed-goal check fires
    // first.
    expect(checkCollaborationRunContextBinding(binding, {
      dispatch_id: binding.dispatch_id,
      delegated_run_intent_sha256: binding.delegated_run_intent_sha256,
      execution_packet_sha256: binding.execution_packet_sha256,
      composed_goal: `${plainGoal} altered`,
      context_packet_rendered_context_sha256: renderedDigest,
    })).toBe('binding_composed_goal_stale');
  });

  test('the binding store keeps one record per dispatch', () => {
    const value = fixture();
    publishSignal(value, 'signal-a', 'merge-gate-flake');
    const delivery = deliver(value);
    const dispatchId = admit(value, 0, delivery.composed_goal);
    recordCollaborationRunContextBinding({ repo_root: value.repoRoot, dispatch_id: dispatchId, delivery });

    const stored = readCollaborationRunContextBinding(realpathSync(value.repoRoot), dispatchId)!;

    expect(stored.dispatch_id).toBe(dispatchId);
    expect(stored.binding_sha256).toBe(
      recordCollaborationRunContextBinding({
        repo_root: value.repoRoot,
        dispatch_id: dispatchId,
        delivery,
      }).binding_sha256,
    );
  });

  describe('two independent writers of the same record converge', () => {
    interface DriverRound {
      readonly ok: boolean;
      readonly sha256?: string;
      readonly code?: string | null;
      readonly message?: string;
    }

    /**
     * One writer in its own process. It holds one persistent barrier pair: it
     * blocks on the command FIFO until the parent releases a round, runs the
     * publication, and writes one ack byte back, so both writers enter the
     * same publication window together and the final-name link race is
     * exercised for real, not by timing luck. Results are one JSON array on
     * stdout, read after the process exits.
     */
    function writeDriver(): string {
      const directory = realpathSync(mkdtempSync(join(tmpdir(), 'repo-harness-c6-driver-')));
      roots.push(directory);
      const driver = join(directory, 'publish.ts');
      writeFileSync(driver, [
        `import { closeSync, constants, openSync, readSync, writeSync } from 'fs';`,
        `import {`,
        `  deliverCollaborationContext,`,
        `  recordCollaborationRunContextBinding,`,
        `} from ${JSON.stringify(join(sourceRoot, 'src/effects/collaboration/context-delivery'))};`,
        `import { collectCollaborativeWorkExchange } from ${JSON.stringify(join(sourceRoot, 'src/effects/collaboration/work-exchange'))};`,
        `const input = JSON.parse(process.argv[2]!);`,
        // The barrier ends are opened once and held for the whole run. POSIX
        // FIFO connections are not generational: a freshly opened writer can
        // pair with the previous round's not-yet-closed reader. Held ends make
        // the pairing per run instead of per round, so that cannot happen.
        `const commands = openSync(input.commands[process.argv[3]!], constants.O_RDONLY);`,
        `const acks = openSync(input.acks[process.argv[3]!], constants.O_WRONLY);`,
        `const rounds = [];`,
        `for (let round = 0; round < input.rounds; round += 1) {`,
        `  const signal = Buffer.alloc(1);`,
        `  if (readSync(commands, signal, 0, 1, null) !== 1) break;`,
        `  try {`,
        `    if (input.role === 'packet') {`,
        `      const delivery = deliverCollaborationContext({`,
        `        repo_root: input.repo_root,`,
        `        collection: collectCollaborativeWorkExchange({ repo_root: input.repo_root, read_execution_offers: () => [] }),`,
        `        subject_refs: [{ kind: 'capability', capability_id: ${JSON.stringify(CAPABILITY)}, capability_revision: ${JSON.stringify(`sha256:${'7'.repeat(64)}`)} }],`,
        `        base_goal: \`${BASE_GOAL} round \${round}\`,`,
        `      });`,
        `      rounds.push({ ok: true, sha256: delivery.packet.packet_sha256 });`,
        `    } else {`,
        `      const binding = recordCollaborationRunContextBinding({`,
        `        repo_root: input.repo_root,`,
        `        dispatch_id: input.dispatch_id,`,
        `        delivery: input.delivery,`,
        `      });`,
        `      rounds.push({ ok: true, sha256: binding.binding_sha256 });`,
        `    }`,
        `  } catch (error) {`,
        `    rounds.push({ ok: false, code: (error as { code?: string }).code ?? null, message: (error as Error).message });`,
        `  }`,
        `  writeSync(acks, signal);`,
        `}`,
        `closeSync(commands);`,
        `closeSync(acks);`,
        `process.stdout.write(JSON.stringify(rounds));`,
        '',
      ].join('\n'));
      return driver;
    }

    /**
     * One driver process. It acknowledges each round on its own ack FIFO once
     * the round's store work is done.
     */
    function startDriver(driver: string, input: unknown, env: NodeJS.ProcessEnv, index: string) {
      const child = spawn(process.execPath, [driver, JSON.stringify(input), index], { env });
      let stdoutText = '';
      let stderrText = '';
      child.stdout?.on('data', (chunk: Buffer | string) => { stdoutText += String(chunk); });
      child.stderr?.on('data', (chunk: Buffer | string) => { stderrText += String(chunk); });
      return {
        results: async (): Promise<DriverRound[]> => {
          const code = await new Promise<number | null>((resolveExit) => child.once('close', resolveExit));
          if (stdoutText === '') throw new Error(`driver produced no result (exit ${code}): ${stderrText}`);
          return JSON.parse(stdoutText) as DriverRound[];
        },
        stderr: () => stderrText,
      };
    }

    /**
     * Two named FIFOs per driver: commands parent->child, acks child->parent.
     */
    function prepareBarriers(value: Fixture, name: string): { commands: string[]; acks: string[] } {
      const make = (kind: string): string[] => [0, 1].map((index) => {
        const fifo = join(value.repoRoot, `.${name}-${kind}-${index}`);
        execFileSync('mkfifo', [fifo]);
        return fifo;
      });
      return { commands: make('commands'), acks: make('acks') };
    }

    interface DriverBarriers {
      /** Let both drivers start their next round. */
      release(): Promise<void>;
      /** Wait until both drivers finished their current round. */
      awaitRound(): Promise<void>;
      /** Close every held end, so a failed round cannot leak a FileHandle. */
      close(): Promise<void>;
    }

    /**
     * Open both drivers' barrier pairs once and hold the ends for the whole
     * run. A per-round reopen cannot be made safe: POSIX FIFO connections are
     * not generational, so the parent's next `open(fifo, 'w')` can pair with
     * the previous round's not-yet-closed reader, which is an EPIPE on write
     * or a byte nobody reads, and a parent open whose reader already exited
     * blocks forever. Held ends fix the pairing for the run, and the per-round
     * ack byte proves a driver finished its round before the parent resets
     * store state for the next one.
     */
    async function holdBarriers(barriers: { commands: readonly string[]; acks: readonly string[] }): Promise<DriverBarriers> {
      const opened: FileHandle[] = [];
      const hold = async (path: string, flags: string): Promise<FileHandle> => {
        const handle = await open(path, flags);
        opened.push(handle);
        return handle;
      };
      let commands: FileHandle[];
      let acks: FileHandle[];
      try {
        // All four opens at once. Each parent end pairs only with the same
        // FIFO's driver end, and every driver unconditionally opens its
        // command end and then its ack end, so every open eventually pairs.
        [commands, acks] = await Promise.all([
          Promise.all(barriers.commands.map((fifo) => hold(fifo, 'w'))),
          Promise.all(barriers.acks.map((fifo) => hold(fifo, 'r'))),
        ]);
      } catch (error) {
        // A failed open must not leak the ends that did open.
        for (const handle of opened) await handle.close().catch(() => {});
        throw error;
      }
      return {
        release: async (): Promise<void> => {
          for (const handle of commands) await handle.write(Buffer.alloc(1));
        },
        awaitRound: async (): Promise<void> => {
          for (const handle of acks) {
            const read = await handle.read(Buffer.alloc(1), 0, 1, null);
            if (read.bytesRead !== 1) throw new Error('a driver exited before acknowledging its round');
          }
        },
        close: async (): Promise<void> => {
          for (const handle of [...commands, ...acks]) await handle.close();
        },
      };
    }

    test('concurrent identical packet writers both succeed and publish one record', async () => {
      const value = fixture();
      publishSignal(value, 'signal-a', 'merge-gate-flake');
      const driver = writeDriver();
      const rounds = 8;
      const barriers = prepareBarriers(value, 'packet');

      const input = { role: 'packet', repo_root: value.repoRoot, rounds, commands: barriers.commands, acks: barriers.acks };
      const first = startDriver(driver, input, value.env, '0');
      const second = startDriver(driver, input, value.env, '1');
      const barrier = await holdBarriers(barriers);
      try {
        // A round's command goes out only after the previous round's acks, so
        // both writers are parked on the barrier read when it arrives and the
        // publication window stays shared instead of running on buffered
        // commands.
        for (let round = 0; round < rounds; round += 1) {
          await barrier.release();
          await barrier.awaitRound();
        }
      } finally {
        await barrier.close();
      }

      const [leftRounds, rightRounds] = await Promise.all([first.results(), second.results()]);
      expect(first.stderr()).toBe('');
      expect(second.stderr()).toBe('');
      const packetPaths = contextPacketStorePaths(realpathSync(value.repoRoot));

      // Every round: both writers report the same packet, so the loser of the
      // link race converged instead of failing, and the shard keeps one file.
      expect(leftRounds).toHaveLength(rounds);
      expect(rightRounds).toHaveLength(rounds);
      for (let round = 0; round < rounds; round += 1) {
        const left = leftRounds[round]!, right = rightRounds[round]!;
        expect({ round, ...left }).toEqual({ round, ok: true, sha256: left.sha256 });
        expect(right.ok).toBe(true);
        expect(right.sha256).toBe(left.sha256);
        expect(existsSync(collaborationRecordPath(
          packetPaths,
          left.sha256!.slice('sha256:'.length),
          'packet_sha256',
        ))).toBe(true);
      }
      // `base_goal` differs per round but is no input to the packet, so every
      // round rebuilds byte-identical bytes: one digest across both writers,
      // and the shard holds exactly the one converged record.
      const digests = new Set([...leftRounds, ...rightRounds].map((round) => round.sha256));
      expect([...digests]).toHaveLength(1);
      expect(readdirSync(packetPaths.shard).filter((name) => name.endsWith('.json')))
        .toEqual([`${leftRounds[0]!.sha256!.slice('sha256:'.length)}.json`]);
    }, 240000);

    test('concurrent identical binding writers both succeed and publish one record', async () => {
      const value = fixture();
      publishSignal(value, 'signal-a', 'merge-gate-flake');
      const delivery = deliver(value);
      const dispatchId = admit(value, 0, delivery.composed_goal);
      const driver = writeDriver();
      const repoRoot = realpathSync(value.repoRoot);
      const rounds = 8;
      // A binding is filed under its own digest, not the dispatch id, so the
      // reset clears the shard's records wholesale rather than by name.
      const bindingShard = runContextBindingStorePaths(repoRoot).shard;
      const barriers = prepareBarriers(value, 'binding');
      const input = {
        role: 'binding',
        repo_root: value.repoRoot,
        rounds,
        dispatch_id: dispatchId,
        delivery,
        commands: barriers.commands,
        acks: barriers.acks,
      };

      const first = startDriver(driver, input, value.env, '0');
      const second = startDriver(driver, input, value.env, '1');

      const barrier = await holdBarriers(barriers);
      try {
        for (let round = 0; round < rounds; round += 1) {
          if (round > 0) {
            // The acks prove both writers finished the previous round's store
            // work and are parked on the next command, so removing the
            // converged record makes this round a fresh creation race rather
            // than a replay.
            await barrier.awaitRound();
            for (const name of readdirSync(bindingShard)) {
              if (name.endsWith('.json')) rmSync(join(bindingShard, name));
            }
          }
          await barrier.release();
        }
        await barrier.awaitRound();
      } finally {
        await barrier.close();
      }

      const [leftRounds, rightRounds] = await Promise.all([first.results(), second.results()]);
      expect(first.stderr()).toBe('');
      expect(second.stderr()).toBe('');
      expect(leftRounds).toHaveLength(rounds);
      expect(rightRounds).toHaveLength(rounds);
      for (let round = 0; round < rounds; round += 1) {
        const left = leftRounds[round]!, right = rightRounds[round]!;
        expect({ round, ...left }).toEqual({ round, ok: true, sha256: left.sha256 });
        expect(right.ok).toBe(true);
        expect(right.sha256).toBe(left.sha256);
      }

      // Exactly the converged record is stored under the dispatch identity.
      const converged = leftRounds[rounds - 1]!.sha256;
      if (converged === undefined) throw new Error('no round converged');
      const stored = readCollaborationRunContextBinding(repoRoot, dispatchId)!;
      expect(stored.binding_sha256).toBe(converged);
      expect(stored.dispatch_id).toBe(dispatchId);
    }, 240000);

    test('concurrent writers of different bytes for one dispatch conflict', async () => {
      const value = fixture();
      publishSignal(value, 'signal-a', 'merge-gate-flake');
      // Two honest deliveries of the same store state that still disagree: a
      // smaller budget selects the same single signal, so the rendered context
      // and the composed goal are identical while the packet digest is not.
      // Both bindings therefore pass every fence check and differ only in
      // bytes under one record identity.
      const delivery = deliver(value);
      const other = deliverCollaborationContext({
        repo_root: value.repoRoot,
        collection: collect(value),
        subject_refs: [{ kind: 'capability', capability_id: CAPABILITY, capability_revision: `sha256:${'7'.repeat(64)}` }],
        base_goal: BASE_GOAL,
        budget_estimated_tokens: 800,
      });
      expect(other.rendered_context).toBe(delivery.rendered_context);
      expect(other.composed_goal).toBe(delivery.composed_goal);
      expect(other.packet.packet_sha256).not.toBe(delivery.packet.packet_sha256);
      const dispatchId = admit(value, 0, delivery.composed_goal);
      const driver = writeDriver();
      const rounds = 3;
      const barriers = prepareBarriers(value, 'conflict');

      const first = startDriver(
        driver,
        { role: 'binding', repo_root: value.repoRoot, rounds, dispatch_id: dispatchId, delivery, commands: barriers.commands, acks: barriers.acks },
        value.env,
        '0',
      );
      const second = startDriver(
        driver,
        { role: 'binding', repo_root: value.repoRoot, rounds, dispatch_id: dispatchId, delivery: other, commands: barriers.commands, acks: barriers.acks },
        value.env,
        '1',
      );
      const barrier = await holdBarriers(barriers);
      try {
        for (let round = 0; round < rounds; round += 1) {
          await barrier.release();
          await barrier.awaitRound();
        }
      } finally {
        await barrier.close();
      }

      const [leftRounds, rightRounds] = await Promise.all([first.results(), second.results()]);
      expect(first.stderr()).toBe('');
      expect(second.stderr()).toBe('');
      // One record identity, two byte streams: exactly one writer's record is
      // stored, the loser of the link race is refused with the typed conflict
      // — never a raw EEXIST and never an overwrite — and every later round
      // agrees with the record that won.
      const winner = [leftRounds, rightRounds].findIndex((writer) => writer.every((round) => round.ok));
      expect(winner).toBeGreaterThanOrEqual(0);
      const winnerDelivery = winner === 0 ? delivery : other;
      for (const round of (winner === 0 ? rightRounds : leftRounds)) {
        expect(round.ok).toBe(false);
        expect(round.code).toBe('collaboration_conflict');
      }
      const stored = readCollaborationRunContextBinding(realpathSync(value.repoRoot), dispatchId)!;
      expect(stored.collaboration_context_packet_sha256).toBe(winnerDelivery.packet.packet_sha256);
    }, 240000);
  });
});
