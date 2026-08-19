/**
 * The worktree-local claim token, read.
 *
 * `scripts/sprint-backlog.sh` is the only writer (`write_claim_token`, called
 * exactly twice, both inside `start-task`) and its `find_claim_token` is the
 * authority on lookup semantics. Three outcomes, and the third is the point:
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
import { readdirSync } from 'fs';
import { join } from 'path';
import { readText, repoPath } from './collect-state-inputs';

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

function parseToken(path: string, raw: string): ClaimTokenV1 | null {
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
