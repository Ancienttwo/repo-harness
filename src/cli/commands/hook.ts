/**
 * `repo-harness hook <event> --route <route-id>` dispatcher.
 *
 * Replaces the per-script scripts/hook-shim.sh by routing through a single
 * registry-defined contract (event, route-id, matcher) → ordered scripts.
 *
 * Behavior contract (verified by tests/cli/hook.test.ts):
 *   - not in a git repo                    → exit 0 silently
 *   - in repo but no opt-in marker         → exit 0 silently
 *   - opt-in + unknown (event, route)      → exit 2 with error
 *   - opt-in + missing .ai/hooks/<script>  → exit 3 with error
 *   - opt-in + script fails                → propagate script exit code
 *   - opt-in + all scripts succeed         → exit 0
 *
 * Sets HOOK_REPO_ROOT in the child environment so .ai/hooks/<script>.sh
 * scripts see the right repo context (matches scripts/hook-shim.sh +
 * .ai/hooks/run-hook.sh behavior — kept for Phase 1G self-migration).
 */

import {
  isOptIn,
  resolveRepoRoot,
  runHook as runHookRuntime,
  type RunHookOptions,
  type RunHookResult,
} from '../hook/runtime';

export function runHook(opts: RunHookOptions): RunHookResult {
  return runHookRuntime({ ...opts, commandName: 'repo-harness hook' });
}

export { isOptIn, resolveRepoRoot };
export type { RunHookOptions, RunHookResult };
