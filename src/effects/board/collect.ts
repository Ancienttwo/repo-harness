import { execFile, spawnSync, type ExecFileException } from 'child_process';
import { architecturePort, isArchitectureUnavailable, type ArchctxProviderOptions } from '../../core/architecture/contracts';
import {
  linkedPullRequests, projectBoard, seatTerminal, syncCarryCandidates, type BoardAcceptanceMergeV1, type BoardDailyRunInputV1, type BoardExecutionV1, type BoardHostPortsV1,
  type BoardPathOwnerV1, type BoardPathOwnersV1, type BoardSeatTerminalInputV1, type BoardSeatTerminalReadV1, type BoardToolingV1, type BoardV1,
} from '../../core/board/board';
import { ADVISOR_SEAT } from '../../core/board/advisor-seat';
import {
  BOARD_PAGE, BOARD_PARENT_COMMENT_PAGES, BOARD_SUB_ISSUE_PAGES, BoardSourceError, decodeParentRead, decodePullRequestsRead, parentCommentsPreviousCursor, parentReadNextCursor, type BoardParentReadV1, type BoardPullRequestReadV1,
} from '../../core/board/source';
import { normalizeCapabilityPath } from '../../core/capabilities/registry';
import { HC_MIN_VERSION } from '../../core/terminal/herdr-pin';
import { parsePublicationPolicy, policyFileFromContents, PUBLICATION_POLICY_PATH, type PolicyFileAtRef } from '../../core/publication/acceptance-merge-policy';
import type { PullRequestReadinessV2, PullRequestSelectionV2 } from '../../core/publication/merge-readiness';
import { GitExecError, gitExecFile, gitSpawnSync, withoutRepositorySelectingGitEnv } from '../git/runner';
import { collectPullRequestMergeReadiness } from '../publication/merge-readiness';
import { createKeyedSources, readinessKey, type KeyedSources } from './keyed-sources';
import { provenMergeOnlySyncs, type MergeOnlySyncInput } from './merge-only-sync';

const GH_TIMEOUT_MS = 30_000;
const SEAT_GIT_TIMEOUT_MS = 10_000;

const COMMENT_NODES = 'nodes { url createdAt authorAssociation body }';
const COMMENTS = `comments(last: ${BOARD_PAGE.comments}) { pageInfo { hasPreviousPage } ${COMMENT_NODES} }`;
const ISSUE_FIELDS = `number title url state labels(first: ${BOARD_PAGE.labels}) { pageInfo { hasNextPage } nodes { name } } milestone { title }`;
/** The parent thread holds the plan, the coordinator claim and the merge holds, so the read follows its comment cursor to the oldest page. */
const parentComments = (before: string) => `comments(last: ${BOARD_PAGE.parent_comments}${before}) { pageInfo { hasPreviousPage startCursor } ${COMMENT_NODES} }`;

/** One older comment page of the parent; `$before` is the start cursor of the newer page. */
export const PARENT_COMMENTS_QUERY = `query($owner: String!, $name: String!, $number: Int!, $before: String!) {
  repository(owner: $owner, name: $name) { issue(number: $number) { ${parentComments(', before: $before')} } }
}`;

/** One page of the parent read: its sub-issues with blocked-by edges, claim comments and cross-referenced PR numbers. `$after` selects the sub-issue page. */
export const PARENT_QUERY = `query($owner: String!, $name: String!, $number: Int!, $repairs: String!, $after: String) {
  repository(owner: $owner, name: $name) {
    databaseId nameWithOwner defaultBranchRef { name }
    issue(number: $number) {
      ${ISSUE_FIELDS} ${parentComments('')}
      subIssues(first: ${BOARD_PAGE.sub_issues}, after: $after) { pageInfo { hasNextPage endCursor } nodes {
        ${ISSUE_FIELDS} ${COMMENTS}
        blockedBy(first: ${BOARD_PAGE.blocked_by}) { pageInfo { hasNextPage } nodes { number state } }
        timelineItems(itemTypes: [CROSS_REFERENCED_EVENT], last: ${BOARD_PAGE.timeline}) { pageInfo { hasPreviousPage } nodes {
          ... on CrossReferencedEvent { source { ... on PullRequest { number repository { nameWithOwner } } } }
        } }
      } }
    }
  }
  repairs: search(query: $repairs, type: ISSUE, first: ${BOARD_PAGE.repairs}) { issueCount nodes { ... on Issue { number body } } }
}`;

/** The identity, review and head-rollup fields are the readiness inputs of the keyed source store; nested thread comments stay out. */
const PULL_REQUEST_FIELDS = `number url state isDraft body baseRefName baseRefOid headRefName headRefOid mergedAt
  changedFiles mergeable reviewDecision isCrossRepository
  latestOpinionatedReviews(first: ${BOARD_PAGE.reviews}) { pageInfo { hasNextPage } nodes { state } }
  reviewThreads(first: ${BOARD_PAGE.threads}) { totalCount pageInfo { hasNextPage } nodes { isResolved } }
  files(first: ${BOARD_PAGE.files}) { totalCount nodes { path additions deletions } }
  commits(last: 1) { nodes { commit { oid committedDate statusCheckRollup {
    contexts(first: ${BOARD_PAGE.checks}) { pageInfo { hasNextPage } nodes {
      ... on CheckRun { name status conclusion completedAt detailsUrl } ... on StatusContext { context state targetUrl createdAt }
    } }
  } } } }
  ${COMMENTS}`;

/** The cross-referenced pull requests, each once, so a PR that names several sub-issues is read once. */
export function pullRequestsQuery(numbers: readonly number[]): string {
  return `query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) {\n${
    numbers.map(number => `  pr${number}: pullRequest(number: ${number}) { ${PULL_REQUEST_FIELDS} }`).join('\n')}\n} }`;
}

export class BoardCollectError extends Error {
  constructor(message: string, readonly httpStatus: number | null = null) {
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
  /** Effect seam for tests: the reviewed heads of which git proves the head a merge-only sync. */
  readonly merge_only_syncs?: typeof provenMergeOnlySyncs;
  /** Effect seam for tests: the archctx process of the path owner read. */
  readonly archctx?: ArchctxProviderOptions;
  readonly host: BoardHostPortsV1;
  readonly now?: () => Date;
}

export type GhInput = Pick<BoardCollectInput, 'repo_root' | 'gh_bin' | 'gh_runner'>;

type GhRunner = NonNullable<BoardCollectInput['gh_runner']>;

function runGh(input: GhInput, args: readonly string[]): { readonly status: number | null; readonly stdout: string; readonly stderr?: string; readonly error?: Error } {
  return input.gh_runner?.(args) ?? spawnSync(input.gh_bin ?? process.env.REPO_HARNESS_GH_BIN ?? 'gh', [...args], {
    cwd: input.repo_root, env: { ...process.env, GH_HOST: 'github.com' }, encoding: 'utf-8', timeout: GH_TIMEOUT_MS, killSignal: 'SIGKILL',
  });
}

/** One gh call that prints JSON; a failed call or invalid JSON is a `BoardCollectError`. */
export function readGhJson(input: GhInput, args: readonly string[]): unknown {
  return ghJson(args, runGh(input, args));
}

function ghJson(args: readonly string[], result: { readonly status: number | null; readonly stdout: string; readonly stderr?: string }): unknown {
  if (result.status !== 0) {
    const stderr = (result.stderr ?? '').trim();
    const status = /\(HTTP (\d{3})\)$/u.exec(stderr) ?? /^gh: HTTP (\d{3})$/mu.exec(stderr) ?? /^HTTP (\d{3}):/mu.exec(stderr);
    throw new BoardCollectError(`gh ${args.slice(0, 2).join(' ')} failed: ${stderr || `exit ${result.status}`}`, status === null ? null : Number(status[1]));
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new BoardCollectError(`gh ${args.slice(0, 2).join(' ')} returned invalid JSON`);
  }
}

function graphql(input: GhInput, query: string, variables: Readonly<Record<string, string | number>>): unknown {
  const args = ['api', 'graphql', '--hostname', 'github.com', '-f', `query=${query}`,
    ...Object.entries(variables).flatMap(([key, value]) => [typeof value === 'number' ? '-F' : '-f', `${key}=${value}`])];
  const response = readGhJson(input, args) as { data?: unknown; errors?: unknown } | null;
  if (response === null || typeof response !== 'object' || response.errors !== undefined) {
    throw new BoardCollectError(`GitHub GraphQL refused the board read: ${JSON.stringify(response?.errors ?? response).slice(0, 500)}`);
  }
  return response.data;
}

function dailyRun(input: BoardCollectInput, repository: string, branch: string): BoardDailyRunInputV1 {
  let body: unknown;
  try {
    body = readGhJson(input, ['api', '--hostname', 'github.com',
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

/**
 * `publication.acceptance_merge` on the default branch, decoded only by the
 * publication policy parser. GitHub answers an absent file with exit 1 and a
 * JSON body of status 404; every other failure leaves the value unknown.
 */
function acceptanceMerge(input: BoardCollectInput, repository: string, branch: string): BoardAcceptanceMergeV1 {
  const result = runGh(input, ['api', '--hostname', 'github.com', `repos/${repository}/contents/${PUBLICATION_POLICY_PATH}?ref=${encodeURIComponent(branch)}`]);
  let body: unknown;
  try {
    body = JSON.parse(result.stdout);
  } catch {
    return 'unknown';
  }
  const absent = result.status === 1 && (body as { status?: unknown } | null)?.status === '404';
  const file: PolicyFileAtRef | null = absent ? { status: 'missing' } : result.status === 0 ? policyFileFromContents(body) : null;
  if (file === null) return 'unknown';
  const policy = parsePublicationPolicy(file);
  return policy.ok ? policy.acceptance_merge : 'unknown';
}

function tooling(input: BoardCollectInput): BoardToolingV1 {
  const herdrApp = { status: 'not_pinned' } as const;
  const version = input.host.hcVersion();
  return { hc: version.status === 'unavailable' ? version : { status: 'observed', version: version.version, min_version: HC_MIN_VERSION }, herdr_app: herdrApp };
}

/** One orchestrator and one advisor serve the whole repository (#1780): the board of every parent shows them. */
const REPOSITORY_SEATS: ReadonlySet<string> = new Set(['orchestrator', ADVISOR_SEAT]);

function seatBranch(cwd: string | null): string | null {
  if (cwd === null) return null;
  // The directory selects the repository, so a git variable of this process must not.
  const read = gitSpawnSync(['symbolic-ref', '--quiet', '--short', 'HEAD'], { cwd, env: withoutRepositorySelectingGitEnv(), encoding: 'utf8', timeout: SEAT_GIT_TIMEOUT_MS });
  return read.error === undefined && read.status === 0 ? read.stdout.trim() : null;
}

/** Each terminal with the current branch of its directory, read with git in that directory. The directory stays here. */
export function seatTerminalsWithBranches(terminals: readonly BoardSeatTerminalReadV1[]): readonly BoardSeatTerminalInputV1[] {
  return terminals.map(({ cwd, ...terminal }) => ({ ...terminal, branch: seatBranch(cwd) }));
}

/**
 * The seat terminals of this repository and parent: the orchestrator and the
 * advisor by their seat label with any parent label or none, and every other
 * terminal by this parent label. No such terminal means the seat labels are
 * not written, which the board does not read as "no stuck seats".
 */
function execution(input: BoardCollectInput, repositoryId: number): BoardExecutionV1 {
  const read = input.host.seatTerminals(String(repositoryId));
  if (read.status === 'unavailable') return read;
  const parent = String(input.parent);
  const terminals = read.terminals.filter(({ labels }) => (labels.seat !== undefined && REPOSITORY_SEATS.has(labels.seat)) || labels.parent === parent);
  if (terminals.length === 0) return { status: 'unavailable', reason: 'no_seat_terminals' };
  return { status: 'observed', terminals: Object.freeze(seatTerminalsWithBranches(terminals).map(seatTerminal)) };
}

/**
 * The owners of the changed paths of the open pull requests, from one
 * `archctx resolve` batch on the local model. An ambiguous path keeps its
 * entry. A failed run, a rejected model or an owner that is no capability
 * node makes every owner unavailable, because it does not name its path.
 */
export function pathOwners(input: Pick<BoardCollectInput, 'repo_root' | 'archctx'>, reads: readonly BoardPullRequestReadV1[]): BoardPathOwnersV1 {
  const paths = [...new Set(reads.filter(read => read.state === 'open').flatMap(read => read.files ?? []))].sort();
  if (paths.length === 0) return { status: 'observed', owners: [] };
  const display = architecturePort('display');
  if (isArchitectureUnavailable(display)) return { status: 'unavailable', reason: display.code };
  const read = display.pathOwners(input.repo_root, paths, input.archctx);
  if (read.status === 'failed') return { status: 'unavailable', reason: read.code };
  const { resolution } = read;
  const fault = resolution.diagnostics.find(diagnostic => diagnostic.code !== 'AMBIGUOUS_MATCH');
  if (fault !== undefined) return { status: 'unavailable', reason: fault.code };
  const owners = new Map<string, BoardPathOwnerV1>();
  for (const match of resolution.matches) owners.set(match.filePath, { path: match.filePath, status: 'owned', capability: match.prefix });
  for (const path of resolution.unmappedPaths) owners.set(path, { path, status: 'unowned' });
  for (const diagnostic of resolution.diagnostics) owners.set(diagnostic.path, { path: diagnostic.path, status: 'ambiguous' });
  // The resolver answers each path in its normalized form; the board keys the owner by the GitHub path.
  return { status: 'observed', owners: Object.freeze(paths.map(path => ({ ...owners.get(normalizeCapabilityPath(path, input.repo_root))!, path }))) };
}

const REPOSITORY_ID_ARGS = ['api', '--hostname', 'github.com', 'repos/{owner}/{repo}'] as const;

function repositoryId(value: unknown): number {
  const id = (value as { id?: unknown } | null)?.id;
  if (!Number.isSafeInteger(id) || (id as number) < 1) throw new BoardCollectError('the local GitHub repository id is unknown');
  return id as number;
}

/** The GitHub numeric id of the local repository: the value of the `repo-harness.repository` label. */
export function readRepositoryId(input: GhInput): number {
  return repositoryId(readGhJson(input, REPOSITORY_ID_ARGS));
}

function hasGitHubRemote(remotes: string, isGitHubRemote: (url: string) => boolean): boolean {
  return remotes.split('\n').some(line => line !== '' && isGitHubRemote(line.slice(line.indexOf(' ') + 1)));
}

/** The repository id of a checkout, or null when no remote URL of it is a GitHub URL: gh then has no repository to read. */
export function readLocalRepositoryId(input: GhInput, isGitHubRemote: (url: string) => boolean): number | null {
  const remotes = gitSpawnSync(['config', '--local', '--get-regexp', '^remote\\..*\\.url$'], { cwd: input.repo_root, encoding: 'utf8' });
  // Exit 1: the checkout has no remote URL.
  if (remotes.error !== undefined || (remotes.status !== 0 && remotes.status !== 1)) throw new BoardCollectError('git did not list the remote URLs of this checkout');
  return hasGitHubRemote(remotes.stdout, isGitHubRemote) ? readRepositoryId(input) : null;
}

/** The same local admission, query and decoders, with cancellable children for resident observers. */
export async function readLocalRepositoryIdAsync(input: {
  readonly repo_root: string; readonly gh_bin?: string; readonly env: NodeJS.ProcessEnv; readonly signal: AbortSignal;
}, isGitHubRemote: (url: string) => boolean): Promise<number | null> {
  let remotes: string;
  try {
    remotes = await gitExecFile(['config', '--local', '--get-regexp', '^remote\\..*\\.url$'], { cwd: input.repo_root, env: input.env, signal: input.signal });
  } catch (error) {
    if (error instanceof GitExecError && error.status === 1) remotes = '';
    else throw error;
  }
  if (!hasGitHubRemote(remotes, isGitHubRemote)) return null;
  if (input.signal.aborted) throw new DOMException('repository read aborted', 'AbortError');
  const env = withoutRepositorySelectingGitEnv(input.env);
  delete env.GH_REPO;
  const result = await new Promise<{ readonly status: number | null; readonly stdout: string; readonly stderr: string }>((resolve, reject) => {
    let output: { readonly error: ExecFileException | null; readonly stdout: string; readonly stderr: string };
    const child = execFile(input.gh_bin ?? input.env.REPO_HARNESS_GH_BIN ?? 'gh', [...REPOSITORY_ID_ARGS], {
      cwd: input.repo_root, env: { ...env, GH_HOST: 'github.com' }, signal: input.signal, timeout: GH_TIMEOUT_MS, killSignal: 'SIGKILL', encoding: 'utf8',
    }, (error, stdout, stderr) => { output = { error, stdout, stderr }; });
    // The abort callback can run before exit. Reap the child before this read settles.
    child.once('close', () => {
      if (input.signal.aborted) reject(new DOMException('repository read aborted', 'AbortError'));
      else if (output.error && typeof output.error.code !== 'number') reject(output.error);
      else resolve({ status: output.error?.code as number ?? 0, stdout: output.stdout, stderr: output.stderr });
    });
  });
  return repositoryId(ghJson(REPOSITORY_ID_ARGS, result));
}

/** The read of the parent issue, every page of its sub-issues and their comments; the board and dispatch share it. */
export function readParent(input: Pick<BoardCollectInput, 'repo_root' | 'gh_bin' | 'gh_runner' | 'parent' | 'now'>): { readonly parent: BoardParentReadV1; readonly observed_at: string } {
  const repository = (readGhJson(input, ['repo', 'view', '--json', 'nameWithOwner']) as { nameWithOwner?: unknown } | null)?.nameWithOwner;
  if (typeof repository !== 'string' || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repository)) throw new BoardCollectError('the local GitHub repository is unknown');
  const [owner, name] = repository.split('/') as [string, string];
  const observedAt = (input.now?.() ?? new Date()).toISOString();
  const variables = { owner, name, number: input.parent, repairs: `repo:${repository} is:issue is:open in:title "CI repair"` };
  const first = graphql(input, PARENT_QUERY, variables);
  const pages = followCursor(first, parentReadNextCursor, after => graphql(input, PARENT_QUERY, { ...variables, after }),
    'issue.subIssues', BOARD_PAGE.sub_issues, BOARD_SUB_ISSUE_PAGES);
  const commentPages = followCursor(first, parentCommentsPreviousCursor, before => graphql(input, PARENT_COMMENTS_QUERY, { owner, name, number: input.parent, before }),
    'issue.comments', BOARD_PAGE.parent_comments, BOARD_PARENT_COMMENT_PAGES);
  const parent = decodeParentRead(pages, commentPages, repository);
  return { parent, observed_at: observedAt };
}

/** `first` and each page that a cursor of the page before it selects, up to `cap` pages. */
function followCursor(first: unknown, cursor: (data: unknown, at: number) => string | null, read: (cursor: string) => unknown,
  connection: string, size: number, cap: number): unknown[] {
  const pages = [first];
  // The decoder runs after the last page, so a repeated cursor or an endless stream must stop the loop here.
  const cursors = new Set<string>();
  for (let next = cursor(first, 0); next !== null; next = cursor(pages.at(-1), pages.length - 1)) {
    if (cursors.has(next)) throw new BoardSourceError(`${connection} cursor ${next} repeats`);
    if (pages.length === cap) throw new BoardSourceError(`${connection} has more than ${cap} pages of ${size}`);
    cursors.add(next);
    pages.push(read(next));
  }
  return pages;
}

/**
 * The provider transport of the readiness reads of one board read. Every pull
 * request of the repository gets the same repository identity, so those reads
 * run once; the keyed source store answers the content-addressed reads. The
 * pull request identity, checks, reviews and stack lists run each time, so the
 * identity and stack fences of each read stay. A failure is not stored. The
 * answers live only as long as this function's return value.
 */
function boardReadinessTransport(input: GhInput, repository: string): GhRunner {
  const root = `repos/${repository}`;
  const reusable = (args: readonly string[]): boolean => (args[0] === 'repo' && args[1] === 'view')
    || (args.length === 4 && args[0] === 'api' && args[1] === root && args[2] === '--hostname' && args[3] === 'github.com');
  const answers = new Map<string, ReturnType<GhRunner>>();
  return (args) => {
    const key = reusable(args) ? JSON.stringify(args) : null;
    const stored = key === null ? undefined : answers.get(key);
    if (stored !== undefined) return stored;
    const result = runGh(input, args);
    // No exit status (spawn error, timeout) is -1, which no reader accepts: the read reports provider_unavailable.
    const answer = { status: result.status ?? -1, stdout: result.stdout ?? '', stderr: result.stderr || result.error?.message || '' };
    if (key !== null && answer.status === 0) answers.set(key, answer);
    return answer;
  };
}

/** One board read through a fresh keyed source store: the path of every act. */
export function collectBoard(input: BoardCollectInput): BoardV1 {
  return collectBoardThrough(input, createKeyedSources());
}

/** One board read through `sources`. Only the attention watcher keeps a store across reads. */
export function collectBoardThrough(input: BoardCollectInput, sources: KeyedSources): BoardV1 {
  const { parent, observed_at: observedAt } = readParent(input);
  const repository = parent.repository.name_with_owner;
  const [owner, name] = repository.split('/') as [string, string];
  const candidates = [...new Set(parent.sub_issues.flatMap(issue => issue.pull_request_candidates))].sort((left, right) => left - right);
  const reads: BoardPullRequestReadV1[] = candidates.length === 0 ? [] : decodePullRequestsRead(graphql(input, pullRequestsQuery(candidates), { owner, name }), candidates);
  const linked = linkedPullRequests(parent, reads);
  const readinessTransport = boardReadinessTransport(input, repository);
  const readiness = linked.filter(read => read.state === 'open').map((read) => {
    const selection: PullRequestSelectionV2 = {
      provider_repository_id: String(parent.repository.database_id), repository, pr_number: read.number,
      expected_head_sha: read.head_sha, expected_base_sha: read.base_sha,
    };
    const key = readinessKey({ repository_id: parent.repository.database_id, default_branch: parent.repository.default_branch, read, reads });
    const now = input.now?.() ?? new Date();
    return sources.readiness(key, now, () => input.readiness?.(selection) ?? collectPullRequestMergeReadiness({
      ...selection, repo_root: input.repo_root, gh_bin: input.gh_bin, gh_runner: sources.transport(read, now, readinessTransport),
    }));
  });
  const owners = pathOwners(input, linked);
  const proveSyncs = input.merge_only_syncs ?? provenMergeOnlySyncs;
  const mergeOnlySyncs = new Map(linked.map((read) => {
    const sync: MergeOnlySyncInput = { repo_root: input.repo_root, pr: read.number, base_ref: read.base_ref, base_sha: read.base_sha, head_sha: read.head_sha };
    return [read.number, proveSyncs(sync, syncCarryCandidates(read, owners))] as const;
  }));
  return projectBoard({
    observed_at: observedAt,
    parent,
    acceptance_merge: acceptanceMerge(input, repository, parent.repository.default_branch),
    pull_requests: reads,
    readiness,
    merge_only_syncs: mergeOnlySyncs,
    path_owners: owners,
    execution: execution(input, parent.repository.database_id),
    daily_run: dailyRun(input, repository, parent.repository.default_branch),
    tooling: tooling(input),
  });
}
