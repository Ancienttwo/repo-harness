import { loadWorkflowContractAsset } from './workflow-contract-asset';

export interface RemovedManagedHook {
  readonly event: string;
  readonly command: string;
}

export interface StrippedManagedHookConfig {
  readonly hooks: Record<string, unknown>;
  readonly removed: readonly RemovedManagedHook[];
}

export const MANAGED_TAG = 'repo-harness-managed-hook-v1';
const LEGACY_TYPED_MANAGED = /^(?:HOOK_HOST=(?:codex|claude) )?repo-harness hook (?:SessionStart|PreToolUse|PostToolUse|UserPromptSubmit|SubagentStart|SubagentStop|Stop) --route (?:default|edit|subagent|bash|always|delegation|context|quality)$/;

let retiredCommands: ReadonlySet<string> | undefined;

/** The contract asset is the sole inventory of retired template commands. */
export function retiredHookCommands(): ReadonlySet<string> {
  if (!retiredCommands) {
    const contract = loadWorkflowContractAsset<{
      migrations: { upgrade: { actions: readonly { surface?: string; commands?: readonly string[] }[] } };
    }>();
    retiredCommands = new Set(contract.migrations.upgrade.actions.flatMap((action) =>
      action.surface === 'hook-entry' ? [...(action.commands ?? [])] : []));
  }
  return retiredCommands;
}

// Both project adoption and global cleanup share the full legacy typed form.
export function isRepoHarnessLegacyTypedHookCommand(command: unknown): boolean {
  return typeof command === 'string' && command.match(LEGACY_TYPED_MANAGED)?.[0] === command;
}

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
  if (isRepoHarnessLegacyTypedHookCommand(command)) return true;
  return retiredHookCommands().has(command);
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
