import { spawnSync } from 'child_process';
import { parseDependencyLines, TIER_LABELS, type AmbiguousLineV1, type DependencyLineV1, type SkippedLineV1, type UnparsedLineV1 } from '../../core/board/dependency-migration';

const GH_TIMEOUT_MS = 30_000;
const PAGE = 100;

export type DependencyMigrationErrorCode =
  | 'dependency_line_unparsed'
  | 'dependency_line_ambiguous'
  | 'parent_not_found'
  | 'foreign_sub_issue'
  | 'sub_issues_truncated'
  | 'blocked_by_truncated'
  | 'github_failed';

export interface DependencyMigrationLabelV1 {
  readonly name: string;
  readonly result: 'created' | 'exists';
}

export interface DependencyMigrationEdgeV1 {
  readonly issue: number;
  readonly blocker: number;
  readonly line_number: number;
  readonly line: string;
  readonly result: 'created' | 'exists';
}

export interface DependencyMigrationResultV1 {
  readonly protocol: 1;
  readonly kind: 'repo-harness.dependency-migration';
  readonly parent: number;
  readonly labels: readonly DependencyMigrationLabelV1[];
  readonly edges: readonly DependencyMigrationEdgeV1[];
  /** `风险：` / `Risk:` lines of dependency sections; they create no edge. */
  readonly skipped: readonly SkippedLineV1[];
}

/** A stop. `labels` and `edges` hold the writes that finished before it; a rerun skips them. */
export class DependencyMigrationError extends Error {
  constructor(
    readonly code: DependencyMigrationErrorCode,
    message: string,
    readonly labels: readonly DependencyMigrationLabelV1[] = [],
    readonly edges: readonly DependencyMigrationEdgeV1[] = [],
  ) {
    super(message);
    this.name = 'DependencyMigrationError';
  }
}

export interface DependencyMigrationInput {
  readonly repo_root: string;
  readonly parent: number;
  readonly gh_bin?: string;
  /** Effect seam for tests: answers each gh argument list. */
  readonly gh_runner?: (args: readonly string[]) => { readonly status: number; readonly stdout: string; readonly stderr?: string };
}

interface SubIssueRead {
  readonly id: string;
  readonly number: number;
  readonly state: string;
  readonly body: string;
  readonly repository: { readonly nameWithOwner: string };
  readonly blockedBy: { readonly pageInfo: { readonly hasNextPage: boolean }; readonly nodes: readonly { readonly id: string; readonly number: number }[] };
}

function gh(input: DependencyMigrationInput, args: readonly string[]): unknown {
  const result = input.gh_runner?.(args) ?? spawnSync(input.gh_bin ?? process.env.REPO_HARNESS_GH_BIN ?? 'gh', [...args], {
    cwd: input.repo_root, env: { ...process.env, GH_HOST: 'github.com' }, encoding: 'utf-8', timeout: GH_TIMEOUT_MS, killSignal: 'SIGKILL',
  });
  if (result.status !== 0) throw new DependencyMigrationError('github_failed', `gh ${args.slice(0, 2).join(' ')} failed: ${(result.stderr ?? '').trim() || `exit ${result.status}`}`);
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new DependencyMigrationError('github_failed', `gh ${args.slice(0, 2).join(' ')} returned invalid JSON`);
  }
}

function graphql(input: DependencyMigrationInput, query: string, variables: Readonly<Record<string, string | number>>): Record<string, any> {
  const args = ['api', 'graphql', '--hostname', 'github.com', '-f', `query=${query}`,
    ...Object.entries(variables).flatMap(([key, value]) => [typeof value === 'number' ? '-F' : '-f', `${key}=${value}`])];
  const response = gh(input, args) as { data?: Record<string, any>; errors?: unknown } | null;
  if (response === null || typeof response !== 'object' || response.errors !== undefined || typeof response.data !== 'object' || response.data === null) {
    throw new DependencyMigrationError('github_failed', `GitHub GraphQL refused the request: ${JSON.stringify(response?.errors ?? response).slice(0, 500)}`);
  }
  return response.data;
}

const READ_QUERY = `query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    ${TIER_LABELS.map((label, index) => `t${index}: label(name: "${label.name}") { name }`).join('\n    ')}
    issue(number: $number) {
      subIssues(first: ${PAGE}) { pageInfo { hasNextPage } nodes {
        id number state body repository { nameWithOwner }
        blockedBy(first: ${PAGE}) { pageInfo { hasNextPage } nodes { id number } }
      } }
    }
  }
}`;

const ADD_BLOCKED_BY = `mutation($issue: ID!, $blocker: ID!) {
  addBlockedBy(input: { issueId: $issue, blockingIssueId: $blocker }) { issue { number } }
}`;

/**
 * Moves the dependency lines of the open sub-issues of one parent to
 * blocked-by links and creates the tier labels. One scan reads every open
 * body before the first write. Declaration-like lines in possible code
 * positions stop the run with one `dependency_line_ambiguous` error that names
 * all of them; otherwise unparsable lines stop it with one
 * `dependency_line_unparsed` error that names all of them.
 * Existing labels and links are reported as `exists` and not written again;
 * a link is identified by the node ids of both issues, because issue numbers
 * are local to a repository. A bare `#n` is resolved in the parent's
 * repository, so an open sub-issue from another repository stops the run.
 * Closed sub-issues are not read.
 */
export function migrateDependencies(input: DependencyMigrationInput): DependencyMigrationResultV1 {
  const repository = (gh(input, ['repo', 'view', '--json', 'nameWithOwner']) as { nameWithOwner?: unknown } | null)?.nameWithOwner;
  if (typeof repository !== 'string' || !/^[^/\s]+\/[^/\s]+$/u.test(repository)) throw new DependencyMigrationError('github_failed', 'gh repo view returned no nameWithOwner');
  const [owner, name] = repository.split('/') as [string, string];
  const data = graphql(input, READ_QUERY, { owner, name, number: input.parent }).repository;
  const subIssues = data?.issue?.subIssues as { pageInfo: { hasNextPage: boolean }; nodes: SubIssueRead[] } | undefined;
  if (subIssues === undefined) throw new DependencyMigrationError('parent_not_found', `#${input.parent} is not an issue of ${repository}`);
  if (subIssues.pageInfo.hasNextPage) throw new DependencyMigrationError('sub_issues_truncated', `#${input.parent} has more than ${PAGE} sub-issues`);

  const open = subIssues.nodes.filter(node => node.state === 'OPEN');
  const planned: { readonly target: SubIssueRead; readonly line: DependencyLineV1 }[] = [];
  const skipped: SkippedLineV1[] = [];
  const ambiguous: AmbiguousLineV1[] = [];
  const unparsed: UnparsedLineV1[] = [];
  for (const target of open) {
    if (target.repository.nameWithOwner !== repository) {
      throw new DependencyMigrationError('foreign_sub_issue', `#${target.number} of ${target.repository.nameWithOwner} is not in ${repository}; this migration reads one repository only`);
    }
    if (target.blockedBy.pageInfo.hasNextPage) throw new DependencyMigrationError('blocked_by_truncated', `#${target.number} has more than ${PAGE} blocked-by links`);
    const parsed = parseDependencyLines(target.number, target.body);
    for (const line of parsed.edges) planned.push({ target, line });
    skipped.push(...parsed.skipped);
    ambiguous.push(...parsed.ambiguous);
    unparsed.push(...parsed.unparsed);
  }
  if (ambiguous.length > 0) {
    throw new DependencyMigrationError('dependency_line_ambiguous', `dependency lines in a possible code position (after a fence or indented); edit the body or add the link by hand: ${
      ambiguous.map(entry => `#${entry.issue} line ${entry.line_number}: ${entry.line.trim()}`).join('; ')}`);
  }
  if (unparsed.length > 0) {
    throw new DependencyMigrationError('dependency_line_unparsed', `lines that are not dependency lines: ${
      unparsed.map(entry => `#${entry.issue} line ${entry.line_number} (${entry.reason}): ${entry.line.trim()}`).join('; ')}`);
  }

  const blockers = [...new Set(planned.map(entry => entry.line.blocker))];
  const blockerIds = new Map<number, string>();
  if (blockers.length > 0) {
    const read = graphql(input, `query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) {\n${
      blockers.map(number => `  b${number}: issue(number: ${number}) { id number }`).join('\n')}\n} }`, { owner, name }).repository;
    for (const number of blockers) {
      const node = read?.[`b${number}`];
      if (node?.number !== number || typeof node.id !== 'string') throw new DependencyMigrationError('github_failed', `#${number} did not resolve to an issue of ${repository}`);
      blockerIds.set(number, node.id);
    }
  }

  const labels: DependencyMigrationLabelV1[] = [];
  const edges: DependencyMigrationEdgeV1[] = [];
  const stop = (error: unknown): never => {
    if (error instanceof DependencyMigrationError) throw new DependencyMigrationError(error.code, error.message, labels, edges);
    throw error;
  };
  TIER_LABELS.forEach((label, index) => {
    if (data[`t${index}`]?.name === label.name) {
      labels.push({ name: label.name, result: 'exists' });
      return;
    }
    try {
      gh(input, ['api', '--hostname', 'github.com', '--method', 'POST', `repos/${repository}/labels`,
        '-f', `name=${label.name}`, '-f', `color=${label.color}`, '-f', `description=${label.description}`]);
    } catch (error) {
      stop(error);
    }
    labels.push({ name: label.name, result: 'created' });
  });

  const linked = new Set(open.flatMap(target => target.blockedBy.nodes.map(node => `${target.id}:${node.id}`)));
  for (const { target, line } of planned) {
    const blockerId = blockerIds.get(line.blocker)!;
    const key = `${target.id}:${blockerId}`;
    const edge = { issue: target.number, blocker: line.blocker, line_number: line.line_number, line: line.line };
    if (linked.has(key)) {
      edges.push({ ...edge, result: 'exists' });
      continue;
    }
    try {
      const added = graphql(input, ADD_BLOCKED_BY, { issue: target.id, blocker: blockerId });
      if (added.addBlockedBy?.issue?.number !== target.number) throw new DependencyMigrationError('github_failed', `addBlockedBy for #${target.number} returned no issue`);
    } catch (error) {
      stop(error);
    }
    linked.add(key);
    edges.push({ ...edge, result: 'created' });
  }
  return Object.freeze({ protocol: 1, kind: 'repo-harness.dependency-migration', parent: input.parent, labels, edges, skipped });
}
