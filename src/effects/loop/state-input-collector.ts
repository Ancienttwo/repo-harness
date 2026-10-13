import type { EffectiveState } from '../../core/state/types';
import { readTrimmed, safeRealpath } from '../state/collect-state-inputs';

const ACTIVE_PLAN_MARKER = '.ai/harness/active-plan';
const ACTIVE_WORKTREE_MARKER = '.ai/harness/active-worktree';

/**
 * Mirrors the owner/current comparison `resolveEffectiveStateUnlocked`
 * performs, through the same `readTrimmed` and `safeRealpath` primitives.
 * `ownedByCurrent` is false when there is no owner marker: "no marker" is not
 * "current worktree owns it".
 */
export interface WorktreeOwnership {
  readonly current: string;
  readonly owner: string | null;
  readonly ownedByCurrent: boolean;
}

export type EffectiveStateFailureCode = 'state_resolution_unstable' | 'state_resolution_failed';

/** Effective State for one hook event, or the bounded cause of its failure. */
export type EffectiveStateResolution =
  | { readonly ok: true; readonly state: EffectiveState }
  | {
      readonly ok: false;
      readonly reason_code: EffectiveStateFailureCode;
      readonly error_hash: string;
      readonly message: string;
    };

/**
 * Inputs to build one collector for one hook event. `repoRoot` is already
 * resolved by the runtime. `resolveEffectiveState` is injected because its
 * retry policy lives in the CLI layer, which effect modules may not import.
 */
export interface StateInputCollectorDeps {
  readonly repoRoot: string;
  readonly resolveEffectiveState: () => EffectiveStateResolution;
}

export interface StateInputCollector {
  getRepoRoot(): string;
  getWorktreeOwnership(): WorktreeOwnership;
  /** Raw `.ai/harness/active-plan` marker text, or null when absent. */
  getActivePlanMarker(): string | null;
  /** Resolves Effective State at most once per event. */
  getEffectiveState(): EffectiveStateResolution;
}

const UNCOMPUTED = Symbol('state-input-collector-uncomputed');

/** Caches the first result, including a legitimate null. */
function once<T>(compute: () => T): () => T {
  let cached: T | typeof UNCOMPUTED = UNCOMPUTED;
  return () => {
    if (cached === UNCOMPUTED) cached = compute();
    return cached;
  };
}

export function createStateInputCollector(deps: StateInputCollectorDeps): StateInputCollector {
  const getWorktreeOwnership = once((): WorktreeOwnership => {
    const current = safeRealpath(deps.repoRoot);
    const owner = readTrimmed(deps.repoRoot, ACTIVE_WORKTREE_MARKER);
    return {
      current,
      owner,
      ownedByCurrent: Boolean(owner && safeRealpath(owner) === current),
    };
  });
  const getActivePlanMarker = once(() => readTrimmed(deps.repoRoot, ACTIVE_PLAN_MARKER));
  const getEffectiveState = once(deps.resolveEffectiveState);

  return {
    getRepoRoot: () => deps.repoRoot,
    getWorktreeOwnership,
    getActivePlanMarker,
    getEffectiveState,
  };
}
