import { execFileSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { buildClaimActorReceipt, validateEngineerPrincipal } from '../../src/core/engineers/principal-claim';
import { buildTaskMessageEvent } from '../../src/core/fleet/task-message';
import { bindLeaseRecord, buildLeaseOwnerRecord, deriveTaskRevision, releaseLeaseRecord } from '../../src/core/state/coordination-identity';
import { readEngineerBindingStatus } from '../../src/effects/engineers/binding-store';
import { loadEngineerProfile } from '../../src/effects/engineers/profile-store';
import { publishClaimActorReceipt } from '../../src/effects/engineers/claim-actor-store';
import { sendTaskMessage } from '../../src/effects/fleet/task-inbox';
import { createLeaseDirectory, readLease, writeLeaseOwnerDurably } from '../../src/effects/state/coordination-lease-store';
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
  const bound = bindLeaseRecord(claimed, { claimId, executionWorktree: repoRoot, branch: 'codex/runtime', unitRef: 'plans/runtime.md' });
  if (!bound.ok) throw new Error(bound.error);
  createLeaseDirectory(repoRoot, taskId);
  writeLeaseOwnerDurably(repoRoot, taskId, bound.record);
  const profile = loadEngineerProfile(repoRoot, engineerId);
  const binding = readEngineerBindingStatus(repoRoot, engineerId, profile.engineer_contract_revision).binding!;
  const principal = validateEngineerPrincipal({ protocol: 1, kind: 'repo-harness-engineer-principal', repository_id: repoHarnessRepoIdFor(repoRoot), engineer_id: engineerId, binding_id: binding.binding_id, binding_generation: binding.binding_generation, engineer_contract_revision: binding.engineer_contract_revision, carrier: 'mcp_oauth', auth_subject: '55555555-5555-4555-8555-555555555555', provider: binding.provider, provider_thread_id: binding.provider_thread_id });
  const envelope = { protocol: 1 as const, kind: 'repo-harness-work-envelope' as const, repo_id: repoHarnessRepoIdFor(repoRoot), task_id: taskId, task_revision: taskRevision, sprint_path: sprintPath, claim_id: claimId, generation: 1, worktree_path: repoRoot, branch: 'codex/runtime', unit_ref: 'plans/runtime.md', authorization_revision: 1 };
  publishClaimActorReceipt(repoRoot, buildClaimActorReceipt({ envelope, principal, session_id: 'runtime-session', bound_at: '2026-08-30T10:00:00.000Z' }));
  sendTaskMessage({ repo_root: repoRoot, canonical_source: { targetRef: 'HEAD', sprintPath }, event: buildTaskMessageEvent({ message_id: messageId, task_id: taskId, task_revision: taskRevision, scope: 'claim', target_claim_id: claimId, target_generation: 1, sender_kind: 'operator', sender_id: 'runtime-test', sender_trust: 'local_operator', audience: 'owner', body, created_at: '2026-08-30T10:01:00.000Z', in_reply_to: null }) });
  return { message_kind: 'task_message' as const, task_id: taskId, message_id: messageId,
    expected_task_revision: taskRevision, expected_claim_id: claimId, expected_lease_generation: 1 };
}

export function releaseEngineerTaskMessage(repoRoot: string, taskId: string): void {
  const lease = readLease(repoRoot, taskId).record;
  if (!lease) throw new Error('Task fixture lease is missing');
  const released = releaseLeaseRecord(lease, lease.claim_id);
  if (!released.ok) throw new Error(released.error);
  writeLeaseOwnerDurably(repoRoot, taskId, released.record);
}
