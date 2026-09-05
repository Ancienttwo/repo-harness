import { execFileSync } from 'child_process';
import { repoHarnessRepoIdFor } from '../repo-registry';
import { randomBytes } from 'crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { canonicalMessageBytes, canonicalMessageDigest } from '../../core/messages/mechanics';
import { validateIssueBatchIntent, type IssueBatchIntentV1 } from '../../core/automation/issue-batch';
import { IssueBatchAdoptionError, type CampaignIssueBatchAdoptionReceiptV1 } from '../../core/automation/issue-batch-adoption';
import { projectCanonicalTasks } from '../../core/state/coordination-identity';
import { backlogRows, renderBacklogRow, sprintBacklogSchema } from '../../core/state/sprint-backlog-rows';
import { projectWorkGraph, schedulingCarrierPath, validateWorkGraph, validateWorkPackageDefinition, validateWorkGraphTopology, type WorkPackageDefinitionV1 } from '../../core/engineers/scheduling';
import { assertCanonicalSprintTaskIdsUniqueAtCommit, resolveRepoIdentity } from '../state/coordination-canonical-source';
import { persistIssueBatchAdoptionArtifact, readIssueBatchAdoptionArtifact, withIssueBatchPublicationLock } from './issue-batch-store';

export type CampaignPublicationPolicy = Pick<WorkPackageDefinitionV1, 'required_acceptance' | 'retry_policy' | 'rollback_boundary'>;
export type CampaignPublicationBoundary = 'after_sprint_blob' | 'after_graph_blob' | 'after_manifest_blob' | 'after_publication_intent_fsync' | 'before_ref_cas' | 'after_ref_cas';
export interface PublishIssueBatchInput {
  readonly repo_root: string;
  readonly intent: IssueBatchIntentV1;
  readonly receipt: CampaignIssueBatchAdoptionReceiptV1;
  readonly sprint_path: string;
  readonly policy: CampaignPublicationPolicy;
  readonly evidence: { readonly challenge_receipt_sha256: string; readonly terminal_sha256: string };
  readonly now?: () => string;
  readonly crash_hook?: (boundary: CampaignPublicationBoundary) => void;
}
export interface CampaignPublicationV1 {
  readonly candidate_ref: string;
  readonly materialized_commit: string;
  readonly base_main_sha: string;
  readonly projection_sha256: string;
  readonly manifest_path: string;
  readonly task_ids: readonly string[];
}
function fail(message: string): never { throw new IssueBatchAdoptionError('issue_adoption_conflict', message); }
function git(root: string, args: string[], env?: NodeJS.ProcessEnv): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env } }).trim();
}
function bytes(root: string, commit: string, path: string): string { return execFileSync('git', ['show', `${commit}:${path}`], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
function ref(root: string, name: string): string | null { try { return git(root, ['rev-parse', '--verify', name]); } catch { return null; } }
function publishRef(input: PublishIssueBatchInput, publication: CampaignPublicationV1): CampaignPublicationV1 {
  const root = input.repo_root;
  const candidate = ref(root, publication.candidate_ref);
  if (candidate === publication.materialized_commit) return publication;
  if (candidate !== null) fail('candidate ref changed outside this publication');
  try {
    git(root, ['merge-base', '--is-ancestor', publication.materialized_commit, input.intent.target_ref]);
    return publication;
  } catch { /* Only a committed canonical ancestor permits replay after candidate cleanup. */ }
  if (ref(root, input.intent.target_ref) !== input.intent.base_main_sha) fail('canonical target moved before candidate publication');
  input.crash_hook?.('before_ref_cas');
  const target = git(root, ['rev-parse', '--symbolic-full-name', input.intent.target_ref]);
  if (!target.startsWith('refs/heads/')) fail('publication target must be a local canonical branch');
  execFileSync('git', ['update-ref', '--stdin'], { cwd: root, input: `start\nverify ${target} ${input.intent.base_main_sha}\ncreate ${publication.candidate_ref} ${publication.materialized_commit}\nprepare\ncommit\n`, stdio: ['pipe', 'pipe', 'pipe'] });
  input.crash_hook?.('after_ref_cas');
  return publication;
}
/** Creates a candidate commit, never mutates the canonical branch or caller's index/worktree. */
export function publishIssueBatch(input: PublishIssueBatchInput): CampaignPublicationV1 {
  const intent = validateIssueBatchIntent(input.intent);
  const receipt = input.receipt;
  const { receipt_sha256: receiptDigest, ...receiptBasis } = receipt;
  if (canonicalMessageDigest(receiptBasis) !== receiptDigest || receipt.issue_batch_intent_sha256 !== intent.intent_sha256
    || receipt.campaign_id !== intent.campaign_id || receipt.group_number !== intent.group_number || receipt.base_main_sha !== intent.base_main_sha) fail('adoption receipt binding differs');
  const root = input.repo_root;
  const carrier = schedulingCarrierPath(input.sprint_path);
  const manifestPath = `tasks/campaigns/${intent.campaign_id}/group-${intent.group_number}.issues.json`;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(intent.campaign_id)) fail('campaign id cannot be represented as a manifest path');
  const projectionDigest = canonicalMessageDigest({ receipt, sprint_path: input.sprint_path, policy: input.policy, evidence: input.evidence });
  return withIssueBatchPublicationLock(root, intent, () => {
    const stored = readIssueBatchAdoptionArtifact(root, intent, 'publication');
    if (stored) {
      if (stored.projection_sha256 !== projectionDigest) fail('same intent has a different materialization projection');
      const publication = stored as unknown as CampaignPublicationV1;
      const manifest = JSON.parse(bytes(root, publication.materialized_commit, manifestPath));
      if (manifest.projection_sha256 !== projectionDigest || canonicalMessageBytes(manifest.receipt) !== canonicalMessageBytes({ ...receipt })
        || git(root, ['rev-parse', `${publication.materialized_commit}^`]) !== intent.base_main_sha) fail('stored publication commit does not contain the accepted manifest');
      return publishRef(input, publication);
    }
    if (ref(root, intent.target_ref) !== intent.base_main_sha) fail('canonical target moved before materialization');
    const sprintBefore = bytes(root, intent.base_main_sha, input.sprint_path);
    const graphBefore = validateWorkGraph(JSON.parse(bytes(root, intent.base_main_sha, carrier)));
    if (graphBefore.repository_id !== intent.repository_id || graphBefore.sprint_path !== input.sprint_path || repoHarnessRepoIdFor(root) !== intent.repository_id) fail('Sprint repository binding differs');
    if (sprintBacklogSchema(sprintBefore) !== 2) fail('Sprint requires persistent task IDs');
    const tasks = (sprint: string) => projectCanonicalTasks({ repoIdentity: resolveRepoIdentity(root), sprintPath: input.sprint_path, sprintText: sprint }).map((t, i) => ({ task_id: t.task_id, task_revision: t.task_revision, task_ref: t.row.task, status: t.row.status, row_order: i + 1 }));
    projectWorkGraph(graphBefore, tasks(sprintBefore));
    const ids = receipt.issues.map(issue => ({ slot: issue.slot, task_id: randomBytes(32).toString('hex'), work_package_id: `campaign-${intent.intent_sha256.slice(7, 23)}-${issue.slot}` }));
    const packages = receipt.issues.map(issue => {
      const id = ids.find(i => i.slot === issue.slot)!;
      return validateWorkPackageDefinition({ ...input.policy, work_package_id: id.work_package_id, task_id: id.task_id, primary_capability: issue.primary_capability,
        depends_on: issue.depends_on_slots.map(slot => {
          const dep = ids.find(i => i.slot === slot); if (!dep) fail('dependency is not an adopted slot');
          return { repository_id: intent.repository_id, work_package_id: dep.work_package_id, required_state: 'canonical_done', acceptance_authority: null };
        }), priority: issue.priority, concurrency: { scope: 'repo', key: issue.primary_capability }, execution_surface: 'contract', integration_group: null });
    });
    const position = sprintBefore.indexOf('\n## Execution Log');
    if (position < 0) fail('Sprint lacks Execution Log boundary');
    const rows = receipt.issues.map((issue, i) => renderBacklogRow(2, { index: String(backlogRows(sprintBefore).length + i + 1), id: ids[i]!.task_id, status: '[ ]',
      task: `Campaign ${intent.campaign_id} group ${intent.group_number} slot ${issue.slot}: ${issue.issue_kind} #${issue.issue_number}`, mode: 'contract',
      acceptance: `Adoption ${receipt.receipt_sha256}; Issue body ${issue.body_sha256}; local plan and module acceptance required`, plan: '(pending)' }));
    const sprintAfter = rows.length ? `${sprintBefore.slice(0, position).trimEnd()}\n${rows.join('\n')}\n${sprintBefore.slice(position)}` : sprintBefore;
    const graph = validateWorkGraph({ ...graphBefore, lane: packages.length ? 'engineering-v2' : graphBefore.lane, work_packages: [...graphBefore.work_packages, ...packages] });
    const projected = projectWorkGraph(graph, tasks(sprintAfter));
    // Existing dependencies may resolve in other canonical graphs; only this new group is closed here.
    validateWorkGraphTopology([{ ...projected, work_packages: projected.work_packages.filter(w => ids.some(id => id.work_package_id === w.work_package_id)) }]);
    assertCanonicalSprintTaskIdsUniqueAtCommit(root, { commit: intent.base_main_sha, sprintPath: input.sprint_path, sprintText: sprintAfter });
    if (ref(root, `${intent.base_main_sha}:${manifestPath}`) !== null) fail('manifest already exists for this campaign group');
    const manifest = { protocol: 1, kind: 'repo-harness-campaign-issue-manifest', projection_sha256: projectionDigest, receipt, evidence: input.evidence, slots: ids, publication_policy: input.policy };
    const temp = mkdtempSync(join(tmpdir(), 'repo-harness-issue-publication-'));
    const env = { GIT_INDEX_FILE: join(temp, 'index') };
    try {
      git(root, ['read-tree', intent.base_main_sha], env);
      const changes = [[input.sprint_path, sprintAfter, 'after_sprint_blob'], [carrier, `${JSON.stringify(graph, null, 2)}\n`, 'after_graph_blob'], [manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'after_manifest_blob']] as const;
      for (const [path, content, boundary] of changes) {
        const file = join(temp, boundary); writeFileSync(file, content);
        const blob = git(root, ['hash-object', '-w', file]);
        git(root, ['update-index', '--add', '--cacheinfo', '100644', blob, path], env);
        input.crash_hook?.(boundary);
      }
      const tree = git(root, ['write-tree'], env);
      const time = input.now?.() ?? new Date().toISOString();
      const commit = git(root, ['commit-tree', tree, '-p', intent.base_main_sha, '-m', `materialize campaign ${intent.campaign_id} group ${intent.group_number}`], {
        ...env, GIT_AUTHOR_NAME: 'repo-harness', GIT_AUTHOR_EMAIL: 'repo-harness@localhost', GIT_COMMITTER_NAME: 'repo-harness', GIT_COMMITTER_EMAIL: 'repo-harness@localhost', GIT_AUTHOR_DATE: time, GIT_COMMITTER_DATE: time,
      });
      const publication = { candidate_ref: `refs/heads/codex/campaign-adoption-${intent.intent_sha256.slice(7)}`, materialized_commit: commit, base_main_sha: intent.base_main_sha,
        projection_sha256: projectionDigest, manifest_path: manifestPath, task_ids: ids.map(i => i.task_id) };
      persistIssueBatchAdoptionArtifact(root, intent, 'publication', publication);
      input.crash_hook?.('after_publication_intent_fsync');
      return publishRef(input, publication);
    } finally { rmSync(temp, { recursive: true, force: true }); }
  });
}
