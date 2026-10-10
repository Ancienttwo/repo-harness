import { createHash } from 'crypto';
import { existsSync, readFileSync, realpathSync } from 'fs';
import { join, relative } from 'path';
import { PM_OPERATION_SCHEMAS, PM_WORKER_ROLE, PmError, parsePmRequest, type PmTaskScope } from '../../core/pm/protocol';
import { collectRepoTaskOffers } from '../fleet/acquire';
import { canonicalRepoPath, isRepoHarnessAdoptedPath, readRepoHarnessRegistryStrictSnapshot, repoHarnessRepoIdFor, withRepoHarnessRegistryAuthorizationLockAsync } from '../repo-registry';
import { readLease, withTaskLockAsync } from '../state/coordination-lease-store';
import { withWorktreeTopologyLockAsync } from '../state/coordination-worktree-topology';
import { readClaimTokenForTask } from '../state/coordination-claim-token';
import { readWorktreeTopology } from '../git/worktree-topology';
import { assertCodingTaskAgent, sendCodingTaskRequest, startCodingTaskAgent } from '../terminal/coding-session';
import { assertTaskRequest, collectTaskResult, ensureSessionDirectory, readSessionArtifact, readTaskAgent,
  readTaskRequestResult, taskAgentStatus, writeSessionArtifact, type TaskRequest } from '../terminal/task-session';
import { taskRepository } from '../terminal/task-worktree';
import { PM_ADMISSION_REMEDIATION, readPmHostConfiguration, type PmHostConfiguration } from './host';

/** Synchronous trusted caller fence. Never parsed from the PM wire request. */
export type PmExecutionGuard = () => void;

function registeredRepository(repoId: string, env: NodeJS.ProcessEnv) {
  const registry = readRepoHarnessRegistryStrictSnapshot({ env, adoptedOnly: false });
  const repo = registry.repos.find(entry => entry.id === repoId);
  if (!repo || !isRepoHarnessAdoptedPath(repo.path) || canonicalRepoPath(repo.path) !== repo.path || repoHarnessRepoIdFor(repo.path) !== repo.id) throw new PmError('pm_repo_unavailable');
  return { registry, repo };
}

/** No request path reaches Git or the filesystem. These paths come from the lease. */
function taskAuthority(scope: PmTaskScope, env: NodeJS.ProcessEnv, write: boolean, offerRevision?: string) {
  const { registry, repo } = registeredRepository(scope.repo_id, env);
  if (scope.authorization_revision !== registry.authorizationRevision) throw new PmError('pm_authorization_stale');
  // Collect ingests evidence into primary state. It also needs write access.
  if (repo.accessMode !== 'read_write') throw new PmError('pm_scope_not_approved');
  const offer = collectRepoTaskOffers(repo, registry, { task_id: scope.task_id })?.offers.find(item => item.task_id === scope.task_id);
  if (!offer || offer.snapshot_consistency !== 'stable' || offer.task_revision !== scope.task_revision
    || (offerRevision !== undefined && offer.offer_revision !== offerRevision)) throw new PmError('pm_task_stale');
  const lease = readLease(repo.path, scope.task_id);
  const claim = lease.record;
  if (lease.classification === 'available') throw new PmError('pm_acquisition_not_admitted', PM_ADMISSION_REMEDIATION);
  if (!claim || lease.classification !== 'bound' || claim.state !== 'bound'
    || claim.claim_id !== scope.claim_id || claim.generation !== scope.generation || claim.task_revision !== scope.task_revision
    || claim.sprint_path !== offer.sprint_path || claim.target_ref !== offer.canonical_target?.ref
    || !claim.execution_worktree || !claim.branch || !claim.unit_ref) throw new PmError('pm_claim_stale');
  if (write && (!offer.plan || offer.plan.plan_path !== claim.unit_ref
    || offer.blockers.some(blocker => blocker.code !== 'lease_unavailable'))) throw new PmError('pm_scope_not_approved');
  const executionRoot = realpathSync(claim.execution_worktree);
  const topology = readWorktreeTopology(repo.path);
  if (executionRoot !== claim.execution_worktree || !topology.worktrees.some(entry => canonicalRepoPath(entry.path) === executionRoot
    && entry.branch === `refs/heads/${claim.branch}`)) throw new PmError('pm_worktree_stale');
  const repository = taskRepository(executionRoot);
  if (repository.primary_root !== repo.path || executionRoot === repository.primary_root) throw new PmError('pm_worktree_stale');
  const token = readClaimTokenForTask(executionRoot, scope.task_id);
  if (token.outcome !== 'found' || token.token.claim_id !== claim.claim_id || token.token.task_id !== claim.task_id
    || token.token.sprint !== claim.sprint_path || token.token.unit_ref !== claim.unit_ref) throw new PmError('pm_claim_token_stale');
  return { repo, registry, offer, claim, executionRoot };
}

/** Bind, cleanup, lease changes and authorization changes use these same locks. */
export async function withPmTaskAuthority<T>(scope: PmTaskScope, env: NodeJS.ProcessEnv, write: boolean,
  action: (authority: ReturnType<typeof taskAuthority>) => Promise<T>, offerRevision?: string, guard?: PmExecutionGuard): Promise<T> {
  guard?.();
  const { repo } = registeredRepository(scope.repo_id, env);
  return withWorktreeTopologyLockAsync(repo.path, () => {
    guard?.();
    return withTaskLockAsync(repo.path, scope.task_id, () => {
      guard?.();
      return withRepoHarnessRegistryAuthorizationLockAsync({ env }, async () => {
        guard?.();
        const authority = taskAuthority(scope, env, write, offerRevision);
        guard?.();
        return await action(authority);
      });
    });
  });
}

function admittedHost(authority: ReturnType<typeof taskAuthority>, env: NodeJS.ProcessEnv): PmHostConfiguration {
  const host = readPmHostConfiguration(env);
  if (host.admission.execution_root !== authority.executionRoot) throw new PmError('pm_acquisition_not_admitted', PM_ADMISSION_REMEDIATION);
  return host;
}

function existingRequest(repo: string, root: string, task: string, round: number, requestId: string): TaskRequest {
  const { dir, binding } = readTaskAgent(repo, task, PM_WORKER_ROLE);
  if (binding.execution_root !== root) throw new PmError('pm_worktree_stale');
  const request = readSessionArtifact<TaskRequest>(join(dir, `request-${round}.json`));
  if (request.request_id !== requestId || request.round !== round || request.task !== task || request.role !== PM_WORKER_ROLE) throw new PmError('pm_request_stale');
  assertTaskRequest(repo, dir, request);
  return request;
}

function inputProjection(root: string, input: unknown) {
  const bytes = `${JSON.stringify(input, null, 2)}\n`;
  const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  const directory = join(root, '.ai/harness/runs/pm-input');
  const path = join(directory, `${digest.slice(7)}.json`);
  return { path, digest, directory, input, bytes };
}

function publishInput(root: string, source: ReturnType<typeof inputProjection>) {
  const { path, directory, bytes, input } = source;
  ensureSessionDirectory(root, directory);
  if (existsSync(path)) {
    if (`${JSON.stringify(readSessionArtifact(path), null, 2)}\n` !== bytes) throw new PmError('pm_input_conflict');
  } else {
    try { writeSessionArtifact(path, input); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST'
        || readFileSync(path, 'utf8') !== bytes) throw error;
    }
  }
}

function sameInputRequest(root: string, task: string, source: { path: string; digest: string }): TaskRequest | null {
  const { dir, binding } = readTaskAgent(root, task, PM_WORKER_ROLE);
  for (let round = 1; round <= binding.max_requests && existsSync(join(dir, `request-${round}.json`)); round++) {
    const request = readSessionArtifact<TaskRequest>(join(dir, `request-${round}.json`));
    if (request.source_ref === source.path && request.context_sha256 === source.digest) {
      assertTaskRequest(root, dir, request);
      return request;
    }
  }
  return null;
}

async function deliver(root: string, task: string, source: ReturnType<typeof inputProjection>, guard: PmExecutionGuard) {
  guard();
  const previous = sameInputRequest(root, task, source);
  if (previous) return deliveryReceipt(root, previous);
  publishInput(root, source);
  try {
    const request = await sendCodingTaskRequest(root, task, PM_WORKER_ROLE, relative(root, source.path), 'changed_only', guard);
    guard();
    return deliveryReceipt(root, request);
  }
  catch (error) {
    guard();
    // The canonical request is the retry receipt, including unknown delivery.
    const written = sameInputRequest(root, task, source);
    if (written) return deliveryReceipt(root, written);
    throw error;
  }
}

function deliveryReceipt(root: string, request: TaskRequest) {
  const { dir } = readTaskAgent(root, request.task, PM_WORKER_ROLE);
  const path = join(dir, `delivery-${request.round}.json`);
  const marker = existsSync(path) ? readSessionArtifact<{ request_id: string; state: string }>(path) : null;
  return { request, delivery: marker?.request_id === request.request_id && marker.state === 'accepted' ? 'accepted' : 'unknown' };
}

export async function executePmRequest(value: unknown, env: NodeJS.ProcessEnv = process.env, trustedGuard?: PmExecutionGuard): Promise<unknown> {
  const request = parsePmRequest(value);
  trustedGuard?.();
  if (request.operation === 'capabilities') {
    let runtime: { available: boolean; reason?: string };
    try { readPmHostConfiguration(env); runtime = { available: true }; }
    catch (error) { runtime = { available: false, reason: error instanceof Error ? error.message : String(error) }; }
    return { operations: PM_OPERATION_SCHEMAS, worker_role: PM_WORKER_ROLE, runtime, restriction: 'model-tool-boundary',
      dispatch_scope: 'operator-approved-canonical-bound-linked-worktree', provider_acceptance: 'unverified', acquisition: 'unavailable', remediation: PM_ADMISSION_REMEDIATION };
  }
  if (request.operation === 'status') {
    const { repo, registry } = registeredRepository(request.repo_id, env);
    const offers = collectRepoTaskOffers(repo, registry)?.offers ?? [];
    return { authorization_revision: registry.authorizationRevision, tasks: offers.map(offer => {
      const claim = readLease(repo.path, offer.task_id).record;
      return { offer, claim: claim ? { claim_id: claim.claim_id, generation: claim.generation, task_revision: claim.task_revision, state: claim.state } : null,
        worker: taskAgentStatus(repo.path, offer.task_id, PM_WORKER_ROLE) };
    }) };
  }
  const write = request.operation !== 'collect';
  const guard = () => {
    trustedGuard?.();
    taskAuthority(request, env, write, request.operation === 'dispatch' ? request.offer_revision : undefined);
  };
  return withPmTaskAuthority(request, env, write, async authority => {
    if (request.operation === 'collect') {
      const canonical = existingRequest(authority.repo.path, authority.executionRoot, request.task_id, request.round, request.request_id);
      const result = await collectTaskResult(authority.repo.path, request.task_id, PM_WORKER_ROLE, canonical.round, guard);
      guard();
      return { request: canonical, status: result === null ? 'pending' : 'collected', result };
    }
    const host = admittedHost(authority, env);
    if (request.operation === 'dispatch') {
      await startCodingTaskAgent(authority.executionRoot, { task: request.task_id, role: PM_WORKER_ROLE, harness_kind: 'codex',
        endpoint: host.endpoint, parent_pane: host.parent_pane, args: [], max_requests: host.max_requests }, host.admission, guard);
      guard();
      const source = inputProjection(authority.executionRoot, { operation: 'dispatch', task_id: request.task_id, claim_id: request.claim_id,
        task_revision: request.task_revision, plan: authority.offer.plan });
      const { dir } = readTaskAgent(authority.repo.path, request.task_id, PM_WORKER_ROLE);
      if (existsSync(join(dir, 'request-1.json')) && !sameInputRequest(authority.executionRoot, request.task_id, source)) {
        throw new PmError('pm_request_stale', 'Dispatch has a request. Use a same-task follow-up after its result is valid.');
      }
      return await deliver(authority.executionRoot, request.task_id, source, guard);
    }
    assertCodingTaskAgent(authority.executionRoot, request.task_id, PM_WORKER_ROLE, host.admission);
    const previous = existingRequest(authority.repo.path, authority.executionRoot, request.task_id, request.round, request.request_id);
    const { dir, binding } = readTaskAgent(authority.repo.path, request.task_id, PM_WORKER_ROLE);
    if (binding.execution_root !== authority.executionRoot) throw new PmError('pm_worktree_stale');
    const source = inputProjection(authority.executionRoot, { operation: 'follow-up', task_id: request.task_id, claim_id: request.claim_id,
      task_revision: request.task_revision, previous_request_id: previous.request_id, previous_round: previous.round, message: request.message });
    const duplicate = sameInputRequest(authority.executionRoot, request.task_id, source);
    if (duplicate) return deliveryReceipt(authority.executionRoot, duplicate);
    if (existsSync(join(dir, `request-${previous.round + 1}.json`))) throw new PmError('pm_request_stale');
    if (readTaskRequestResult(authority.repo.path, dir, previous) === null) throw new PmError('pm_result_pending');
    taskAuthority(request, env, true);
    return await deliver(authority.executionRoot, request.task_id, source, guard);
  }, request.operation === 'dispatch' ? request.offer_revision : undefined, trustedGuard);
}
