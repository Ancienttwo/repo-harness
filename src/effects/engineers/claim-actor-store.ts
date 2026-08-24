import { constants, closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, relative, resolve, sep } from 'path';

import {
  EngineerPrincipalError,
  canonicalClaimActorReceiptBytes,
  validateClaimActorReceipt,
  workEnvelopeSha256,
  type ClaimActorEnvelope,
  type ClaimActorReceiptV1,
} from '../../core/engineers/principal-claim';
import { resolveGitCommonDirectory } from '../git/common-directory';
import { readLease, type LeaseRead } from '../state/coordination-lease-store';

const RECEIPT_ROOT = 'repo-harness/engineers/v1/claim-actors';
const TASK_ID = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function pathFor(cwd: string, taskId: string, claimId: string): { common: string; root: string; task: string; receipt: string } {
  if (!TASK_ID.test(taskId) || !UUID.test(claimId)) throw new EngineerPrincipalError('claim_actor_receipt_invalid', 'unsafe claim actor receipt identity');
  const common = resolve(resolveGitCommonDirectory(cwd));
  const root = join(common, RECEIPT_ROOT);
  const task = join(root, taskId);
  return { common, root, task, receipt: join(task, `${claimId}.json`) };
}

function fsyncDirectory(path: string): void {
  const fd = openSync(path, constants.O_RDONLY);
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

function ensureSafeDirectory(root: string, target: string): void {
  const scoped = relative(root, target);
  if (!scoped || scoped === '..' || scoped.startsWith(`..${sep}`)) {
    throw new EngineerPrincipalError('claim_actor_receipt_invalid', `claim actor receipt directory escapes Git common dir: ${target}`);
  }
  let current = root;
  for (const component of scoped.split(sep)) {
    current = join(current, component);
    try {
      const stat = lstatSync(current);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new EngineerPrincipalError('claim_actor_receipt_invalid', `unsafe claim actor receipt directory: ${current}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      try { mkdirSync(current, { mode: 0o700 }); } catch (mkdirError) {
        if ((mkdirError as NodeJS.ErrnoException).code !== 'EEXIST') throw mkdirError;
      }
      const stat = lstatSync(current);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new EngineerPrincipalError('claim_actor_receipt_invalid', `unsafe claim actor receipt directory: ${current}`);
      fsyncDirectory(dirname(current));
    }
  }
}

function safeDirectoryExists(root: string, target: string): boolean {
  const scoped = relative(root, target);
  if (!scoped || scoped === '..' || scoped.startsWith(`..${sep}`)) {
    throw new EngineerPrincipalError('claim_actor_receipt_invalid', `claim actor receipt directory escapes Git common dir: ${target}`);
  }
  let current = root;
  for (const component of scoped.split(sep)) {
    current = join(current, component);
    try {
      const stat = lstatSync(current);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new EngineerPrincipalError('claim_actor_receipt_invalid', `unsafe claim actor receipt directory: ${current}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
  }
  return true;
}

function parse(raw: string): ClaimActorReceiptV1 {
  try {
    const receipt = validateClaimActorReceipt(JSON.parse(raw));
    if (raw !== canonicalClaimActorReceiptBytes(receipt)) throw new Error('not canonical');
    return receipt;
  } catch (error) {
    if (error instanceof EngineerPrincipalError) throw error;
    throw new EngineerPrincipalError('claim_actor_receipt_invalid', 'claim actor receipt is invalid', error);
  }
}

export function readClaimActorReceipt(cwd: string, taskId: string, claimId: string): ClaimActorReceiptV1 | null {
  const paths = pathFor(cwd, taskId, claimId);
  if (!safeDirectoryExists(paths.common, paths.task) || !existsSync(paths.receipt)) return null;
  const stat = lstatSync(paths.receipt);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new EngineerPrincipalError('claim_actor_receipt_invalid', 'claim actor receipt path is unsafe');
  return parse(readFileSync(paths.receipt, 'utf8'));
}

export function publishClaimActorReceipt(cwd: string, receiptInput: ClaimActorReceiptV1): ClaimActorReceiptV1 {
  const receipt = validateClaimActorReceipt(receiptInput);
  const paths = pathFor(cwd, receipt.task_id, receipt.claim_id);
  ensureSafeDirectory(paths.common, paths.task);
  const bytes = canonicalClaimActorReceiptBytes(receipt);
  try {
    const fd = openSync(paths.receipt, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    try {
      writeFileSync(fd, bytes, { encoding: 'utf8' });
      fsyncSync(fd);
    } finally { closeSync(fd); }
    fsyncDirectory(paths.task);
    fsyncDirectory(paths.root);
    return receipt;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const existing = readClaimActorReceipt(cwd, receipt.task_id, receipt.claim_id);
    if (existing && canonicalClaimActorReceiptBytes(existing) === bytes) return existing;
    throw new EngineerPrincipalError('claim_actor_receipt_conflict', 'claim actor receipt identity already contains different bytes');
  }
}

export function validateClaimActorReceiptLive<TEnvelope extends ClaimActorEnvelope>(
  cwd: string,
  receiptInput: ClaimActorReceiptV1,
  envelope: TEnvelope,
  leaseReader: (cwd: string, taskId: string) => LeaseRead = readLease,
): ClaimActorReceiptV1 {
  const receipt = validateClaimActorReceipt(receiptInput);
  if (receipt.task_id !== envelope.task_id
    || receipt.task_revision !== envelope.task_revision
    || receipt.claim_id !== envelope.claim_id
    || receipt.lease_generation !== envelope.generation
    || receipt.repository_id !== envelope.repo_id
    || receipt.authorization_revision !== envelope.authorization_revision
    || receipt.worktree_path !== envelope.worktree_path
    || receipt.branch !== envelope.branch
    || receipt.unit_ref !== envelope.unit_ref
    || receipt.work_envelope_sha256 !== workEnvelopeSha256(envelope)) {
    throw new EngineerPrincipalError('claim_actor_receipt_invalid', 'claim actor receipt does not match WorkEnvelope');
  }
  const lease = leaseReader(cwd, envelope.task_id).record;
  if (!lease || lease.claim_id !== envelope.claim_id || lease.generation !== envelope.generation
    || lease.task_revision !== envelope.task_revision || lease.state !== 'bound' || lease.execution_worktree !== envelope.worktree_path
    || lease.branch !== envelope.branch || lease.unit_ref !== envelope.unit_ref) {
    throw new EngineerPrincipalError('claim_actor_receipt_invalid', 'claim actor receipt does not match live Lease');
  }
  return receipt;
}
