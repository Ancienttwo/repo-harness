import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync } from 'child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { projectBoard } from '../../src/core/state/project-board';
import { buildLeaseOwnerRecord } from '../../src/core/state/coordination-identity';
import type { BoardDocumentV1, BoardCardV1 } from '../../src/core/state/types';
import {
  collectRepoTaskOffers,
} from '../../src/effects/fleet/acquire';
import type {
  RepoHarnessRegisteredRepo,
  RepoHarnessRegistrySnapshot,
} from '../../src/effects/repo-registry';

import {
  classifyTaskOffer,
  taskOfferRevision,
  type ClassifyTaskOfferInput,
} from '../../src/core/fleet/task-offer';
import { proveCanonicalTaskPlan } from '../../src/effects/state/coordination-canonical-source';

const PLAN = {
  plan_path: 'plans/plan-20260823-0202-fleet-offer-acquire.md',
  contract_path: 'tasks/contracts/20260823-0202-fleet-offer-acquire.contract.md',
  source_ref: 'sprint:plans/sprints/fleet.sprint.md#build the fleet offer',
  plan_sha256: 'sha256:plan',
  contract_sha256: 'sha256:contract',
} as const;

function input(overrides: Partial<ClassifyTaskOfferInput> = {}): ClassifyTaskOfferInput {
  return {
    repo_access_mode: 'read_write',
    row_status: '[ ]',
    mode: 'contract',
    lease_state: 'available',
    snapshot_consistency: 'stable',
    plan: PLAN,
    ...overrides,
  };
}

describe('TaskOfferV1 closed classification', () => {
  test('execution_ready requires the complete contract path', () => {
    expect(classifyTaskOffer(input())).toEqual({
      execution_readiness: 'execution_ready',
      blockers: [],
    });
  });

  test('planning_required is distinct from unsupported when the exact plan is absent', () => {
    const result = classifyTaskOffer(input({ plan: null, plan_failure: 'missing' }));
    expect(result.execution_readiness).toBe('planning_required');
    expect(result.blockers).toEqual([{ code: 'plan_missing', attention_owner: 'agent' }]);
  });

  test('inline rows are visible but never require a contract plan', () => {
    expect(classifyTaskOffer(input({ mode: 'inline', plan: null }))).toEqual({
      execution_readiness: 'inline_ready',
      blockers: [],
    });
  });

  test('unsupported wins over planning when an authority is unavailable', () => {
    const result = classifyTaskOffer(input({
      repo_access_mode: 'read_only',
      plan: null,
      plan_failure: 'missing',
    }));
    expect(result.execution_readiness).toBe('unsupported');
    expect(result.blockers).toEqual([
      { code: 'repo_read_only', attention_owner: 'user' },
      { code: 'plan_missing', attention_owner: 'agent' },
    ]);
  });

  test('every non-pending lease and torn snapshot is closed', () => {
    const result = classifyTaskOffer(input({
      row_status: '[x]',
      lease_state: 'bound',
      snapshot_consistency: 'changed_during_read',
    }));
    expect(result.execution_readiness).toBe('unsupported');
    expect(result.blockers.map((blocker) => blocker.code)).toEqual([
      'snapshot_changed_during_read',
      'row_not_pending',
      'lease_unavailable',
    ]);
  });

  test('revision is deterministic and field-boundary safe', () => {
    expect(taskOfferRevision(['a', 'b', null])).toBe(taskOfferRevision(['a', 'b', null]));
    expect(taskOfferRevision(['a|b', 'c'])).not.toBe(taskOfferRevision(['a', 'b|c']));
  });

  test('plan proof requires the exact canonical Source Ref and projectable contract', () => {
    const sprintPath = 'plans/sprints/offers.sprint.md';
    const taskCell = 'execute one task';
    const planPath = 'plans/plan-20260823-0202-offer.md';
    const plan = [
      '# Plan: offer',
      '',
      '> **Status**: Approved',
      `> **Source Ref**: sprint:${sprintPath}#${taskCell}`,
      '> **Artifact Level**: work-package',
      '> **Promotion Reason**: verification_boundary',
      '> **Verification Boundary**: focused offer tests',
      '> **Rollback Surface**: revert offer unit',
      '> **Task Contract**: tasks/contracts/offer.contract.md',
      '',
      '## Promotion Gate',
      '- **Merge/PR unit**: offer unit',
      '- **Rollback surface**: revert offer unit',
      '- **Verification boundary**: focused offer tests',
      '- **Review/acceptance boundary**: unit review',
      '- **High-risk surface**: authority joins',
      '- **Why not checklist row**: independent verification boundary',
      '',
      '## Evidence Contract',
      '- **State/progress path**: plan and contract',
      '- **Verification evidence**: focused tests',
      '- **Evaluator rubric**: review file',
      '- **Stop condition**: tests pass',
      '- **Rollback surface**: revert offer unit',
      '',
    ].join('\n');
    const contract = [
      '# Task Contract: offer',
      '',
      `> **Plan**: ${planPath}`,
      '',
      '## Allowed Paths',
      '```yaml',
      'allowed_paths:',
      '  - src/core/fleet/task-offer.ts',
      '```',
    ].join('\n');
    const proof = proveCanonicalTaskPlan({
      sprintPath,
      taskCell,
      planPath,
      planText: plan,
      contractText: contract,
    });
    expect(proof.ok).toBe(true);
    if (proof.ok) {
      expect(proof.proof.source_ref).toBe(`sprint:${sprintPath}#${taskCell}`);
      expect(proof.proof.projectable).toBe(true);
    }
    const mismatched = proveCanonicalTaskPlan({
      sprintPath,
      taskCell: 'other task',
      planPath,
      planText: plan,
      contractText: contract,
    });
    expect(mismatched).toMatchObject({ ok: false, code: 'plan_source_mismatch' });
  });
});

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


test('exact-task offer read preserves original row order and skips unrelated plan resolution',()=>{
  const target=fixtureRepo('repo-scope','read_write');
  const seen:string[]=[];
  const result=collectRepoTaskOffers(target,registry([target]),{task_id:'task-b',board_reader:()=>board([card('task-a','1','other task','contract'),card('task-b','7','execute one task','contract')]),plan_reader:(_cwd,input)=>{seen.push(input.taskCell);return {ok:true,proof:PLAN_PROOF};}});
  expect(seen).toEqual(['execute one task']);expect(result?.offers.map(o=>[o.task_id,o.row_order])).toEqual([['task-b',7]]);
});


test('Lease authority and read consistency block Fleet offers', () => {
  const target = fixtureRepo('repo-liveness', 'read_write');
  const base = card('task-a', '1', 'execute one task', 'contract');
  const owner = buildLeaseOwnerRecord({ claimId: 'claim-liveness', taskId: base.task_id,
    taskRevision: base.task_revision, sprintPath: SPRINT_PATH, targetRef: 'main', generation: 1,
    sessionId: 'session-liveness', sourceWorktree: target.path });
  const read = (at: number, lease: 'available' | 'reserving' | 'unknown' = 'reserving', consistency: 'stable' | 'changed_during_read' = 'stable') =>
    collectRepoTaskOffers(target, registry([target]), { now_ms: at,
      board_reader: () => {
        const projected = projectBoard({ canonical_target: board([]).canonical_target, sprint_path: SPRINT_PATH,
          revisions: board([]).revisions, tasks: [{ task_id: base.task_id, task_revision: base.task_revision,
            row: { index: '1', status: '[ ]', task: base.task, mode: 'contract', acceptance: base.acceptance, plan: '(pending)' },
            lease: { classification: lease, record: lease === 'reserving' ? owner : null, unknown_reason: lease === 'unknown' ? 'owner_record_unreadable' : null },
            evidence: null,
          }] });
        return { ...projected, snapshot_consistency: consistency };
      }, plan_reader: () => ({ ok: true, proof: PLAN_PROOF }) });
  const t1 = Date.parse('2026-09-04T00:00:00.999Z');
  const t2 = Date.parse('2026-09-04T00:00:01.000Z');
  const reserved = read(t1)!.offers[0]!;
  expect(reserved.execution_readiness).toBe('unsupported');
  expect(reserved.blockers.map(value => value.code)).toEqual(['lease_unavailable']);
  expect(read(t2, 'available')!.offers[0]).toMatchObject({ execution_readiness: 'execution_ready', blockers: [] });
  expect(read(t1, 'unknown')!.offers[0]!.blockers.map(value => value.code)).toEqual(['lease_unknown']);
  expect(read(t2, 'available', 'changed_during_read')!.offers[0]!.blockers.map(value => value.code)).toEqual(['snapshot_changed_during_read']);
});
