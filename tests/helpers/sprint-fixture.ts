import { resolveGitCommonDirectory } from '../../src/effects/git/common-directory';
import { TASK_DIGEST_PATTERN } from '../../src/core/state/coordination-identity';
import { createHash } from 'crypto';
import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';

export function coordinationRoot(cwd: string): string {
  return join(resolveGitCommonDirectory(cwd), 'repo-harness/coordination/v1');
}
export function leaseDirectory(cwd: string, taskId: string): string {
  if (!TASK_DIGEST_PATTERN.test(taskId)) throw new Error('invalid fixture task id');
  return join(coordinationRoot(cwd), 'leases', taskId);
}

const FIXTURE_ID_DOMAIN = 'repo-harness-fixture-task-id';

/**
 * A stable, valid 64-hex task id for one fixture label. Tests need the same id
 * on every run; this is a test-only convenience and no product code may derive
 * an identity this way.
 */
export function fixtureTaskId(taskCell: string): string {
  return createHash('sha256').update(`${FIXTURE_ID_DOMAIN}\0${taskCell}`, 'utf-8').digest('hex');
}

/** Seed historical owner bytes. This helper does not implement lease transitions. */
export function seedLeaseDirectory(cwd: string, taskId: string): boolean {
  const path = leaseDirectory(cwd, taskId);
  if (existsSync(path)) return false;
  mkdirSync(path, { recursive: true });
  return true;
}
