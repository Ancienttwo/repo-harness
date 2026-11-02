/**
 * Builds one integration batch branch and opens its batch PR (orchestrator §9.3, steps 1, 2 and 4).
 *
 * The branch holds one `--no-ff` merge commit per member on the current default
 * branch and nothing else, so `publication merge --batch` accepts it. Member
 * heads, closing issues and acceptance reviews come from GitHub; the caller
 * names only the PRs and their order. A conflicting member is dropped and
 * reported. The batch number is never reused: a number is used when a remote
 * branch or any PR has that head ref, and the push only creates the ref. Every
 * git remote call goes to `origin`, after its fetch and push URLs prove that it
 * is the repository that `--repository-id` names. The command never merges into
 * the default branch.
 */

import { spawnSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { BATCH_COMMIT_LIMIT } from '../../core/publication/merge-readiness';
import { gitSpawnSync, withoutRepositorySelectingGitEnv } from '../git/runner';

const BATCH_MEMBER_LIMIT = 6;

export type BatchBuildErrorCode =
  | 'invalid_selection'
  | 'provider_unavailable'
  | 'provider_data_incomplete'
  | 'remote_mismatch'
  | 'git_failed'
  | 'batch_empty'
  | 'batch_commit_limit_exceeded'
  | 'batch_ref_collision'
  | 'batch_push_outcome_unknown'
  | 'batch_pr_outcome_unknown';

export interface BatchMemberAcceptance {
  readonly round: number;
  readonly subject_sha: string;
  readonly tier: string;
  readonly verdict: string;
  readonly url: string;
}

export interface BatchMember {
  readonly pr: number;
  readonly head_sha: string;
  readonly closes: readonly string[];
  /** The latest `repo-harness acceptance review` on the PR; null when the PR has none. */
  readonly acceptance: BatchMemberAcceptance | null;
  /** Null when the head is the reviewed subject or no review exists; otherwise how the head differs. */
  readonly head_note: string | null;
}

export interface BatchMergedMember extends BatchMember {
  readonly merge_commit_sha: string;
}

export interface BatchDroppedMember {
  readonly pr: number;
  readonly head_sha: string;
  /** `already_contained`: the base or an earlier member already holds the head, so the merge made no commit. */
  readonly reason: 'merge_conflict' | 'already_contained';
  /** The conflicted files; empty for `already_contained`. */
  readonly files: readonly string[];
}

export interface BatchBuildDocument {
  readonly protocol: 1;
  readonly kind: 'repo-harness-publication-batch-build';
  readonly repository: string;
  readonly provider_repository_id: string;
  readonly parent: number;
  readonly batch_number: number;
  readonly branch: string;
  readonly base_ref: string;
  readonly base_sha: string;
  readonly head_sha: string;
  readonly pr: { readonly number: number; readonly url: string };
  readonly merged: readonly BatchMergedMember[];
  readonly dropped: readonly BatchDroppedMember[];
}

interface FailureDetails {
  readonly branch?: string;
  /** The head the build pushed or tried to push. */
  readonly head_sha?: string;
  /** The remote branch value that the readback after a failed push saw. */
  readonly observed_head_sha?: string;
  /** Exit 5 after the push: the PR text, so `gh pr create --head <branch>` can finish without a rebuild. */
  readonly title?: string;
  readonly body?: string;
}

export interface BatchBuildFailure extends FailureDetails {
  readonly ok: false;
  readonly exit_code: 4 | 5;
  readonly error: BatchBuildErrorCode;
  readonly message: string;
}

export type BatchBuildResult =
  | { readonly exit_code: 0; readonly document: BatchBuildDocument }
  | { readonly exit_code: 4 | 5; readonly document: BatchBuildFailure };

export interface BatchBuildInput {
  readonly repo_root: string;
  /** Raw flag values; the build validates them as positive integers. */
  readonly provider_repository_id: string;
  readonly parent: string;
  readonly prs: readonly string[];
  readonly gh_bin?: string;
  /** Internal test seam; the CLI never sets it. */
  readonly gh_runner?: (args: readonly string[]) => { readonly status: number; readonly stdout: string; readonly stderr?: string };
}

class BuildError extends Error {
  constructor(readonly code: BatchBuildErrorCode, message: string, readonly exitCode: 4 | 5 = 4, readonly details: FailureDetails = {}) {
    super(message);
  }
}

const PROVIDER_TIMEOUT_MS = 30_000;
const SHA = /^[0-9a-f]{40}$/u;
const POSITIVE_INTEGER = /^[1-9][0-9]*$/u;
const REMOTE = 'origin';
/** The URL forms that name one github.com repository; group 1 is `owner/name`. */
const GITHUB_REMOTE = /^(?:https:\/\/(?:[^@/]+@)?github\.com\/|ssh:\/\/git@github\.com(?::22)?\/|git@github\.com:)([^/]+\/[^/]+?)(?:\.git)?\/?$/iu;

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function gh(input: BatchBuildInput, args: readonly string[]): unknown {
  const full = args[0] === 'api' ? [...args, '--hostname', 'github.com'] : [...args];
  const result = input.gh_runner?.(full) ?? spawnSync(input.gh_bin ?? process.env.REPO_HARNESS_GH_BIN ?? 'gh', full, {
    cwd: input.repo_root, env: { ...process.env, GH_HOST: 'github.com' }, encoding: 'utf-8',
    timeout: PROVIDER_TIMEOUT_MS, killSignal: 'SIGKILL',
  });
  const label = `gh ${args.slice(0, 2).join(' ')}`;
  if (result.status !== 0) {
    const failure = 'error' in result && result.error ? result.error.message : (result.stderr ?? '').trim();
    throw new BuildError('provider_unavailable', `${label}: ${failure || `exit ${result.status}`}`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new BuildError('provider_data_incomplete', `${label} returned invalid JSON`);
  }
}

/** Repository-selecting variables are removed, so each call acts on its cwd and never on the caller's repository. */
function git(cwd: string, args: readonly string[]): { readonly status: number | null; readonly stdout: string; readonly stderr: string } {
  const result = gitSpawnSync(args, { cwd, encoding: 'utf-8', env: withoutRepositorySelectingGitEnv() });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

function gitOk(cwd: string, args: readonly string[]): string {
  const result = git(cwd, args);
  if (result.status !== 0) throw new BuildError('git_failed', `git ${args.join(' ')}: ${result.stderr.trim() || `exit ${result.status}`}`);
  return result.stdout.trim();
}

interface Repository {
  readonly full_name: string;
  readonly default_branch: string;
}

function readRepository(input: BatchBuildInput): Repository {
  const value = gh(input, ['api', `repositories/${input.provider_repository_id}`]);
  if (!isObject(value) || String(value.id) !== input.provider_repository_id || typeof value.full_name !== 'string'
    || !value.full_name.includes('/') || typeof value.default_branch !== 'string' || value.default_branch === '') {
    throw new BuildError('provider_data_incomplete', 'provider repository does not match --repository-id');
  }
  return { full_name: value.full_name, default_branch: value.default_branch };
}

/** Every effective fetch and push URL of the remote names the selected repository on github.com. */
function assertRemoteIsRepository(root: string, repository: string): void {
  const urls = [
    ...gitOk(root, ['remote', 'get-url', '--all', REMOTE]).split('\n'),
    ...gitOk(root, ['remote', 'get-url', '--push', '--all', REMOTE]).split('\n'),
  ].filter(Boolean);
  const others = urls.filter((url) => GITHUB_REMOTE.exec(url)?.[1]?.toLowerCase() !== repository.toLowerCase());
  if (others.length > 0) {
    throw new BuildError('remote_mismatch', `${REMOTE} must fetch from and push only to github.com/${repository}; it also uses ${
      others.map((url) => url.replace(/\/\/[^@/]+@/u, '//')).join(', ')}`);
  }
}

const MEMBER_QUERY = 'query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){number headRefOid closingIssuesReferences(first:100){pageInfo{hasNextPage} nodes{number repository{nameWithOwner}}} reviews(last:100){nodes{body url}}}}}';
const ACCEPTANCE_REVIEW = /^repo-harness acceptance review\nRound: (\d+)\nSubject: ([0-9a-f]{40})\nTier: (\S+)\nVerdict: (\S+)\n/u;

function readMember(input: BatchBuildInput, repository: string, pr: number): Omit<BatchMember, 'head_note'> {
  const [owner, name] = repository.split('/');
  const value = gh(input, ['api', 'graphql', '-f', `query=${MEMBER_QUERY}`, '-f', `owner=${owner}`, '-f', `name=${name}`, '-F', `number=${pr}`]);
  const node = isObject(value) && isObject(value.data) && isObject(value.data.repository) ? value.data.repository.pullRequest : undefined;
  const closing = isObject(node) ? node.closingIssuesReferences : undefined;
  const reviews = isObject(node) && isObject(node.reviews) ? node.reviews.nodes : undefined;
  if (!isObject(node) || node.number !== pr || typeof node.headRefOid !== 'string' || !SHA.test(node.headRefOid)
    || !isObject(closing) || !isObject(closing.pageInfo) || closing.pageInfo.hasNextPage !== false
    || !Array.isArray(closing.nodes) || !Array.isArray(reviews)) {
    throw new BuildError('provider_data_incomplete', `PR #${pr} is missing or incomplete`);
  }
  const closes = closing.nodes.map((entry) => {
    const owner = isObject(entry) && isObject(entry.repository) ? entry.repository.nameWithOwner : undefined;
    if (!isObject(entry) || !Number.isSafeInteger(entry.number) || typeof owner !== 'string') {
      throw new BuildError('provider_data_incomplete', `PR #${pr} closing reference is incomplete`);
    }
    return owner.toLowerCase() === repository.toLowerCase() ? `#${entry.number}` : `${owner}#${entry.number}`;
  });
  let acceptance: BatchMemberAcceptance | null = null;
  for (const review of reviews) {
    const match = isObject(review) && typeof review.body === 'string' ? ACCEPTANCE_REVIEW.exec(review.body.replace(/\r\n/gu, '\n')) : null;
    if (match && isObject(review) && typeof review.url === 'string') {
      acceptance = { round: Number(match[1]), subject_sha: match[2]!, tier: match[3]!, verdict: match[4]!, url: review.url };
    }
  }
  return { pr, head_sha: node.headRefOid, closes, acceptance };
}

/** The value of one exact remote ref, or null when the remote does not have it. */
function remoteRef(root: string, ref: string): string | null {
  const line = gitOk(root, ['ls-remote', REMOTE, ref]).split('\n').find((entry) => entry.split('\t')[1] === ref);
  return line?.split('\t')[0] ?? null;
}

function batchPrs(input: BatchBuildInput, repository: string, branch: string, limit: number): unknown {
  return gh(input, ['api', `repos/${repository}/pulls?state=all&per_page=${limit}&head=${repository.split('/')[0]}:${branch}`]);
}

/** The lowest batch number that no remote branch and no PR head ref of the repository has used. */
function nextBatchNumber(input: BatchBuildInput, repository: string, parent: number): number {
  const prefix = `integration/${parent}-batch-`;
  const branches = new Set(gitOk(input.repo_root, ['ls-remote', '--heads', REMOTE, `refs/heads/${prefix}*`]).split('\n')
    .map((line) => line.split('\t')[1]?.replace('refs/heads/', '')).filter((ref): ref is string => ref !== undefined));
  for (let n = 1; ; n++) {
    if (branches.has(`${prefix}${n}`)) continue;
    const prs = batchPrs(input, repository, `${prefix}${n}`, 1);
    if (!Array.isArray(prs)) throw new BuildError('provider_data_incomplete', 'provider PR list is not an array');
    if (prs.length === 0) return n;
  }
}

/** The reviewed subject equals the head, or how the head differs from it. */
function headNote(worktree: string, member: Omit<BatchMember, 'head_note'>, base: string): string | null {
  const subject = member.acceptance?.subject_sha;
  if (subject === undefined || subject === member.head_sha) return null;
  const range = git(worktree, ['rev-list', '--no-merges', `${subject}..${member.head_sha}`, `^${base}`]);
  if (range.status !== 0) return 'the reviewed subject is not in the head history';
  const count = range.stdout.split('\n').filter(Boolean).length;
  return count === 0 ? 'adds main only' : `adds ${count} commits after the reviewed subject`;
}

function mergeMember(worktree: string, member: BatchMember, branch: string): BatchMergedMember | BatchDroppedMember {
  const before = gitOk(worktree, ['rev-parse', 'HEAD']);
  const merge = git(worktree, ['merge', '--no-ff', '--no-edit', '-m', `Merge #${member.pr} at ${member.head_sha} into ${branch}`, member.head_sha]);
  if (merge.status === 0) {
    const head = gitOk(worktree, ['rev-parse', 'HEAD']);
    // `git merge` exits 0 without a commit when the head is already reachable.
    if (head === before) return { pr: member.pr, head_sha: member.head_sha, reason: 'already_contained', files: [] };
    const second = git(worktree, ['rev-parse', '--verify', '--quiet', 'HEAD^2']).stdout.trim();
    if (second !== member.head_sha) throw new BuildError('git_failed', `the merge of #${member.pr} made ${head}, whose second parent is not ${member.head_sha}`);
    return { ...member, merge_commit_sha: head };
  }
  const files = gitOk(worktree, ['diff', '--name-only', '--diff-filter=U']).split('\n').filter(Boolean);
  if (files.length === 0) throw new BuildError('git_failed', `git merge of #${member.pr}: ${merge.stderr.trim() || merge.stdout.trim()}`);
  gitOk(worktree, ['merge', '--abort']);
  return { pr: member.pr, head_sha: member.head_sha, reason: 'merge_conflict', files };
}

/**
 * Create-only push: the lease expects the ref to be absent, so the push never
 * moves a batch ref that another build created after the number was chosen.
 */
function pushNewBranch(worktree: string, branch: string, head: string): void {
  const ref = `refs/heads/${branch}`;
  const push = git(worktree, ['push', '--porcelain', `--force-with-lease=${ref}:`, REMOTE, `${head}:${ref}`]);
  if (push.status === 0) return;
  const failure = push.stderr.trim() || `exit ${push.status}`;
  const rejected = push.stdout.split('\n').some((line) => line.startsWith('!') && line.split('\t')[1]?.endsWith(`:${ref}`) && line.includes('[rejected]'));
  let observed: string | null;
  try {
    observed = remoteRef(worktree, ref);
  } catch (error) {
    throw new BuildError('batch_push_outcome_unknown', `git push of ${branch} failed (${failure}) and the remote readback failed: ${errorMessage(error)}`,
      5, { branch, head_sha: head });
  }
  const seen = observed === null ? {} : { observed_head_sha: observed };
  if (rejected) {
    throw new BuildError('batch_ref_collision', `${branch} already exists on ${REMOTE}; nothing was pushed. Run the build again to take the next number.`,
      4, { branch, head_sha: head, ...seen });
  }
  if (observed === null) throw new BuildError('git_failed', `git push of ${branch} failed and ${REMOTE} has no such ref; nothing was pushed: ${failure}`);
  if (observed !== head) {
    throw new BuildError('batch_push_outcome_unknown', `git push of ${branch} failed (${failure}) and ${REMOTE} has the ref at ${observed}`,
      5, { branch, head_sha: head, ...seen });
  }
}

function pullRequestLink(value: unknown): { readonly number: number; readonly url: string } | null {
  return isObject(value) && Number.isSafeInteger(value.number) && typeof value.html_url === 'string'
    ? { number: Number(value.number), url: value.html_url }
    : null;
}

/** On a failed or unproven create, one readback by head ref decides: exactly one PR is the result, anything else is exit 5. */
function openBatchPr(input: BatchBuildInput, repository: Repository, branch: string, head: string, title: string, body: string) {
  let createFailure: string;
  try {
    const created = pullRequestLink(gh(input, ['api', '-X', 'POST', `repos/${repository.full_name}/pulls`,
      '-f', `title=${title}`, '-f', `head=${branch}`, '-f', `base=${repository.default_branch}`, '-f', `body=${body}`]));
    if (created) return created;
    createFailure = 'the PR create response has no number or html_url';
  } catch (error) {
    createFailure = errorMessage(error);
  }
  const unknown = (readback: string) => new BuildError('batch_pr_outcome_unknown',
    `pushed ${branch} at ${head}, but the PR create failed (${createFailure}) and ${readback}; finish with gh pr create --head ${branch} and this title and body`,
    5, { branch, head_sha: head, title, body });
  let prs: unknown;
  try {
    prs = batchPrs(input, repository.full_name, branch, 2);
  } catch (error) {
    throw unknown(`the PR readback failed: ${errorMessage(error)}`);
  }
  const found = Array.isArray(prs) && prs.length === 1 ? pullRequestLink(prs[0]) : null;
  if (found) return found;
  throw unknown(`the PR readback found ${Array.isArray(prs) ? prs.length : 'no list of'} PRs with that head`);
}

function droppedReason(member: BatchDroppedMember): string {
  return member.reason === 'merge_conflict'
    ? `merge conflict in ${member.files.map((file) => `\`${file}\``).join(', ')}`
    : 'its head is already in main or in an earlier member';
}

function acceptanceCells(member: BatchMergedMember): string {
  const review = member.acceptance;
  const merged = `\`${member.head_sha}\`${member.head_note ? ` (${member.head_note})` : ''}`;
  if (review === null) return `no acceptance review on GitHub | ${merged} | —`;
  return `\`${review.subject_sha}\` (round ${review.round} ${review.verdict}, ${review.tier}) | ${merged} | ${review.url}`;
}

function renderBatchTitle(parent: number, merged: readonly BatchMergedMember[]): string {
  return `chore(integration): merge accepted PRs ${merged.map((member) => `#${member.pr}`).join(' ')} as one batch (#${parent})`;
}

/** The batch PR body of `templates.md`, from what the build observed. */
function renderBatchBody(parent: number, base: string, merged: readonly BatchMergedMember[], dropped: readonly BatchDroppedMember[]): string {
  const closes = [...new Set(merged.flatMap((member) => member.closes))];
  const left = dropped.map((member) => `#${member.pr} (${droppedReason(member)})`);
  return [
    ...closes.map((reference) => `Closes ${reference}`),
    `Refs #${parent}`,
    '',
    '## Goal',
    `Merge ${merged.length} accepted PRs with one CI run instead of ${merged.length} serial up-to-date syncs.`,
    '',
    '## Scope',
    `One \`--no-ff\` merge of each member head onto main@${base}, in this order. Each member keeps its own commits and review history. This PR adds no change of its own.`,
    '',
    '| PR | Issue | Reviewed subject | Merged head | Acceptance |',
    '|---|---|---|---|---|',
    ...merged.map((member) => `| #${member.pr} | ${member.closes.join(', ') || '—'} | ${acceptanceCells(member)} |`),
    '',
    `Not in this PR: ${left.length ? left.join('; ') : 'none'}.`,
    '',
    '## Changes',
    `- ${merged.length} merge commits. All merged without conflicts.`,
    '- Deleted: nothing beyond what each member deletes.',
    '',
    '## Architecture slice',
    'Architecture slice unchanged by the batch, see each member PR.',
    '',
    '## Verification',
    '- PR CI is the authority for the combined head.',
    '',
    '## Test changes',
    'None in this PR. Each member PR lists its own test changes.',
    '',
    '## Risk and rollback',
    'Risk: an interaction between the members that no single PR\'s CI saw; the batch CI run covers it. Rollback: `git revert -m 1 <batch merge commit>` reverts the whole batch; `git revert -m 1 <member merge commit on main>` reverts one member.',
    '',
  ].join('\n');
}

function positiveInteger(value: string, flag: string): number {
  if (!POSITIVE_INTEGER.test(value) || !Number.isSafeInteger(Number(value))) throw new BuildError('invalid_selection', `${flag} must be a positive integer; got ${value}`);
  return Number(value);
}

function validateSelection(input: BatchBuildInput): { readonly parent: number; readonly prs: readonly number[] } {
  positiveInteger(input.provider_repository_id, '--repository-id');
  const parent = positiveInteger(input.parent, '--parent');
  if (input.prs.length === 0) throw new BuildError('invalid_selection', 'name at least one --pr');
  if (input.prs.length > BATCH_MEMBER_LIMIT) {
    throw new BuildError('invalid_selection', `a batch has at most ${BATCH_MEMBER_LIMIT} members; got ${input.prs.length}`);
  }
  const prs = input.prs.map((pr) => positiveInteger(pr, '--pr'));
  if (new Set(prs).size !== prs.length) throw new BuildError('invalid_selection', 'a --pr value repeats');
  return { parent, prs };
}

function build(input: BatchBuildInput): BatchBuildDocument {
  const selection = validateSelection(input);
  const repository = readRepository(input);
  assertRemoteIsRepository(input.repo_root, repository.full_name);
  const members = selection.prs.map((pr) => readMember(input, repository.full_name, pr));
  const batchNumber = nextBatchNumber(input, repository.full_name, selection.parent);
  const branch = `integration/${selection.parent}-batch-${batchNumber}`;
  gitOk(input.repo_root, ['fetch', '--no-tags', REMOTE, repository.default_branch]);
  const base = gitOk(input.repo_root, ['rev-parse', 'FETCH_HEAD^{commit}']);
  for (const member of members) {
    gitOk(input.repo_root, ['fetch', '--no-tags', REMOTE, `refs/pull/${member.pr}/head`]);
    if (git(input.repo_root, ['cat-file', '-e', `${member.head_sha}^{commit}`]).status !== 0) {
      throw new BuildError('git_failed', `PR #${member.pr} head ${member.head_sha} is not in the fetched pull ref`);
    }
  }
  const scratch = mkdtempSync(join(tmpdir(), `repo-harness-batch-${selection.parent}-${batchNumber}-`));
  const worktree = join(scratch, 'worktree');
  try {
    gitOk(input.repo_root, ['worktree', 'add', '--detach', worktree, base]);
    const merged: BatchMergedMember[] = [];
    const dropped: BatchDroppedMember[] = [];
    for (const member of members) {
      const result = mergeMember(worktree, { ...member, head_note: headNote(worktree, member, base) }, branch);
      if ('merge_commit_sha' in result) merged.push(result);
      else dropped.push(result);
    }
    if (merged.length === 0) throw new BuildError('batch_empty', `no member merged; nothing was pushed: ${dropped.map((member) => `#${member.pr}`).join(', ')}`);
    const head = gitOk(worktree, ['rev-parse', 'HEAD']);
    const commits = Number(gitOk(worktree, ['rev-list', '--count', `${base}..${head}`]));
    if (commits > BATCH_COMMIT_LIMIT) {
      throw new BuildError('batch_commit_limit_exceeded',
        `base..head has ${commits} commits; publication merge --batch proves at most ${BATCH_COMMIT_LIMIT}. Nothing was pushed; build smaller batches.`);
    }
    pushNewBranch(worktree, branch, head);
    const title = renderBatchTitle(selection.parent, merged);
    const pr = openBatchPr(input, repository, branch, head, title, renderBatchBody(selection.parent, base, merged, dropped));
    return {
      protocol: 1, kind: 'repo-harness-publication-batch-build', repository: repository.full_name,
      provider_repository_id: input.provider_repository_id, parent: selection.parent, batch_number: batchNumber, branch,
      base_ref: repository.default_branch, base_sha: base, head_sha: head, pr, merged, dropped,
    };
  } finally {
    git(input.repo_root, ['worktree', 'remove', '--force', worktree]);
    try {
      rmSync(scratch, { recursive: true, force: true });
    } catch {
      // A leftover scratch directory does not change what was pushed or opened, so it never replaces the result.
    }
  }
}

/**
 * Exit 0: built and opened. Exit 4: refused; nothing was pushed. Exit 5: the
 * branch may be on the remote and the push or PR outcome is not proven; the
 * document names the branch and head to inspect.
 */
export function buildIntegrationBatch(input: BatchBuildInput): BatchBuildResult {
  try {
    return { exit_code: 0, document: build(input) };
  } catch (error) {
    const known = error instanceof BuildError ? error : new BuildError('git_failed', errorMessage(error));
    return {
      exit_code: known.exitCode,
      document: { ok: false, exit_code: known.exitCode, error: known.code, message: known.message, ...known.details },
    };
  }
}
