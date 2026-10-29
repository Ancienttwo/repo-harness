import { useCallback, useEffect, useState } from 'react';
import {
  decodeWorktreeCleanupResult,
  selectionDigestInput,
  WORKTREE_CLEANUP_MAX_IDS,
  worktreeDigestRow,
  type WorktreeCleanupRequest,
  type WorktreeCleanupResult,
} from '../core/operator/worktree-cleanup';
import { decodeWorktrees, type WorktreeView, type WorktreesSnapshot } from '../core/operator/worktrees';
import { asApiError } from './fleet-api';
import type { OperatorTranslate } from './i18n';
import type { OperatorApiErrorV1 } from './types';
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

/** `reload` reads the collector's cache again at once. */
export function useWorktrees(read: WorktreesReader, initial: WorktreesSnapshot | undefined, generation: number, enabled: boolean): { readonly view: WorktreesView; readonly reload: () => void } {
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
  const reload = useObservationRefresh(observe, JSON.stringify(['worktrees', generation]), { enabled, immediate: initial === undefined || generation > 0 });
  return { view, reload };
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

/**
 * `expected_digest` for a selection: SHA-256 of the core digest input, the
 * same bytes the server hashes. The console is served on loopback only, a
 * secure context, so `crypto.subtle` is present.
 */
export async function selectionDigest(rows: readonly WorktreeView[]): Promise<string> {
  const input = new TextEncoder().encode(selectionDigestInput(rows.map(worktreeDigestRow)));
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', input));
  return Array.from(hash, byte => byte.toString(16).padStart(2, '0')).join('');
}

/** The terminal equivalent of cleaning one green row. */
export function cleanupCommand(id: string, digest: string): string {
  return `repo-harness worktrees clean --ids ${id} --expected-digest ${digest}`;
}

/** The one-row digest of each row, recomputed when a row's decision fields change. */
export function useRowDigests(rows: readonly WorktreeView[]): Readonly<Record<string, string>> {
  const key = JSON.stringify(rows.map(row => selectionDigestInput([worktreeDigestRow(row)])));
  const [digests, setDigests] = useState<{ readonly key: string; readonly byId: Readonly<Record<string, string>> }>({ key: '', byId: {} });
  // `key` is a function of `rows`, so the rows this effect captures are the ones that produced it.
  useEffect(() => {
    let live = true;
    void Promise.all(rows.map(async row => [row.id, await selectionDigest([row])] as const))
      .then(entries => { if (live) setDigests({ key, byId: Object.fromEntries(entries) }); });
    return () => { live = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return digests.key === key ? digests.byId : {};
}

const WORKTREE_CLEANUP_PATH = '/api/v1/worktrees/cleanup';

export type WorktreeCleanupPost = WorktreeCleanupRequest & { readonly request_id: string };

/**
 * `unreachable`: no typed answer arrived, so the request may or may not have run.
 * `unreadable`: a 200 whose body failed the decoder; the cleanup ran.
 */
export type WorktreeCleanupWrite =
  | { readonly state: 'cleaned'; readonly result: WorktreeCleanupResult }
  | { readonly state: 'refused'; readonly status: number; readonly error: OperatorApiErrorV1 }
  | { readonly state: 'unreachable' }
  | { readonly state: 'unreadable' };
export type WorktreeCleanupWriter = (body: WorktreeCleanupPost) => Promise<WorktreeCleanupWrite>;

const UNTYPED: OperatorApiErrorV1 = Object.freeze({ code: '', message: '', next_action: '' });

/** The write token travels in the HttpOnly cookie the page response set. */
export async function postWorktreeCleanup(body: WorktreeCleanupPost): Promise<WorktreeCleanupWrite> {
  let response: Response;
  try {
    response = await fetch(WORKTREE_CLEANUP_PATH, {
      method: 'POST', cache: 'no-store', credentials: 'same-origin',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return { state: 'unreachable' };
  }
  const payload: unknown = await response.json().catch(() => null);
  if (response.ok) {
    try { return { state: 'cleaned', result: decodeWorktreeCleanupResult(payload) }; } catch { return { state: 'unreadable' }; }
  }
  const error = asApiError(payload, UNTYPED);
  return error === UNTYPED ? { state: 'unreachable' } : { state: 'refused', status: response.status, error };
}

export type WorktreeCleanupState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'running'; readonly count: number }
  | { readonly kind: 'cleaned'; readonly result: WorktreeCleanupResult }
  | { readonly kind: 'refused'; readonly error: OperatorApiErrorV1 }
  | { readonly kind: 'unreachable' }
  | { readonly kind: 'unreadable' };

export interface WorktreeCleanup {
  /** Green rows not yet reported removed: the only rows a request may carry. */
  readonly selectable: readonly WorktreeView[];
  readonly selected: readonly WorktreeView[];
  readonly state: WorktreeCleanupState;
  /** Ids a result reported removed; the cache lists them until its next collection. */
  readonly removed: ReadonlySet<string>;
  readonly toggle: (id: string, on: boolean) => void;
  readonly submit: () => void;
  /** Reads the list again and restores the default selection. */
  readonly reselect: () => void;
}

/**
 * Green rows start checked. A click sends the checked ids, the digest of
 * exactly those rows and a new request_id; any answer reloads the list.
 */
export function useWorktreeCleanup(snapshot: WorktreesSnapshot | null, write: WorktreeCleanupWriter, reload: () => void): WorktreeCleanup {
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(() => new Set());
  const [removed, setRemoved] = useState<ReadonlySet<string>>(() => new Set());
  const [state, setState] = useState<WorktreeCleanupState>({ kind: 'idle' });
  const selectable = snapshot ? allWorktrees(snapshot).filter(tree => tree.judgment === 'green' && !removed.has(tree.id)) : [];
  const selected = selectable.filter(tree => !excluded.has(tree.id));

  const toggle = useCallback((id: string, on: boolean) => {
    setExcluded(current => {
      const next = new Set(current);
      if (on) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const running = state.kind === 'running';
  const submit = useCallback(() => {
    if (running || selected.length === 0 || selected.length > WORKTREE_CLEANUP_MAX_IDS) return;
    const rows = selected;
    setState({ kind: 'running', count: rows.length });
    void selectionDigest(rows)
      .then(digest => write({ request_id: crypto.randomUUID(), ids: rows.map(tree => tree.id).sort(), expected_digest: digest }))
      // A writer that throws gave no typed answer, the same as a lost connection.
      .catch((): WorktreeCleanupWrite => ({ state: 'unreachable' }))
      .then((outcome) => {
        if (outcome.state === 'cleaned') {
          const gone = outcome.result.items.filter(item => item.outcome === 'removed').map(item => item.id);
          setRemoved(current => new Set([...current, ...gone]));
        }
        setState(outcome.state === 'cleaned' ? { kind: 'cleaned', result: outcome.result }
          : outcome.state === 'refused' ? { kind: 'refused', error: outcome.error } : { kind: outcome.state });
        reload();
      });
  }, [running, selected, write, reload]);

  const reselect = useCallback(() => {
    setExcluded(new Set());
    setState({ kind: 'idle' });
    reload();
  }, [reload]);

  return { selectable, selected, state, removed, toggle, submit, reselect };
}
