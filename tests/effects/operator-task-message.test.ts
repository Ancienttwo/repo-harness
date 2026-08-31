import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { deriveTaskId, deriveTaskRevision, buildLeaseOwnerRecord, bindLeaseRecord } from '../../src/core/state/coordination-identity';
import { repoHarnessRepoIdFor } from '../../src/effects/repo-registry';
import { sendOperatorTaskMessage, OperatorTaskMessageError } from '../../src/effects/fleet/task-message-request';
import { createLeaseDirectory, writeLeaseOwnerDurably } from '../../src/effects/state/coordination-lease-store';
import { taskInboxEventPath } from '../../src/effects/fleet/task-inbox';
import { resolveRepoIdentity } from '../../src/effects/state/coordination-canonical-source';

const SPRINT_PATH = 'plans/sprints/operator-message.sprint.md';
const TASK_CELL = 'send a fenced operator message';
const CLAIM_ONE = '123e4567-e89b-42d3-a456-426614174001';
const CLAIM_TWO = '123e4567-e89b-42d3-a456-426614174002';
const MESSAGE_ONE = '123e4567-e89b-42d3-a456-426614174010';
const MESSAGE_TWO = '123e4567-e89b-42d3-a456-426614174011';

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
    '# Sprint: operator message', '', '## Backlog', '',
    '| # | Status | Task | Mode | Acceptance | Plan |',
    '|---|--------|------|------|------------|------|',
    `| 1 | [ ] | ${TASK_CELL} | contract | proves the fence | (pending) |`, '',
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

  const taskId = deriveTaskId({
    repoIdentity: resolveRepoIdentity(root),
    sprintPath: SPRINT_PATH,
    taskCell: TASK_CELL,
  });
  const taskRevision = deriveTaskRevision({
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

describe('operator task-message effect fence', () => {
  test('rejects a stale task revision before creating an event', () => withFixture((value) => {
    expect(() => sendOperatorTaskMessage(input(value, MESSAGE_ONE, 'task', {
      expected_task_revision: '0'.repeat(64),
    }))).toThrow(OperatorTaskMessageError);
    try {
      sendOperatorTaskMessage(input(value, MESSAGE_ONE, 'task', { expected_task_revision: '0'.repeat(64) }));
    } catch (error) {
      expect((error as OperatorTaskMessageError).code).toBe('task_revision_mismatch');
    }
    expect(() => readFileSync(taskInboxEventPath(value.root, value.taskId, MESSAGE_ONE))).toThrow();
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
    expect(() => sendOperatorTaskMessage(input(value, MESSAGE_TWO, 'claim'))).toThrow(OperatorTaskMessageError);
    try {
      sendOperatorTaskMessage(input(value, MESSAGE_TWO, 'claim'));
    } catch (error) {
      expect((error as OperatorTaskMessageError).code).toBe('claim_mismatch');
    }
    expect(() => readFileSync(taskInboxEventPath(value.root, value.taskId, MESSAGE_TWO))).toThrow();
  }));
});
