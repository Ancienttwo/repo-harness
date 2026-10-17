/** Read retained worktree claim tokens. Lease records own task identity. */
import { readdirSync } from 'fs';
import { join } from 'path';
import { readText, repoPath } from './collect-state-inputs';

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

/**
 * Every token this tree holds for `unitRef`, resolved through the same
 * repository containment `readText` enforces on every other state source. The
 * directory listing is sorted so an ambiguous result names its matches in a
 * stable order.
 *
 * Throws only on a genuine IO failure the caller must decide about (a
 * permission error, an unreadable directory entry); a missing claims
 * directory is `none`: it has no recorded claim token.
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

/**
 * The token this tree holds for its active plan. `activePlanMarker` is the
 * trimmed `.ai/harness/active-plan` text from the state collector; no marker
 * names no unit, so it names no token.
 */
export function findClaimTokenForActivePlan(cwd: string, activePlanMarker: string | null): ClaimTokenRead {
  return activePlanMarker ? findClaimTokenByUnitRef(cwd, activePlanMarker) : { outcome: 'none' };
}
