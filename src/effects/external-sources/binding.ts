import { createHash } from 'node:crypto';
import { canonicalize } from '../../core/evidence/canonical-json';
import { isTaskDiffRequest, type OperatorTaskDiffRequest } from '../../core/operator/task-diff';
import { buildExternalSourceProjection } from '../../core/external-sources/projection';
import { renderExternalSourceUntrustedContext } from '../../core/external-sources/binding';
import { buildAdmittedSourceBindingReceipt, type ExternalSourceBindingReceiptV2 } from '../../core/external-sources/admitted-binding';
import { readRepoHarnessRegistryStrictSnapshot, type RepoHarnessRegistryStrictSnapshot } from '../repo-registry';
import { readReviewAdmissionSource } from '../review/admission-source';
import { observeTaskInboxContext } from '../fleet/task-inbox';
import { readTaskAgent } from '../terminal/task-session';
import { listExternalSourceBindingReceipts, listHistoricalExternalSourceBindingReceipts,
  listExternalSourceRefreshReceipts, listProviderIssueObservations, writeExternalSourceBindingReceipt } from './store';

export interface BindExternalSourceInput {
  readonly registered_repository_id: string;
  readonly source_revision: string;
  readonly session: OperatorTaskDiffRequest;
  readonly bound_at?: string;
  readonly env?: NodeJS.ProcessEnv;
}
export interface ExternalSourceBindingDependencies {
  readonly registry: (env?: NodeJS.ProcessEnv) => RepoHarnessRegistryStrictSnapshot;
  readonly observations: typeof listProviderIssueObservations;
  readonly refreshReceipts: typeof listExternalSourceRefreshReceipts;
  readonly receipts: typeof listExternalSourceBindingReceipts;
  readonly admissionSource: typeof readReviewAdmissionSource;
  readonly write: typeof writeExternalSourceBindingReceipt;
}
function dependencies(overrides: Partial<ExternalSourceBindingDependencies> = {}): ExternalSourceBindingDependencies {
  return { registry: env => readRepoHarnessRegistryStrictSnapshot({ env }), observations: listProviderIssueObservations,
    refreshReceipts: listExternalSourceRefreshReceipts, receipts: listExternalSourceBindingReceipts,
    admissionSource: readReviewAdmissionSource, write: writeExternalSourceBindingReceipt, ...overrides };
}
function observeSession(root: string, session: OperatorTaskDiffRequest, deps: ExternalSourceBindingDependencies) {
  if (!isTaskDiffRequest(session)) throw new Error('explicit admitted session selector is invalid');
  const { binding } = readTaskAgent(root, session.task, session.role);
  const digest = `sha256:${createHash('sha256').update(canonicalize(JSON.parse(JSON.stringify(binding)))).digest('hex')}`;
  if (digest !== session.session_binding_sha256 || !binding.task_admission) throw new Error('session binding changed');
  const source = deps.admissionSource(binding.task_admission.identity.source_root, {
    'repository-id': session.provider_repository_id, 'issue-id': session.issue_id, 'campaign-id': session.campaign_id,
    'grant-sha256': session.grant_sha256, 'policy-sha256': session.policy_sha256, actor: session.actor_id,
  });
  return observeTaskInboxContext({ repo_root: root, task_id: session.task, source: {
    session: { task: session.task, role: session.role }, authority: { source,
      claim: { reference: session.claim_ref, revision: session.claim_revision }, engineer_profile: binding.task_admission.identity.engineer_profile } } });
}
function authority(input: BindExternalSourceInput, deps: ExternalSourceBindingDependencies) {
  const registry = deps.registry(input.env), repo = registry.repos.find(r => r.id === input.registered_repository_id);
  if (!repo || repo.accessMode !== 'read_write') throw new Error('registered repository is not write-authorized');
  if (input.session.repository_id !== repo.id) throw new Error('session selects a different registered repository');
  const matches = deps.observations(repo.path).filter(o => o.registered_repository_id === repo.id && o.source_revision === input.source_revision);
  if (matches.length !== 1) throw new Error('expected exactly one immutable observation');
  const observation = matches[0]!;
  if (!observation.eligible) throw new Error('source revision is not eligible');
  const session = observeSession(repo.path, input.session, deps);
  if (observation.provider_repository_id !== session.identity.repository_id || observation.provider_issue_id !== session.identity.issue_id)
    throw new Error('source provider identity differs from admitted issue');
  return { repo, registry, observation, session };
}
export function bindExternalSource(input: BindExternalSourceInput, overrides: Partial<ExternalSourceBindingDependencies> = {}): ExternalSourceBindingReceiptV2 {
  const deps = dependencies(overrides), before = authority(input, deps), after = authority(input, deps);
  if (before.repo.path !== after.repo.path || before.registry.authorizationRevision !== after.registry.authorizationRevision
    || before.observation.observation_sha256 !== after.observation.observation_sha256
    || canonicalize(JSON.parse(JSON.stringify(before.session))) !== canonicalize(JSON.parse(JSON.stringify(after.session)))) throw new Error('binding authority changed during revalidation');
  return deps.write(after.repo.path, buildAdmittedSourceBindingReceipt({ registered_repository_id: after.repo.id,
    authorization_revision: after.registry.authorizationRevision, provider: after.observation.provider,
    provider_repository_id: after.observation.provider_repository_id, provider_issue_id: after.observation.provider_issue_id,
    source_revision: after.observation.source_revision, observation_sha256: after.observation.observation_sha256,
    session: input.session, admission_sha256: after.session.approval.admission_sha256,
    bound_at: input.bound_at ?? after.observation.observed_at }));
}
export function listExternalSourceBindings(repositoryId: string, env?: NodeJS.ProcessEnv, overrides: Partial<ExternalSourceBindingDependencies> = {}) {
  const deps = dependencies(overrides), registry = deps.registry(env), repo = registry.repos.find(r => r.id === repositoryId);
  if (!repo) throw new Error('registered repository is unknown');
  const projection = buildExternalSourceProjection({ registered_repository_id: repositoryId,
    observations: deps.observations(repo.path).filter(o => o.registered_repository_id === repositoryId), receipts: deps.refreshReceipts(repo.path) });
  const latest = new Map(projection.issues.map(i => [`${i.provider_repository_id}\0${i.provider_issue_id}`, i.latest_observation.source_revision]));
  const bindings = deps.receipts(repo.path).filter(r => r.registered_repository_id === repositoryId).map(receipt => {
    const revision = latest.get(`${receipt.provider_repository_id}\0${receipt.provider_issue_id}`);
    const source_status = revision === undefined ? 'unavailable' : revision === receipt.source_revision ? 'current' : 'drifted';
    let session_status: 'current' | 'drifted' | 'unavailable' = 'unavailable';
    try { session_status = observeSession(repo.path, receipt.session, deps).approval.admission_sha256 === receipt.admission_sha256 ? 'current' : 'drifted'; } catch { /* Historical correlation cannot establish current authority. */ }
    const authorization_status = repo.accessMode === 'read_write' && receipt.authorization_revision === registry.authorizationRevision ? 'current' : 'stale';
    const attention = authorization_status === 'stale' ? 'authorization_stale'
      : session_status === 'unavailable' || source_status === 'unavailable' ? 'authority_unavailable'
      : session_status === 'drifted' ? 'session_drift' : source_status === 'drifted' ? 'source_drift' : 'none';
    return { receipt, source_status, session_status, authorization_status, attention };
  });
  const after = deps.registry(env);
  if (after.authorizationRevision !== registry.authorizationRevision || after.repos.find(r => r.id === repositoryId)?.path !== repo.path) throw new Error('registry changed during binding observation');
  return { protocol: 2, kind: 'repo-harness-external-source-binding-projection', registered_repository_id: repositoryId,
    authorization_revision: registry.authorizationRevision, bindings };
}
export function listHistoricalExternalSourceBindings(repositoryId: string, env?: NodeJS.ProcessEnv) {
  const repo = readRepoHarnessRegistryStrictSnapshot({ env }).repos.find(r => r.id === repositoryId);
  if (!repo) throw new Error('registered repository is unknown');
  return { protocol: 1, kind: 'repo-harness-historical-external-source-bindings', registered_repository_id: repositoryId,
    bindings: listHistoricalExternalSourceBindingReceipts(repo.path).filter(r => r.registered_repository_id === repositoryId) };
}

export function externalSourceContext(repoRoot: string, repositoryId: string, sourceRevision: string): string {
  const matches = listProviderIssueObservations(repoRoot).filter((observation) => observation.registered_repository_id === repositoryId && observation.source_revision === sourceRevision);
  if (matches.length !== 1) throw new Error(`expected exactly one immutable observation for source revision ${sourceRevision}, found ${matches.length}`);
  return renderExternalSourceUntrustedContext({ observation: matches[0] });
}
