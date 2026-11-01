import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { canonicalize } from '../../core/evidence/canonical-json';
import { readTaskAgent, observeTaskSessionAdmission } from '../terminal/task-session';
import { readReviewAdmissionSource } from '../admission/admission-source';
import { resolvePolicyReviewBase } from '../review/diff-fingerprint';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { SESSION_OBSERVATION_MAX_BYTES, type AdmittedSessionSelector, type SessionObservationFailure } from '../../core/sessions/session-selector';
import { resolveGitCommonDirectory } from '../git/common-directory';
import { readWorktreeTopology } from '../git/worktree-topology';
import { readRepoHarnessRegistryStrictSnapshot } from '../repo-registry';
import { gitExecFileSync } from '../git/runner';

export class SessionObservationError extends Error {
  constructor(readonly code: SessionObservationFailure) { super(code); }
}
export const refuseSessionObservation = (code: SessionObservationFailure): never => { throw new SessionObservationError(code); };

export function runSessionObservationGit(cwd: string, args: string[], allowNoMatch = false): string {
  try {
    const bytes = gitExecFileSync(['--no-pager', '-c', 'core.fsmonitor=false', ...args], {
      cwd, timeout: 5000, maxBuffer: SESSION_OBSERVATION_MAX_BYTES, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', GIT_NO_LAZY_FETCH: '1' },
    });
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return text;
  } catch (error) {
    if (allowNoMatch && (error as { status?: number }).status === 1) return '';
    if ((error as NodeJS.ErrnoException).code === 'ENOBUFS') return refuseSessionObservation('too_large');
    return refuseSessionObservation('unavailable');
  }
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
  if (!stat.isDirectory() || stat.ino === 0n) return refuseSessionObservation('unavailable');
  return `${stat.dev}:${stat.ino}`;
}

/** Shared read-only session check for discovery and explicit diff reads. */
export function observeAdmittedSessionSource(input: AdmittedSessionSelector & { readonly env?: NodeJS.ProcessEnv },
  effects: { readonly admissionSource?: typeof readReviewAdmissionSource } = {}) {

      const registry = readRepoHarnessRegistryStrictSnapshot({ env: input.env, adoptedOnly: false });
      const repo = registry.repos.find(r => r.id === input.repository_id);
      if (!repo) return refuseSessionObservation('unavailable');
      const root = realpathSync(repo.path);
      const { dir, binding } = readTaskAgent(root, input.task, input.role);
      if (existsSync(join(dir, 'closed.json')) || !binding.task_admission) return refuseSessionObservation('unavailable');
      const boundSource = binding.task_admission.identity.source_root;
      if (typeof boundSource !== 'string') return refuseSessionObservation('stale');
      const sourceRoot = realpathSync(boundSource);
      if (sourceRoot !== boundSource || !sameDirectory(resolveGitCommonDirectory(root), resolveGitCommonDirectory(sourceRoot))) return refuseSessionObservation('unavailable');
      const topology = readWorktreeTopology(root).worktrees;
      if (!topology.some(entry => !entry.prunable && sameDirectory(entry.path, sourceRoot))) return refuseSessionObservation('unavailable');
      const worktree = realpathSync(binding.execution_root);
      if (worktree !== binding.execution_root || !sameDirectory(resolveGitCommonDirectory(root), resolveGitCommonDirectory(worktree))) return refuseSessionObservation('unavailable');
      const entry = topology.find(w => sameDirectory(w.path, worktree));
      if (!entry || !entry.branch || entry.detached) return refuseSessionObservation('unavailable');
      if (!sameDirectory(runSessionObservationGit(worktree, ['rev-parse', '--show-toplevel']).trim(), worktree)
        || runSessionObservationGit(worktree, ['symbolic-ref', 'HEAD']).trim() !== entry.branch) return refuseSessionObservation('unavailable');
      const bindingDigest = `sha256:${createHash('sha256').update(canonicalize(JSON.parse(JSON.stringify(binding)))).digest('hex')}`;
      if (bindingDigest !== input.session_binding_sha256) return refuseSessionObservation('stale');
      const source = (effects.admissionSource ?? readReviewAdmissionSource)(sourceRoot, {
        'repository-id': input.provider_repository_id, 'issue-id': input.issue_id, 'campaign-id': input.campaign_id,
        'grant-sha256': input.grant_sha256, 'policy-sha256': input.policy_sha256, actor: input.actor_id,
      });
      let current: ReturnType<typeof observeTaskSessionAdmission>;
      try {
        current = observeTaskSessionAdmission(worktree, binding, binding.runtime,
          { source, claim: { reference: input.claim_ref, revision: input.claim_revision } });
      } catch (error) {
        if (error instanceof Error && error.message === 'review_admission_revoked_or_replaced') return refuseSessionObservation('stale');
        throw error;
      }
      if (canonicalize(JSON.parse(JSON.stringify(current.identity))) !== canonicalize(JSON.parse(JSON.stringify(binding.task_admission.identity)))
        || current.identity.repository_id !== input.provider_repository_id || current.identity.issue_id !== input.issue_id
        || current.identity.campaign_id !== input.campaign_id || current.identity.execution_actor !== input.actor_id
        || current.approval.grant_sha256 !== input.grant_sha256) return refuseSessionObservation('stale');
      const policyPath = join(sourceRoot, '.ai/harness/policy.json');
      const policyBytes = readFileSync(policyPath);
      const policyBase = resolvePolicyReviewBase(sourceRoot);
      if (!policyBytes.equals(readFileSync(policyPath))) return refuseSessionObservation('stale');
      if (!policyBase.ok) return refuseSessionObservation('unavailable');
      const targetRef = policyBase.targetRef;
      const base = runSessionObservationGit(worktree, ['rev-parse', '--verify', '--end-of-options', `${targetRef}^{commit}`]).trim();
      return { root, sourceRoot, worktree, base, targetRef, branch: entry.branch.slice('refs/heads/'.length),
        sourcePolicy: createHash('sha256').update(policyBytes).digest('hex'),
        binding: bindingDigest, identity: current.identity, approval: current.approval, registryRevision: registry.authorizationRevision,
        physical: [root, sourceRoot, worktree, resolveGitCommonDirectory(root)].map(physicalDirectory) };

}

