import { randomUUID, createHash } from 'node:crypto';
import { constants, closeSync, existsSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import { osAccountHome } from '../runtime/os-account-home';
import { canonicalize } from '../../core/evidence/canonical-json';
import type { JsonValue } from '../../core/evidence/types';
import { createReviewAdmission, reviewCampaignKey, bindReviewAdmission, type ReviewAdmission, type ReviewAdmissionInput, type ReviewAuthorityInput } from '../../core/review/authority-context';
import { taskRepository } from '../terminal/task-worktree';
import { gatesDirectoryName, resolveRepositoryIdentity } from '../git/repository-identity';
import { withExclusiveDirectoryLock } from '../locking/exclusive-directory-lock';
import { createFileExclusiveDurably, syncDirectoryDurably } from '../atomic-append';
import { assertObservationPath, currentReadonlyObservation, rejectObservation, observationReadFileSync } from '../readonly-observation';

interface StoreInput { repoRoot: string; authorityHome?: string }
interface CampaignIdentity { repository_id: string; issue_id: string; campaign_id: string }
interface ActiveGrant { protocol: 1; revision: number; grant_sha256: string | null }
interface ApprovalRecord {
  protocol: 1; kind: 'repo-harness-review-approval'; repository_root: string;
  actor_id: string; activation_id: string; admission: ReviewAdmission;
}
const HASH = /^sha256:[0-9a-f]{64}$/;
function fail(reason: string): never { throw new Error(`review_admission_${reason}`); }
function bytes(value: unknown): Buffer { return Buffer.from(canonicalize(value as JsonValue) + '\n'); }
function digest(value: Buffer): string { return `sha256:${createHash('sha256').update(value).digest('hex')}`; }
function inside(root: string, path: string): boolean { const r = relative(root, path); return r === '' || !isAbsolute(r) && r !== '..' && !r.startsWith(`..${sep}`); }
function safeStat(path: string, directory: boolean): void {
  assertObservationPath(path);
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || (directory ? !stat.isDirectory() : !stat.isFile())
    || typeof process.getuid === 'function' && stat.uid !== process.getuid()
    || (stat.mode & 0o022) !== 0 || !directory && stat.nlink !== 1) fail('unsafe_authority');
}
function location(input: StoreInput, identity: CampaignIdentity, create: boolean) {
  const repository = resolveRepositoryIdentity(input.repoRoot);
  const home = realpathSync(input.authorityHome ?? osAccountHome());
  const state = join(home, '.repo-harness');
  safeStat(home, true);
  if (inside(repository.worktreeId, state) || inside(repository.repositoryId, state) || inside(taskRepository(input.repoRoot).primary_root, state)) fail('authority_inside_candidate');
  const parts = ['.repo-harness', 'gates', gatesDirectoryName(repository.worktreeId), 'review-admissions', reviewCampaignKey(identity).slice(7)];
  let path = home;
  for (const part of parts) {
    path = join(path, part);
    assertObservationPath(path);
    if (!existsSync(path)) {
      if (!create) fail('missing');
      mkdirSync(path, { mode: 0o700 });
    }
    safeStat(path, true);
  }
  return { root: repository.worktreeId, directory: path, active: join(path, 'active.json') };
}
function readProtected(path: string): Buffer {
  safeStat(path, false);
  if (currentReadonlyObservation()) {
    const content = observationReadFileSync(path);
    if (content.length > 1024 * 1024) fail('unsafe_authority');
    return content;
  }
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > 1024 * 1024
      || typeof process.getuid === 'function' && stat.uid !== process.getuid() || (stat.mode & 0o022) !== 0) fail('unsafe_authority');
    return readFileSync(fd);
  } finally { closeSync(fd); }
}
function active(path: string): ActiveGrant {
  if (!existsSync(path)) return { protocol: 1, revision: 0, grant_sha256: null };
  const value = JSON.parse(readProtected(path).toString('utf8'));
  if (!value || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(['grant_sha256', 'protocol', 'revision'])
    || value.protocol !== 1 || !Number.isSafeInteger(value.revision) || value.revision < 1
    || value.grant_sha256 !== null && (typeof value.grant_sha256 !== 'string' || !HASH.test(value.grant_sha256))) fail('invalid_active_grant');
  return value;
}
function publishActive(path: string, next: ActiveGrant): void {
  const temporary = join(dirname(path), `activation-${randomUUID()}.tmp`);
  createFileExclusiveDurably(temporary, bytes(next));
  renameSync(temporary, path);
  syncDirectoryDurably(dirname(path));
}

/** Explicit operator approval only. The CLI must present this exact digest for
 * approval; no review round, candidate file or PR body may call this implicitly.
 * A new activation has a distinct identity even when its policy bytes repeat.
 */
export function approveReviewAdmission(input: StoreInput & {
  admission: ReviewAdmissionInput; expectedAdmissionSha256: string;
  approvedActor: string; expectedRevision: number;
}): { revision: number; grant_sha256: string } {
  if (currentReadonlyObservation()) rejectObservation('Observation cannot approve a review admission');
  const admission = createReviewAdmission(input.admission);
  if (admission.admission_sha256 !== input.expectedAdmissionSha256 || input.approvedActor !== admission.actor_id) fail('approval_mismatch');
  const loc = location(input, admission, true);
  return withExclusiveDirectoryLock(loc.directory, 'approval.lock', () => {
    const previous = active(loc.active);
    if (previous.revision !== input.expectedRevision || previous.revision === Number.MAX_SAFE_INTEGER) fail('revision_changed');
    const record: ApprovalRecord = { protocol: 1, kind: 'repo-harness-review-approval', repository_root: loc.root,
      actor_id: input.approvedActor, activation_id: randomUUID(), admission };
    const content = bytes(record), sha = digest(content);
    createFileExclusiveDurably(join(loc.directory, `${sha.slice(7)}.json`), content);
    syncDirectoryDurably(loc.directory);
    const next = { protocol: 1 as const, revision: previous.revision + 1, grant_sha256: sha };
    publishActive(loc.active, next);
    return { revision: next.revision, grant_sha256: sha };
  }, { reclaimStaleOwner: true });
}

export function revokeReviewAdmission(input: StoreInput & CampaignIdentity & { expectedRevision: number }): void {
  if (currentReadonlyObservation()) rejectObservation('Observation cannot revoke a review admission');
  const loc = location(input, input, false);
  withExclusiveDirectoryLock(loc.directory, 'approval.lock', () => {
    const previous = active(loc.active);
    if (previous.revision !== input.expectedRevision || previous.revision === Number.MAX_SAFE_INTEGER) fail('revision_changed');
    publishActive(loc.active, { protocol: 1, revision: previous.revision + 1, grant_sha256: null });
  }, { reclaimStaleOwner: true });
}

/** Read the active protected record, then compare fresh goal/actor/plan inputs.
 * Prior approvals stay on disk as history. Only the current activation can bind
 * a round. Re-read this before recording acceptance and when verifying it.
 */
export function readReviewAdmission(input: StoreInput & CampaignIdentity & {
  expectedGrantSha256: string; expectedPolicySha256: string; expectedGoal: ReviewAdmissionInput['goal']; expectedActor: string;
  round: Pick<ReviewAuthorityInput, 'subject' | 'verification'>;
}) {
  const loc = location(input, input, false), before = active(loc.active);
  if (!HASH.test(input.expectedGrantSha256) || before.grant_sha256 !== input.expectedGrantSha256) fail('revoked_or_replaced');
  const content = readProtected(join(loc.directory, `${input.expectedGrantSha256.slice(7)}.json`));
  if (digest(content) !== input.expectedGrantSha256) fail('grant_digest');
  const value = JSON.parse(content.toString('utf8')) as ApprovalRecord;
  if (!value || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(['activation_id', 'actor_id', 'admission', 'kind', 'protocol', 'repository_root'])
    || value.protocol !== 1 || value.kind !== 'repo-harness-review-approval' || value.repository_root !== loc.root
    || value.actor_id !== input.expectedActor || typeof value.activation_id !== 'string'
    || !/^[0-9a-f-]{36}$/.test(value.activation_id)) fail('grant_binding');
  const admitted = value.admission;
  if (admitted.repository_id !== input.repository_id || admitted.issue_id !== input.issue_id || admitted.campaign_id !== input.campaign_id
    || admitted.actor_id !== input.expectedActor || admitted.goal.revision !== input.expectedGoal.revision
    || admitted.goal.content !== input.expectedGoal.content) fail('goal_or_actor_changed');
  if (admitted.policy.policy_sha256 !== input.expectedPolicySha256) fail('policy_changed');
  const context = bindReviewAdmission(admitted, input.round, input.expectedGrantSha256);
  if (!bytes(before).equals(bytes(active(loc.active)))) fail('changed_during_read');
  return { admission: admitted, context, revision: before.revision };
}
