import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import { linkedPullRequests, projectBoard, type BoardDailyRunInputV1, type BoardExecutionV1, type BoardTerminalV1, type BoardToolingV1, type BoardV1 } from '../../core/board/board';
import { BOARD_PAGE, decodeParentRead, decodePullRequestsRead, type BoardPullRequestReadV1 } from '../../core/board/source';
import type { PullRequestReadinessV2, PullRequestSelectionV2 } from '../../core/publication/merge-readiness';
import { collectPullRequestMergeReadiness } from '../publication/merge-readiness';
import { HerdrCoreError, RH_LABEL, hcGet, hcList, hcVersion, type HcTerminal } from '../terminal/herdr-core';

const GH_TIMEOUT_MS = 30_000;
const POLICY_PATH = '.ai/harness/policy.json';
const SEMVER = /^[0-9]+\.[0-9]+\.[0-9]+$/u;

const COMMENTS = `comments(last: ${BOARD_PAGE.comments}) { pageInfo { hasPreviousPage } nodes { url createdAt authorAssociation body } }`;
const ISSUE_FIELDS = `number title url state labels(first: ${BOARD_PAGE.labels}) { pageInfo { hasNextPage } nodes { name } } milestone { title } ${COMMENTS}`;

/** One read of the parent: its sub-issues with blocked-by edges, claim comments and cross-referenced PR numbers. */
export const PARENT_QUERY = `query($owner: String!, $name: String!, $number: Int!, $repairs: String!) {
  repository(owner: $owner, name: $name) {
    databaseId nameWithOwner defaultBranchRef { name }
    issue(number: $number) {
      ${ISSUE_FIELDS}
      subIssues(first: ${BOARD_PAGE.sub_issues}) { pageInfo { hasNextPage } nodes {
        ${ISSUE_FIELDS}
        blockedBy(first: ${BOARD_PAGE.blocked_by}) { pageInfo { hasNextPage } nodes { number state } }
        timelineItems(itemTypes: [CROSS_REFERENCED_EVENT], last: ${BOARD_PAGE.timeline}) { pageInfo { hasPreviousPage } nodes {
          ... on CrossReferencedEvent { source { ... on PullRequest { number repository { nameWithOwner } } } }
        } }
      } }
    }
  }
  repairs: search(query: $repairs, type: ISSUE, first: ${BOARD_PAGE.repairs}) { issueCount nodes { ... on Issue { number body } } }
}`;

const PULL_REQUEST_FIELDS = `number url state isDraft body baseRefName baseRefOid headRefName headRefOid mergedAt
  files(first: ${BOARD_PAGE.files}) { totalCount nodes { path } }
  commits(last: 1) { nodes { commit { oid committedDate statusCheckRollup {
    contexts(first: ${BOARD_PAGE.checks}) { pageInfo { hasNextPage } nodes { ... on CheckRun { name status conclusion completedAt } } }
  } } } }
  ${COMMENTS}`;

/** The cross-referenced pull requests, each once, so a PR that names several sub-issues is read once. */
export function pullRequestsQuery(numbers: readonly number[]): string {
  return `query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) {\n${
    numbers.map(number => `  pr${number}: pullRequest(number: ${number}) { ${PULL_REQUEST_FIELDS} }`).join('\n')}\n} }`;
}

export class BoardCollectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BoardCollectError';
  }
}

export interface BoardCollectInput {
  readonly repo_root: string;
  readonly parent: number;
  readonly gh_bin?: string;
  /** Effect seam for tests: answers each gh argument list. */
  readonly gh_runner?: (args: readonly string[]) => { readonly status: number; readonly stdout: string; readonly stderr?: string };
  /** Effect seam for tests: the single-PR readiness projection. */
  readonly readiness?: (selection: PullRequestSelectionV2) => PullRequestReadinessV2;
  /** The environment for hc; `HC_SESSION` / `HC_SOCKET` select the core. */
  readonly hc_env?: NodeJS.ProcessEnv;
  readonly now?: () => Date;
}

function gh(input: BoardCollectInput, args: readonly string[]): unknown {
  const result = input.gh_runner?.(args) ?? spawnSync(input.gh_bin ?? process.env.REPO_HARNESS_GH_BIN ?? 'gh', [...args], {
    cwd: input.repo_root, env: { ...process.env, GH_HOST: 'github.com' }, encoding: 'utf-8', timeout: GH_TIMEOUT_MS, killSignal: 'SIGKILL',
  });
  if (result.status !== 0) throw new BoardCollectError(`gh ${args.slice(0, 2).join(' ')} failed: ${(result.stderr ?? '').trim() || `exit ${result.status}`}`);
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new BoardCollectError(`gh ${args.slice(0, 2).join(' ')} returned invalid JSON`);
  }
}

function graphql(input: BoardCollectInput, query: string, variables: Readonly<Record<string, string | number>>): unknown {
  const args = ['api', 'graphql', '--hostname', 'github.com', '-f', `query=${query}`,
    ...Object.entries(variables).flatMap(([key, value]) => [typeof value === 'number' ? '-F' : '-f', `${key}=${value}`])];
  const response = gh(input, args) as { data?: unknown; errors?: unknown } | null;
  if (response === null || typeof response !== 'object' || response.errors !== undefined) {
    throw new BoardCollectError(`GitHub GraphQL refused the board read: ${JSON.stringify(response?.errors ?? response).slice(0, 500)}`);
  }
  return response.data;
}

function dailyRun(input: BoardCollectInput, repository: string, branch: string): BoardDailyRunInputV1 {
  let body: unknown;
  try {
    body = gh(input, ['api', '--hostname', 'github.com',
      `repos/${repository}/actions/workflows/ci.yml/runs?event=schedule&status=completed&per_page=1&branch=${encodeURIComponent(branch)}`]);
  } catch (error) {
    if (error instanceof BoardCollectError) return { status: 'unavailable', reason: 'github_unavailable' };
    throw error;
  }
  const runs = (body as { workflow_runs?: unknown } | null)?.workflow_runs;
  if (!Array.isArray(runs)) return { status: 'unavailable', reason: 'github_unavailable' };
  const run = runs[0] as Record<string, unknown> | undefined;
  if (run === undefined) return { status: 'unavailable', reason: 'no_daily_run' };
  // The response must be the run the query asked for (same rule as the operator tests collector).
  if (run.event !== 'schedule' || run.head_branch !== branch || run.path !== '.github/workflows/ci.yml' || run.status !== 'completed'
    || typeof run.html_url !== 'string' || typeof run.created_at !== 'string' || (run.conclusion !== null && typeof run.conclusion !== 'string')) {
    return { status: 'unavailable', reason: 'daily_run_invalid' };
  }
  return { status: 'observed', run_url: run.html_url, conclusion: run.conclusion as string | null, created_at: run.created_at };
}

function hcPin(repoRoot: string): string | null {
  try {
    const policy = JSON.parse(readFileSync(join(repoRoot, POLICY_PATH), 'utf-8')) as { external_tooling?: { herdr_core?: { min_version?: unknown } } };
    const pin = policy.external_tooling?.herdr_core?.min_version;
    return typeof pin === 'string' && SEMVER.test(pin) ? pin : null;
  } catch {
    return null;
  }
}

function tooling(input: BoardCollectInput): BoardToolingV1 {
  const herdrApp = { status: 'not_pinned' } as const;
  const pin = hcPin(input.repo_root);
  if (pin === null) return { hc: { status: 'unavailable', reason: 'pin_missing' }, herdr_app: herdrApp };
  try {
    const version = hcVersion({ env: input.hc_env });
    if (!SEMVER.test(version)) return { hc: { status: 'unavailable', reason: 'hc_version_invalid' }, herdr_app: herdrApp };
    return { hc: { status: 'observed', version, min_version: pin }, herdr_app: herdrApp };
  } catch (error) {
    if (error instanceof HerdrCoreError) return { hc: { status: 'unavailable', reason: `hc_${error.reason}` }, herdr_app: herdrApp };
    throw error;
  }
}

const POSITIVE = /^[1-9][0-9]*$/u;

function seatTerminal(terminal: HcTerminal): BoardTerminalV1 {
  const base = {
    address: terminal.address, name: terminal.name, state: terminal.state, status: terminal.status?.state ?? null,
    status_kind: terminal.status?.kind ?? null, status_ms: terminal.status_ms, turn: terminal.turn,
  };
  const seat = terminal.labels[RH_LABEL.seat];
  if (seat === undefined) return { ...base, seat_status: 'unavailable', reason: 'seat_label_missing' };
  const issue = terminal.labels[RH_LABEL.issue];
  const pr = terminal.labels[RH_LABEL.pr];
  if (seat === '' || [issue, pr].some(value => value !== undefined && !POSITIVE.test(value))) {
    return { ...base, seat_status: 'unavailable', reason: 'seat_label_invalid' };
  }
  return { ...base, seat_status: 'observed', seat, issue: issue === undefined ? null : Number(issue), pr: pr === undefined ? null : Number(pr) };
}

/** The seat terminals of this parent. A terminal without the parent label is never read. */
function execution(input: BoardCollectInput): BoardExecutionV1 {
  try {
    const options = { env: input.hc_env };
    const terminals = hcList({ [RH_LABEL.parent]: String(input.parent) }, options).map(summary => seatTerminal(hcGet(summary.address, options)));
    return { status: 'observed', terminals: Object.freeze(terminals) };
  } catch (error) {
    if (error instanceof HerdrCoreError) return { status: 'unavailable', reason: `hc_${error.reason}` };
    throw error;
  }
}

export function collectBoard(input: BoardCollectInput): BoardV1 {
  const repository = (gh(input, ['repo', 'view', '--json', 'nameWithOwner']) as { nameWithOwner?: unknown } | null)?.nameWithOwner;
  if (typeof repository !== 'string' || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repository)) throw new BoardCollectError('the local GitHub repository is unknown');
  const [owner, name] = repository.split('/') as [string, string];
  const observedAt = (input.now?.() ?? new Date()).toISOString();
  const parent = decodeParentRead(graphql(input, PARENT_QUERY, {
    owner, name, number: input.parent, repairs: `repo:${repository} is:issue is:open in:title "CI repair"`,
  }), repository);
  const candidates = [...new Set(parent.sub_issues.flatMap(issue => issue.pull_request_candidates))].sort((left, right) => left - right);
  const reads: BoardPullRequestReadV1[] = candidates.length === 0 ? [] : decodePullRequestsRead(graphql(input, pullRequestsQuery(candidates), { owner, name }), candidates);
  const readiness = linkedPullRequests(parent, reads).filter(read => read.state === 'open').map((read) => {
    const selection: PullRequestSelectionV2 = {
      provider_repository_id: String(parent.repository.database_id), repository, pr_number: read.number,
      expected_head_sha: read.head_sha, expected_base_sha: read.base_sha,
    };
    return input.readiness?.(selection) ?? collectPullRequestMergeReadiness({ ...selection, repo_root: input.repo_root, gh_bin: input.gh_bin });
  });
  return projectBoard({
    observed_at: observedAt,
    parent,
    pull_requests: reads,
    readiness,
    execution: execution(input),
    daily_run: dailyRun(input, repository, parent.repository.default_branch),
    tooling: tooling(input),
  });
}
