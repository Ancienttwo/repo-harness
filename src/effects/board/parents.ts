import { spawnSync } from 'child_process';
import type { BoardHostPortsV1 } from '../../core/board/board';
import { projectBoardParents, type BoardParentsV1 } from '../../core/board/parents';
import { decodeOpenIssuesRead } from '../../core/board/source';
import { seatTerminalsWithBranches } from './collect';

const GH_TIMEOUT_MS = 60_000;

/** The open issues of the local repository with their sub-issue counts, newest update first; gh follows `endCursor`. */
export const OPEN_ISSUES_QUERY = `query($owner: String!, $name: String!, $endCursor: String) {
  repository(owner: $owner, name: $name) {
    databaseId nameWithOwner
    issues(states: OPEN, first: 100, after: $endCursor, orderBy: { field: UPDATED_AT, direction: DESC }) {
      pageInfo { hasNextPage endCursor }
      nodes { number title url updatedAt subIssuesSummary { total completed } }
    }
  }
}`;

/** The two reads of the parent list; each failure is the whole result, and the operator shows its code. */
export class BoardParentsError extends Error {
  constructor(readonly code: 'parents_github_failed' | 'parents_hc_failed', message: string) {
    super(message);
    this.name = 'BoardParentsError';
  }
}

export interface BoardParentsCollectInput {
  readonly repo_root: string;
  readonly host: BoardHostPortsV1;
  /** Effect seam for tests: answers the gh argument list. */
  readonly gh_runner?: (args: readonly string[]) => { readonly status: number; readonly stdout: string; readonly stderr?: string };
  readonly now?: () => Date;
}

/**
 * One paginated GraphQL read of the open issues, one hc list of the
 * repository's seat terminals and one git read of each seat's branch. gh fills
 * `{owner}` and `{repo}` from the checkout, so no other read names the
 * repository.
 */
export function collectBoardParents(input: BoardParentsCollectInput): BoardParentsV1 {
  const observedAt = (input.now?.() ?? new Date()).toISOString();
  const args = ['api', 'graphql', '--hostname', 'github.com', '--paginate', '--slurp', '-f', `query=${OPEN_ISSUES_QUERY}`, '-F', 'owner={owner}', '-F', 'name={repo}'];
  const result = input.gh_runner?.(args) ?? spawnSync(process.env.REPO_HARNESS_GH_BIN ?? 'gh', args, {
    cwd: input.repo_root, env: { ...process.env, GH_HOST: 'github.com' }, encoding: 'utf-8', timeout: GH_TIMEOUT_MS, killSignal: 'SIGKILL',
  });
  if (result.status !== 0) throw new BoardParentsError('parents_github_failed', `gh api graphql failed: ${(result.stderr ?? '').trim() || `exit ${result.status}`}`);
  let pages: unknown;
  try {
    pages = JSON.parse(result.stdout);
  } catch {
    throw new BoardParentsError('parents_github_failed', 'gh api graphql returned invalid JSON');
  }
  const issues = decodeOpenIssuesRead(pages);
  const seats = input.host.seatTerminals(String(issues.repository.database_id));
  if (seats.status === 'unavailable') throw new BoardParentsError('parents_hc_failed', `hc could not list the seat terminals: ${seats.reason}`);
  return projectBoardParents({ observed_at: observedAt, issues, terminals: seatTerminalsWithBranches(seats.terminals) });
}
