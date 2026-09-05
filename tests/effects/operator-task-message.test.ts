import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { deriveTaskRevision, buildLeaseOwnerRecord, bindLeaseRecord } from '../../src/core/state/coordination-identity';
import { repoHarnessRegisteredReposPath, repoHarnessRepoIdFor } from '../../src/effects/repo-registry';
import { sendOperatorTaskMessage, OperatorTaskMessageError } from '../../src/effects/fleet/task-message-request';
import { createLeaseDirectory, writeLeaseOwnerDurably } from '../../src/effects/state/coordination-lease-store';
import { taskInboxEventPath, taskInboxTaskDirectory } from '../../src/effects/fleet/task-inbox';
import { resolveRepoIdentity } from '../../src/effects/state/coordination-canonical-source';
import { fixtureTaskId } from '../helpers/sprint-fixture';

const SPRINT_PATH = 'plans/sprints/operator-message.sprint.md';
const TASK_CELL = 'send a fenced operator message';
const CLAIM_ONE = '123e4567-e89b-42d3-a456-426614174001';
const CLAIM_TWO = '123e4567-e89b-42d3-a456-426614174002';
const MESSAGE_ONE = '123e4567-e89b-42d3-a456-426614174010';
const MESSAGE_TWO = '123e4567-e89b-42d3-a456-426614174011';
const PROJECT_ROOT = resolve(import.meta.dir, '../..');
const TASK_MESSAGE_REQUEST_MODULE = resolve(import.meta.dir, '../../src/effects/fleet/task-message-request.ts');
const REGISTRY_MODULE = resolve(import.meta.dir, '../../src/effects/repo-registry.ts');

interface Fixture {
  readonly root: string;
  readonly home: string;
  readonly repositoryId: string;
  readonly taskId: string;
  readonly taskRevision: string;
  readonly source: { readonly targetRef: string; readonly sprintPath: string };
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function fixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'repo-harness-operator-message-'));
  const home = mkdtempSync(join(tmpdir(), 'repo-harness-operator-message-home-'));
  git(root, 'init', '-b', 'main');
  git(root, 'config', 'user.name', 'Operator Message Test');
  git(root, 'config', 'user.email', 'operator-message@test.invalid');
  mkdirSync(join(root, 'plans/sprints'), { recursive: true });
  mkdirSync(join(root, '.ai/harness/sprint'), { recursive: true });
  writeFileSync(join(root, '.ai/harness/sprint/active-sprint'), `${SPRINT_PATH}\n`);
  writeFileSync(join(root, SPRINT_PATH), [
    '# Sprint: operator message', '', '> **Backlog Schema**: 2', '', '## Backlog', '',
    '| # | ID | Status | Task | Mode | Acceptance | Plan |',
    '|---|----|--------|------|------|------------|------|',
    `| 1 | ${fixtureTaskId(`${TASK_CELL}`)} | [ ] | ${TASK_CELL} | contract | proves the fence | (pending) |`, '',
  ].join('\n'));
  writeFileSync(join(root, 'README.md'), 'fixture\n');
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'fixture');

  const repositoryPath = realpathSync(root);
  const repositoryId = repoHarnessRepoIdFor(repositoryPath);
  const now = '2026-09-01T00:00:00.000Z';
  writeFileSync(join(home, 'registered-repos.json'), `${JSON.stringify({
    version: 1,
    authorizationRevision: 1,
    repos: [{
      id: repositoryId,
      path: repositoryPath,
      accessMode: 'read_write',
      source: 'adopt',
      registeredAt: now,
      lastSeenAt: now,
    }],
  })}\n`);

  const taskId = fixtureTaskId(TASK_CELL);
  const taskRevision = deriveTaskRevision({ taskCell: TASK_CELL,
    taskId,
    modeCell: 'contract',
    acceptanceCell: 'proves the fence',
  });
  return { root, home, repositoryId, taskId, taskRevision, source: { targetRef: 'main', sprintPath: SPRINT_PATH } };
}

function lease(fixtureValue: Fixture, claimId: string, generation: number): void {
  const owner = buildLeaseOwnerRecord({
    claimId,
    taskId: fixtureValue.taskId,
    taskRevision: fixtureValue.taskRevision,
    sprintPath: SPRINT_PATH,
    targetRef: 'main',
    generation,
    sessionId: `operator-message-${generation}`,
    sourceWorktree: fixtureValue.root,
  });
  const bound = bindLeaseRecord(owner, {
    claimId,
    executionWorktree: realpathSync(fixtureValue.root),
    branch: `codex/operator-message-${generation}`,
    unitRef: 'plans/plan-operator-message.md',
  });
  if (!bound.ok) throw new Error(bound.error);
  if (generation === 1 && !createLeaseDirectory(fixtureValue.root, fixtureValue.taskId)) throw new Error('lease election failed');
  writeLeaseOwnerDurably(fixtureValue.root, fixtureValue.taskId, bound.record);
}

function input(fixtureValue: Fixture, messageId: string, scope: 'task' | 'claim', overrides: Partial<{
  expected_task_revision: string;
  expected_claim_id: string | null;
  expected_generation: number | null;
}> = {}) {
  return {
    env: { REPO_HARNESS_HOME: fixtureValue.home },
    repository_id: fixtureValue.repositoryId,
    task_id: fixtureValue.taskId,
    message_id: messageId,
    scope,
    expected_task_revision: fixtureValue.taskRevision,
    expected_claim_id: scope === 'claim' ? CLAIM_ONE : null,
    expected_generation: scope === 'claim' ? 1 : null,
    body: 'please inspect the current task state',
    ...overrides,
  } as const;
}

function withFixture(run: (value: Fixture) => void): void {
  const value = fixture();
  try {
    run(value);
  } finally {
    rmSync(value.root, { recursive: true, force: true });
    rmSync(value.home, { recursive: true, force: true });
  }
}

async function withFixtureAsync(run: (value: Fixture) => Promise<void>): Promise<void> {
  const value = fixture();
  try {
    await run(value);
  } finally {
    rmSync(value.root, { recursive: true, force: true });
    rmSync(value.home, { recursive: true, force: true });
  }
}

async function waitFor(condition: () => boolean, description: string): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (!condition()) {
    if (Date.now() >= deadline) throw new Error(`timed out waiting for ${description}`);
    await Bun.sleep(10);
  }
}

function spawnWorker(script: string, env: Record<string, string>): ReturnType<typeof Bun.spawn> {
  return Bun.spawn([process.execPath, '-e', script], {
    cwd: PROJECT_ROOT,
    env: { ...process.env, ...env },
    stdout: 'pipe',
    stderr: 'pipe',
  });
}

async function workerResult(worker: ReturnType<typeof Bun.spawn>): Promise<{ readonly status: number; readonly stdout: string; readonly stderr: string }> {
  if (!(worker.stdout instanceof ReadableStream) || !(worker.stderr instanceof ReadableStream)) {
    throw new Error('worker must expose stdout and stderr pipes');
  }
  const [status, stdout, stderr] = await Promise.all([
    worker.exited,
    new Response(worker.stdout).text(),
    new Response(worker.stderr).text(),
  ]);
  return { status, stdout, stderr };
}

function operatorMessageWorker(value: Fixture, messageId: string, env: Record<string, string> = {}): ReturnType<typeof Bun.spawn> {
  const script = `
    const { sendOperatorTaskMessage, OperatorTaskMessageError } = await import(process.env.TASK_MESSAGE_REQUEST_MODULE);
    try {
      const result = sendOperatorTaskMessage(JSON.parse(process.env.TASK_INPUT));
      process.stdout.write(JSON.stringify({ ok: true, result }));
    } catch (error) {
      process.stdout.write(JSON.stringify({
        ok: false,
        code: error instanceof OperatorTaskMessageError ? error.code : null,
        message: error instanceof Error ? error.message : String(error),
      }));
    }
  `;
  return spawnWorker(script, {
    TASK_MESSAGE_REQUEST_MODULE,
    TASK_INPUT: JSON.stringify(input(value, messageId, 'task')),
    ...env,
  });
}

function readWorkerPayload(result: { readonly status: number; readonly stdout: string; readonly stderr: string }): Record<string, unknown> {
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout) as Record<string, unknown>;
}

function registryRevoker(
  value: Fixture,
  opts: { readonly readyPath?: string; readonly releasePath?: string } = {},
): ReturnType<typeof Bun.spawn> {
  const script = `
    import { existsSync, writeFileSync } from 'node:fs';
    const { applyRepoHarnessRegistryBatch } = await import(process.env.REGISTRY_MODULE);
    const wait = new Int32Array(new SharedArrayBuffer(4));
    applyRepoHarnessRegistryBatch([
      { repoRoot: process.env.REPO_ROOT, source: 'adopt', accessMode: 'read_only' },
    ], {
      env: { REPO_HARNESS_HOME: process.env.REGISTRY_HOME },
      requireAdopted: false,
      beforeCommit: () => {
        if (!process.env.READY_PATH) return;
        writeFileSync(process.env.READY_PATH, 'ready\\n');
        while (!existsSync(process.env.RELEASE_PATH)) Atomics.wait(wait, 0, 0, 5);
      },
    });
  `;
  return spawnWorker(script, {
    REGISTRY_MODULE,
    REGISTRY_HOME: value.home,
    REPO_ROOT: value.root,
    READY_PATH: opts.readyPath ?? '',
    RELEASE_PATH: opts.releasePath ?? '',
  });
}

function pausedGitBin(value: Fixture, readyPath: string, releasePath: string): string {
  const bin = join(value.root, 'test-bin');
  mkdirSync(bin, { recursive: true });
  const gitPath = join(bin, 'git');
  const realGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
  writeFileSync(gitPath, `#!/bin/sh
"${realGit}" "$@"
status=$?
if [ "$1" = "show" ] && [ "$status" -eq 0 ]; then
  : > "${readyPath}"
  while [ ! -f "${releasePath}" ]; do sleep 0.01; done
fi
exit "$status"
`);
  chmodSync(gitPath, 0o700);
  return bin;
}

function expectNoInboxArtifacts(value: Fixture, messageId: string): void {
  expect(existsSync(taskInboxEventPath(value.root, value.taskId, messageId))).toBe(false);
}

function expectOperatorError(run: () => void, code: OperatorTaskMessageError['code']): void {
  expect(run).toThrow(OperatorTaskMessageError);
  try {
    run();
  } catch (error) {
    expect((error as OperatorTaskMessageError).code).toBe(code);
  }
}

describe('operator task-message effect fence', () => {
  test('rejects a stale task revision before creating an event', () => withFixture((value) => {
    expectOperatorError(() => sendOperatorTaskMessage(input(value, MESSAGE_ONE, 'task', {
      expected_task_revision: '0'.repeat(64),
    })), 'task_revision_mismatch');
    expectNoInboxArtifacts(value, MESSAGE_ONE);
  }));

  test('keeps a claim message bound to the observed claim and rejects takeover', () => withFixture((value) => {
    lease(value, CLAIM_ONE, 1);
    const created = sendOperatorTaskMessage(input(value, MESSAGE_ONE, 'claim'));
    expect(created).toMatchObject({
      task_id: value.taskId,
      target_claim_id: CLAIM_ONE,
      target_generation: 1,
      created: true,
    });
    const stored = JSON.parse(readFileSync(taskInboxEventPath(value.root, value.taskId, MESSAGE_ONE), 'utf8')) as Record<string, unknown>;
    expect(stored).toMatchObject({ target_claim_id: CLAIM_ONE, target_generation: 1 });

    lease(value, CLAIM_TWO, 2);
    expectOperatorError(() => sendOperatorTaskMessage(input(value, MESSAGE_TWO, 'claim')), 'claim_mismatch');
    expectNoInboxArtifacts(value, MESSAGE_TWO);
  }));

  test('keeps an identical retry idempotent while task authority remains pending', () => withFixture((value) => {
    expect(sendOperatorTaskMessage(input(value, MESSAGE_ONE, 'task')).created).toBe(true);
    expect(sendOperatorTaskMessage(input(value, MESSAGE_ONE, 'task')).created).toBe(false);
  }));

  test('rejects a completed canonical row even when its task revision is unchanged', () => withFixture((value) => {
    writeFileSync(join(value.root, SPRINT_PATH), [
      '# Sprint: operator message', '', '> **Backlog Schema**: 2', '', '## Backlog', '',
      '| # | ID | Status | Task | Mode | Acceptance | Plan |',
      '|---|----|--------|------|------|------------|------|',
      `| 1 | ${fixtureTaskId(`${TASK_CELL}`)} | [x] | ${TASK_CELL} | contract | proves the fence | (pending) |`, '',
    ].join('\n'));
    git(value.root, 'add', SPRINT_PATH);
    git(value.root, 'commit', '-m', 'complete fixture task');

    expectOperatorError(() => sendOperatorTaskMessage(input(value, MESSAGE_ONE, 'task')), 'task_not_pending');
    expectNoInboxArtifacts(value, MESSAGE_ONE);
    expect(existsSync(taskInboxTaskDirectory(value.root, value.taskId))).toBe(false);
  }));

  test('linearizes registry revocation before a waiting task-message publication', async () => withFixtureAsync(async (value) => {
    const readyPath = join(value.home, 'revocation-ready');
    const releasePath = join(value.home, 'release-revocation');
    const revoker = registryRevoker(value, { readyPath, releasePath });
    await waitFor(() => existsSync(readyPath), 'registry revocation prepare barrier');

    const sender = operatorMessageWorker(value, MESSAGE_ONE);
    writeFileSync(releasePath, 'release\n');

    const [revokerResult, senderResult] = await Promise.all([workerResult(revoker), workerResult(sender)]);
    expect(revokerResult.status, revokerResult.stderr).toBe(0);
    expect(readWorkerPayload(senderResult)).toMatchObject({ ok: false, code: 'repository_read_only' });
    expectNoInboxArtifacts(value, MESSAGE_ONE);
  }), 30_000);

  if (process.platform !== 'win32') {
    test('never holds the registry authorization lock while a publication waits for the task lock', async () => withFixtureAsync(async (value) => {
      const gitReadyPath = join(value.home, 'initial-sprint-read');
      const gitReleasePath = join(value.home, 'release-initial-sprint-read');
      const bin = pausedGitBin(value, gitReadyPath, gitReleasePath);
      const sender = operatorMessageWorker(value, MESSAGE_ONE, { PATH: `${bin}:${process.env.PATH ?? ''}` });
      await waitFor(() => existsSync(gitReadyPath), 'initial canonical sprint read');

      const registryLockPath = `${repoHarnessRegisteredReposPath({ REPO_HARNESS_HOME: value.home })}.lock`;
      expect(existsSync(registryLockPath)).toBe(false);

      writeFileSync(gitReleasePath, 'release\n');
      const senderResult = await workerResult(sender);
      expect(readWorkerPayload(senderResult)).toMatchObject({ ok: true, result: { created: true } });
      expect(existsSync(taskInboxEventPath(value.root, value.taskId, MESSAGE_ONE))).toBe(true);
    }), 30_000);

    test('rejects a revocation that lands between registry authorization and the locked publication', async () => withFixtureAsync(async (value) => {
      const gitReadyPath = join(value.home, 'initial-sprint-read');
      const gitReleasePath = join(value.home, 'release-initial-sprint-read');
      const bin = pausedGitBin(value, gitReadyPath, gitReleasePath);
      const sender = operatorMessageWorker(value, MESSAGE_ONE, { PATH: `${bin}:${process.env.PATH ?? ''}` });
      await waitFor(() => existsSync(gitReadyPath), 'initial canonical sprint read');

      const revoker = registryRevoker(value);
      const revokerResult = await workerResult(revoker);
      expect(revokerResult.status, revokerResult.stderr).toBe(0);

      writeFileSync(gitReleasePath, 'release\n');
      const senderResult = await workerResult(sender);
      expect(readWorkerPayload(senderResult)).toMatchObject({ ok: false, code: 'repository_read_only' });
      expectNoInboxArtifacts(value, MESSAGE_ONE);
    }), 30_000);

    test('rejects an active-sprint change captured between source resolution and the task lock', async () => withFixtureAsync(async (value) => {
      const gitReadyPath = join(value.home, 'initial-sprint-read');
      const gitReleasePath = join(value.home, 'release-initial-sprint-read');
      const bin = pausedGitBin(value, gitReadyPath, gitReleasePath);
      const sender = operatorMessageWorker(value, MESSAGE_ONE, { PATH: `${bin}:${process.env.PATH ?? ''}` });
      await waitFor(() => existsSync(gitReadyPath), 'initial canonical sprint read');
      writeFileSync(join(value.root, '.ai/harness/sprint/active-sprint'), 'plans/sprints/replacement.sprint.md\n');
      writeFileSync(gitReleasePath, 'release\n');

      const senderResult = await workerResult(sender);
      expect(readWorkerPayload(senderResult)).toMatchObject({ ok: false, code: 'canonical_source_stale' });
      expectNoInboxArtifacts(value, MESSAGE_ONE);
    }), 30_000);

    test('rejects a canonical target-ref change captured between source resolution and the task lock', async () => withFixtureAsync(async (value) => {
      const gitReadyPath = join(value.home, 'initial-sprint-read');
      const gitReleasePath = join(value.home, 'release-initial-sprint-read');
      const bin = pausedGitBin(value, gitReadyPath, gitReleasePath);
      const sender = operatorMessageWorker(value, MESSAGE_ONE, { PATH: `${bin}:${process.env.PATH ?? ''}` });
      await waitFor(() => existsSync(gitReadyPath), 'initial canonical sprint read');
      writeFileSync(join(value.root, '.ai/harness/policy.json'), JSON.stringify({
        worktree_strategy: { merge_back: { target: 'alternate' } },
      }));
      writeFileSync(gitReleasePath, 'release\n');

      const senderResult = await workerResult(sender);
      expect(readWorkerPayload(senderResult)).toMatchObject({ ok: false, code: 'canonical_source_stale' });
      expectNoInboxArtifacts(value, MESSAGE_ONE);
    }), 30_000);

    test('rejects a status change that lands after draft resolution and before locked publication', async () => withFixtureAsync(async (value) => {
      const gitReadyPath = join(value.home, 'initial-sprint-read');
      const gitReleasePath = join(value.home, 'release-initial-sprint-read');
      const bin = pausedGitBin(value, gitReadyPath, gitReleasePath);
      const sender = operatorMessageWorker(value, MESSAGE_ONE, { PATH: `${bin}:${process.env.PATH ?? ''}` });
      await waitFor(() => existsSync(gitReadyPath), 'initial canonical sprint read');

      writeFileSync(join(value.root, SPRINT_PATH), [
        '# Sprint: operator message', '', '> **Backlog Schema**: 2', '', '## Backlog', '',
        '| # | ID | Status | Task | Mode | Acceptance | Plan |',
        '|---|----|--------|------|------|------------|------|',
        `| 1 | ${fixtureTaskId(`${TASK_CELL}`)} | [x] | ${TASK_CELL} | contract | proves the fence | (pending) |`, '',
      ].join('\n'));
      git(value.root, 'add', SPRINT_PATH);
      git(value.root, 'commit', '-m', 'complete fixture task after draft');
      writeFileSync(gitReleasePath, 'release\n');

      const senderResult = await workerResult(sender);
      expect(readWorkerPayload(senderResult)).toMatchObject({ ok: false, code: 'task_not_pending' });
      expectNoInboxArtifacts(value, MESSAGE_ONE);
    }), 30_000);
  }
});
