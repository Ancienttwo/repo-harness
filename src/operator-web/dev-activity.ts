import { useCallback, useState } from 'react';
import { decodeDevActivitySnapshot } from '../core/dev-activity/decode';
import type {
  DevActivityAttention,
  DevActivityColumn,
  DevActivityItem,
  DevActivityRepository,
  DevActivitySnapshotV1,
  DevActivitySourceStatus,
} from '../core/dev-activity/types';
import { useObservationRefresh } from './useObservationRefresh';

/**
 * Browser side of `GET /api/v1/dev-activity`. The server owns every column,
 * attention row and authority join; this module only reads, filters and
 * orders what the snapshot already decided.
 */
export type DevActivityReader = (signal: AbortSignal) => Promise<DevActivitySnapshotV1>;

export async function fetchDevActivity(signal: AbortSignal): Promise<DevActivitySnapshotV1> {
  const response = await fetch('/api/v1/dev-activity', { signal, cache: 'no-store', headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('dev_activity_unavailable');
  return decodeDevActivitySnapshot(await response.json());
}

/** A failed refresh keeps the last good snapshot and says when it failed. */
export type DevActivityView =
  | { readonly kind: 'loading' }
  | { readonly kind: 'unreachable' }
  | { readonly kind: 'ready'; readonly snapshot: DevActivitySnapshotV1; readonly refreshFailed: boolean };

export function useDevActivity(read: DevActivityReader, initial: DevActivitySnapshotV1 | undefined, generation: number): DevActivityView {
  const [view, setView] = useState<DevActivityView>(() => initial ? { kind: 'ready', snapshot: initial, refreshFailed: false } : { kind: 'loading' });
  const observe = useCallback(async (signal: AbortSignal): Promise<boolean> => {
    try {
      const snapshot = await read(signal);
      if (signal.aborted) return false;
      setView({ kind: 'ready', snapshot, refreshFailed: false });
      return true;
    } catch {
      if (signal.aborted) return false;
      setView(current => current.kind === 'ready' ? { ...current, refreshFailed: true } : { kind: 'unreachable' });
      return false;
    }
  }, [read]);
  useObservationRefresh(observe, JSON.stringify(['dev-activity', generation]), { immediate: initial === undefined || generation > 0 });
  return view;
}

export function snapshotOf(view: DevActivityView): DevActivitySnapshotV1 | null {
  return view.kind === 'ready' ? view.snapshot : null;
}

export interface BoardFilters {
  /** null is every repository. */
  readonly repositoryId: string | null;
  readonly query: string;
  readonly onlyNeedsYou: boolean;
  readonly showClosed: boolean;
}

export const DEFAULT_BOARD_FILTERS: BoardFilters = { repositoryId: null, query: '', onlyNeedsYou: false, showClosed: false };

export function repositoryById(snapshot: DevActivitySnapshotV1, id: string): DevActivityRepository | null {
  return snapshot.repositories.find(repository => repository.repository_id === id) ?? null;
}

/**
 * The display name is the label. Two registrations with one name are told
 * apart by their GitHub slug, then by the registry id; the id never leads.
 */
export function repositoryLabel(repositories: readonly DevActivityRepository[], id: string): string {
  const repository = repositories.find(row => row.repository_id === id);
  if (!repository) return id;
  const shared = repositories.filter(row => row.display_name === repository.display_name).length > 1;
  if (!shared) return repository.display_name;
  return `${repository.display_name} · ${repository.github ?? repository.repository_id}`;
}

export function attentionSubjects(snapshot: DevActivitySnapshotV1): ReadonlySet<string> {
  return new Set(snapshot.attention.map(row => row.subject_id));
}

export function attentionItem(snapshot: DevActivitySnapshotV1, row: DevActivityAttention): DevActivityItem | null {
  if (row.kind === 'human_request') return null;
  return snapshot.items.find(item => item.id === row.subject_id) ?? null;
}

export interface ItemBlock { readonly source: 'ledger' | 'runtime'; readonly reason: string; readonly since: string }

/** Both authorities are listed when both report a block; neither overrides the other. */
export function itemBlocks(item: DevActivityItem): readonly ItemBlock[] {
  const blocks: ItemBlock[] = [];
  if (item.ledger?.blocked) blocks.push({ source: 'ledger', ...item.ledger.blocked });
  if (item.runtime_blocked) blocks.push({ source: 'runtime', ...item.runtime_blocked });
  return blocks;
}

function matchesQuery(item: DevActivityItem, repositories: readonly DevActivityRepository[], query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === '') return true;
  const haystack = [item.title, item.branch ?? '', repositoryLabel(repositories, item.repository_id),
    item.pull_request ? `#${item.pull_request.number}` : '', item.agent?.label ?? '', item.ledger?.phase ?? ''];
  return haystack.some(value => value.toLowerCase().includes(needle));
}

export function filterItems(snapshot: DevActivitySnapshotV1, filters: BoardFilters): readonly DevActivityItem[] {
  const subjects = attentionSubjects(snapshot);
  return snapshot.items.filter(item =>
    (filters.repositoryId === null || item.repository_id === filters.repositoryId)
    && (item.hidden !== 'closed_unmerged' || filters.showClosed)
    && (!filters.onlyNeedsYou || subjects.has(item.id))
    && matchesQuery(item, snapshot.repositories, filters.query));
}

/** Unknown times sort last in both directions. */
function time(value: string | null | undefined, missing: number): number {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isNaN(parsed) ? missing : parsed;
}

/**
 * Within a column a blocked item comes first, then the longest wait. Shipped
 * work reads newest first. Ties keep the id order so rows do not jump.
 */
export function orderColumn(column: DevActivityColumn, items: readonly DevActivityItem[]): readonly DevActivityItem[] {
  return items.slice().sort((left, right) => {
    if (column === 'shipped') {
      const l = time(left.pull_request?.merged_at, Number.NEGATIVE_INFINITY), r = time(right.pull_request?.merged_at, Number.NEGATIVE_INFINITY);
      if (l !== r) return r > l ? 1 : -1;
    } else {
      const blocked = Number(itemBlocks(right).length > 0) - Number(itemBlocks(left).length > 0);
      if (blocked !== 0) return blocked;
      const l = time(left.column_since, Number.POSITIVE_INFINITY), r = time(right.column_since, Number.POSITIVE_INFINITY);
      if (l !== r) return l < r ? -1 : 1;
    }
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  });
}

export type SourceHealthCounts = Readonly<Record<DevActivitySourceStatus, number>>;

export function sourceHealth(repositories: readonly DevActivityRepository[]): SourceHealthCounts {
  const counts: Record<DevActivitySourceStatus, number> = { ok: 0, stale: 0, unavailable: 0, not_configured: 0 };
  for (const repository of repositories) for (const source of repository.sources) counts[source.status] += 1;
  return counts;
}

export function openPullRequests(items: readonly DevActivityItem[], repositoryId: string): number {
  return items.filter(item => item.repository_id === repositoryId && item.pull_request?.state === 'open').length;
}

export function worktreeCount(items: readonly DevActivityItem[], repositoryId: string): number {
  return new Set(items.filter(item => item.repository_id === repositoryId).flatMap(item => item.worktrees.map(tree => tree.directory))).size;
}
