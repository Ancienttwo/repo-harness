import { evaluateBoardAttention } from './attention';
import type { BoardV1 } from './board';
import { primaryPullRequest } from './pull-requests';

export interface BoardSummaryV1 {
  readonly queue: number;
  readonly ci_failures: number;
  /** An unobserved plan has no batch counts. Observed batches are counted together. */
  readonly batch: { readonly accepted: number; readonly size: number } | { readonly accepted: null; readonly size: null };
  readonly needs_you: number;
}

export type BoardSummaryEntryV1 =
  | { readonly parent: number; readonly status: 'observed'; readonly observed_at: string; readonly summary: BoardSummaryV1 }
  | { readonly parent: number; readonly status: 'not_read' }
  | { readonly parent: number; readonly status: 'unavailable'; readonly reason: string };

export interface BoardSummariesV1 {
  readonly protocol: 1;
  readonly kind: 'repo-harness.board-summaries';
  readonly repository_id: string;
  readonly parents: readonly BoardSummaryEntryV1[];
}

/** Counts use the board's observations, including its attention time. No source read occurs here. */
export function boardSummary(board: BoardV1): BoardSummaryV1 {
  const open = board.pull_requests.filter(pr => pr.state === 'open');
  let batch: BoardSummaryV1['batch'] = { accepted: null, size: null };
  if (board.plan.status === 'observed') {
    const members = board.plan.block.batches.flat();
    batch = { size: members.length, accepted: members.filter(number =>
      board.items.some(item => item.number === number && primaryPullRequest(board, item)?.acceptance.status === 'accepted')).length };
  }
  return {
    queue: open.filter(pr => pr.acceptance.status === 'not_accepted' && pr.required_check.status === 'success').length,
    ci_failures: open.filter(pr => pr.required_check.status === 'failure').length,
    batch,
    needs_you: evaluateBoardAttention(board).findings.filter(finding => finding.route === 'orchestrator').length,
  };
}

function fail(label: string): never { throw new TypeError(`board summaries invalid: ${label}`); }

function record(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(label);
  if (Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) fail(`${label} fields`);
  return value as Record<string, unknown>;
}

function count(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) fail(label);
  return value as number;
}

function entry(value: unknown): BoardSummaryEntryV1 {
  const status = (value as Partial<BoardSummaryEntryV1> | null)?.status;
  const keys = status === 'observed' ? ['parent', 'status', 'observed_at', 'summary']
    : status === 'not_read' ? ['parent', 'status'] : status === 'unavailable' ? ['parent', 'status', 'reason'] : fail('status');
  const row = record(value, keys, 'parent');
  const parent = count(row.parent, 'parent number');
  if (parent === 0) fail('parent number');
  if (status === 'not_read') return { parent, status };
  if (status === 'unavailable') {
    if (typeof row.reason !== 'string' || row.reason.trim() === '') fail('reason');
    return { parent, status, reason: row.reason };
  }
  if (typeof row.observed_at !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/u.test(row.observed_at)
    || !Number.isFinite(Date.parse(row.observed_at))) fail('observed_at');
  if (new Date(row.observed_at).toISOString().replace('.000Z', 'Z') !== row.observed_at.replace('.000Z', 'Z')) fail('observed_at');
  const summary = record(row.summary, ['queue', 'ci_failures', 'batch', 'needs_you'], 'summary');
  const batch = record(summary.batch, ['accepted', 'size'], 'batch');
  let decodedBatch: BoardSummaryV1['batch'];
  if (batch.accepted === null && batch.size === null) decodedBatch = { accepted: null, size: null };
  else {
    const accepted = count(batch.accepted, 'batch accepted'), size = count(batch.size, 'batch size');
    if (accepted > size) fail('batch accepted exceeds size');
    decodedBatch = { accepted, size };
  }
  return { parent, status: 'observed', observed_at: row.observed_at, summary: {
    queue: count(summary.queue, 'queue'), ci_failures: count(summary.ci_failures, 'ci_failures'),
    batch: decodedBatch, needs_you: count(summary.needs_you, 'needs_you'),
  } };
}

/** The same strict contract decodes stored snapshots and the route response. A file holds one observed parent. */
export function decodeBoardSummaries(value: unknown): BoardSummariesV1 {
  const result = record(value, ['protocol', 'kind', 'repository_id', 'parents'], 'response');
  if (result.protocol !== 1 || result.kind !== 'repo-harness.board-summaries') fail('protocol or kind');
  if (typeof result.repository_id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(result.repository_id)) fail('repository_id');
  if (!Array.isArray(result.parents)) fail('parents');
  const parents = result.parents.map(entry);
  if (new Set(parents.map(row => row.parent)).size !== parents.length) fail('duplicate parent');
  return { protocol: 1, kind: 'repo-harness.board-summaries', repository_id: result.repository_id, parents };
}
