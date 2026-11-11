import { decodeDevActivitySnapshot } from '../core/dev-activity/decode';
import {
  DEV_ACTIVITY_TRUNCATED_REASON_PREFIX,
  type DevActivityAttention,
  type DevActivityItem,
  type DevActivityRepository,
  type DevActivitySnapshotV2,
  type DevActivitySourceHealth,
  type DevActivitySourceStatus,
} from '../core/dev-activity/types';
import { useSnapshotView, type SnapshotView } from './useSnapshotView';

/**
 * Browser side of `GET /api/v1/dev-activity`. The server owns every column,
 * attention row and authority join; this module only reads what the
 * snapshot already decided.
 */
export type DevActivityReader = (signal: AbortSignal) => Promise<DevActivitySnapshotV2>;

export async function fetchDevActivity(signal: AbortSignal): Promise<DevActivitySnapshotV2> {
  const response = await fetch('/api/v1/dev-activity', { signal, cache: 'no-store', headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('dev_activity_unavailable');
  return decodeDevActivitySnapshot(await response.json());
}

export type DevActivityView = SnapshotView<DevActivitySnapshotV2>;

export function useDevActivity(read: DevActivityReader, initial: DevActivitySnapshotV2 | undefined, generation: number): DevActivityView {
  return useSnapshotView('dev-activity', read, initial, generation).view;
}

export function snapshotOf(view: DevActivityView): DevActivitySnapshotV2 | null {
  return view.kind === 'ready' ? view.snapshot : null;
}

export function repositoryById(snapshot: DevActivitySnapshotV2, id: string): DevActivityRepository | null {
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

export function attentionItem(snapshot: DevActivitySnapshotV2, row: DevActivityAttention): DevActivityItem | null {
  return snapshot.items.find(item => item.id === row.subject_id) ?? null;
}

export type SourceHealthCounts = Readonly<Record<DevActivitySourceStatus, number>>;

export function sourceHealth(repositories: readonly DevActivityRepository[]): SourceHealthCounts {
  const counts: Record<DevActivitySourceStatus, number> = { ok: 0, stale: 0, unavailable: 0, not_configured: 0 };
  for (const repository of repositories) for (const source of repository.sources) counts[source.status] += 1;
  return counts;
}

/**
 * The PR categories (open, merged, closed) a GitHub source dropped for
 * exceeding one query; null for any other reason. The other categories stay.
 */
export function truncatedCategories(source: DevActivitySourceHealth): readonly string[] | null {
  return source.reason?.startsWith(DEV_ACTIVITY_TRUNCATED_REASON_PREFIX)
    ? source.reason.slice(DEV_ACTIVITY_TRUNCATED_REASON_PREFIX.length).split('_') : null;
}

/**
 * Git and GitHub sources that are not ok, except a GitHub source that dropped
 * only merged or closed PRs: open work is complete there, and the drop is
 * reported where merged PRs are counted.
 */
export function failedSources(repository: DevActivityRepository): readonly DevActivitySourceHealth[] {
  return repository.sources.filter(source => source.kind !== 'runtime' && (source.status === 'unavailable' || source.status === 'stale')
    && !(truncatedCategories(source)?.every(category => category !== 'open') ?? false));
}

export function openPullRequests(items: readonly DevActivityItem[], repositoryId: string): number {
  return items.filter(item => item.repository_id === repositoryId && item.pull_request?.state === 'open').length;
}

export function worktreeCount(items: readonly DevActivityItem[], repositoryId: string): number {
  return new Set(items.filter(item => item.repository_id === repositoryId).flatMap(item => item.worktrees.map(tree => tree.directory))).size;
}
