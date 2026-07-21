import { afterEach, describe, expect, test } from 'bun:test';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { EffectiveState } from '../src/core/state/types';
import { runStopHandler } from '../src/cli/hook/stop-handler';
import { runSubagentHandler } from '../src/cli/hook/subagent-handler';

const fixtures: string[] = [];

afterEach(() => {
  while (fixtures.length > 0) rmSync(fixtures.pop()!, { recursive: true, force: true });
});

function fixture(): string {
  const repoRoot = mkdtempSync(join(tmpdir(), 'repo-harness-delegation-state-'));
  fixtures.push(repoRoot);
  mkdirSync(join(repoRoot, '.ai/harness'), { recursive: true });
  writeFileSync(join(repoRoot, '.ai/harness/policy.json'), '{}\n');
  return repoRoot;
}

function canonicalState(): EffectiveState {
  return {
    workflow_profile: 'standard',
    review: {
      path: null,
      freshness: 'missing',
      recommendation: null,
      recorded_subject_sha256: null,
      recorded_target_revision: null,
    },
    readiness: {
      ok: true,
      allowedToEdit: { decision: 'allow' },
      allowedToStop: { decision: 'allow' },
      readyToShip: { decision: 'allow' },
      requirements: { edit: [], stop: [], ship: [] },
      nextAction: null,
    },
  } as unknown as EffectiveState;
}

function collector(repoRoot: string) {
  return {
    getRepoRoot: () => repoRoot,
    getWorktreeOwnership: () => ({ owner: null, ownedByCurrent: false }),
    getActivePlanMarker: () => null,
    getStopEffectiveState: () => canonicalState(),
  };
}

function codexEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return { ...process.env, HOOK_HOST: 'codex', ...overrides };
}

function seedDelegation(repoRoot: string, turnId: string): void {
  const seeded = runSubagentHandler({
    event: 'UserPromptSubmit',
    repoRoot,
    env: codexEnv(),
    input: JSON.stringify({
      hook_event_name: 'UserPromptSubmit',
      turn_id: turnId,
      prompt: '/delegate use bounded subagents',
    }),
  });
  expect(seeded.exitCode).toBe(0);
  expect(seeded.stdout).toContain('[repo-harness:delegation]');
}

function readDelegationProjection(repoRoot: string, turnId: string) {
  const latest = JSON.parse(
    readFileSync(join(repoRoot, '.ai/harness/delegation/latest.json'), 'utf8'),
  ) as Record<string, unknown>;
  const scoped = JSON.parse(
    readFileSync(join(repoRoot, `.ai/harness/delegation/turns/turn-${turnId}.json`), 'utf8'),
  ) as Record<string, unknown>;
  return { latest, scoped };
}

async function waitForPath(path: string, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!existsSync(path)) {
    if (Date.now() >= deadline) throw new Error(`timed out waiting for barrier: ${path}`);
    await Bun.sleep(10);
  }
}

async function spawnStopAtPreLockBarrier(
  repoRoot: string,
  turnId: string,
  readyPath: string,
  releasePath: string,
) {
  const modulePath = join(import.meta.dir, '../src/cli/hook/stop-handler.ts');
  const source = [
    'import { existsSync, writeFileSync } from "fs";',
    `import { runStopHandler } from ${JSON.stringify(modulePath)};`,
    'const repoRoot = process.argv[1];',
    'const turnId = process.argv[2];',
    'const readyPath = process.argv[3];',
    'const releasePath = process.argv[4];',
    'const canonical = {',
    '  workflow_profile: "standard",',
    '  review: { path: null, freshness: "missing", recommendation: null, recorded_subject_sha256: null, recorded_target_revision: null },',
    '  readiness: {',
    '    ok: true,',
    '    allowedToEdit: { decision: "allow" },',
    '    allowedToStop: { decision: "allow" },',
    '    readyToShip: { decision: "allow" },',
    '    requirements: { edit: [], stop: [], ship: [] },',
    '    nextAction: null,',
    '  },',
    '};',
    'const result = runStopHandler({',
    '  collector: {',
    '    getRepoRoot: () => repoRoot,',
    '    getWorktreeOwnership: () => ({ owner: null, ownedByCurrent: false }),',
    '    getActivePlanMarker: () => null,',
    '    getStopEffectiveState: () => canonical,',
    '  },',
    '  input: JSON.stringify({ turn_id: turnId }),',
    '  env: { ...process.env, HOOK_RUN_ID: "delegation-race-stop" },',
    '  dependencies: {',
    '    beforeDelegationLock: () => {',
    '      writeFileSync(readyPath, "ready\\n");',
    '      const deadline = Date.now() + 10000;',
    '      const view = new Int32Array(new SharedArrayBuffer(4));',
    '      while (!existsSync(releasePath)) {',
    '        if (Date.now() >= deadline) throw new Error("stop barrier timed out");',
    '        Atomics.wait(view, 0, 0, 10);',
    '      }',
    '    },',
    '  },',
    '});',
    'process.stdout.write(JSON.stringify(result));',
    'process.exitCode = result.exitCode;',
  ].join('\n');
  return Bun.spawn(
    [process.execPath, '-e', source, repoRoot, turnId, readyPath, releasePath],
    { env: codexEnv(), stdout: 'pipe', stderr: 'pipe' },
  );
}

async function spawnSubagentStart(repoRoot: string, turnId: string) {
  const modulePath = join(import.meta.dir, '../src/cli/hook/subagent-handler.ts');
  const input = JSON.stringify({
    hook_event_name: 'SubagentStart',
    turn_id: turnId,
    agent_id: `agent-${turnId}`,
    agent_type: 'default',
    model: 'gpt-5.6-sol',
  });
  const source = [
    `import { runSubagentHandler } from ${JSON.stringify(modulePath)};`,
    'const result = runSubagentHandler({',
    '  event: "SubagentStart",',
    '  repoRoot: process.argv[1],',
    '  env: { ...process.env, HOOK_HOST: "codex" },',
    '  input: process.argv[2],',
    '});',
    'process.stdout.write(JSON.stringify(result));',
    'process.exitCode = result.exitCode;',
  ].join('\n');
  const child = Bun.spawn([process.execPath, '-e', source, repoRoot, input], {
    env: codexEnv(),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}

describe('delegation state cross-writer transaction', () => {
  test('rechecks fallback eligibility after a real SubagentStart process commits first', async () => {
    const repoRoot = fixture();
    const turnId = 'race';
    seedDelegation(repoRoot, turnId);
    const readyPath = join(repoRoot, 'stop-ready');
    const releasePath = join(repoRoot, 'release-stop');
    const stop = await spawnStopAtPreLockBarrier(repoRoot, turnId, readyPath, releasePath);

    await waitForPath(readyPath);
    try {
      const started = await spawnSubagentStart(repoRoot, turnId);
      expect(started.exitCode).toBe(0);
      expect(started.stderr).toBe('');
      expect(JSON.parse(started.stdout).exitCode).toBe(0);
      expect(readDelegationProjection(repoRoot, turnId)).toMatchObject({
        latest: { spawned: true, fallback_used: false },
        scoped: { spawned: true, fallback_used: false },
      });
    } finally {
      writeFileSync(releasePath, 'release\n');
    }
    const [stopExitCode, stopStdout, stopStderr] = await Promise.all([
      stop.exited,
      new Response(stop.stdout).text(),
      new Response(stop.stderr).text(),
    ]);
    expect(stopExitCode).toBe(0);
    expect(stopStderr).toBe('');
    const stopResult = JSON.parse(stopStdout) as { exitCode: number; stdout: string };
    expect(stopResult.exitCode).toBe(0);
    expect(stopResult.stdout).not.toContain('[DelegationFallback]');
    expect(readDelegationProjection(repoRoot, turnId)).toMatchObject({
      latest: { spawned: true, fallback_used: false },
      scoped: { spawned: true, fallback_used: false },
    });
  }, 15_000);

  test('keeps fallback_used monotonic when SubagentStart follows a committed claim', () => {
    const repoRoot = fixture();
    const turnId = 'fallback-first';
    seedDelegation(repoRoot, turnId);

    const stopped = runStopHandler({
      collector: collector(repoRoot),
      input: JSON.stringify({ turn_id: turnId }),
      env: { ...process.env, HOOK_RUN_ID: 'delegation-fallback-first' },
    });
    expect(stopped.exitCode).toBe(0);
    expect(stopped.stdout).toContain('[DelegationFallback]');
    expect(readDelegationProjection(repoRoot, turnId)).toMatchObject({
      latest: { spawned: false, fallback_used: true },
      scoped: { spawned: false, fallback_used: true },
    });

    const started = runSubagentHandler({
      event: 'SubagentStart',
      repoRoot,
      env: codexEnv(),
      input: JSON.stringify({
        hook_event_name: 'SubagentStart',
        turn_id: turnId,
        agent_id: 'agent-fallback-first',
        agent_type: 'default',
        model: 'gpt-5.6-sol',
      }),
    });
    expect(started.exitCode).toBe(0);
    expect(readDelegationProjection(repoRoot, turnId)).toMatchObject({
      latest: { spawned: true, fallback_used: true },
      scoped: { spawned: true, fallback_used: true },
    });

    seedDelegation(repoRoot, turnId);
    expect(readDelegationProjection(repoRoot, turnId)).toMatchObject({
      latest: { spawned: false, fallback_used: false },
      scoped: { spawned: false, fallback_used: false },
    });
  });
});
