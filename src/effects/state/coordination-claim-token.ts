/**
 * The worktree-local claim token, read.
 *
 * `writeClaimTokenForBoundLease` is the only writer. Both the legacy
 * sprint-backlog flow and fleet acquire reach it through `sprint
 * write-claim-token`, so token publication has the same task-lock and
 * fencing check in every acquisition path. `find_claim_token` in
 * `scripts/sprint-backlog.sh` remains the authority on its legacy lookup
 * semantics. Three outcomes, and the third is the point:
 *
 * ```sh
 * # 0 with the token path on stdout, 1 when this tree holds none, 2 when more
 * # than one matches -- ambiguity fails closed instead of picking a token.
 * ```
 *
 * This module reproduces that trichotomy exactly, including the refusal to
 * pick. A reader that returned the first match would hand a caller a
 * capability the shell would have refused to hand it, which is worse than no
 * reader at all.
 *
 * What the token is NOT: it is not the lease. The record on the shared plane
 * says who owns the row; the token is only this tree's proof that it may still
 * act on that ownership -- a tree the claim was stolen from keeps its stale
 * token and fails the claim-id comparison, which is the whole design. Nothing
 * here may be read as ownership on its own.
 *
 * Lookup key: `unit_ref`, not the shell's `(sprint, task)` pair. The hook's
 * question is "is THIS execution unit sprint-bound", and the active-plan
 * marker is the only identity a hook holds; matching on the task cell would
 * require the hook to already know which row it is, which is the fact it is
 * trying to establish. Contract mode writes `unit_ref = <captured plan path>`
 * and inline mode writes `inline:<sprint>#<index>`, so an inline token can
 * never collide with a `plans/plan-*.md` marker.
 */
import {
  closeSync,
  constants,
  fsyncSync,
  mkdirSync,
  openSync,
  readdirSync,
  realpathSync,
  renameSync,
  unlinkSync,
} from 'fs';
import { join } from 'path';
import { readText, repoPath } from './collect-state-inputs';
import { TASK_DIGEST_PATTERN, lookupCanonicalTask, PENDING_ROW_STATUS } from '../../core/state/coordination-identity';
import { readCanonicalSprint, resolveRepoIdentity } from './coordination-canonical-source';
import { readLease, withTaskLock } from './coordination-lease-store';
import { writeFileDurably } from '../evidence/atomic-append';

/** `claim_token_dir()`: sibling of the active-sprint marker. */
export const CLAIM_TOKEN_DIR = '.ai/harness/sprint/claims';

const CLAIM_TOKEN_SUFFIX = '.claim';

/** One token's fields, exactly the five `write_claim_token` emits. */
export interface ClaimTokenV1 {
  /** Repo-relative path of the token file. */
  readonly path: string;
  readonly claim_id: string;
  readonly task_id: string;
  readonly sprint: string;
  readonly task: string;
  readonly unit_ref: string;
}

export type ClaimTokenRead =
  /** This tree holds no token for the requested unit (`find_claim_token` -> 1). */
  | { readonly outcome: 'none' }
  /** More than one token matches (`find_claim_token` -> 2). Never resolved. */
  | { readonly outcome: 'ambiguous'; readonly matches: readonly string[] }
  | { readonly outcome: 'found'; readonly token: ClaimTokenV1 };

/** Inputs for the one lock-checked writer of a worktree-local claim token. */
export interface ClaimTokenWriteInput {
  readonly task_id: string;
  readonly claim_id: string;
  /** Existing execution worktree; canonicalized before comparison and write. */
  readonly worktree: string;
  readonly sprint: string;
  readonly task: string;
  readonly unit_ref: string;
}

/**
 * `claim_token_field()`: `sed -n "s/^<name>=//p" | head -1`. First line with
 * the prefix wins; the value is the rest of that line verbatim, so a value
 * containing `=` survives intact. A trailing CR is stripped because the shell
 * reads these files line-wise and a CRLF-written token would otherwise carry
 * an invisible byte into a claim-id comparison.
 */
function tokenField(raw: string, name: string): string {
  const prefix = `${name}=`;
  for (const line of raw.split('\n')) {
    if (line.startsWith(prefix)) return line.slice(prefix.length).replace(/\r$/, '');
  }
  return '';
}

/**
 * True when `raw` declares the same field twice.
 *
 * `tokenField` keeps the first occurrence; a reader that kept the last would
 * see a different capability in the same bytes. A token is a fencing
 * capability, so two readable answers is not a token -- it is refused.
 */
function hasDuplicateTokenFields(raw: string): boolean {
  const seen = new Set<string>();
  for (const line of raw.split('\n')) {
    const separator = line.indexOf('=');
    if (separator <= 0) continue;
    const name = line.slice(0, separator);
    if (seen.has(name)) return true;
    seen.add(name);
  }
  return false;
}

function parseToken(path: string, raw: string): ClaimTokenV1 | null {
  if (hasDuplicateTokenFields(raw)) return null;
  const claimId = tokenField(raw, 'claim_id');
  const taskId = tokenField(raw, 'task_id');
  const unitRef = tokenField(raw, 'unit_ref');
  // A token missing any of the three fields the gate keys off is not a
  // partial capability, it is an unreadable one; it never matches, so it can
  // neither arm the gate nor be counted toward ambiguity.
  if (!claimId || !taskId || !unitRef) return null;
  return {
    path,
    claim_id: claimId,
    task_id: taskId,
    sprint: tokenField(raw, 'sprint'),
    task: tokenField(raw, 'task'),
    unit_ref: unitRef,
  };
}

function assertTokenField(name: string, value: string): void {
  if (!value || value.includes('\0') || value.includes('\n') || value.includes('\r')) {
    throw new Error(`invalid claim token ${name}`);
  }
}

function serializeToken(input: ClaimTokenWriteInput): string {
  return [
    `claim_id=${input.claim_id}`,
    `task_id=${input.task_id}`,
    `sprint=${input.sprint}`,
    `task=${input.task}`,
    `unit_ref=${input.unit_ref}`,
    '',
  ].join('\n');
}

function fsyncDirectory(path: string): void {
  const fd = openSync(path, constants.O_RDONLY);
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

/**
 * Atomically replace one token after the caller proved its current lease
 * binding. The target is confined to the named worktree before and after its
 * parent exists, so a `.ai` symlink cannot turn a token capability into a
 * write outside that worktree.
 */
function writeTokenAtomically(worktree: string, input: ClaimTokenWriteInput): ClaimTokenV1 {
  const directory = repoPath(worktree, CLAIM_TOKEN_DIR);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const canonicalDirectory = repoPath(worktree, CLAIM_TOKEN_DIR);
  const target = join(canonicalDirectory, `${input.task_id}${CLAIM_TOKEN_SUFFIX}`);
  const temporary = join(
    canonicalDirectory,
    `.${input.task_id}${CLAIM_TOKEN_SUFFIX}.tmp-${process.pid}-${Date.now()}`,
  );
  try {
    writeFileDurably(temporary, serializeToken(input));
    renameSync(temporary, target);
    fsyncDirectory(canonicalDirectory);
  } catch (error) {
    try {
      unlinkSync(temporary);
    } catch {
      // The temporary file may not exist. Preserve the primary write failure.
    }
    throw error;
  }
  return {
    path: `${CLAIM_TOKEN_DIR}/${input.task_id}${CLAIM_TOKEN_SUFFIX}`,
    claim_id: input.claim_id,
    task_id: input.task_id,
    sprint: input.sprint,
    task: input.task,
    unit_ref: input.unit_ref,
  };
}

/**
 * Write the capability token only for the still-current `bound` lease that
 * names this exact worktree and work unit. The canonical sprint is re-read
 * inside the same task lock: shell fields remain a projection of the task
 * authority rather than an independently supplied task identity.
 */
export function writeClaimTokenForBoundLease(cwd: string, input: ClaimTokenWriteInput): ClaimTokenV1 {
  if (!TASK_DIGEST_PATTERN.test(input.task_id)) {
    throw new Error(`malformed task id: ${input.task_id}`);
  }
  for (const [name, value] of Object.entries(input)) {
    if (name !== 'worktree') assertTokenField(name, value);
  }

  const worktree = realpathSync(input.worktree);
  return withTaskLock(cwd, input.task_id, () => {
    const lease = readLease(cwd, input.task_id);
    if (lease.record === null) {
      throw new Error(
        `cannot write claim token for ${input.task_id}: lease is ${lease.classification}`
        + `${lease.unknown_reason ? ` (${lease.unknown_reason})` : ''}`,
      );
    }
    if (lease.record.claim_id !== input.claim_id) {
      throw new Error(
        `cannot write claim token for ${input.task_id}: claim id mismatch (${lease.record.claim_id}, not ${input.claim_id})`,
      );
    }
    if (lease.record.state !== 'bound') {
      throw new Error(`cannot write claim token for ${input.task_id}: lease is ${lease.record.state}, not bound`);
    }
    if (lease.record.execution_worktree !== worktree) {
      throw new Error(
        `cannot write claim token for ${input.task_id}: lease is bound to ${lease.record.execution_worktree}, not ${worktree}`,
      );
    }
    if (lease.record.sprint_path !== input.sprint) {
      throw new Error(`cannot write claim token for ${input.task_id}: sprint path mismatch`);
    }
    if (lease.record.unit_ref !== input.unit_ref) {
      throw new Error(`cannot write claim token for ${input.task_id}: unit ref mismatch`);
    }

    const canonical = readCanonicalSprint(cwd, {
      targetRef: lease.record.target_ref,
      sprintPath: input.sprint,
    });
    if (!canonical.ok) throw new Error(canonical.error);
    const task = lookupCanonicalTask({
      repoIdentity: resolveRepoIdentity(cwd),
      sprintPath: input.sprint,
      sprintText: canonical.text,
    }, input.task_id);
    if (!task.ok) throw new Error(task.error);
    if (task.task.row.status !== PENDING_ROW_STATUS) {
      throw new Error(`cannot write claim token for ${input.task_id}: canonical row is not pending`);
    }
    // Revision first: under backlog schema 2 the Task cell is part of the
    // revision preimage, so a title edit since the lease was taken is revision
    // drift and must be reported as that. The Task cell comparison below is a
    // caller-consistency check against `--task`, not an identity check.
    if (task.task.task_revision !== lease.record.task_revision) {
      throw new Error(`cannot write claim token for ${input.task_id}: task revision mismatch`);
    }
    if (task.task.row.task !== input.task) {
      throw new Error(`cannot write claim token for ${input.task_id}: task cell mismatch`);
    }
    return writeTokenAtomically(worktree, { ...input, worktree });
  });
}

/**
 * The token this tree holds for one task id, addressed by identity.
 *
 * The file *is* `<task_id>.claim`, so this is one read rather than a scan, and
 * a token whose own `task_id` disagrees with the name it is filed under is
 * refused rather than trusted.
 */
export function readClaimTokenForTask(cwd: string, taskId: string): ClaimTokenRead {
  if (!/^[0-9a-f]{64}$/.test(taskId)) return { outcome: 'none' };
  const relative = join(CLAIM_TOKEN_DIR, `${taskId}${CLAIM_TOKEN_SUFFIX}`);
  const raw = readText(cwd, relative);
  if (raw === null) return { outcome: 'none' };
  const token = parseToken(relative, raw);
  if (token === null || token.task_id !== taskId) {
    return { outcome: 'ambiguous', matches: [relative] };
  }
  return { outcome: 'found', token };
}

/** Remove the token this tree holds for one task id, if any. */
export function removeClaimTokenForTask(cwd: string, taskId: string): void {
  if (!/^[0-9a-f]{64}$/.test(taskId)) return;
  const target = repoPath(cwd, join(CLAIM_TOKEN_DIR, `${taskId}${CLAIM_TOKEN_SUFFIX}`));
  try {
    unlinkSync(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

/**
 * Every token this tree holds for `unitRef`, resolved through the same
 * repository containment `readText` enforces on every other state source. The
 * directory listing is sorted so an ambiguous result names its matches in a
 * stable order.
 *
 * Throws only on a genuine IO failure the caller must decide about (a
 * permission error, an unreadable directory entry); a missing claims
 * directory is `none`, because a repository that never ran `start-task` is
 * not a failure.
 */
export function findClaimTokenByUnitRef(cwd: string, unitRef: string): ClaimTokenRead {
  if (!unitRef) return { outcome: 'none' };
  let entries: readonly string[];
  try {
    entries = readdirSync(repoPath(cwd, CLAIM_TOKEN_DIR), { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(CLAIM_TOKEN_SUFFIX))
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT'
      || (error as NodeJS.ErrnoException).code === 'ENOTDIR') {
      return { outcome: 'none' };
    }
    throw error;
  }

  const matches: ClaimTokenV1[] = [];
  for (const name of entries) {
    const relative = join(CLAIM_TOKEN_DIR, name);
    const raw = readText(cwd, relative);
    if (raw === null) continue;
    const token = parseToken(relative, raw);
    if (token !== null && token.unit_ref === unitRef) matches.push(token);
  }

  if (matches.length === 0) return { outcome: 'none' };
  if (matches.length > 1) {
    return { outcome: 'ambiguous', matches: matches.map((token) => token.path) };
  }
  return { outcome: 'found', token: matches[0]! };
}
