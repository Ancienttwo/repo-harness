import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { HookBridge } from '../cli/hook/bridge-client';

/**
 * DSH binding for the shared bridge client.
 *
 * The published package ships the DSH plugin as `dist/dsh/plugin.js`, one
 * directory below `dist/hook-entry.js`, so the bundle resolves the entry in
 * its parent directory. The TypeScript source used by tests does not, and
 * tests supply the entry explicitly.
 */

export const DSH_HOOK_ENTRY = fileURLToPath(new URL('../hook-entry.js', import.meta.url));

export interface DshBridgeOptions {
  readonly hookEntry?: string;
  readonly bun?: string;
  readonly timeoutMs?: number;
}

export interface DshBridgeResolution {
  readonly bridge: HookBridge;
  /** Null when the packaged hook entry exists; otherwise the fixed capability code. */
  readonly unavailable: string | null;
}

export function resolveDshBridge(options: DshBridgeOptions = {}): DshBridgeResolution {
  const entry = options.hookEntry ?? DSH_HOOK_ENTRY;
  const bridge = new HookBridge({
    host: 'dsh',
    codePrefix: 'DSH',
    entry,
    bun: options.bun,
    timeoutMs: options.timeoutMs,
  });
  return {
    bridge,
    unavailable: existsSync(entry) ? null : 'DSH_HOOK_ENTRY_MISSING',
  };
}
