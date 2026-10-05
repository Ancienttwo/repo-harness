/**
 * `repo-harness hook <event> --route <route-id>` dispatcher.
 *
 * Routes one registry-defined (event, route-id, matcher) tuple to exactly one
 * typed in-process handler.
 *
 * Behavior contract (verified by tests/cli/hook.test.ts):
 *   - not in a git repo                    → exit 0 silently
 *   - in repo but no opt-in marker         → exit 0 silently
 *   - opt-in + unknown (event, route)      → exit 2 with error
 *   - opt-in + missing handler binding     → exit 3 with error
 *   - opt-in + handler fails               → propagate handler exit code
 *   - opt-in + handler succeeds            → exit 0
 *
 * The runtime resolves HOOK_REPO_ROOT once and owns host output shaping plus
 * event telemetry; there is no secondary script dispatcher.
 */

import { Command } from 'commander';
import { resolveWorkflowStateLibrary } from '../../effects/runtime/helper-runner';

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

/** Print the package-owned operator library. Never select a repository copy. */
export function buildHookLibCommand(): Command {
  const command = new Command('hook-lib').description('Locate the installed operator library');
  command.command('path').description('Print the absolute path of workflow-state.sh').action(() => {
    console.log(resolveWorkflowStateLibrary());
  });
  return command;
}
