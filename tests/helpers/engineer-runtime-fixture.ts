import { seedLeaseDirectory } from './sprint-fixture';
import { writeHistoricalLease } from './sprint-fixture';
import { boundLeaseFixture } from './sprint-fixture';
import { claimActorReceiptFixture, seedClaimActorReceipt } from './engineer-state-fixture';
import { execFileSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { buildTaskMessageEvent } from '../../src/core/fleet/task-message';
import { buildLeaseOwnerRecord, deriveTaskRevision } from '../../src/core/state/coordination-identity';
import { readEngineerBindingStatus } from '../../src/effects/engineers/binding-store';
import { loadEngineerProfile } from '../../src/effects/engineers/profile-store';
import { sendTaskMessage } from '../../src/effects/fleet/task-inbox';
import { readLease } from '../../src/effects/state/coordination-lease-store';
import { repoHarnessRepoIdFor } from '../../src/effects/repo-registry';
import { fixtureTaskId } from './sprint-fixture';

export function seedEngineerTaskMessage(repoRoot: string, engineerId: string, messageId: string, body = 'secret-message-body') {
  const sprintPath = 'plans/sprints/runtime.sprint.md';
  const taskCell = 'wake exact task owner';
  mkdirSync(join(repoRoot, 'plans/sprints'), { recursive: true });
  writeFileSync(join(repoRoot, sprintPath), ['# Sprint: runtime', '', '> **Status**: Executing', '> **Backlog Schema**: 2', '', '## Backlog', '', '| # | ID | Status | Task | Mode | Acceptance | Plan |', '|---|---|---|---|---|---|---|', `| 1 | ${fixtureTaskId(taskCell)} | [ ] | ${taskCell} | contract | exact receipt | (pending) |`, ''].join('\n'));
  execFileSync('git', ['add', sprintPath], { cwd: repoRoot });
  execFileSync('git', ['commit', '-qm', 'task authority'], { cwd: repoRoot });
  const taskId = fixtureTaskId(taskCell);
  const taskRevision = deriveTaskRevision({ taskCell, taskId, modeCell: 'contract', acceptanceCell: 'exact receipt' });
  const claimId = '44444444-4444-4444-8444-444444444444';
  const claimed = buildLeaseOwnerRecord({ claimId, taskId, taskRevision, sprintPath, targetRef: 'HEAD', generation: 1, sessionId: 'runtime-session', sourceWorktree: repoRoot });
  const bound = boundLeaseFixture(claimed, { executionWorktree: repoRoot, branch: 'codex/runtime', unitRef: 'plans/runtime.md' });
  seedLeaseDirectory(repoRoot, taskId);
  writeHistoricalLease(repoRoot, taskId, bound);
  const profile = loadEngineerProfile(repoRoot, engineerId);
  const binding = readEngineerBindingStatus(repoRoot, engineerId, profile.engineer_contract_revision).binding!;

  const envelope = { protocol: 1 as const, kind: 'repo-harness-work-envelope' as const, repo_id: repoHarnessRepoIdFor(repoRoot), task_id: taskId, task_revision: taskRevision, sprint_path: sprintPath, claim_id: claimId, generation: 1, worktree_path: repoRoot, branch: 'codex/runtime', unit_ref: 'plans/runtime.md', authorization_revision: 1 };
  seedClaimActorReceipt(repoRoot, claimActorReceiptFixture({ envelope, binding, session_id: 'runtime-session', bound_at: '2026-08-30T10:00:00.000Z' }));
  sendTaskMessage({ repo_root: repoRoot, canonical_source: { targetRef: 'HEAD', sprintPath }, event: buildTaskMessageEvent({ message_id: messageId, task_id: taskId, task_revision: taskRevision, scope: 'claim', target_claim_id: claimId, target_generation: 1, sender_kind: 'operator', sender_id: 'runtime-test', sender_trust: 'local_operator', audience: 'owner', body, created_at: '2026-08-30T10:01:00.000Z', in_reply_to: null }) });
  return { message_kind: 'task_message' as const, task_id: taskId, message_id: messageId,
    expected_task_revision: taskRevision, expected_claim_id: claimId, expected_lease_generation: 1 };
}

export function releaseEngineerTaskMessage(repoRoot: string, taskId: string): void {
  const lease = readLease(repoRoot, taskId).record;
  if (!lease) throw new Error('Task fixture lease is missing');
  writeHistoricalLease(repoRoot, taskId, { ...lease, state: 'released', ...('record_schema' in lease ? { current_publication: null } : {}) } as typeof lease);
}
