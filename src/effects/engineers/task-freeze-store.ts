import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import {
  closeSync,
  constants,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'fs';
import { basename, dirname, join, relative, resolve, sep } from 'path';

import {
  TaskFreezeError,
  buildTaskFreezeInspection,
  buildTaskFreezeReceipt,
  canonicalTaskFreezeReceiptBytes,
  taskFreezeReceiptChangedFields,
  validateTaskFreezeReceipt,
  type TaskFreezeInspectionV1,
  type TaskFreezeReceiptV1,
} from '../../core/engineers/task-freeze';
import { canonicalEngineerJson } from '../../core/engineers/profile-binding';
import type { WorkEnvelopeV1 } from '../fleet/acquire';
import { resolveGitCommonDirectory } from '../git/common-directory';
import { buildReviewSubject, resolvePolicyReviewBase } from '../review/diff-fingerprint';
import { withTaskLock } from '../state/coordination-lease-store';
import { readLease } from '../state/coordination-lease-store';
import { readEngineerBindingStatus, withEngineerBindingLock } from './binding-store';
import {
  listLiveClaimActorReceiptsForEngineer,
  readClaimActorReceipt,
  validateClaimActorReceiptLive,
} from './claim-actor-store';
import { loadEngineerProfile } from './profile-store';

const FREEZE_ROOT = 'repo-harness/engineers/v1/task-freezes';
const CHECKS_FILE = '.ai/harness/checks/latest.json';
const TASK_ID = /^[0-9a-f]{64}$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;

export interface WriterGrantFreezeObservationV1 {
  readonly grant_id: string;
  readonly grant_sha256: string;
}

export interface TaskFreezeStoreDependencies {
  readonly after_first_read?: () => void;
  /** ME-2B replaces the default absent authority with its exact current reader. */
  readonly read_writer_grant?: (repoRoot: string, taskId: string) => WriterGrantFreezeObservationV1 | null;
  readonly now?: () => string;
}

interface Snapshot {
  readonly receipt_input: Omit<TaskFreezeReceiptV1, 'protocol' | 'kind' | 'observed_at' | 'receipt_sha256'>;
  readonly tracked_dirty: boolean;
  readonly untracked_present: boolean;
  readonly checks_verified: boolean;
  readonly hypotheses_present: boolean;
}

type ActiveTaskFreezeBindingStatus = Omit<ReturnType<typeof readEngineerBindingStatus>, 'binding'> & {
  readonly binding: NonNullable<ReturnType<typeof readEngineerBindingStatus>['binding']>;
};

function digest(bytes: Buffer | string): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function gitBuffer(cwd: string, args: readonly string[]): Buffer {
  try {
    return execFileSync('git', [...args], {
      cwd,
      encoding: 'buffer',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch (error) {
    throw new TaskFreezeError('task_freeze_state_unavailable', `cannot observe Git state: git ${args.join(' ')}`, error);
  }
}

function gitText(cwd: string, args: readonly string[]): string {
  return gitBuffer(cwd, args).toString('utf8').trimEnd();
}

function regularBytes(path: string, missing: string): Buffer {
  if (!existsSync(path)) return Buffer.from(missing, 'utf8');
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new TaskFreezeError('task_freeze_state_unavailable', `observation path is not a regular file: ${path}`);
  }
  return readFileSync(path);
}

function notesPath(worktree: string, unitRef: string): string | null {
  const name = basename(unitRef);
  if (!name.startsWith('plan-') || !name.endsWith('.md')) return null;
  return join(worktree, 'tasks', 'notes', `${name.slice('plan-'.length, -'.md'.length)}.notes.md`);
}

function openQuestionsBytes(worktree: string, unitRef: string): { bytes: Buffer; present: boolean } {
  const path = notesPath(worktree, unitRef);
  if (path === null || !existsSync(path)) return { bytes: Buffer.from('missing\n'), present: false };
  const raw = regularBytes(path, 'missing\n').toString('utf8');
  const header = raw.match(/^## Open Questions[ \t]*\r?$/mu);
  if (!header || header.index === undefined) return { bytes: Buffer.from('missing-section\n'), present: true };
  const tail = raw.slice(header.index + header[0].length).replace(/^\r?\n/u, '');
  const next = tail.search(/^## /mu);
  const section = (next === -1 ? tail : tail.slice(0, next)).trim();
  return { bytes: Buffer.from(`${section}\n`, 'utf8'), present: section !== '- None.' };
}

function checksObservation(worktree: string, unitRef: string): { bytes: Buffer; verified: boolean } {
  const path = join(worktree, CHECKS_FILE);
  const bytes = regularBytes(path, 'missing\n');
  if (bytes.equals(Buffer.from('missing\n'))) return { bytes, verified: false };
  try {
    const value = JSON.parse(bytes.toString('utf8')) as Record<string, unknown>;
    const contract = value.contract;
    const changeAssessment = value.change_assessment;
    const assessment = changeAssessment && typeof changeAssessment === 'object' && !Array.isArray(changeAssessment)
      ? (changeAssessment as Record<string, unknown>).assessment
      : null;
    const base = resolvePolicyReviewBase(worktree);
    const targetRef = base.ok ? base.targetRef : null;
    const subject = targetRef === null ? null : buildReviewSubject(worktree, { targetRef });
    const verified = value.status === 'pass'
      && !!contract
      && typeof contract === 'object'
      && !Array.isArray(contract)
      && (contract as Record<string, unknown>).file === unitRef.replace(/^plans\/plan-/, 'tasks/contracts/').replace(/\.md$/u, '.contract.md')
      && !!subject
      && subject.status === 'ok'
      && !!assessment
      && typeof assessment === 'object'
      && !Array.isArray(assessment)
      && value.review_subject_sha256 === subject.review_subject_sha256
      && (assessment as Record<string, unknown>).review_subject_sha256 === subject.review_subject_sha256
      && (assessment as Record<string, unknown>).target_ref === targetRef
      && (assessment as Record<string, unknown>).target_revision === subject.target_rev;
    return { bytes, verified };
  } catch {
    return { bytes, verified: false };
  }
}

function untrackedInventory(worktree: string): { bytes: Buffer; present: boolean } {
  const raw = gitBuffer(worktree, ['ls-files', '--others', '--exclude-standard', '-z']);
  const paths: Buffer[] = [];
  let start = 0;
  for (let index = 0; index < raw.length; index += 1) {
    if (raw[index] !== 0) continue;
    if (index > start) paths.push(raw.subarray(start, index));
    start = index + 1;
  }
  if (start < raw.length) paths.push(raw.subarray(start));
  paths.sort(Buffer.compare);
  const encoded: Buffer[] = [];
  for (const path of paths) {
    const absolute = Buffer.concat([Buffer.from(worktree, 'utf8'), Buffer.from('/'), path]);
    let type: string;
    try {
      const stat = lstatSync(absolute);
      if (stat.isFile()) type = 'file';
      else if (stat.isSymbolicLink()) type = 'symlink';
      else if (stat.isDirectory()) type = 'directory';
      else if (stat.isFIFO()) type = 'fifo';
      else if (stat.isSocket()) type = 'socket';
      else if (stat.isBlockDevice()) type = 'block-device';
      else if (stat.isCharacterDevice()) type = 'character-device';
      else throw new Error('unsupported filesystem entry type');
    } catch (error) {
      throw new TaskFreezeError('task_freeze_state_unavailable', 'cannot classify an untracked filesystem entry', error);
    }
    encoded.push(path, Buffer.from([0]), Buffer.from(type, 'ascii'), Buffer.from([0]));
  }
  return {
    bytes: Buffer.concat(encoded),
    present: paths.length > 0,
  };
}

function assertWorktree(root: string, expected: string): string {
  let actual: string;
  try {
    actual = realpathSync(expected);
  } catch (error) {
    throw new TaskFreezeError('task_freeze_state_unavailable', `bound worktree is unavailable: ${expected}`, error);
  }
  const top = realpathSync(gitText(actual, ['rev-parse', '--show-toplevel']));
  if (top !== actual) throw new TaskFreezeError('task_freeze_state_unavailable', `bound worktree root mismatch: ${actual}`);
  const common = realpathSync(resolveGitCommonDirectory(root));
  const observedCommon = realpathSync(resolveGitCommonDirectory(actual));
  if (observedCommon !== common) throw new TaskFreezeError('task_freeze_state_unavailable', 'bound worktree belongs to another Git common directory');
  return actual;
}

function readCurrentTaskFreezeBinding(repoRoot: string, engineerId: string): ActiveTaskFreezeBindingStatus {
  const profile = loadEngineerProfile(repoRoot, engineerId);
  const binding = readEngineerBindingStatus(repoRoot, engineerId, profile.engineer_contract_revision);
  const active = binding.binding;
  if (binding.current.state !== 'active' || active === null) {
    throw new TaskFreezeError('task_freeze_binding_stale', 'Engineer Binding is not active');
  }
  return Object.freeze({ ...binding, binding: active });
}

function readTaskFreezeSnapshot(
  repoRoot: string,
  engineerId: string,
  taskId: string,
  claimId: string,
  dependencies: TaskFreezeStoreDependencies,
): Snapshot {
  const binding = readCurrentTaskFreezeBinding(repoRoot, engineerId);
  const actor = readClaimActorReceipt(repoRoot, taskId, claimId);
  if (actor === null || actor.engineer_id !== engineerId
    || actor.binding_id !== binding.binding.binding_id
    || actor.binding_generation !== binding.binding.binding_generation) {
    throw new TaskFreezeError('task_freeze_binding_stale', 'Claim actor does not match the current Engineer Binding');
  }
  const envelopePath = join(actor.worktree_path, '.ai/harness/handoff/work-envelope.json');
  let envelope: WorkEnvelopeV1;
  let envelopeBytes: Buffer;
  try {
    envelopeBytes = regularBytes(envelopePath, 'missing\n');
    envelope = JSON.parse(envelopeBytes.toString('utf8')) as WorkEnvelopeV1;
  } catch (error) {
    throw new TaskFreezeError('task_freeze_state_unavailable', `exact WorkEnvelope is unavailable: ${envelopePath}`, error);
  }
  validateClaimActorReceiptLive(repoRoot, actor, envelope);
  const lease = readLease(repoRoot, taskId);
  if (lease.raw === null) throw new TaskFreezeError('task_freeze_state_unavailable', 'live Lease bytes are unavailable');
  const worktree = assertWorktree(repoRoot, actor.worktree_path);
  const branch = gitText(worktree, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  if (branch !== actor.branch) throw new TaskFreezeError('task_freeze_state_unavailable', 'bound branch does not match current Git branch');
  const head = gitText(worktree, ['rev-parse', 'HEAD']);
  const tree = gitText(worktree, ['rev-parse', 'HEAD^{tree}']);
  const diff = gitBuffer(worktree, ['diff', '--binary', '--no-ext-diff', 'HEAD', '--']);
  const inventory = untrackedInventory(worktree);
  const checks = checksObservation(worktree, actor.unit_ref);
  const hypotheses = openQuestionsBytes(worktree, actor.unit_ref);
  const writerGrant = dependencies.read_writer_grant?.(repoRoot, taskId) ?? null;
  return Object.freeze({
    receipt_input: Object.freeze({
      task: Object.freeze({
        task_id: actor.task_id,
        task_revision: actor.task_revision,
        claim_id: actor.claim_id,
        lease_generation: actor.lease_generation,
      }),
      engineer_id: actor.engineer_id,
      binding_id: actor.binding_id,
      binding_generation: actor.binding_generation,
      binding_current_sha256: binding.current.current_digest,
      claim_actor_receipt_sha256: actor.receipt_sha256,
      work_envelope_sha256: actor.work_envelope_sha256,
      work_envelope_bytes_sha256: digest(envelopeBytes),
      lease_state_sha256: digest(lease.raw),
      worktree,
      worktree_topology_sha256: digest(gitBuffer(repoRoot, ['worktree', 'list', '--porcelain'])),
      branch,
      unit_ref: actor.unit_ref,
      head_sha: head,
      tree_sha: tree,
      diff_sha256: digest(diff),
      untracked_inventory_sha256: digest(inventory.bytes),
      checks_state_sha256: digest(checks.bytes),
      unverified_hypotheses_sha256: digest(hypotheses.bytes),
      writer_grant_id: writerGrant?.grant_id ?? null,
      writer_grant_sha256: writerGrant?.grant_sha256 ?? null,
    }),
    tracked_dirty: diff.length > 0,
    untracked_present: inventory.present,
    checks_verified: checks.verified,
    hypotheses_present: hypotheses.present,
  });
}

function snapshotBytes(snapshot: Snapshot): string {
  return canonicalEngineerJson(snapshot);
}

function selectLiveClaim(repoRoot: string, engineerId: string): { task_id: string; claim_id: string } {
  const live = listLiveClaimActorReceiptsForEngineer(repoRoot, engineerId);
  if (live.length === 0) throw new TaskFreezeError('task_freeze_claim_missing', `engineer ${engineerId} has no live Claim`);
  if (live.length !== 1) throw new TaskFreezeError('task_freeze_claim_ambiguous', `engineer ${engineerId} has ${live.length} live Claims`);
  return { task_id: live[0]!.task_id, claim_id: live[0]!.claim_id };
}

function inspectBoundTaskLocked(
  repoRoot: string,
  engineerId: string,
  dependencies: TaskFreezeStoreDependencies,
  persist: boolean,
): TaskFreezeInspectionV1 {
  const selected = selectLiveClaim(repoRoot, engineerId);
  return withTaskLock(repoRoot, selected.task_id, () => {
    const first = readTaskFreezeSnapshot(repoRoot, engineerId, selected.task_id, selected.claim_id, dependencies);
    dependencies.after_first_read?.();
    const second = readTaskFreezeSnapshot(repoRoot, engineerId, selected.task_id, selected.claim_id, dependencies);
    if (snapshotBytes(first) !== snapshotBytes(second)) {
      throw new TaskFreezeError('task_freeze_changed_during_read', 'bound task changed during the freeze read');
    }
    const receipt = buildTaskFreezeReceipt({
      ...second.receipt_input,
      observed_at: (dependencies.now ?? (() => new Date().toISOString()))(),
    });
    const inspection = buildTaskFreezeInspection({
      receipt,
      tracked_dirty: second.tracked_dirty,
      untracked_present: second.untracked_present,
      checks_verified: second.checks_verified,
      hypotheses_present: second.hypotheses_present,
      writer_grant_active: second.receipt_input.writer_grant_id !== null,
    });
    if (persist) persistTaskFreezeReceipt(repoRoot, receipt);
    return inspection;
  });
}

export function inspectBoundTask(
  repoRootInput: string,
  engineerId: string,
  dependencies: TaskFreezeStoreDependencies = {},
): TaskFreezeInspectionV1 {
  const repoRoot = realpathSync(repoRootInput);
  return withEngineerBindingLock(
    repoRoot,
    engineerId,
    () => inspectBoundTaskLocked(repoRoot, engineerId, dependencies, false),
  );
}

function fsyncDirectory(path: string): void {
  const fd = openSync(path, constants.O_RDONLY);
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

function ensureDirectory(common: string, target: string): void {
  const scoped = relative(common, target);
  if (!scoped || scoped === '..' || scoped.startsWith(`..${sep}`)) {
    throw new TaskFreezeError('task_freeze_invalid', `freeze path escapes Git common directory: ${target}`);
  }
  let current = common;
  for (const part of scoped.split(sep)) {
    current = join(current, part);
    if (!existsSync(current)) {
      try {
        mkdirSync(current, { mode: 0o700 });
        fsyncDirectory(dirname(current));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      }
    }
    const stat = lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new TaskFreezeError('task_freeze_invalid', `unsafe freeze directory: ${current}`);
  }
}

function receiptPath(repoRoot: string, receipt: TaskFreezeReceiptV1): { common: string; root: string; task: string; file: string } {
  const common = resolve(resolveGitCommonDirectory(repoRoot));
  const root = join(common, FREEZE_ROOT);
  const task = join(root, receipt.task.task_id);
  return { common, root, task, file: join(task, `${receipt.receipt_sha256.slice('sha256:'.length)}.json`) };
}

export function persistTaskFreezeReceipt(repoRoot: string, receiptInput: TaskFreezeReceiptV1): TaskFreezeReceiptV1 {
  const receipt = validateTaskFreezeReceipt(receiptInput);
  const paths = receiptPath(repoRoot, receipt);
  ensureDirectory(paths.common, paths.task);
  const bytes = canonicalTaskFreezeReceiptBytes(receipt);
  try {
    const fd = openSync(paths.file, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    try { writeFileSync(fd, bytes, 'utf8'); fsyncSync(fd); } finally { closeSync(fd); }
    fsyncDirectory(paths.task);
    return receipt;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const existing = readFileSync(paths.file, 'utf8');
    if (existing === bytes) return receipt;
    throw new TaskFreezeError('task_freeze_conflict', 'freeze receipt identity already contains different bytes');
  }
}

export function createTaskFreeze(
  repoRootInput: string,
  engineerId: string,
  dependencies: TaskFreezeStoreDependencies = {},
): TaskFreezeInspectionV1 {
  const repoRoot = realpathSync(repoRootInput);
  return withEngineerBindingLock(
    repoRoot,
    engineerId,
    () => inspectBoundTaskLocked(repoRoot, engineerId, dependencies, true),
  );
}

export function readTaskFreezeReceipt(repoRoot: string, taskId: string, receiptSha256: string): TaskFreezeReceiptV1 {
  if (!TASK_ID.test(taskId) || !DIGEST.test(receiptSha256)) {
    throw new TaskFreezeError('task_freeze_invalid', 'unsafe freeze receipt identity');
  }
  const common = resolve(resolveGitCommonDirectory(repoRoot));
  const root = join(common, FREEZE_ROOT);
  const task = join(root, taskId);
  const paths = { common, root, task, file: join(task, `${receiptSha256.slice('sha256:'.length)}.json`) };
  if (!existsSync(paths.file)) throw new TaskFreezeError('task_freeze_state_unavailable', 'freeze receipt not found');
  const taskStat = lstatSync(paths.task);
  const fileStat = lstatSync(paths.file);
  if (!taskStat.isDirectory() || taskStat.isSymbolicLink() || !fileStat.isFile() || fileStat.isSymbolicLink()) {
    throw new TaskFreezeError('task_freeze_invalid', 'freeze receipt path is unsafe');
  }
  const raw = readFileSync(paths.file, 'utf8');
  const receipt = validateTaskFreezeReceipt(JSON.parse(raw));
  if (receipt.task.task_id !== taskId || receipt.receipt_sha256 !== receiptSha256 || canonicalTaskFreezeReceiptBytes(receipt) !== raw) {
    throw new TaskFreezeError('task_freeze_invalid', 'freeze receipt path/content identity mismatch');
  }
  return receipt;
}

export function verifyTaskFreeze(
  repoRoot: string,
  taskId: string,
  receiptSha256: string,
  dependencies: TaskFreezeStoreDependencies = {},
): { readonly receipt: TaskFreezeReceiptV1; readonly current: TaskFreezeInspectionV1 } {
  const receipt = readTaskFreezeReceipt(repoRoot, taskId, receiptSha256);
  const current = inspectBoundTask(repoRoot, receipt.engineer_id, dependencies);
  const changed = taskFreezeReceiptChangedFields(receipt, current.receipt);
  if (changed.length > 0) throw new TaskFreezeError('task_freeze_stale', `freeze receipt is stale: ${changed.join(', ')}`);
  return Object.freeze({ receipt, current });
}
