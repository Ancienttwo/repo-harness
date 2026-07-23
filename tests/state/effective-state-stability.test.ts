import { describe, expect, test } from 'bun:test';
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'fs';
import { join } from 'path';
import { spawn, spawnSync } from 'child_process';
import {
  CONTRACT,
  createEffectiveStateFixture,
  writeFixture,
  writeFixtureStateLock,
} from './effective-state-fixture';
import { resolveEffectiveState } from '../../src/effects/state/resolve-effective-state';
import { runMutationGuard, type MutationGuardCollector } from '../../src/cli/hook/mutation-guard';
import { createStateInputCollector } from '../../src/effects/loop/state-input-collector';
import type { EffectiveState } from '../../src/core/state/types';

// hook-guard-stability regression guard (2026-07-23 root-cause-prover
// diagnosis, .ai/harness/runs/hook-guard-stability/diagnosis-probes/).
//
// Root cause: resolveStableEffectiveState's stability contract
// (src/effects/state/resolve-effective-state.ts) compares the FULL
// source_hashes map -- including non-authority, high-churn surfaces such as
// checks/latest.json, tasks/current.md, handoff/resume, and the
// review_subject working-tree diff fingerprint -- between re-reads, and
// throws "workflow authority changed repeatedly while resolving effective
// state" whenever any one of them differs. The hook wrapper
// (src/cli/hook/runtime.ts) collapses that throw into `null`, which
// mutation-guard.ts cannot distinguish from a genuine blocker, so it fails
// closed with the generic "Deterministic workflow profile resolution
// failed" banner -- blocking innocent edits on ordinary concurrent work
// (bun test, git commands, evidence-cache writes) rather than on anything
// wrong with the plan/contract themselves.
//
// This guard proves both falsifier directions named in the task contract
// (tasks/contracts/20260723-0620-hook-guard-stability.contract.md):
//   (a) churn confined to a non-authority source must not abort resolution
//       or surface as the unresolvable-profile block.
//   (b) a genuine plan-contract conflict (the artifact-parsers
//       planContractRelationshipConflicts shape) must still block with
//       today's exact WorkflowProfileGuard message and exit code.
//
// On unfixed code, direction (a) is expected to be RED (the resolution
// throws under sustained non-authority churn, so `failure` is non-null and
// the assertions below fail); direction (b) already holds today and stays
// green across the fix. Only the DESIRED end state is asserted here -- no
// assertion encodes today's bug as expected behavior.

const CHECKS_RELATIVE_PATH = '.ai/harness/checks/latest.json';

interface ContinuousMutator {
  readonly startedPath: string;
  readonly stopPath: string;
  readonly counterPath: string;
  readonly done: Promise<void>;
}

/**
 * Deterministically churns `relativePath` from a detached shell process for
 * the whole lifetime of the caller's critical section, with no sleep-based
 * timing race: mirrors tests/state/state-concurrency.test.ts's "continuous
 * capability-registry mutation overlaps resolution" barrier technique.
 *
 * The mutator first claims the given fake lock-owner file (created via
 * writeFixtureStateLock with this process's own pid, so it cannot be
 * reclaimed as stale), mutates the target once, signals "started", THEN
 * releases the fake lock -- guaranteeing the caller's own
 * resolveEffectiveState call (which blocks on the same lock) cannot begin
 * its own reads until at least one mutation has already landed -- and keeps
 * mutating in a tight loop with no delay until the stop file appears, so
 * every read taken during the caller's critical section observes fresh
 * churn regardless of host speed.
 */
function spawnContinuousMutator(opts: {
  readonly cwd: string;
  readonly relativePath: string;
  readonly ownerPath: string;
  readonly lockPath: string;
}): ContinuousMutator {
  const stateDir = join(opts.cwd, '.ai/harness/state');
  mkdirSync(stateDir, { recursive: true });
  const startedPath = join(stateDir, 'stability-guard-mutator-started');
  const stopPath = join(stateDir, 'stability-guard-mutator-stop');
  const counterPath = join(stateDir, 'stability-guard-mutator-count');
  const targetPath = join(opts.cwd, opts.relativePath);
  const mutator = spawn('sh', [
    '-c',
    [
      'i=0',
      'printf " " >> "$1"',
      'i=$((i + 1))',
      'printf "%s\\n" "$i" > "$5"',
      'printf "started\\n" > "$2"',
      'rm -f "$3"',
      'rmdir "$4"',
      'while [ ! -f "$6" ]; do',
      '  printf " " >> "$1"',
      '  i=$((i + 1))',
      'done',
      'printf "%s\\n" "$i" > "$5"',
    ].join('\n'),
    'mutate-effective-state-non-authority-source',
    targetPath,
    startedPath,
    opts.ownerPath,
    opts.lockPath,
    counterPath,
    stopPath,
  ], { stdio: 'ignore' });
  const done = new Promise<void>((resolvePromise, rejectPromise) => {
    mutator.once('exit', (code) => (code === 0
      ? resolvePromise()
      : rejectPromise(new Error(`fixture mutator exited ${code}`))));
    mutator.once('error', rejectPromise);
  });
  return { startedPath, stopPath, counterPath, done };
}

/** Bounded, non-sleep-race busy wait for a barrier file (same idiom as
 * tests/state/state-concurrency.test.ts): polls for existence, capped at 5s. */
function waitForBarrier(path: string): void {
  const barrier = spawnSync('sh', [
    '-c',
    'i=0; while [ ! -f "$1" ]; do i=$((i + 1)); [ "$i" -lt 500 ] || exit 1; sleep 0.01; done',
    'wait-mutator',
    path,
  ]);
  if (barrier.status !== 0) throw new Error(`fixture mutator did not start in time: ${path}`);
}

describe('Effective State stability contract: authority-only partition (hook-guard-stability)', () => {
  test('sustained churn confined to a non-authority source (checks/latest.json) does not abort resolution', async () => {
    const fixture = createEffectiveStateFixture();
    try {
      const risk = { targetPaths: ['src/feature.ts'], operationKind: 'feature' } as const;
      const { ownerPath, lockPath } = writeFixtureStateLock(fixture.cwd, {
        pid: process.pid,
        created_at: Date.now(),
        token: 'stability-guard-non-authority-barrier',
      });
      const mutator = spawnContinuousMutator({
        cwd: fixture.cwd,
        relativePath: CHECKS_RELATIVE_PATH,
        ownerPath,
        lockPath,
      });
      waitForBarrier(mutator.startedPath);
      const beforeCount = Number.parseInt(readFileSync(mutator.counterPath, 'utf-8'), 10);

      let failure: Error | null = null;
      let resolved: EffectiveState | null = null;
      try {
        resolved = resolveEffectiveState(fixture.cwd, Date.now(), risk);
      } catch (error) {
        failure = error as Error;
      } finally {
        writeFileSync(mutator.stopPath, 'stop\n');
      }
      await mutator.done;

      const afterCount = Number.parseInt(readFileSync(mutator.counterPath, 'utf-8'), 10);
      // Sanity check on the injection itself: the non-authority source
      // really did churn throughout the call window.
      expect(afterCount).toBeGreaterThan(beforeCount);

      // Falsifier direction (a): non-authority churn alone must not abort
      // resolution (no throw) and must not surface as an unresolvable
      // workflow profile.
      expect(failure).toBeNull();
      expect(resolved?.blockers ?? []).toEqual([]);
      expect(resolved?.workflow_profile === 'lite'
        || resolved?.workflow_profile === 'standard'
        || resolved?.workflow_profile === 'strict').toBe(true);
    } finally {
      fixture.cleanup();
    }
  }, 15_000);

  test('a genuine plan-contract conflict still blocks with the exact WorkflowProfileGuard message and exit code', () => {
    const fixture = createEffectiveStateFixture();
    try {
      // artifact-parsers' planContractRelationshipConflicts shape: the
      // contract's own `Plan` header disagrees with the actually-active
      // plan path, so resolveEffectiveState pushes
      // 'contract_plan_relationship' into conflictingSources, which
      // projectEffectiveState turns into the hard blocker
      // 'conflict:contract_plan_relationship'. This is a genuinely blocked
      // resolution (no throw at all) and must stay byte-identical.
      const current = readFileSync(join(fixture.cwd, CONTRACT), 'utf-8');
      writeFixture(fixture.cwd, CONTRACT, current.replace(
        /^> \*\*Plan\*\*: .*$/m,
        '> **Plan**: plans/plan-some-other-conflicting-plan.md',
      ));

      const directResolution = resolveEffectiveState(fixture.cwd, Date.now(), {
        targetPaths: ['src/feature.ts'],
        operationKind: 'edit',
      });
      expect(directResolution.blockers).toContain('conflict:contract_plan_relationship');

      const collector: MutationGuardCollector = createStateInputCollector({
        event: 'PreToolUse',
        repoRoot: fixture.cwd,
        resolveSessionEffectiveState: () => null,
        resolvePreEditEffectiveState: (targetPaths: readonly string[]): EffectiveState | null => {
          try {
            return resolveEffectiveState(fixture.cwd, Date.now(), {
              targetPaths,
              operationKind: 'edit',
            });
          } catch {
            return null;
          }
        },
      });
      const result = runMutationGuard({
        collector,
        input: JSON.stringify({ tool_input: { file_path: 'src/feature.ts' } }),
        env: {},
      });

      expect(result.exitCode).toBe(2);
      expect(result.stdout).toContain('[WorkflowProfileGuard] Unable to resolve a deterministic workflow profile for src/feature.ts');
      expect(result.stderr).toContain('[WorkflowProfileGuard] Deterministic workflow profile resolution failed for src/feature.ts.');
    } finally {
      fixture.cleanup();
    }
  });
});
