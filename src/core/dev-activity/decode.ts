// Strict, browser-safe decoder for GET /api/v1/dev-activity. Exact keys, closed
// vocabularies, and no absolute-path-looking text outside `url`.

import {
  DEV_ACTIVITY_COLUMNS,
  DEV_ACTIVITY_PROJECTION,
  type DevActivitySnapshotV1,
} from './types';

const SOURCE_KINDS = ['git', 'github', 'ledger', 'runtime', 'decisions'];
const SOURCE_STATUSES = ['ok', 'unavailable', 'stale', 'not_configured'];
const HIDDEN_REASONS = ['closed_unmerged'];
const CI_STATES = ['success', 'failure', 'pending', 'none'];
const REVIEW_STATES = ['approved', 'changes_requested', 'review_required', 'none'];
const PR_STATES = ['open', 'merged', 'closed'];
const ATTENTION_KINDS = ['ready_to_merge', 'ledger_waiting_owner', 'human_request', 'runtime_blocked'];
const RUNTIME_FRESHNESS = ['fresh', 'stale', 'disconnected'];
const SNAPSHOT_STATUSES = ['ready', 'partial', 'unavailable'];

export function unavailableDevActivitySnapshot(): DevActivitySnapshotV1 {
  return {
    projection_version: DEV_ACTIVITY_PROJECTION, status: 'unavailable', collected_at: null,
    repositories: [], unreadable_registrations: 0, items: [], attention: [],
  };
}

export function decodeDevActivitySnapshot(value: unknown): DevActivitySnapshotV1 {
  const fail = (what: string): never => { throw new Error(`dev activity projection invalid: ${what}`); };
  const obj = (v: unknown, keys: readonly string[], what: string): Record<string, unknown> => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return fail(what);
    if (Object.keys(v).sort().join(',') !== [...keys].sort().join(',')) return fail(`${what} fields`);
    return v as Record<string, unknown>;
  };
  const text = (v: unknown, what: string): string => {
    if (typeof v !== 'string' || /(?:^|[\s("'=:])\/\S+|[A-Za-z]:[\\/]/u.test(v)) return fail(what);
    return v;
  };
  const nonEmpty = (v: unknown, what: string): string => {
    const s = text(v, what);
    return s.length > 0 ? s : fail(what);
  };
  const nullable = <T>(v: unknown, read: (x: unknown) => T): T | null => (v === null ? null : read(v));
  const time = (v: unknown, what: string): string => {
    const s = text(v, what);
    return Number.isFinite(Date.parse(s)) ? s : fail(what);
  };
  const oneOf = (v: unknown, values: readonly string[], what: string): string =>
    (typeof v === 'string' && values.includes(v) ? v : fail(what));
  const bool = (v: unknown, what: string): boolean => (typeof v === 'boolean' ? v : fail(what));
  const count = (v: unknown, what: string): number =>
    (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : fail(what));
  const array = (v: unknown, what: string): unknown[] => (Array.isArray(v) ? v : fail(what));
  const githubUrl = (v: unknown, what: string): string =>
    (typeof v === 'string' && /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/[^\s]*$/u.test(v) ? v : fail(what));
  const repositoryId = (v: unknown): string =>
    (typeof v === 'string' && /^repo_[0-9a-f]{16}$/u.test(v) ? v : fail('repository_id'));

  const v = obj(value, ['projection_version', 'status', 'collected_at', 'repositories', 'unreadable_registrations', 'items', 'attention'], 'snapshot');
  if (v.projection_version !== DEV_ACTIVITY_PROJECTION) fail('projection_version');
  const status = oneOf(v.status, SNAPSHOT_STATUSES, 'status');
  nullable(v.collected_at, x => time(x, 'collected_at'));
  count(v.unreadable_registrations, 'unreadable_registrations');

  const repositoryIds = new Set<string>();
  for (const raw of array(v.repositories, 'repositories')) {
    const r = obj(raw, ['repository_id', 'display_name', 'github', 'default_branch', 'sources'], 'repository');
    const id = repositoryId(r.repository_id);
    if (repositoryIds.has(id)) fail('duplicate repository');
    repositoryIds.add(id);
    nonEmpty(r.display_name, 'display_name');
    nullable(r.github, x => (typeof x === 'string' && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(x) ? x : fail('github')));
    nullable(r.default_branch, x => nonEmpty(x, 'default_branch'));
    const kinds = new Set<string>();
    for (const rawSource of array(r.sources, 'sources')) {
      const s = obj(rawSource, ['kind', 'status', 'reason', 'observed_at'], 'source');
      const kind = oneOf(s.kind, SOURCE_KINDS, 'source kind');
      if (kinds.has(kind)) fail('duplicate source');
      kinds.add(kind);
      oneOf(s.status, SOURCE_STATUSES, 'source status');
      nullable(s.reason, x => (typeof x === 'string' && /^[a-z][a-z0-9_]{0,63}$/u.test(x) ? x : fail('source reason')));
      nullable(s.observed_at, x => time(x, 'source observed_at'));
    }
  }

  const itemIds = new Set<string>();
  for (const raw of array(v.items, 'items')) {
    const i = obj(raw, ['id', 'repository_id', 'branch', 'title', 'column', 'hidden', 'column_since', 'worktrees',
      'pull_request', 'ledger', 'agent', 'runtime_blocked', 'cleanup_pending'], 'item');
    const repo = repositoryId(i.repository_id);
    if (!repositoryIds.has(repo)) fail('item repository');
    const id = nonEmpty(i.id, 'item id');
    if (!id.startsWith(`${repo}:`) || itemIds.has(id)) fail('item id');
    itemIds.add(id);
    nullable(i.branch, x => nonEmpty(x, 'branch'));
    nonEmpty(i.title, 'title');
    oneOf(i.column, DEV_ACTIVITY_COLUMNS, 'column');
    nullable(i.hidden, x => oneOf(x, HIDDEN_REASONS, 'hidden'));
    nullable(i.column_since, x => time(x, 'column_since'));
    for (const rawWorktree of array(i.worktrees, 'worktrees')) {
      const w = obj(rawWorktree, ['directory', 'head_sha', 'dirty', 'ahead', 'behind'], 'worktree');
      const directory = nonEmpty(w.directory, 'worktree directory');
      if (directory.includes('/') || directory.includes('\\') || directory === '.' || directory === '..') fail('worktree directory');
      if (typeof w.head_sha !== 'string' || !/^[0-9a-f]{40,64}$/u.test(w.head_sha)) fail('head_sha');
      bool(w.dirty, 'dirty');
      nullable(w.ahead, x => count(x, 'ahead'));
      nullable(w.behind, x => count(x, 'behind'));
    }
    nullable(i.pull_request, x => {
      const p = obj(x, ['number', 'title', 'url', 'state', 'is_draft', 'base_branch', 'merge_state', 'ci', 'review',
        'updated_at', 'merged_at', 'closed_at'], 'pull_request');
      if (count(p.number, 'pr number') < 1) fail('pr number');
      text(p.title, 'pr title');
      githubUrl(p.url, 'pr url');
      oneOf(p.state, PR_STATES, 'pr state');
      bool(p.is_draft, 'is_draft');
      nonEmpty(p.base_branch, 'base_branch');
      if (typeof p.merge_state !== 'string' || !/^[A-Z_]{1,32}$/u.test(p.merge_state)) fail('merge_state');
      nullable(p.ci, y => oneOf(y, CI_STATES, 'ci'));
      if ((p.state === 'open') !== (p.ci !== null)) fail('ci');
      oneOf(p.review, REVIEW_STATES, 'review');
      time(p.updated_at, 'updated_at');
      nullable(p.merged_at, y => time(y, 'merged_at'));
      nullable(p.closed_at, y => time(y, 'closed_at'));
      if ((p.state === 'merged') !== (p.merged_at !== null)) fail('merged_at');
      return p;
    });
    nullable(i.ledger, x => {
      const l = obj(x, ['record_id', 'phase', 'phase_since', 'owner', 'blocked', 'waiting_owner'], 'ledger');
      nonEmpty(l.record_id, 'record_id');
      nonEmpty(l.phase, 'phase');
      time(l.phase_since, 'phase_since');
      nullable(l.owner, y => nonEmpty(y, 'owner'));
      nullable(l.blocked, y => {
        const b = obj(y, ['reason', 'since'], 'ledger blocked');
        text(b.reason, 'blocked reason');
        return time(b.since, 'blocked since');
      });
      return bool(l.waiting_owner, 'waiting_owner');
    });
    nullable(i.agent, x => {
      const a = obj(x, ['label', 'source', 'runtime_state', 'runtime_freshness', 'changed_at'], 'agent');
      nonEmpty(a.label, 'agent label');
      oneOf(a.source, ['ledger', 'runtime'], 'agent source');
      nullable(a.runtime_state, y => nonEmpty(y, 'runtime_state'));
      nullable(a.runtime_freshness, y => oneOf(y, RUNTIME_FRESHNESS, 'runtime_freshness'));
      nullable(a.changed_at, y => time(y, 'agent changed_at'));
      if ((a.source === 'runtime') !== (a.runtime_state !== null && a.runtime_freshness !== null)) fail('agent runtime facts');
      return a;
    });
    nullable(i.runtime_blocked, x => {
      const b = obj(x, ['reason', 'since'], 'runtime_blocked');
      nonEmpty(b.reason, 'runtime_blocked reason');
      return time(b.since, 'runtime_blocked since');
    });
    bool(i.cleanup_pending, 'cleanup_pending');
  }

  let previous = Number.NEGATIVE_INFINITY;
  for (const raw of array(v.attention, 'attention')) {
    const a = obj(raw, ['kind', 'subject_id', 'repository_id', 'summary', 'waiting_since', 'url', 'command'], 'attention');
    const kind = oneOf(a.kind, ATTENTION_KINDS, 'attention kind');
    const repo = repositoryId(a.repository_id);
    if (!repositoryIds.has(repo)) fail('attention repository');
    const subject = nonEmpty(a.subject_id, 'subject_id');
    if (kind !== 'human_request' && !itemIds.has(subject)) fail('attention subject');
    text(a.summary, 'summary');
    const at = Date.parse(time(a.waiting_since, 'waiting_since'));
    if (at < previous) fail('attention order');
    previous = at;
    nullable(a.url, x => githubUrl(x, 'attention url'));
    nullable(a.command, x => nonEmpty(x, 'command'));
  }
  if (status === 'unavailable' && ((v.repositories as unknown[]).length || (v.items as unknown[]).length || (v.attention as unknown[]).length)) {
    fail('unavailable snapshot carries data');
  }
  return v as unknown as DevActivitySnapshotV1;
}
