import { collectPullRequestMergeReadiness } from '../../../src/effects/publication/merge-readiness';
import { projectPullRequestMergeReadiness, type ProviderMergeReadinessFactsV1 } from '../../../src/core/publication/merge-readiness';
import { parseFastCheck, parsePullRequest, parseReviewThreads, WatcherQueryError } from './vendor/github.ts';
import type { GitHubReader, PrContext, PollingOptions } from './vendor/types.ts';
import { parsePrNumber } from './vendor/types.ts';
import type { WatchClock } from './vendor/policy.ts';

export const HEAD = 'a'.repeat(40);
export const BASE = 'b'.repeat(40);
export const OTHER = 'c'.repeat(40);
export const context = (number = 1): PrContext => ({ owner: 'fixture', repo: 'offline', number: parsePrNumber(number) });
export const options: PollingOptions = { interval: 10, sweepInterval: 300, timeout: 40, maxQueryErrors: 5, allowDraft: false };
export interface RawCheck { name: string; bucket: string; state: string; link: string }
export interface RawPr {
  number: number; url: string; state: string; isDraft: boolean; headRefOid: string;
  baseRefOid: string; headRefName: string; baseRefName: string; body: string;
  reviewDecision: string | null; mergeable: string; mergeStateStatus: string; mergedAt: string | null;
}
export interface Fixture {
  name: string;
  pr: RawPr;
  checks: RawCheck[];
  threads: { id: string; isResolved: boolean; comments: { nodes: never[] } }[];
  hasNextPage: boolean;
  expectedHead: string;
  expectedBase: string;
  identityStates?: Partial<RawPr>[];
  graphHead?: string;
  graphBase?: string;
  graphErrors?: unknown[];
  unavailable?: boolean;
}
export function frozen<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(frozen);
    Object.freeze(value);
  }
  return value;
}
export function fixture(name = 'clean', patch: Partial<Fixture> = {}): Fixture {
  return frozen({ name, pr: {
    number: 1, url: 'https://github.com/fixture/offline/pull/1', state: 'OPEN',
    isDraft: false, headRefOid: HEAD, baseRefOid: BASE, headRefName: 'feature',
    baseRefName: 'main', body: '', reviewDecision: 'APPROVED', mergeable: 'MERGEABLE',
    mergeStateStatus: 'CLEAN', mergedAt: null,
  }, checks: [check()], threads: [], hasNextPage: false,
  expectedHead: HEAD, expectedBase: BASE, ...patch });
}
export function changePr(name: string, patch: Partial<RawPr>): Fixture {
  return fixture(name, { pr: { ...fixture().pr, ...patch } });
}
export function check(bucket = 'pass', name = 'Required / CI'): RawCheck {
  return { name, bucket, state: bucket === 'pass' ? 'SUCCESS' : bucket === 'pending' ? 'PENDING' : 'FAILURE',
    link: 'https://github.com/fixture/offline/actions/runs/123/job/456' };
}
export function thread(id: number, isResolved = true) {
  return { id: `thread-${id}`, isResolved, comments: { nodes: [] as never[] } };
}
/** Both adapters replay this same frozen timeline independently. A provider
 * identity can move just after the facts response was captured. The observation
 * has then completed, but its initial identity is no longer current. */
export function temporalProvider(f: Fixture) {
  const states = frozen((f.identityStates ?? [{}]).map(patch => ({ ...f.pr, ...patch })));
  const identityReads: RawPr[] = [];
  const transitions: { before: RawPr; after: RawPr }[] = [];
  let index = 0;
  return {
    identityReads,
    transitions,
    current: () => states[index],
    readIdentity() {
      const identity = states[index];
      identityReads.push(identity);
      return identity;
    },
    completeFacts() {
      if (states.length === 1) return;
      const before = states[index];
      index = (index + 1) % states.length;
      transitions.push(frozen({ before, after: states[index] }));
    },
  };
}
export function watcherReader(f: Fixture) {
  const source = temporalProvider(f);
  const calls: string[] = [];
  const count = (name: string) => {
    calls.push(name);
    if (f.unavailable) throw new WatcherQueryError({ kind: 'command-exit', retryable: true, detail: 'fixture unavailable', code: 1 });
  };
  const reader: GitHubReader = Object.freeze({
    async originRepo() { throw new Error('No repository discovery in this experiment'); },
    async currentPr() { throw new Error('No PR discovery in this experiment'); },
    async openPullRequests() { throw new Error('No live stack discovery in this experiment'); },
    async pullRequest(ctx: PrContext) { count('pullRequest'); return frozen(parsePullRequest(source.readIdentity(), ctx)); },
    async checksFastPath() { count('checksFastPath'); return frozen({ kind: 'checks' as const, checks: f.checks.map(parseFastCheck) }); },
    async checkRollupPage() { count('checkRollupPage'); return frozen({ checks: [], endCursor: null }); },
    async reviewThreads() {
      count('reviewThreads');
      return frozen(parseReviewThreads({ errors: f.graphErrors, data: { repository: { pullRequest: {
        headRefOid: f.graphHead ?? source.current().headRefOid, baseRefOid: f.graphBase ?? source.current().baseRefOid,
        reviewThreads: { nodes: f.threads, pageInfo: { hasNextPage: f.hasNextPage } },
      } } } }));
    },
    async commitRollups() {
      count('commitRollups');
      const value = frozen([{ oid: source.current().headRefOid, state: 'SUCCESS' as const }]);
      source.completeFacts();
      return value;
    },
  });
  return { reader, calls, source };
}
export function collectBaseline(f: Fixture) {
  const calls: string[] = [];
  const source = temporalProvider(f);
  let current = source.current();
  const result = collectPullRequestMergeReadiness({
    repo_root: '.', pr_number: f.pr.number, expected_head_sha: f.expectedHead, expected_base_sha: f.expectedBase,
    gh_runner(args) {
      calls.push(args.slice(0, 3).join(' '));
      if (f.unavailable) return { status: 1, stdout: '', stderr: 'fixture unavailable' };
      let value: unknown;
      let status = 0;
      if (args[0] === 'repo' && args[1] === 'view') value = { id: 'R_fixture', nameWithOwner: 'fixture/offline' };
      else if (args[0] === 'pr' && args[1] === 'view') {
        current = source.readIdentity();
        value = current;
      } else if (args[0] === 'pr' && args[1] === 'checks') value = f.checks;
      else if (args[0] === 'api' && args[1]?.includes('/actions/runs/')) value = {
        path: '.github/workflows/ci.yml', event: 'pull_request', head_sha: current.headRefOid,
        pull_requests: [{ number: current.number, head: { sha: current.headRefOid }, base: { sha: current.baseRefOid } }],
        status: 'completed', conclusion: 'success',
      };
      else if (args[0] === 'api' && args[1]?.includes('/contents/')) { value = { status: '404' }; status = 1; }
      else if (args[0] === 'api' && args[1] === 'graphql') { value = {
        ...(f.graphErrors ? { errors: f.graphErrors } : {}),
        data: { node: { id: 'R_fixture', pullRequest: {
          number: current.number, headRefOid: f.graphHead ?? current.headRefOid,
          baseRefOid: f.graphBase ?? current.baseRefOid, reviewDecision: current.reviewDecision,
          reviewThreads: { nodes: f.threads, pageInfo: { hasNextPage: f.hasNextPage } },
          latestOpinionatedReviews: { nodes: [], pageInfo: { hasNextPage: false } },
        } } },
      };
        source.completeFacts();
      }
      else throw new Error(`Unexpected offline collector request: ${args.join(' ')}`);
      return { status, stdout: JSON.stringify(value) };
    },
  });
  return { result, calls, source };
}
// Stack rows are observations against explicit per-row identities. This uses
// the existing pure predicate, not the main-only collector or merge authority.
export function projectStackRow(f: Fixture) {
  const provider: ProviderMergeReadinessFactsV1 = {
    state: f.pr.state, is_draft: f.pr.isDraft, head_sha: f.pr.headRefOid, base_sha: f.pr.baseRefOid,
    review_decision: f.pr.reviewDecision, unresolved_thread_count: f.threads.filter(t => !t.isResolved).length,
    rollback_boundary: { status: 'not_active' }, checks: f.checks as ProviderMergeReadinessFactsV1['checks'],
    mergeable: f.pr.mergeable as ProviderMergeReadinessFactsV1['mergeable'],
  };
  return projectPullRequestMergeReadiness({ expected_head_sha: f.expectedHead, expected_base_sha: f.expectedBase,
    integration_mode: f.pr.state === 'MERGED' ? 'ancestor' : 'unmerged',
    observation: f.unavailable ? 'provider_unavailable' : f.hasNextPage ? 'provider_data_incomplete' : 'stable', provider });
}
export class Cancelled extends Error { constructor() { super('offline cancellation'); } }
export function logicalClock(cancelAfterSleeps = Infinity) {
  let now = 0;
  const sleeps: number[] = [];
  const clock: WatchClock = Object.freeze({
    now: () => now,
    observedAt: () => new Date(Date.UTC(2026, 9, 6) + now * 1000).toISOString(),
    async sleep(seconds: number) {
      sleeps.push(seconds);
      now += seconds;
      if (sleeps.length >= cancelAfterSleeps) throw new Cancelled();
    },
  });
  return { clock, sleeps };
}
