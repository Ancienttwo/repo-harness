import { existsSync, lstatSync, readFileSync, readdirSync } from 'fs';
import { join, relative, resolve, sep } from 'path';

import {
  EngineerPrincipalError,
  canonicalClaimActorReceiptBytes,
  validateClaimActorReceipt,
  type ClaimActorReceiptV1,
} from '../../core/engineers/principal-claim';
import { resolveGitCommonDirectory } from '../git/common-directory';
import { readLease, type LeaseRead } from '../state/coordination-lease-store';

const RECEIPT_ROOT = 'repo-harness/engineers/v1/claim-actors';
const TASK_ID = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ENGINEER_ID = /^engineer:capability\.[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$/;

function pathFor(cwd: string, taskId: string, claimId: string): { common: string; root: string; task: string; receipt: string } {
  if (!TASK_ID.test(taskId) || !UUID.test(claimId)) throw new EngineerPrincipalError('claim_actor_receipt_invalid', 'unsafe claim actor receipt identity');
  const common = resolve(resolveGitCommonDirectory(cwd));
  const root = join(common, RECEIPT_ROOT);
  const task = join(root, taskId);
  return { common, root, task, receipt: join(task, `${claimId}.json`) };
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

export function readClaimActorReceipt(cwd: string, taskId: string, claimId: string, budget?: { max_bytes: number; charge: (bytes: number) => void }): ClaimActorReceiptV1 | null {
  const paths = pathFor(cwd, taskId, claimId);
  if (!safeDirectoryExists(paths.common, paths.task) || !existsSync(paths.receipt)) return null;
  const stat = lstatSync(paths.receipt);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new EngineerPrincipalError('claim_actor_receipt_invalid', 'claim actor receipt path is unsafe');
  if (budget) {
    if (stat.size > budget.max_bytes) throw new EngineerPrincipalError('claim_actor_receipt_invalid', 'claim actor receipt exceeds read budget');
    budget.charge(stat.size);
  }
  return parse(readFileSync(paths.receipt, 'utf8'));
}

/**
 * Read immutable actor receipts and retain only Claims that are still the live
 * Lease owner. Historical receipts never count toward Profile concurrency. An
 * unknown Lease behind one of this Engineer's receipts fails closed.
 */
export function listLiveClaimActorReceiptsForEngineer(
  cwd: string,
  engineerId: string,
  leaseReader: (cwd: string, taskId: string) => LeaseRead = readLease,
): readonly ClaimActorReceiptV1[] {
  if (!ENGINEER_ID.test(engineerId)) {
    throw new EngineerPrincipalError('claim_actor_receipt_invalid', 'engineer_id is invalid for Claim actor listing');
  }
  const common = resolve(resolveGitCommonDirectory(cwd));
  const root = join(common, RECEIPT_ROOT);
  if (!safeDirectoryExists(common, root)) return Object.freeze([]);
  const receipts: ClaimActorReceiptV1[] = [];
  for (const taskId of readdirSync(root).sort()) {
    if (!TASK_ID.test(taskId)) throw new EngineerPrincipalError('claim_actor_receipt_invalid', `unexpected Claim actor task entry: ${taskId}`);
    const taskPath = join(root, taskId);
    const taskStat = lstatSync(taskPath);
    if (!taskStat.isDirectory() || taskStat.isSymbolicLink()) {
      throw new EngineerPrincipalError('claim_actor_receipt_invalid', `unsafe Claim actor task directory: ${taskId}`);
    }
    for (const entry of readdirSync(taskPath).sort()) {
      const claimId = entry.endsWith('.json') ? entry.slice(0, -'.json'.length) : '';
      if (!UUID.test(claimId)) throw new EngineerPrincipalError('claim_actor_receipt_invalid', `unexpected Claim actor receipt entry: ${entry}`);
      const path = join(taskPath, entry);
      const stat = lstatSync(path);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new EngineerPrincipalError('claim_actor_receipt_invalid', `unsafe Claim actor receipt: ${entry}`);
      const receipt = parse(readFileSync(path, 'utf8'));
      if (receipt.task_id !== taskId || receipt.claim_id !== claimId) {
        throw new EngineerPrincipalError('claim_actor_receipt_invalid', `Claim actor receipt identity does not match path: ${entry}`);
      }
      if (receipt.engineer_id !== engineerId) continue;
      const read = leaseReader(cwd, taskId);
      // An unknown Lease cannot prove this Claim ended; refuse instead of undercounting.
      // The receipt itself is valid, so the code names the unavailable Lease
      // state and points the operator at the Lease, not the receipt store.
      if (read.classification === 'unknown') {
        throw new EngineerPrincipalError('claim_actor_lease_unavailable', `cannot prove Claim ${claimId} ended: Lease is unknown (${read.unknown_reason})`);
      }
      const lease = read.record;
      if (lease && lease.claim_id === claimId && lease.generation === receipt.lease_generation
        && lease.task_revision === receipt.task_revision && lease.state !== 'released') receipts.push(receipt);
    }
  }
  return Object.freeze(receipts);
}
