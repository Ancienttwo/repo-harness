import { sha256Hex } from '../../core/evidence/sha256';
import type { BoardPullRequestReadV1 } from '../../core/board/source';
import type { BoardReadinessV1 } from '../../core/board/board';
import type { PullRequestReadinessV2 } from '../../core/publication/merge-readiness';

/** The inputs outside a key (branch protection, review-bot accounts, the local generated-artifact run) age out after this. */
export const KEYED_SOURCE_MAX_AGE_MS = 60 * 60_000;

/** The readiness stack walk stops at this depth; a longer chain is not keyed. */
const STACK_DEPTH_LIMIT = 20;

/** These blockers mark a torn or failed read, not an observation of the pull request; such an answer is not stored. */
const UNSTABLE_BLOCKERS: ReadonlySet<string> = new Set(['provider_unavailable', 'provider_data_incomplete', 'changed_during_read']);

type GhAnswer = { readonly status: number; readonly stdout: string; readonly stderr?: string };
export type GhRunner = (args: readonly string[]) => GhAnswer;

interface Entry<T> {
  readonly value: T;
  readonly at_ms: number;
}

/**
 * The readiness answers of a board, each under the digest of its inputs, and
 * the content-addressed provider answers under their SHA. One store serves one
 * act, or the attention watcher for its process lifetime; an act never gets the
 * store of another call.
 */
export interface KeyedSources {
  /** The stored answer of `key` when it is younger than the maximum age; otherwise `read` runs. A null key always reads. */
  readiness(key: string | null, now: Date, read: () => PullRequestReadinessV2): BoardReadinessV1;
  /** `next` with the content-addressed reads of one pull request at `head_sha` on `base_sha` answered from the store. */
  transport(selection: { readonly head_sha: string; readonly base_sha: string }, now: Date, next: GhRunner): GhRunner;
}

export function createKeyedSources(): KeyedSources {
  const answers = new Map<string, Entry<BoardReadinessV1>>();
  const contents = new Map<string, Entry<GhAnswer>>();
  // A key that no read asks for again stays in the map, so each readiness call removes every aged entry: the watcher store stays bounded.
  const sweep = (nowMs: number): void => {
    for (const map of [answers, contents] as Map<string, Entry<unknown>>[]) {
      for (const [key, entry] of map) if (nowMs - entry.at_ms >= KEYED_SOURCE_MAX_AGE_MS) map.delete(key);
    }
  };
  return {
    readiness(key, now, read) {
      sweep(now.getTime());
      const stored = key === null ? undefined : answers.get(key)?.value;
      if (stored !== undefined) return stored;
      const readiness = read();
      const answer = Object.freeze({ readiness, observed_at: now.toISOString() });
      if (key !== null && !readiness.blockers.some(blocker => UNSTABLE_BLOCKERS.has(blocker.code))) answers.set(key, { value: answer, at_ms: now.getTime() });
      return answer;
    },
    transport(selection, now, next) {
      return (args) => {
        const key = contentKey(args, selection);
        const stored = key === null ? undefined : contents.get(key)?.value;
        if (stored !== undefined) return stored;
        const answer = next(args);
        if (key !== null && stableContent(args[1]!, answer)) contents.set(key, { value: answer, at_ms: now.getTime() });
        return answer;
      };
    },
  };
}

const SHA = '[0-9a-f]{40}';
/**
 * Content-addressed reads: a path that names its commit, the rollback parent
 * pull request (stored only once merged), and the jobs and annotations of one
 * run attempt and check run. The pull requests of a commit are not stored: the
 * list can gain a pull request later.
 */
const BY_SHA = [new RegExp(`/contents/[^?]+\\?ref=${SHA}$`, 'u'), new RegExp(`/git/commits/${SHA}$`, 'u'),
  /\/pulls\/\d+$/u, /\/actions\/runs\/\d+\/attempts\/\d+\/jobs\?per_page=100$/u, /\/check-runs\/\d+\/annotations\?per_page=100$/u];
/** The changed-file pages belong to the head and base of the pull request that reads them. */
const FILE_PAGE = /\/pulls\/\d+\/files\?per_page=\d+&page=\d+$/u;

function contentKey(args: readonly string[], selection: { readonly head_sha: string; readonly base_sha: string }): string | null {
  if (args.length !== 4 || args[0] !== 'api' || args[2] !== '--hostname' || args[3] !== 'github.com') return null;
  const path = args[1]!;
  if (FILE_PAGE.test(path)) return JSON.stringify([selection.head_sha, selection.base_sha, path]);
  return BY_SHA.some(pattern => pattern.test(path)) ? JSON.stringify([path]) : null;
}

function json(stdout: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(stdout);
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

/**
 * Only a final answer is stored: a merged pull request (the rollback parent),
 * the jobs of a finished attempt, and GitHub's 404 for an absent file at a SHA.
 */
function stableContent(path: string, answer: GhAnswer): boolean {
  if (answer.status === 1) return path.includes('/contents/') && json(answer.stdout)?.status === '404';
  if (answer.status !== 0) return false;
  if (/\/pulls\/\d+$/u.test(path)) return json(answer.stdout)?.merged === true;
  if (path.includes('/attempts/')) {
    const jobs = json(answer.stdout)?.jobs;
    return Array.isArray(jobs) && jobs.every(job => typeof (job as { conclusion?: unknown } | null)?.conclusion === 'string');
  }
  return true;
}

/** The open base pull requests from the head of `read` down to the default branch; null when a link is not in `reads` or the chain does not end. */
function stackLinks(read: BoardPullRequestReadV1, reads: readonly BoardPullRequestReadV1[], defaultBranch: string): unknown[] | null {
  const links: unknown[] = [];
  const seen = new Set([read.number]);
  for (let baseRef = read.base_ref; baseRef !== defaultBranch;) {
    if (links.length === STACK_DEPTH_LIMIT) return null;
    const bases = reads.filter(entry => entry.head_ref === baseRef && entry.state === 'open');
    if (bases.length !== 1 || seen.has(bases[0]!.number)) return null;
    const base = bases[0]!;
    seen.add(base.number);
    links.push([base.number, base.state, base.head_sha, base.base_ref, base.base_sha, base.readiness_inputs.cross_repository]);
    baseRef = base.base_ref;
  }
  return links;
}

/**
 * The digest of every readiness input that the board read observes: the
 * selection, the identity, the reviews and threads, the head-commit rollup and
 * the stack links. Null when the read misses one of them, so the pull request
 * is read again.
 */
export function readinessKey(input: { readonly repository_id: number; readonly default_branch: string; readonly read: BoardPullRequestReadV1; readonly reads: readonly BoardPullRequestReadV1[] }): string | null {
  const { read } = input;
  const inputs = read.readiness_inputs;
  if (inputs.review_states === null || inputs.threads === null) return null;
  const stack = stackLinks(read, input.reads, input.default_branch);
  if (stack === null) return null;
  const facts = [
    input.repository_id, read.number, read.head_sha, read.head_ref, read.base_sha, read.base_ref, input.default_branch,
    read.state, read.is_draft, read.merged_at, read.body, inputs.changed_files, inputs.mergeable, inputs.review_decision,
    inputs.review_states, inputs.threads.resolved, inputs.threads.total,
    inputs.rollup.map(context => [context.type, context.name, context.status, context.conclusion, context.completed_at, context.details_url]),
    stack,
  ];
  return sha256Hex(JSON.stringify(facts));
}
