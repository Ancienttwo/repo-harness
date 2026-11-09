/**
 * Decoders for the provider reads behind the board: the parent GraphQL read,
 * the pull request GraphQL read, and the protocol comments in them. Each
 * decoder refuses the first field it cannot read, and a connection that has
 * more pages than one read returns fails closed, because a missing sub-issue,
 * blocked-by edge or pull request would change the board without a trace.
 */

export class BoardSourceError extends Error {
  constructor(message: string) {
    super(`board source invalid: ${message}`);
    this.name = 'BoardSourceError';
  }
}

export interface BoardCommentV1 {
  readonly url: string;
  readonly created_at: string;
  readonly author_association: string;
  readonly body: string;
}

/** The newest comments of a thread. `truncated` is true when older comments exist that the read did not return. */
export interface BoardCommentPageV1 {
  readonly truncated: boolean;
  readonly comments: readonly BoardCommentV1[];
}

export interface BoardRepositoryReadV1 {
  readonly database_id: number;
  readonly name_with_owner: string;
  readonly default_branch: string;
}

export interface BoardIssueReadV1 {
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly state: 'open' | 'closed';
  readonly labels: readonly string[];
  readonly milestone: string | null;
  readonly comments: BoardCommentPageV1;
}

export interface BoardSubIssueReadV1 extends BoardIssueReadV1 {
  readonly blocked_by: readonly { readonly number: number; readonly state: 'open' | 'closed' }[];
  /** Same-repository pull requests whose timeline cross-references this issue. Their bodies decide the link. */
  readonly pull_request_candidates: readonly number[];
}

export interface BoardParentReadV1 {
  readonly repository: BoardRepositoryReadV1;
  readonly parent: BoardIssueReadV1;
  readonly sub_issues: readonly BoardSubIssueReadV1[];
  /** Open issues whose title matches the CI repair search; the body marker decides. */
  readonly repair_candidates: readonly { readonly number: number; readonly body: string }[];
}

export interface BoardCheckRunReadV1 {
  readonly name: string;
  readonly status: string;
  readonly conclusion: string | null;
  readonly completed_at: string | null;
}

export interface BoardPullRequestReadV1 {
  readonly number: number;
  readonly url: string;
  readonly state: 'open' | 'closed' | 'merged';
  readonly is_draft: boolean;
  readonly body: string;
  readonly base_ref: string;
  readonly base_sha: string;
  readonly head_ref: string;
  readonly head_sha: string;
  readonly head_committed_at: string;
  readonly merged_at: string | null;
  /** Null when the pull request changes more files than one read returns. */
  readonly files: readonly string[] | null;
  readonly checks: readonly BoardCheckRunReadV1[];
  readonly comments: BoardCommentPageV1;
}

export const BOARD_PAGE = { labels: 50, comments: 50, sub_issues: 50, blocked_by: 50, timeline: 100, files: 100, checks: 100, repairs: 50 } as const;

type Json = Record<string, unknown>;

function fail(message: string): never {
  throw new BoardSourceError(message);
}

function obj(value: unknown, label: string): Json {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(`${label} is not an object`);
  return value as Json;
}

function str(value: unknown, label: string): string {
  if (typeof value !== 'string') fail(`${label} is not a string`);
  return value;
}

function nullableStr(value: unknown, label: string): string | null {
  return value === null ? null : str(value, label);
}

function int(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) fail(`${label} is not a positive integer`);
  return value as number;
}

function sha(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/u.test(value)) fail(`${label} is not a commit SHA`);
  return value;
}

function time(value: unknown, label: string): string {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) fail(`${label} is not a time`);
  return value;
}

function nodes(connection: unknown, label: string, more: 'hasNextPage' | 'hasPreviousPage' | null): unknown[] {
  const value = obj(connection, label);
  if (more !== null && obj(value.pageInfo, `${label}.pageInfo`)[more] !== false) fail(`${label} has more pages than one read returns`);
  if (!Array.isArray(value.nodes)) fail(`${label}.nodes is not an array`);
  return value.nodes;
}

function issueState(value: unknown, label: string): 'open' | 'closed' {
  if (value === 'OPEN') return 'open';
  if (value === 'CLOSED') return 'closed';
  return fail(`${label} is not OPEN or CLOSED`);
}

function comments(connection: unknown, label: string): BoardCommentPageV1 {
  const value = obj(connection, label);
  const truncated = obj(value.pageInfo, `${label}.pageInfo`).hasPreviousPage;
  if (typeof truncated !== 'boolean') fail(`${label}.pageInfo.hasPreviousPage is not a boolean`);
  return Object.freeze({
    truncated,
    comments: Object.freeze(nodes(value, label, null).map((entry, index) => {
      const comment = obj(entry, `${label}[${index}]`);
      return Object.freeze({
        url: str(comment.url, `${label}[${index}].url`),
        created_at: time(comment.createdAt, `${label}[${index}].createdAt`),
        author_association: str(comment.authorAssociation, `${label}[${index}].authorAssociation`),
        body: str(comment.body, `${label}[${index}].body`),
      });
    })),
  });
}

function issue(value: unknown, label: string): BoardIssueReadV1 {
  const node = obj(value, label);
  const milestone = node.milestone === null ? null : str(obj(node.milestone, `${label}.milestone`).title, `${label}.milestone.title`);
  return {
    number: int(node.number, `${label}.number`),
    title: str(node.title, `${label}.title`),
    url: str(node.url, `${label}.url`),
    state: issueState(node.state, `${label}.state`),
    labels: Object.freeze(nodes(node.labels, `${label}.labels`, 'hasNextPage')
      .map((entry, index) => str(obj(entry, `${label}.labels[${index}]`).name, `${label}.labels[${index}].name`))),
    milestone,
    comments: comments(node.comments, `${label}.comments`),
  };
}

/** `data` of the parent read (`PARENT_QUERY` in the board collector). */
export function decodeParentRead(data: unknown, repository: string): BoardParentReadV1 {
  const root = obj(data, 'data');
  const repo = obj(root.repository, 'repository');
  const nameWithOwner = str(repo.nameWithOwner, 'repository.nameWithOwner');
  if (nameWithOwner.toLowerCase() !== repository.toLowerCase()) fail(`repository is ${nameWithOwner}, expected ${repository}`);
  const parentNode = obj(repo.issue, 'issue');
  const subIssues = nodes(parentNode.subIssues, 'issue.subIssues', 'hasNextPage').map((entry, index) => {
    const label = `subIssues[${index}]`;
    const node = obj(entry, label);
    const candidates = nodes(node.timelineItems, `${label}.timelineItems`, 'hasPreviousPage').flatMap((item) => {
      const source = (item as Json | null)?.source as Json | undefined;
      // A cross-reference from an issue has no PR fields; one from another repository is not ours.
      if (source === undefined || source.number === undefined) return [];
      const sourceRepo = str(obj(source.repository, `${label} source repository`).nameWithOwner, `${label} source repository`);
      return sourceRepo.toLowerCase() === repository.toLowerCase() ? [int(source.number, `${label} source number`)] : [];
    });
    return Object.freeze({
      ...issue(node, label),
      blocked_by: Object.freeze(nodes(node.blockedBy, `${label}.blockedBy`, 'hasNextPage').map((edge, edgeIndex) => {
        const blocker = obj(edge, `${label}.blockedBy[${edgeIndex}]`);
        return Object.freeze({ number: int(blocker.number, `${label}.blockedBy number`), state: issueState(blocker.state, `${label}.blockedBy state`) });
      })),
      pull_request_candidates: Object.freeze([...new Set(candidates)].sort((left, right) => left - right)),
    });
  });
  const search = obj(root.repairs, 'repairs');
  if (!Number.isSafeInteger(search.issueCount) || (search.issueCount as number) > BOARD_PAGE.repairs) fail('repairs has more results than one read returns');
  return Object.freeze({
    repository: Object.freeze({
      database_id: int(repo.databaseId, 'repository.databaseId'),
      name_with_owner: nameWithOwner,
      default_branch: str(obj(repo.defaultBranchRef, 'repository.defaultBranchRef').name, 'repository.defaultBranchRef.name'),
    }),
    parent: Object.freeze(issue(parentNode, 'issue')),
    sub_issues: Object.freeze(subIssues),
    repair_candidates: Object.freeze(nodes(search, 'repairs', null).map((entry, index) => {
      const node = obj(entry, `repairs[${index}]`);
      return Object.freeze({ number: int(node.number, `repairs[${index}].number`), body: str(node.body, `repairs[${index}].body`) });
    })),
  });
}

function pullRequestState(value: unknown, label: string): BoardPullRequestReadV1['state'] {
  if (value === 'OPEN') return 'open';
  if (value === 'CLOSED') return 'closed';
  if (value === 'MERGED') return 'merged';
  return fail(`${label} is not OPEN, CLOSED or MERGED`);
}

/** `data` of the pull request read: one `pr<number>` alias per requested number. */
export function decodePullRequestsRead(data: unknown, numbers: readonly number[]): BoardPullRequestReadV1[] {
  const repo = obj(obj(data, 'data').repository, 'repository');
  return numbers.map((number) => {
    const label = `pr${number}`;
    const node = obj(repo[label], label);
    if (node.number !== number) fail(`${label}.number is not ${number}`);
    const commit = obj(obj(nodes(node.commits, `${label}.commits`, null)[0], `${label}.commits[0]`).commit, `${label} head commit`);
    const headSha = sha(node.headRefOid, `${label}.headRefOid`);
    if (commit.oid !== headSha) fail(`${label} last commit is not the head`);
    const files = obj(node.files, `${label}.files`);
    const filePaths = nodes(files, `${label}.files`, null).map((entry, index) => str(obj(entry, `${label}.files[${index}]`).path, `${label}.files[${index}].path`));
    const rollup = commit.statusCheckRollup === null ? null : obj(commit.statusCheckRollup, `${label}.statusCheckRollup`);
    const checks = rollup === null ? [] : nodes(rollup.contexts, `${label}.contexts`, 'hasNextPage').flatMap((entry, index) => {
      const context = obj(entry, `${label}.contexts[${index}]`);
      // A commit status (StatusContext) has no `name`; the board reads check runs only.
      if (context.name === undefined) return [];
      return [Object.freeze({
        name: str(context.name, `${label}.contexts[${index}].name`),
        status: str(context.status, `${label}.contexts[${index}].status`),
        conclusion: nullableStr(context.conclusion, `${label}.contexts[${index}].conclusion`),
        completed_at: context.completedAt === null ? null : time(context.completedAt, `${label}.contexts[${index}].completedAt`),
      })];
    });
    return Object.freeze({
      number,
      url: str(node.url, `${label}.url`),
      state: pullRequestState(node.state, `${label}.state`),
      is_draft: node.isDraft === true,
      body: str(node.body, `${label}.body`),
      base_ref: str(node.baseRefName, `${label}.baseRefName`),
      base_sha: sha(node.baseRefOid, `${label}.baseRefOid`),
      head_ref: str(node.headRefName, `${label}.headRefName`),
      head_sha: headSha,
      head_committed_at: time(commit.committedDate, `${label} head committedDate`),
      merged_at: node.mergedAt === null ? null : time(node.mergedAt, `${label}.mergedAt`),
      files: files.totalCount === filePaths.length ? Object.freeze(filePaths) : null,
      checks: Object.freeze(checks),
      comments: comments(node.comments, `${label}.comments`),
    });
  });
}

/** One open issue of the parent list read, with its sub-issue counts. */
export interface BoardOpenIssueReadV1 {
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly updated_at: string;
  readonly sub_issues: { readonly total: number; readonly completed: number };
}

export interface BoardOpenIssuesReadV1 {
  readonly repository: { readonly database_id: number; readonly name_with_owner: string };
  readonly issues: readonly BoardOpenIssueReadV1[];
}

function count(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) fail(`${label} is not a count`);
  return value as number;
}

/**
 * The pages of `gh api graphql --paginate --slurp` for the parent list read
 * (`OPEN_ISSUES_QUERY` in the parent list collector). Every page names the
 * same repository, and the last page has no next page.
 */
export function decodeOpenIssuesRead(pages: unknown): BoardOpenIssuesReadV1 {
  if (!Array.isArray(pages) || pages.length === 0) fail('the open issue read has no page');
  let repository: BoardOpenIssuesReadV1['repository'] | null = null;
  const issues = pages.flatMap((page, at) => {
    const repo = obj(obj(obj(page, `page ${at}`).data, `page ${at} data`).repository, `page ${at} repository`);
    const current = { database_id: int(repo.databaseId, 'repository.databaseId'), name_with_owner: str(repo.nameWithOwner, 'repository.nameWithOwner') };
    if (repository !== null && (repository.database_id !== current.database_id || repository.name_with_owner !== current.name_with_owner)) fail(`page ${at} names another repository`);
    repository = current;
    const connection = obj(repo.issues, `page ${at} issues`);
    const next = obj(connection.pageInfo, `page ${at} issues.pageInfo`).hasNextPage;
    if (next !== (at < pages.length - 1)) fail(`page ${at} issues.pageInfo.hasNextPage does not match the page count`);
    return nodes(connection, `page ${at} issues`, null).map((entry, index) => {
      const label = `page ${at} issues[${index}]`;
      const node = obj(entry, label);
      const summary = obj(node.subIssuesSummary, `${label}.subIssuesSummary`);
      return Object.freeze({
        number: int(node.number, `${label}.number`),
        title: str(node.title, `${label}.title`),
        url: str(node.url, `${label}.url`),
        updated_at: time(node.updatedAt, `${label}.updatedAt`),
        sub_issues: Object.freeze({ total: count(summary.total, `${label}.subIssuesSummary.total`), completed: count(summary.completed, `${label}.subIssuesSummary.completed`) }),
      });
    });
  });
  return Object.freeze({ repository: Object.freeze(repository!), issues: Object.freeze(issues) });
}

/** Only an account with write access holds a seat (`board.md`, Claims); other protocol comments are requests. */
const WRITE_ACCESS = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);

/** The comments of one protocol kind from accounts with write access. */
export function protocolComments(page: BoardCommentPageV1, header: string): BoardCommentV1[] {
  return page.comments.filter(comment => WRITE_ACCESS.has(comment.author_association)
    && comment.body.replace(/\r\n/gu, '\n').split('\n', 1)[0]!.trim() === header);
}

/** The newest comment of one protocol kind from an account with write access. */
export function newestProtocolComment(page: BoardCommentPageV1, header: string): BoardCommentV1 | null {
  return protocolComments(page, header).reduce<BoardCommentV1 | null>((newest, comment) => (newest === null || comment.created_at >= newest.created_at ? comment : newest), null);
}

export function field(body: string, name: string): string | null {
  const line = body.replace(/\r\n/gu, '\n').split('\n').find(entry => entry.startsWith(`${name}: `));
  return line === undefined ? null : line.slice(name.length + 2).trim();
}

/** The `Claim:` URL that an `issue claim status` comment names; null when it names none. */
export function claimStatusTarget(comment: BoardCommentV1): string | null {
  const value = field(comment.body, 'Claim');
  return value === null || value === '' ? null : value;
}

export interface ClaimStatusV1 {
  readonly url: string;
  readonly created_at: string;
  /** The `Status:` value, for example `ready for review; claim remains active` or `done`. */
  readonly status: string;
  readonly pr: number | null;
  readonly head_sha: string | null;
}

/** An `issue claim status` comment (`templates.md`). A comment without a `Status:` line is not a status. */
export function parseClaimStatus(comment: BoardCommentV1): ClaimStatusV1 | null {
  const status = field(comment.body, 'Status');
  if (status === null || status === '') return null;
  const pr = /^#([1-9][0-9]*)(?:\s+head\s+([0-9a-f]{7,40}))?/u.exec(field(comment.body, 'PR') ?? '');
  return Object.freeze({
    url: comment.url,
    created_at: comment.created_at,
    status,
    pr: pr === null ? null : Number(pr[1]),
    head_sha: pr?.[2] ?? null,
  });
}

export interface AcceptanceRowV1 {
  readonly round: number;
  readonly subject_sha: string;
  readonly verdict: 'PASS' | 'FAIL';
  /** The review runtime that the Role cell starts with (`review publish` writes `<harness> (<model>), read-only`); null for a subject line. */
  readonly harness: 'claude' | 'codex' | 'pi' | null;
  /** The issue comment id of the record's `Claim:` URL, which identifies one review; null when the line is missing or is not a comment URL. */
  readonly claim: string | null;
  /** True only when the record's `Model relation:` line is `different-family`: the reviewer's recorded `modelRelation` verdict against the writer. */
  readonly different_family: boolean;
}

// The subject cell holds the SHA bare or in paired backticks (the receipt tool and the round-4 records differ).
const RECORD_TABLE_ROW = /^\|\s*([1-9][0-9]*)\b[^|]*\|([^|]*)\|\s*(`?)([0-9a-f]{40})\3\s*\|\s*(PASS|FAIL)\b/u;
// Rounds above 3 have no receipt; the coordinator writes one `Subject: <sha>. Round <n> (...): PASS|FAIL` line.
const RECORD_SUBJECT_LINE = /^Subject: ([0-9a-f]{40})\. Round ([1-9][0-9]*) .*?: (PASS|FAIL)\b/u;

const COMMENT_URL = /^https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/(?:pull|issues)\/[1-9][0-9]*#issuecomment-([1-9][0-9]*)$/u;

/** The id of a GitHub issue comment URL: the one identity of a comment, whatever its `pull` or `issues` path. Null for any other text. */
export function commentId(url: string): string | null {
  return COMMENT_URL.exec(url)?.[1] ?? null;
}

/**
 * The rows of an `acceptance record` comment: the table rows that `review
 * publish` writes, or the one subject line of a later round. Null when the
 * record has neither shape; the caller reports `acceptance_record_unparsed`
 * and does not guess a verdict.
 */
export function parseAcceptanceRecord(comment: BoardCommentV1): readonly AcceptanceRowV1[] | null {
  const rows: AcceptanceRowV1[] = [];
  const record = { claim: commentId(field(comment.body, 'Claim') ?? ''), different_family: field(comment.body, 'Model relation') === 'different-family' };
  for (const line of comment.body.replace(/\r\n/gu, '\n').split('\n')) {
    const table = RECORD_TABLE_ROW.exec(line);
    if (table) rows.push(Object.freeze({ round: Number(table[1]), subject_sha: table[4]!, verdict: table[5] as 'PASS' | 'FAIL', harness: /^\s*(claude|codex|pi)\b/u.exec(table[2]!)?.[1] as AcceptanceRowV1['harness'] ?? null, ...record }));
    const subject = RECORD_SUBJECT_LINE.exec(line);
    if (subject) rows.push(Object.freeze({ round: Number(subject[2]), subject_sha: subject[1]!, verdict: subject[3] as 'PASS' | 'FAIL', harness: null, ...record }));
  }
  return rows.length === 0 ? null : Object.freeze(rows);
}

const REFS = /(?<![A-Za-z0-9_])refs?\s*:?\s*#([1-9][0-9]*)/giu;

/** Issue numbers after `Refs #n` in a pull request body. Closing keywords are `parseClosingReferences`. */
export function parseRefs(body: string): number[] {
  return [...new Set([...body.matchAll(REFS)].map(match => Number(match[1])))].sort((left, right) => left - right);
}

/** `owner/name` of a GitHub remote URL (https, scp-like ssh or ssh://), lowercased; null for any other URL. */
export function githubRemoteRepository(url: string): string | null {
  const match = /^(?:https:\/\/(?:[^@/]+@)?github\.com\/|git@github\.com:|ssh:\/\/git@github\.com(?::22)?\/)([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100}?)(?:\.git)?\/?$/iu.exec(url.trim());
  return match ? `${match[1]}/${match[2]}`.toLowerCase() : null;
}
