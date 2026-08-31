import {
  buildExternalSourceBindingReceipt,
  renderExternalSourceUntrustedContext,
  type ExternalSourceBindingProjectionV1,
  type ExternalSourceBindingReceiptV1,
} from '../../core/external-sources/binding';
import { lookupCanonicalTask, PENDING_ROW_STATUS } from '../../core/state/coordination-identity';
import {
  readRepoHarnessRegistryStrictSnapshot,
  type RepoHarnessRegisteredRepo,
  type RepoHarnessRegistryStrictSnapshot,
} from '../repo-registry';
import {
  readCanonicalSprint,
  readCanonicalTaskPlanProof,
  resolveRepoIdentity,
  type CanonicalTaskPlanProofResult,
} from '../state/coordination-canonical-source';
import {
  listExternalSourceBindingReceipts,
  listProviderIssueObservations,
  writeExternalSourceBindingReceipt,
} from './store';

export interface BindExternalSourceInput {
  readonly registered_repository_id: string;
  readonly source_revision: string;
  readonly sprint_path: string;
  readonly task_id: string;
  readonly target_ref: string;
  readonly bound_at?: string;
  readonly env?: NodeJS.ProcessEnv;
}

export interface ExternalSourceBindingDependencies {
  readonly registry: (env?: NodeJS.ProcessEnv) => RepoHarnessRegistryStrictSnapshot;
  readonly observations: typeof listProviderIssueObservations;
  readonly receipts: typeof listExternalSourceBindingReceipts;
  readonly canonical: typeof readCanonicalSprint;
  readonly plan: typeof readCanonicalTaskPlanProof;
  readonly repoIdentity: typeof resolveRepoIdentity;
  readonly write: typeof writeExternalSourceBindingReceipt;
}

function dependencies(overrides: Partial<ExternalSourceBindingDependencies> = {}): ExternalSourceBindingDependencies {
  return {
    registry: (env) => readRepoHarnessRegistryStrictSnapshot({ env }),
    observations: listProviderIssueObservations,
    receipts: listExternalSourceBindingReceipts,
    canonical: readCanonicalSprint,
    plan: readCanonicalTaskPlanProof,
    repoIdentity: resolveRepoIdentity,
    write: writeExternalSourceBindingReceipt,
    ...overrides,
  };
}

function writableRepo(snapshot: RepoHarnessRegistryStrictSnapshot, id: string, expectedPath?: string): RepoHarnessRegisteredRepo {
  const repo = snapshot.repos.find((candidate) => candidate.id === id);
  if (!repo) throw new Error(`registered repository is unknown: ${id}`);
  if (repo.accessMode !== 'read_write') throw new Error(`registered repository is not write-authorized: ${id}`);
  if (expectedPath !== undefined && repo.path !== expectedPath) throw new Error(`registered repository path changed: ${id}`);
  return repo;
}

function sourceObservation(repoRoot: string, repositoryId: string, sourceRevision: string, deps: ExternalSourceBindingDependencies) {
  const matches = deps.observations(repoRoot).filter((observation) => (
    observation.registered_repository_id === repositoryId && observation.source_revision === sourceRevision
  ));
  if (matches.length !== 1) throw new Error(`expected exactly one immutable observation for source revision ${sourceRevision}, found ${matches.length}`);
  if (!matches[0].eligible) throw new Error(`source revision is not eligible under policy ${matches[0].policy_revision}`);
  return matches[0];
}

function exactPlan(proof: CanonicalTaskPlanProofResult) {
  if (!proof.ok) throw new Error(`canonical task plan/contract is not projectable: ${proof.error}`);
  return proof.proof;
}

function resolveBindingAuthority(input: BindExternalSourceInput, repo: RepoHarnessRegisteredRepo, deps: ExternalSourceBindingDependencies) {
  const observation = sourceObservation(repo.path, repo.id, input.source_revision, deps);
  const canonical = deps.canonical(repo.path, { targetRef: input.target_ref, sprintPath: input.sprint_path });
  if (!canonical.ok) throw new Error(canonical.error);
  const task = lookupCanonicalTask({ repoIdentity: deps.repoIdentity(repo.path), sprintPath: input.sprint_path, sprintText: canonical.text }, input.task_id);
  if (!task.ok) throw new Error(task.error);
  if (task.task.row.status !== PENDING_ROW_STATUS) throw new Error(`canonical task ${input.task_id} is not pending`);
  const proof = exactPlan(deps.plan(repo.path, { sprintPath: input.sprint_path, taskCell: task.task.row.task }));
  return Object.freeze({ observation, canonical, task: task.task, proof });
}

export function bindExternalSource(
  input: BindExternalSourceInput,
  overrides: Partial<ExternalSourceBindingDependencies> = {},
): ExternalSourceBindingReceiptV1 {
  const deps = dependencies(overrides);
  const initialRegistry = deps.registry(input.env);
  const repo = writableRepo(initialRegistry, input.registered_repository_id);
  const authority = resolveBindingAuthority(input, repo, deps);

  const currentRegistry = deps.registry(input.env);
  writableRepo(currentRegistry, repo.id, repo.path);
  if (currentRegistry.authorizationRevision !== initialRegistry.authorizationRevision) throw new Error('registry authorization changed before binding persistence');
  const current = resolveBindingAuthority(input, repo, deps);
  if (current.observation.observation_sha256 !== authority.observation.observation_sha256
    || current.canonical.commit !== authority.canonical.commit
    || current.task.task_revision !== authority.task.task_revision
    || current.proof.plan_sha256 !== authority.proof.plan_sha256
    || current.proof.contract_sha256 !== authority.proof.contract_sha256) {
    throw new Error('binding authority changed during revalidation');
  }

  return deps.write(repo.path, buildExternalSourceBindingReceipt({
    registered_repository_id: repo.id,
    authorization_revision: currentRegistry.authorizationRevision,
    provider: current.observation.provider,
    provider_repository_id: current.observation.provider_repository_id,
    provider_issue_id: current.observation.provider_issue_id,
    source_revision: current.observation.source_revision,
    observation_sha256: current.observation.observation_sha256,
    canonical_target_ref: input.target_ref,
    canonical_target_commit: current.canonical.commit,
    sprint_path: input.sprint_path,
    task_id: current.task.task_id,
    task_revision: current.task.task_revision,
    task_ref: current.task.row.task,
    plan_path: current.proof.plan_path,
    plan_sha256: current.proof.plan_sha256,
    contract_path: current.proof.contract_path,
    contract_sha256: current.proof.contract_sha256,
    bound_at: input.bound_at ?? current.observation.observed_at,
  }));
}

function samePlan(receipt: ExternalSourceBindingReceiptV1, proof: CanonicalTaskPlanProofResult): boolean {
  return proof.ok
    && proof.proof.plan_path === receipt.plan_path
    && proof.proof.plan_sha256 === receipt.plan_sha256
    && proof.proof.contract_path === receipt.contract_path
    && proof.proof.contract_sha256 === receipt.contract_sha256;
}

function canonicalStatus(repo: RepoHarnessRegisteredRepo, receipt: ExternalSourceBindingReceiptV1, deps: ExternalSourceBindingDependencies): 'current' | 'drifted' | 'unavailable' {
  try {
    const canonical = deps.canonical(repo.path, { targetRef: receipt.canonical_target_ref, sprintPath: receipt.sprint_path });
    if (!canonical.ok) return 'unavailable';
    const task = lookupCanonicalTask({ repoIdentity: deps.repoIdentity(repo.path), sprintPath: receipt.sprint_path, sprintText: canonical.text }, receipt.task_id);
    if (!task.ok) return 'drifted';
    const proof = deps.plan(repo.path, { sprintPath: receipt.sprint_path, taskCell: task.task.row.task });
    return task.task.task_revision === receipt.task_revision && samePlan(receipt, proof) ? 'current' : 'drifted';
  } catch {
    return 'unavailable';
  }
}

export function listExternalSourceBindings(
  repositoryId: string,
  env?: NodeJS.ProcessEnv,
  overrides: Partial<ExternalSourceBindingDependencies> = {},
): ExternalSourceBindingProjectionV1 {
  const deps = dependencies(overrides);
  const registry = deps.registry(env);
  const repo = registry.repos.find((candidate) => candidate.id === repositoryId);
  if (!repo) throw new Error(`registered repository is unknown: ${repositoryId}`);
  const observations = deps.observations(repo.path).filter((entry) => entry.registered_repository_id === repositoryId);
  const latest = new Map<string, string>();
  for (const observation of observations.slice().sort((left, right) => left.observed_at.localeCompare(right.observed_at) || left.source_revision.localeCompare(right.source_revision))) {
    latest.set(`${observation.provider_repository_id}\0${observation.provider_issue_id}`, observation.source_revision);
  }
  const bindings = deps.receipts(repo.path).filter((receipt) => receipt.registered_repository_id === repositoryId).map((receipt) => {
    const latestRevision = latest.get(`${receipt.provider_repository_id}\0${receipt.provider_issue_id}`);
    const sourceStatus = latestRevision === undefined ? 'unavailable' : latestRevision === receipt.source_revision ? 'current' : 'drifted';
    const canonical = canonicalStatus(repo, receipt, deps);
    const authorization = repo.accessMode === 'read_write' && receipt.authorization_revision === registry.authorizationRevision ? 'current' : 'stale';
    const attention = authorization === 'stale'
      ? 'authorization_stale'
      : canonical === 'unavailable' || sourceStatus === 'unavailable'
        ? 'authority_unavailable'
        : canonical === 'drifted'
          ? 'canonical_drift'
          : sourceStatus === 'drifted' ? 'source_drift' : 'none';
    return Object.freeze({ receipt, source_status: sourceStatus, canonical_status: canonical, authorization_status: authorization, attention });
  });
  return Object.freeze({
    protocol: 1,
    kind: 'repo-harness-external-source-binding-projection',
    registered_repository_id: repositoryId,
    authorization_revision: registry.authorizationRevision,
    bindings: Object.freeze(bindings),
  });
}

export function externalSourceContext(repoRoot: string, repositoryId: string, sourceRevision: string): string {
  const matches = listProviderIssueObservations(repoRoot).filter((observation) => observation.registered_repository_id === repositoryId && observation.source_revision === sourceRevision);
  if (matches.length !== 1) throw new Error(`expected exactly one immutable observation for source revision ${sourceRevision}, found ${matches.length}`);
  return renderExternalSourceUntrustedContext({ observation: matches[0] });
}
