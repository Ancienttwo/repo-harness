import { useCallback, useState } from 'react';
import { decodeWorktrees, type WorktreeView, type WorktreesSnapshot } from '../core/operator/worktrees';
import type { OperatorTranslate } from './i18n';
import { useObservationRefresh } from './useObservationRefresh';

/**
 * Browser side of `GET /api/v1/worktrees`. The server's background collector
 * owns git, `du` and process probes and caches its result; this module only
 * reads that cache. It never starts a probe.
 */
export type WorktreesReader = (signal: AbortSignal) => Promise<WorktreesSnapshot>;

export async function fetchWorktrees(signal: AbortSignal): Promise<WorktreesSnapshot> {
  const response = await fetch('/api/v1/worktrees', { signal, cache: 'no-store', headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('worktrees_unavailable');
  return decodeWorktrees(await response.json());
}

/** A failed refresh keeps the last good snapshot and says so. */
export type WorktreesView =
  | { readonly kind: 'loading' }
  | { readonly kind: 'unreachable' }
  | { readonly kind: 'ready'; readonly snapshot: WorktreesSnapshot; readonly refreshFailed: boolean };

export function useWorktrees(read: WorktreesReader, initial: WorktreesSnapshot | undefined, generation: number, enabled: boolean): WorktreesView {
  const [view, setView] = useState<WorktreesView>(() => initial ? { kind: 'ready', snapshot: initial, refreshFailed: false } : { kind: 'loading' });
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
  useObservationRefresh(observe, JSON.stringify(['worktrees', generation]), { enabled, immediate: initial === undefined || generation > 0 });
  return view;
}

/** The collector's data, or null while it has none to show. */
export function worktreesOf(view: WorktreesView): WorktreesSnapshot | null {
  return view.kind === 'ready' && view.snapshot.status !== 'unavailable' ? view.snapshot : null;
}

/**
 * The green worktrees of one branch: the Board's only cleanup signal. Green is
 * the collector's sweep verdict; nothing here re-judges a worktree. Only a
 * registered repository joins; unassigned directories have no repository to match.
 */
export function reclaimableFor(snapshot: WorktreesSnapshot | null, repositoryId: string, branch: string): readonly WorktreeView[] {
  const repository = snapshot?.repositories.find(row => row.repository_id === repositoryId);
  return repository?.worktrees.filter(tree => tree.judgment === 'green' && tree.repository_id === repositoryId && tree.branch === branch) ?? [];
}

export interface SpaceTotal {
  /** Sum of the measured sizes only. */
  readonly bytes: number;
  readonly measured: number;
  /** Worktrees whose size was never measured or timed out; never counted as 0 B. */
  readonly unknown: number;
}

export function spaceTotal(worktrees: readonly WorktreeView[]): SpaceTotal {
  let bytes = 0, measured = 0, unknown = 0;
  for (const tree of worktrees) {
    if (tree.size_bytes === null) unknown++;
    else { bytes += tree.size_bytes; measured++; }
  }
  return { bytes, measured, unknown };
}

export function allWorktrees(snapshot: WorktreesSnapshot): readonly WorktreeView[] {
  return snapshot.repositories.flatMap(row => row.worktrees).concat(snapshot.unassigned);
}

export function reclaimableSpace(snapshot: WorktreesSnapshot): SpaceTotal {
  return spaceTotal(allWorktrees(snapshot).filter(tree => tree.judgment === 'green'));
}

/** Measured bytes only; unknown sizes are counted beside the total, never as 0 B. */
export function spaceWords(total: SpaceTotal, t: OperatorTranslate): string {
  const parts = total.measured > 0 ? [formatBytes(total.bytes)] : [];
  if (total.unknown > 0) parts.push(t('worktrees.sizeUnknownCount', { count: total.unknown }));
  return parts.length > 0 ? parts.join(' · ') : t('worktrees.reclaimableNone');
}

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

/** Binary units, one decimal below 10: "3.3 GB", "512 MB". */
export function formatBytes(bytes: number): string {
  let value = bytes, unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) { value /= 1024; unit++; }
  const digits = unit > 0 && value < 10 ? 1 : 0;
  return `${value.toFixed(digits)} ${UNITS[unit]}`;
}
