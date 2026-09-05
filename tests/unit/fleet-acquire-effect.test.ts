import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync } from 'child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { BoardDocumentV1, BoardCardV1 } from '../../src/core/state/types';
import {
  collectFleetOffers,
} from '../../src/effects/fleet/acquire';
import type {
  RepoHarnessRegisteredRepo,
  RepoHarnessRegistrySnapshot,
} from '../../src/effects/repo-registry';
import type { CanonicalTaskPlanProofResult } from '../../src/effects/state/coordination-canonical-source';

const SPRINT_PATH = 'plans/sprints/offers.sprint.md';
const PLAN_PROOF = {
  plan_path: 'plans/plan-20260823-0202-offer.md',
  contract_path: 'tasks/contracts/20260823-0202-offer.contract.md',
  source_ref: `sprint:${SPRINT_PATH}#execute one task`,
  plan_sha256: 'sha256:plan',
  contract_sha256: 'sha256:contract',
  projectable: true as const,
};

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function repo(root: string, id: string, accessMode: 'read_only' | 'read_write'): RepoHarnessRegisteredRepo {
  return {
    id,
    path: root,
    accessMode,
    source: 'manual',
    registeredAt: '2026-08-23T00:00:00.000Z',
    lastSeenAt: '2026-08-23T00:00:00.000Z',
  };
}

function card(taskId: string, rowIndex: string, task: string, mode: string, taskState: 'pending' | 'done' = 'pending'): BoardCardV1 {
  return {
    task_id: taskId,
    task_revision: `${taskId}-revision`,
    row_index: rowIndex,
    task,
    mode,
    acceptance: 'green',
    plan: '(pending)',
    column: taskState === 'done' ? 'done' : 'todo',
    task_state: taskState,
    lease_state: 'available',
    progress_state: 'not_observed',
    claim: null,
    diagnostics: {
      definition_drift: false,
      target_ref_mismatch: false,
      worktree_missing: false,
      orphan_reclaimable: false,
      lease_cleanup_required: false,
      lease_unknown_reason: null,
      progress_unreadable_reason: null,
    },
    actions: {
      release: null,
      steal: null,
      reconcile: null,
      publication_reconcile: null,
      publication_recover: null,
      publication_reopen: null,
      publication_takeover: null,
      publication_abandon: null,
    },
  };
}

function board(cards: readonly BoardCardV1[], consistency: 'stable' | 'changed_during_read' = 'stable'): BoardDocumentV1 {
  return {
    protocol: 1,
    kind: 'repo-harness-board',
    canonical_target: { ref: 'main', oid: 'a'.repeat(40) },
    sprint_path: SPRINT_PATH,
    revisions: {
      task_authority: 'sha256:task',
      coordination: 'sha256:coordination',
      topology: 'sha256:topology',
      evidence: 'sha256:evidence',
      board: 'sha256:board',
    },
    snapshot_consistency: consistency,
    cards,
  };
}

function fixtureRepo(id: string, accessMode: 'read_only' | 'read_write'): RepoHarnessRegisteredRepo {
  const root = mkdtempSync(join(tmpdir(), 'fleet-offer-effect-'));
  roots.push(root);
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root });
  execFileSync('git', ['-c', 'user.name=Fleet fixture', '-c', 'user.email=fleet@example.test', 'commit', '--allow-empty', '-qm', 'seed noncampaign repository'], { cwd: root });
  mkdirSync(join(root, '.ai', 'harness', 'sprint'), { recursive: true });
  writeFileSync(join(root, '.ai', 'harness', 'sprint', 'active-sprint'), `${SPRINT_PATH}\n`);
  writeFileSync(join(root, '.ai', 'harness', 'policy.json'), JSON.stringify({
    worktree_strategy: { merge_back: { target: 'main' } },
  }));
  return repo(root, id, accessMode);
}

function registry(repos: readonly RepoHarnessRegisteredRepo[]): RepoHarnessRegistrySnapshot {
  return {
    registryPath: '/tmp/registry.json',
    authorizationRevision: 7,
    repos,
  };
}

describe('fleet offer read effect', () => {
  test('joins one atomic registry fence and preserves canonical row order', () => {
    const first = fixtureRepo('repo-b', 'read_write');
    const second = fixtureRepo('repo-a', 'read_write');
    const fakeBoard = (_cwd: string): BoardDocumentV1 => board([
      card('task-a', '1', 'execute one task', 'contract'),
      card('task-b', '2', 'write inline docs', 'inline'),
      card('task-c', '3', 'completed task', 'contract', 'done'),
    ]);
    const proof = (_cwd: string, input: { readonly sprintPath: string; readonly taskCell: string }): CanonicalTaskPlanProofResult => (
      input.taskCell === 'execute one task'
        ? { ok: true, proof: PLAN_PROOF }
        : { ok: false, code: 'plan_missing', error: 'missing', candidates: [] }
    );

    const result = collectFleetOffers({
      registry_snapshot: registry([first, second]),
      board_reader: fakeBoard as typeof import('../../src/effects/state/resolve-board').resolveBoard,
      plan_reader: proof as typeof import('../../src/effects/state/coordination-canonical-source').readCanonicalTaskPlanProof,
    });

    expect(result.authorization_revision).toBe(7);
    expect(result.snapshot_consistency).toBe('stable');
    expect(result.offers.map((offer) => `${offer.repo_id}:${offer.row_order}`)).toEqual([
      'repo-a:1', 'repo-a:2', 'repo-a:3', 'repo-b:1', 'repo-b:2', 'repo-b:3',
    ]);
    expect(result.offers.filter((offer) => offer.task_id === 'task-a')[0]?.execution_readiness)
      .toBe('execution_ready');
    expect(result.offers.filter((offer) => offer.task_id === 'task-b')[0]?.execution_readiness)
      .toBe('inline_ready');
    expect(result.offers.filter((offer) => offer.task_id === 'task-c')[0]?.execution_readiness)
      .toBe('unsupported');
  });

  test('read-only and changed snapshots never become executable', () => {
    const readOnly = fixtureRepo('repo-ro', 'read_only');
    const result = collectFleetOffers({
      registry_snapshot: registry([readOnly]),
      board_reader: (() => board([card('task-a', '1', 'execute one task', 'contract')], 'changed_during_read')) as typeof import('../../src/effects/state/resolve-board').resolveBoard,
      plan_reader: (() => ({ ok: true, proof: PLAN_PROOF })) as typeof import('../../src/effects/state/coordination-canonical-source').readCanonicalTaskPlanProof,
    });
    expect(result.snapshot_consistency).toBe('changed_during_read');
    expect(result.offers[0]?.execution_readiness).toBe('unsupported');
    expect(result.offers[0]?.blockers.map((blocker) => blocker.code)).toEqual([
      'repo_read_only',
      'snapshot_changed_during_read',
    ]);
  });
});
