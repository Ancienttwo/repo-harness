import { readTrimmed, safeRealpath } from '../state/collect-state-inputs';

const ACTIVE_PLAN_MARKER = '.ai/harness/active-plan';
const ACTIVE_WORKTREE_MARKER = '.ai/harness/active-worktree';

/**
 * Mirrors the owner/current comparison `resolveEffectiveStateUnlocked`
 * already performs (src/effects/state/resolve-effective-state.ts:321-336,
 * 533-534) via the same exported primitives (`readTrimmed`, `safeRealpath`)
 * -- re-read here, not re-derived by a new parser. `ownedByCurrent` mirrors
 * `worktreeOwnerIsCurrent` exactly: false (not true) when there is no owner
 * marker, since "no marker" is not "current worktree owns it".
 */
export interface WorktreeOwnership {
  readonly current: string;
  readonly owner: string | null;
  readonly ownedByCurrent: boolean;
}

/**
 * Inputs to build one collector for one hook event.
 *
 * `repoRoot` is supplied, not re-derived: `runHook()` already resolves it
 * through the existing repo-root authority (`resolveExplicitRepoRoot` /
 * `resolveRepoRoot` in src/cli/hook/runtime.ts) before a collector can
 * exist, so a getter here would just be a second call to the same fact.
 *
 * `resolveSessionEffectiveState` is injected rather than imported: its
 * existing authority (`effectiveStateSessionSection`, runtime.ts:127-189) is
 * a CLI-layer function that shells out to `state resolve --json`, and effect
 * modules may not depend on `src/cli/*` (check:state-boundaries'
 * EFFECTS_REVERSE_IMPORT rule). This module only adds the memoizing shell
 * around whatever thunk the caller wires in, so that one subprocess spawn
 * stays exactly what it is today: first call only, once per event.
 */
export interface StateInputCollectorDeps<TEvent extends string = string, TSessionEffectiveState = unknown> {
  readonly event: TEvent;
  readonly repoRoot: string;
  readonly resolveSessionEffectiveState: () => TSessionEffectiveState;
}

export interface StateInputCollector<TEvent extends string = string, TSessionEffectiveState = unknown> {
  readonly event: TEvent;
  /** Already resolved by the caller before construction; not a collection. */
  getRepoRoot(): string;
  /** Delegates to collect-state-inputs' `readTrimmed` + `safeRealpath`. */
  getWorktreeOwnership(): WorktreeOwnership;
  /**
   * Raw `.ai/harness/active-plan` marker text, or null when absent. This is
   * the unvalidated pointer only -- staleness/conflict checks and contract
   * path derivation stay inside the existing Effective State resolution
   * (see notes: getters left out).
   */
  getActivePlanMarker(): string | null;
  /**
   * Memoized facade over the injected SessionStart Effective State
   * resolution. Must be requested at most once per event in production --
   * the HRD-02 contract's Falsifier turns on exactly this.
   */
  getSessionEffectiveState(): TSessionEffectiveState;
}

const UNCOMPUTED = Symbol('state-input-collector-uncomputed');

/**
 * Runs `compute` at most once and caches whatever it returns, including a
 * legitimate `null`/`undefined` result (the SessionStart resolution's common
 * case) -- a `??=`-style memo would keep recomputing on any falsy value.
 */
function once<T>(compute: () => T): () => T {
  let cached: T | typeof UNCOMPUTED = UNCOMPUTED;
  return () => {
    if (cached === UNCOMPUTED) cached = compute();
    return cached;
  };
}

export function createStateInputCollector<TEvent extends string, TSessionEffectiveState>(
  deps: StateInputCollectorDeps<TEvent, TSessionEffectiveState>,
): StateInputCollector<TEvent, TSessionEffectiveState> {
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
  const getSessionEffectiveState = once(deps.resolveSessionEffectiveState);

  return {
    event: deps.event,
    getRepoRoot: () => deps.repoRoot,
    getWorktreeOwnership,
    getActivePlanMarker,
    getSessionEffectiveState,
  };
}
