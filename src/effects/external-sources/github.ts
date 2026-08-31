import { execFileSync } from 'child_process';

import type { ExternalSourceFailureClass } from '../../core/external-sources/issue-observation';
import type { ExternalSourcesManualGithubPolicyV1 } from './policy';

export interface GithubRepositoryIdentityV1 {
  readonly provider_repository_id: string;
  readonly display_ref: string;
  readonly url: string;
}

export interface GithubIssueV1 {
  readonly provider_issue_id: string;
  readonly number: number;
  readonly url: string;
  readonly created_at: string | null;
  readonly updated_at: string | null;
  readonly state: 'open' | 'closed';
  readonly title: string;
  readonly body: string;
  readonly labels: readonly string[];
  readonly assignees: readonly string[];
}

export interface GithubFetchSnapshotV1 {
  readonly repository: GithubRepositoryIdentityV1;
  readonly issues: readonly GithubIssueV1[];
  readonly pages_fetched: number;
  readonly issues_seen: number;
}

export interface GithubCommandResult {
  readonly stdout: string;
  readonly stderr?: string;
}

export type GithubCommandRunner = (args: readonly string[], options: { readonly timeout_ms: number; readonly max_buffer: number }) => GithubCommandResult;

export class GithubAdapterError extends Error {
  constructor(
    readonly failure_class: ExternalSourceFailureClass,
    message: string,
    readonly outcome: 'incomplete' | 'unavailable' = 'unavailable',
    readonly repository: GithubRepositoryIdentityV1 | null = null,
    readonly pages_fetched = 0,
    readonly issues_seen = 0,
  ) {
    super(message);
    this.name = 'GithubAdapterError';
  }
}

function defaultRunner(args: readonly string[], options: { readonly timeout_ms: number; readonly max_buffer: number }): GithubCommandResult {
  try {
    return { stdout: execFileSync('gh', args, { encoding: 'utf8', timeout: options.timeout_ms, maxBuffer: options.max_buffer, stdio: ['ignore', 'pipe', 'pipe'] }) };
  } catch (error) {
    const detail = error as NodeJS.ErrnoException & { stderr?: Buffer | string; killed?: boolean };
    const stderr = detail.stderr ? String(detail.stderr).trim() : '';
    const message = `${detail.message}${stderr ? `: ${stderr}` : ''}`;
    if (detail.code === 'ETIMEDOUT' || detail.killed) throw new GithubAdapterError('deadline', message, 'unavailable');
    if (detail.code === 'ENOBUFS') throw new GithubAdapterError('payload_limit', message, 'incomplete');
    if (/(?:429|rate limit)/iu.test(message)) throw new GithubAdapterError('rate_limit', message, 'unavailable');
    if (/(?:401|403|auth|authentication|login)/iu.test(message)) throw new GithubAdapterError('authentication', message, 'unavailable');
    if (detail.code === 'ENOENT' || /network|ENOTFOUND|ECONN/u.test(message)) throw new GithubAdapterError('network', message, 'unavailable');
    throw new GithubAdapterError('invalid_response', message, 'unavailable');
  }
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new GithubAdapterError('invalid_response', `${label} must be an object`);
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new GithubAdapterError('invalid_response', `${label} must be a string`);
  return value;
}

function requiredText(value: unknown, label: string): string {
  const result = text(value, label);
  if (!result.trim()) throw new GithubAdapterError('invalid_response', `${label} must not be empty`);
  return result;
}

function timestamp(value: unknown, label: string): string | null {
  if (value === null || value === undefined) return null;
  const result = text(value, label);
  if (Number.isNaN(Date.parse(result))) throw new GithubAdapterError('invalid_response', `${label} must be a timestamp`);
  return result;
}

function sortedStrings(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value)) throw new GithubAdapterError('invalid_response', `${label} must be an array`);
  return Object.freeze(Array.from(new Set(value.map((entry) => requiredText(entry, label).trim()))).sort());
}

function parseJson(raw: string, label: string): unknown {
  try { return JSON.parse(raw); }
  catch { throw new GithubAdapterError('invalid_response', `${label} is not valid JSON`); }
}

function parseRepository(raw: unknown): GithubRepositoryIdentityV1 {
  const value = object(raw, 'GitHub repository response');
  const id = typeof value.id === 'number' && Number.isSafeInteger(value.id) && value.id > 0 ? String(value.id) : typeof value.id === 'string' && value.id.trim() ? value.id : '';
  if (!id) throw new GithubAdapterError('repository_identity', 'GitHub repository response has no immutable repository id');
  const display = requiredText(value.full_name, 'GitHub repository full_name');
  return Object.freeze({ provider_repository_id: id, display_ref: display, url: requiredText(value.html_url, 'GitHub repository html_url') });
}

function parseIssue(raw: unknown, repository: GithubRepositoryIdentityV1, maxBodyBytes: number): GithubIssueV1 | null {
  const value = object(raw, 'GitHub issue');
  if (value.pull_request !== undefined && value.pull_request !== null) return null;
  const id = typeof value.id === 'number' && Number.isSafeInteger(value.id) && value.id > 0 ? String(value.id) : typeof value.id === 'string' && value.id.trim() ? value.id : '';
  const number = typeof value.number === 'number' && Number.isSafeInteger(value.number) && value.number > 0 ? value.number : null;
  if (!id || number === null) throw new GithubAdapterError('invalid_response', 'GitHub issue has invalid immutable id or number', 'unavailable', repository);
  const body = value.body === null || value.body === undefined ? '' : text(value.body, 'GitHub issue body');
  if (Buffer.byteLength(body, 'utf8') > maxBodyBytes) throw new GithubAdapterError('body_limit', `GitHub issue #${number} body exceeds max_body_bytes`, 'incomplete', repository);
  const rawLabels = value.labels === undefined ? [] : value.labels;
  const rawAssignees = value.assignees === undefined ? [] : value.assignees;
  if (!Array.isArray(rawLabels) || !Array.isArray(rawAssignees)) throw new GithubAdapterError('invalid_response', 'GitHub issue labels or assignees are invalid', 'unavailable', repository);
  const labels = sortedStrings(rawLabels.map((label) => object(label, 'GitHub issue label').name), 'GitHub issue label name');
  const assignees = sortedStrings(rawAssignees.map((assignee) => object(assignee, 'GitHub issue assignee').login), 'GitHub issue assignee login');
  if (value.state !== 'open' && value.state !== 'closed') throw new GithubAdapterError('invalid_response', 'GitHub issue state is invalid', 'unavailable', repository);
  return Object.freeze({
    provider_issue_id: id,
    number,
    url: requiredText(value.html_url, 'GitHub issue html_url'),
    created_at: timestamp(value.created_at, 'GitHub issue created_at'),
    updated_at: timestamp(value.updated_at, 'GitHub issue updated_at'),
    state: value.state,
    title: text(value.title, 'GitHub issue title'),
    body,
    labels,
    assignees,
  });
}

function isTerminalPage(items: readonly unknown[]): boolean {
  return items.length === 0;
}

export function evaluateGithubEligibility(issue: GithubIssueV1, policy: ExternalSourcesManualGithubPolicyV1): { readonly eligible: boolean; readonly reasons: readonly string[] } {
  if (policy.github.selection.kind === 'issue_numbers') {
    const selected = policy.github.selection.issue_numbers.includes(issue.number);
    return Object.freeze({ eligible: selected, reasons: Object.freeze(selected ? [] : ['issue_not_selected']) });
  }
  const labels = new Set(issue.labels);
  const missingLabels = policy.github.selection.labels_all.filter((label) => !labels.has(label));
  const assigneeMatches = policy.github.selection.assignees_any.length === 0 || policy.github.selection.assignees_any.some((assignee) => issue.assignees.includes(assignee));
  const reasons = [
    ...missingLabels.map((label) => `missing_label:${label}`),
    ...(assigneeMatches ? [] : ['assignee_not_allowed']),
  ].sort();
  return Object.freeze({ eligible: reasons.length === 0, reasons: Object.freeze(reasons) });
}

export function fetchGithubIssues(
  policy: ExternalSourcesManualGithubPolicyV1,
  runner: GithubCommandRunner = defaultRunner,
  nowMs: () => number = Date.now,
): GithubFetchSnapshotV1 {
  const { repository, limits } = policy.github;
  const safeMaxBuffer = limits.max_total_bytes + 1;
  const deadlineAt = nowMs() + limits.deadline_ms;
  let totalBytes = 0;
  let pagesFetched = 0;
  let issuesSeen = 0;
  let identity: GithubRepositoryIdentityV1 | null = null;
  const run = (args: readonly string[]): GithubCommandResult => {
    const remaining = Math.floor(deadlineAt - nowMs());
    if (remaining <= 0) throw new GithubAdapterError('deadline', 'GitHub refresh exceeded deadline_ms', 'unavailable', identity, pagesFetched, issuesSeen);
    const result = runner(args, { timeout_ms: remaining, max_buffer: safeMaxBuffer });
    if (nowMs() > deadlineAt) throw new GithubAdapterError('deadline', 'GitHub refresh exceeded deadline_ms', 'unavailable', identity, pagesFetched, issuesSeen);
    return result;
  };
  try {
    const identityResult = run(['api', '--method', 'GET', `repos/${repository}`]);
    totalBytes += Buffer.byteLength(identityResult.stdout, 'utf8');
    if (totalBytes > limits.max_total_bytes) throw new GithubAdapterError('payload_limit', 'GitHub responses exceed max_total_bytes', 'incomplete');
    identity = parseRepository(parseJson(identityResult.stdout, 'GitHub repository response'));
    const all: GithubIssueV1[] = [];
    if (policy.github.selection.kind === 'issue_numbers') {
      for (const selectedNumber of policy.github.selection.issue_numbers) {
        const result = run(['api', '--method', 'GET', `repos/${repository}/issues/${selectedNumber}`]);
        totalBytes += Buffer.byteLength(result.stdout, 'utf8');
        if (totalBytes > limits.max_total_bytes) throw new GithubAdapterError('payload_limit', 'GitHub responses exceed max_total_bytes', 'incomplete', identity, 0, issuesSeen);
        const issue = parseIssue(parseJson(result.stdout, `GitHub issue #${selectedNumber}`), identity, limits.max_body_bytes);
        if (!issue) throw new GithubAdapterError('invalid_response', `selected GitHub issue #${selectedNumber} is a pull request`, 'unavailable', identity, 0, issuesSeen);
        if (issue.number !== selectedNumber) throw new GithubAdapterError('invalid_response', `selected GitHub issue #${selectedNumber} returned issue #${issue.number}`, 'unavailable', identity, 0, issuesSeen);
        issuesSeen += 1;
        all.push(issue);
      }
      return Object.freeze({ repository: identity, issues: Object.freeze(all), pages_fetched: 0, issues_seen: issuesSeen });
    }
    for (let page = 1; page <= limits.max_pages; page += 1) {
      const result = run(['api', '--method', 'GET', `repos/${repository}/issues`, '-f', 'state=all', '-f', 'per_page=100', '-f', `page=${page}`]);
      totalBytes += Buffer.byteLength(result.stdout, 'utf8');
      if (totalBytes > limits.max_total_bytes) throw new GithubAdapterError('payload_limit', 'GitHub responses exceed max_total_bytes', 'incomplete', identity, pagesFetched, issuesSeen);
      const pageItems = parseJson(result.stdout, `GitHub issues page ${page}`);
      if (!Array.isArray(pageItems)) throw new GithubAdapterError('invalid_response', `GitHub issues page ${page} must be an array`, 'unavailable', identity, pagesFetched, issuesSeen);
      pagesFetched += 1;
      if (isTerminalPage(pageItems)) return Object.freeze({ repository: identity, issues: Object.freeze(all), pages_fetched: pagesFetched, issues_seen: issuesSeen });
      for (const item of pageItems) {
        issuesSeen += 1;
        if (issuesSeen > limits.max_issues) throw new GithubAdapterError('issue_limit', 'GitHub issues exceed max_issues', 'incomplete', identity, pagesFetched, issuesSeen);
        const issue = parseIssue(item, identity, limits.max_body_bytes);
        if (issue) all.push(issue);
      }
      if (pageItems.length < 100) return Object.freeze({ repository: identity, issues: Object.freeze(all), pages_fetched: pagesFetched, issues_seen: issuesSeen });
    }
    throw new GithubAdapterError('pagination_limit', 'GitHub issues exceed max_pages without a terminal page', 'incomplete', identity, pagesFetched, issuesSeen);
  } catch (error) {
    if (error instanceof GithubAdapterError) {
      if (error.repository) throw error;
      throw new GithubAdapterError(error.failure_class, error.message, error.outcome, identity, pagesFetched, issuesSeen);
    }
    throw new GithubAdapterError('network', error instanceof Error ? error.message : String(error), 'unavailable', identity, pagesFetched, issuesSeen);
  }
}
