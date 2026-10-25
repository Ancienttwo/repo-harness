import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { canonicalize } from '../../core/evidence/canonical-json';
import { readTaskAgent, observeTaskSessionAdmission } from '../terminal/task-session';
import { readReviewAdmissionSource } from '../admission/admission-source';
import { resolvePolicyReviewBase } from '../review/diff-fingerprint';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { TASK_DIFF_MAX_BYTES, TASK_DIFF_MAX_UNTRACKED, isTaskDiffRequest, type OperatorTaskDiff, type OperatorTaskDiffRequest, type TaskDiffFailure } from '../../core/operator/task-diff';
import { resolveGitCommonDirectory } from '../git/common-directory';
import { readWorktreeTopology } from '../git/worktree-topology';
import { readRepoHarnessRegistryStrictSnapshot } from '../repo-registry';
import { gitExecFileSync } from '../git/runner';

export class OperatorTaskDiffError extends Error {
  constructor(readonly code: TaskDiffFailure) { super(code); }
}
const refuse = (code: TaskDiffFailure): never => { throw new OperatorTaskDiffError(code); };

function git(cwd: string, args: string[], allowNoMatch = false): string {
  try {
    const bytes = gitExecFileSync(['--no-pager', '-c', 'core.fsmonitor=false', ...args], {
      cwd, timeout: 5000, maxBuffer: TASK_DIFF_MAX_BYTES, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', GIT_NO_LAZY_FETCH: '1' },
    });
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return text;
  } catch (error) {
    if (allowNoMatch && (error as { status?: number }).status === 1) return '';
    if ((error as NodeJS.ErrnoException).code === 'ENOBUFS') return refuse('too_large');
    return refuse('unavailable');
  }
}

/** Filters may execute commands even with --no-ext-diff and --no-textconv.
 * Refuse them rather than silently changing the repository's Git semantics.
 */
function refuseExternalFilters(cwd: string): void {
  const output = git(cwd, ['config', '--includes', '--null', '--get-regexp', '^filter\\..*\\.(clean|process)$'], true);
  if (!output) return;
  if (!output.endsWith('\0')) return refuse('unavailable');
  const effective = new Map<string, string>();
  for (const record of output.slice(0, -1).split('\0')) {
    const separator = record.indexOf('\n');
    if (separator < 1) return refuse('unavailable');
    effective.set(record.slice(0, separator), record.slice(separator + 1));
  }
  if ([...effective.values()].some(command => command !== '')) return refuse('filters_unsupported');
}

// Git omits worktree checks for assume-unchanged (lowercase tag) and
// skip-worktree (`S`) entries; never label that an empty diff.
function refuseHiddenWorktreeEntries(cwd: string): void {
  const entries = git(cwd, ['ls-files', '-v', '-z']);
  if (entries && !entries.endsWith('\0')) return refuse('unavailable');
  if (entries.split('\0').some(entry => /^[a-zS] /.test(entry))) return refuse('index_unsupported');
}

// Windows short/long path spellings can survive realpath. Bind physical directories.
function sameDirectory(left: string, right: string): boolean {
  try {
    const a = statSync(left, { bigint: true });
    const b = statSync(right, { bigint: true });
    return a.isDirectory() && b.isDirectory() && a.ino !== 0n && b.ino !== 0n
      && a.dev === b.dev && a.ino === b.ino;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

function physicalDirectory(path: string): string {
  const stat = statSync(path, { bigint: true });
  if (!stat.isDirectory() || stat.ino === 0n) return refuse('unavailable');
  return `${stat.dev}:${stat.ino}`;
}

/** Shared read-only session check for discovery and explicit diff reads. */
export function observeOperatorTaskDiffSource(input: OperatorTaskDiffRequest & { readonly env?: NodeJS.ProcessEnv },
  effects: { readonly admissionSource?: typeof readReviewAdmissionSource } = {}) {

      const registry = readRepoHarnessRegistryStrictSnapshot({ env: input.env, adoptedOnly: false });
      const repo = registry.repos.find(r => r.id === input.repository_id);
      if (!repo) return refuse('unavailable');
      const root = realpathSync(repo.path);
      const { dir, binding } = readTaskAgent(root, input.task, input.role);
      if (existsSync(join(dir, 'closed.json')) || !binding.task_admission) return refuse('unavailable');
      const boundSource = binding.task_admission.identity.source_root;
      if (typeof boundSource !== 'string') return refuse('stale');
      const sourceRoot = realpathSync(boundSource);
      if (sourceRoot !== boundSource || !sameDirectory(resolveGitCommonDirectory(root), resolveGitCommonDirectory(sourceRoot))) return refuse('unavailable');
      const topology = readWorktreeTopology(root).worktrees;
      if (!topology.some(entry => !entry.prunable && sameDirectory(entry.path, sourceRoot))) return refuse('unavailable');
      const worktree = realpathSync(binding.execution_root);
      if (worktree !== binding.execution_root || !sameDirectory(resolveGitCommonDirectory(root), resolveGitCommonDirectory(worktree))) return refuse('unavailable');
      const entry = topology.find(w => sameDirectory(w.path, worktree));
      if (!entry || !entry.branch || entry.detached) return refuse('unavailable');
      if (!sameDirectory(git(worktree, ['rev-parse', '--show-toplevel']).trim(), worktree)
        || git(worktree, ['symbolic-ref', 'HEAD']).trim() !== entry.branch) return refuse('unavailable');
      const bindingDigest = `sha256:${createHash('sha256').update(canonicalize(JSON.parse(JSON.stringify(binding)))).digest('hex')}`;
      if (bindingDigest !== input.session_binding_sha256) return refuse('stale');
      const source = (effects.admissionSource ?? readReviewAdmissionSource)(sourceRoot, {
        'repository-id': input.provider_repository_id, 'issue-id': input.issue_id, 'campaign-id': input.campaign_id,
        'grant-sha256': input.grant_sha256, 'policy-sha256': input.policy_sha256, actor: input.actor_id,
      });
      let current: ReturnType<typeof observeTaskSessionAdmission>;
      try {
        current = observeTaskSessionAdmission(worktree, binding, binding.runtime,
          { source, claim: { reference: input.claim_ref, revision: input.claim_revision }, engineer_profile: binding.task_admission.identity.engineer_profile });
      } catch (error) {
        if (error instanceof Error && error.message === 'review_admission_revoked_or_replaced') return refuse('stale');
        throw error;
      }
      if (canonicalize(JSON.parse(JSON.stringify(current.identity))) !== canonicalize(JSON.parse(JSON.stringify(binding.task_admission.identity)))
        || current.identity.repository_id !== input.provider_repository_id || current.identity.issue_id !== input.issue_id
        || current.identity.campaign_id !== input.campaign_id || current.identity.execution_actor !== input.actor_id
        || current.approval.grant_sha256 !== input.grant_sha256) return refuse('stale');
      const policyPath = join(sourceRoot, '.ai/harness/policy.json');
      const policyBytes = readFileSync(policyPath);
      const policyBase = resolvePolicyReviewBase(sourceRoot);
      if (!policyBytes.equals(readFileSync(policyPath))) return refuse('stale');
      if (!policyBase.ok) return refuse('unavailable');
      const targetRef = policyBase.targetRef;
      const base = git(worktree, ['rev-parse', '--verify', '--end-of-options', `${targetRef}^{commit}`]).trim();
      return { root, sourceRoot, worktree, base, targetRef, branch: entry.branch.slice('refs/heads/'.length),
        sourcePolicy: createHash('sha256').update(policyBytes).digest('hex'),
        binding: bindingDigest, identity: current.identity, approval: current.approval, registryRevision: registry.authorizationRevision,
        physical: [root, sourceRoot, worktree, resolveGitCommonDirectory(root)].map(physicalDirectory) };

}

/** Synchronous local authority/Git reads run only in the cancellable worker. */
export function readOperatorTaskDiff(input: OperatorTaskDiffRequest & { readonly env?: NodeJS.ProcessEnv },
  effects: { readonly admissionSource?: typeof readReviewAdmissionSource } = {}): OperatorTaskDiff {
  const { env, ...selector } = input;
  try {
    if (!isTaskDiffRequest(selector)) return refuse('unavailable');
    const authority = () => observeOperatorTaskDiffSource(input, effects);
    const before = authority();
    refuseExternalFilters(before.worktree);
    const head = git(before.worktree, ['rev-parse', '--verify', 'HEAD^{commit}']).trim();
    const patchArgs = ['diff', '--no-ext-diff', '--no-textconv', '--no-color', '--no-renames', '--ignore-submodules=none', '--submodule=short', '--src-prefix=a/', '--dst-prefix=b/', before.base, '--'];
    refuseHiddenWorktreeEntries(before.worktree);
    const patch = git(before.worktree, patchArgs);
    const rawUntracked = git(before.worktree, ['ls-files', '--others', '--exclude-standard', '-z']);
    const untracked = rawUntracked === '' ? [] : rawUntracked.slice(0, -1).split('\0');
    if (untracked.length > TASK_DIFF_MAX_UNTRACKED) return refuse('too_large');
    refuseHiddenWorktreeEntries(before.worktree);
    // Re-observe content as well as ownership: HEAD alone misses agent edits.
    if (git(before.worktree, patchArgs) !== patch
      || git(before.worktree, ['ls-files', '--others', '--exclude-standard', '-z']) !== rawUntracked) return refuse('stale');
    const after = authority();
    if (JSON.stringify(before) !== JSON.stringify(after) || git(before.worktree, ['rev-parse', '--verify', 'HEAD^{commit}']).trim() !== head) return refuse('stale');
    return {
      ...selector, protocol: 2, kind: 'operator_task_diff',
      target_ref: before.targetRef, branch: before.branch, base_sha: before.base, head_sha: head,
      observed_at: new Date().toISOString(), patch, untracked_paths: untracked,
    };
  } catch (error) {
    if (error instanceof OperatorTaskDiffError) throw error;
    return refuse('unavailable');
  }
}
