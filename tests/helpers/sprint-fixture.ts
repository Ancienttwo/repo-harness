import type { LeaseOwnerRecord, CurrentPublicationPointerV1 } from '../../src/core/state/coordination-identity';
import { resolveGitCommonDirectory } from '../../src/effects/git/common-directory';
import { TASK_DIGEST_PATTERN } from '../../src/core/state/coordination-identity';

export const LEASE_OWNER_FILE_NAME = 'owner.json';
export function coordinationRoot(cwd: string): string {
  return join(resolveGitCommonDirectory(cwd), 'repo-harness/coordination/v1');
}
export function leaseDirectory(cwd: string, taskId: string): string {
  if (!TASK_DIGEST_PATTERN.test(taskId)) throw new Error('invalid historical fixture task id');
  return join(coordinationRoot(cwd), 'leases', taskId);
}
/**
 * Fixture helpers for backlog schema 2 sprints.
 *
 * A schema 2 `ID` cell is an opaque persisted value: the product mints one with
 * `od -An -tx1 -N32 /dev/urandom` and never derives it from anything. Fixtures
 * need the opposite property -- the same row must produce the same id on every
 * run so a test can name it -- so this helper hashes the Task cell to get a
 * stable, valid 64-hex value.
 *
 * This is a *test* convenience and deliberately lives outside `src/`: hashing
 * the Task cell to get an id is exactly the coupling schema 2 removes, and no
 * product code may do it.
 */
import { createHash } from 'crypto';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const FIXTURE_ID_DOMAIN = 'repo-harness-fixture-task-id';

/** A stable, valid persisted task id for one fixture Task cell. */
export function fixtureTaskId(taskCell: string): string {
  return createHash('sha256').update(`${FIXTURE_ID_DOMAIN}\0${taskCell}`, 'utf-8').digest('hex');
}

/** The header line every schema 2 sprint fixture must carry. */
export const FIXTURE_SCHEMA_HEADER = '> **Backlog Schema**: 2';

export interface FixtureRow {
  readonly index: number;
  readonly task: string;
  readonly status?: string;
  readonly mode?: string;
  readonly acceptance?: string;
  readonly plan?: string;
  /** Override the persisted id, for duplicate/malformed-id fixtures. */
  readonly id?: string;
}

/** One schema 2 backlog row line. */
export function fixtureRow(row: FixtureRow): string {
  return `| ${row.index} | ${row.id ?? fixtureTaskId(row.task)} | ${row.status ?? '[ ]'} | ${row.task} | ${row.mode ?? 'contract'} | ${row.acceptance ?? 'acceptance line'} | ${row.plan ?? '(pending)'} |`;
}

/** A whole schema 2 `## Backlog` table, header and separator included. */
export function fixtureBacklogTable(rows: readonly FixtureRow[]): string[] {
  return [
    '| # | ID | Status | Task | Mode | Acceptance | Plan |',
    '|---|----|--------|------|------|------------|------|',
    ...rows.map(fixtureRow),
  ];
}

/** Seed a historical token for completion and publication tests. */
export function writeClaimTokenFixture(input: {
  readonly worktree: string; readonly task_id: string; readonly claim_id: string;
  readonly sprint: string; readonly task: string; readonly unit_ref: string;
}): void {
  const dir = join(input.worktree, '.ai/harness/sprint/claims');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${input.task_id}.claim`),
    `claim_id=${input.claim_id}\ntask_id=${input.task_id}\nsprint=${input.sprint}\ntask=${input.task}\nunit_ref=${input.unit_ref}\n`);
}

/** Address the owner record in a real lease fixture. */
export function leaseOwnerPath(cwd: string, taskId: string): string {
  return join(leaseDirectory(cwd, taskId), LEASE_OWNER_FILE_NAME);
}

/** A historical bound row for tests of completion, publication and observation. */
export function boundLeaseFixture(record: LeaseOwnerRecord, input: {
  executionWorktree: string; branch: string; unitRef: string;
}): LeaseOwnerRecord {
  return { ...record, state: 'bound', execution_worktree: input.executionWorktree,
    branch: input.branch, unit_ref: input.unitRef };
}

/** Seed historical owner bytes. This helper does not implement lease transitions. */
export function seedLeaseDirectory(cwd: string, taskId: string): boolean {
  const path = leaseDirectory(cwd, taskId);
  if (existsSync(path)) return false;
  mkdirSync(path, { recursive: true });
  return true;
}
export function writeHistoricalLease(cwd: string, taskId: string, record: LeaseOwnerRecord): void {
  writeFileSync(leaseOwnerPath(cwd, taskId), serializeHistoricalLease(record));
}
type HistoricalLeaseResult = { ok: true; record: LeaseOwnerRecord } | { ok: false; error: string };
export function completingLeaseFixture(record: LeaseOwnerRecord, input: {
  claimId: string; executionWorktree: string; finishTransactionKey?: string | null;
}): HistoricalLeaseResult {
  return { ok: true, record: { ...record, state: 'completing', finish_transaction_key: input.finishTransactionKey ?? null,
    ...('record_schema' in record ? { current_publication: null } : {}),
  } as LeaseOwnerRecord };
}
export function reviewingLeaseFixture(record: LeaseOwnerRecord, input: {
  claimId: string; publication: CurrentPublicationPointerV1;
}): HistoricalLeaseResult {
  return { ok: true, record: { ...record, record_schema: 2, state: 'reviewing',
    finish_transaction_key: null, current_publication: input.publication } };
}

/** Canonical historical bytes for historical codec fixtures. */
export function serializeHistoricalLease(record: LeaseOwnerRecord): string {
  return `${JSON.stringify(record, null, 2)}\n`;
}
