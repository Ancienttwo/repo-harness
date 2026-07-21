export interface RemovedManagedHook {
  readonly event: string;
  readonly command: string;
}

export interface StrippedManagedHookConfig {
  readonly hooks: Record<string, unknown>;
  readonly removed: readonly RemovedManagedHook[];
}

const MANAGED_TAG = 'repo-harness-managed-hook-v1';
const LEGACY_DIRECT_MANAGED = /^HOOK_HOST=(?:codex|claude) repo-harness hook (?:SessionStart|PreToolUse|PostToolUse|UserPromptSubmit|SubagentStart|SubagentStop|Stop) --route (?:default|edit|subagent|bash|always|delegation|context|quality)$/;
const LEGACY_BARE_MANAGED = /^repo-harness hook(?:\s|$)/;
const LEGACY_MANAGED_PREFIX = 'repo=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0; export HOOK_REPO_ROOT="$repo";';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * The single ownership detector for repo-harness host-adapter commands.
 *
 * Legacy signatures exist only so an explicit installer/adoption/migrate
 * transaction can remove an old generated adapter. Host-event execution must
 * never consult this function or dispatch one of these command shapes.
 */
export function isRepoHarnessManagedHookCommand(command: unknown): command is string {
  if (typeof command !== 'string') return false;
  if (command.startsWith(`: ${MANAGED_TAG}; `)) return true;
  if (LEGACY_DIRECT_MANAGED.test(command)) return true;
  if (LEGACY_BARE_MANAGED.test(command.trimStart())) return true;
  if (
    command.startsWith(LEGACY_MANAGED_PREFIX)
    && command.includes('repo-harness-hook ')
    && command.includes('exec repo-harness hook ')
  ) {
    return true;
  }
  return command.includes('.ai/hooks/run-hook.sh')
    || command.includes('.claude/hooks/run-hook.sh')
    || command.includes('/.repo-harness/hook-shim.sh');
}

/**
 * Remove only command objects owned by repo-harness while preserving sibling
 * commands, block metadata, unrelated events, and the surrounding config.
 * An invalid root fails closed. Unknown event values are preserved byte-for-
 * byte at the JSON value level because a migration cannot prove which entries
 * it owns; valid sibling blocks remain independently eligible for removal.
 */
export function stripRepoHarnessManagedHooks(value: unknown): StrippedManagedHookConfig {
  if (value === undefined) return { hooks: {}, removed: [] };
  if (!isRecord(value)) throw new Error('managed hook config must be an object keyed by event');

  const hooks: Record<string, unknown> = {};
  const removed: RemovedManagedHook[] = [];

  for (const [event, blocks] of Object.entries(value)) {
    if (!Array.isArray(blocks)) {
      hooks[event] = blocks;
      continue;
    }

    const keptBlocks: unknown[] = [];
    for (const block of blocks) {
      if (!isRecord(block) || !Array.isArray(block.hooks)) {
        keptBlocks.push(block);
        continue;
      }

      const keptCommands = block.hooks.filter((hook) => {
        const command = isRecord(hook) ? hook.command : undefined;
        if (!isRepoHarnessManagedHookCommand(command)) return true;
        removed.push({ event, command });
        return false;
      });

      if (keptCommands.length > 0) keptBlocks.push({ ...block, hooks: keptCommands });
    }

    if (keptBlocks.length > 0) hooks[event] = keptBlocks;
  }

  return { hooks, removed };
}
