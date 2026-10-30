import { fileURLToPath } from 'node:url';
import {
  BRIDGE_HOOK_INPUT_BYTES,
  BRIDGE_HOOK_OUTPUT_BYTES,
  BRIDGE_HOOK_TIMEOUT_MS,
  HookBridge,
  bridgeHookEnvironment,
  type BridgeHookRequest,
} from '../cli/hook/bridge-client';

/**
 * Pi binding for the shared bridge client. Pi loads this package's TypeScript
 * sources directly, so the hook entry resolves from `src/pi/` to `dist/`.
 */

export const PI_HOOK_TIMEOUT_MS = BRIDGE_HOOK_TIMEOUT_MS;
export const PI_HOOK_INPUT_BYTES = BRIDGE_HOOK_INPUT_BYTES;
export const PI_HOOK_OUTPUT_BYTES = BRIDGE_HOOK_OUTPUT_BYTES;

const HOOK_ENTRY = fileURLToPath(new URL('../../dist/hook-entry.js', import.meta.url));

export type PiHookRequest = BridgeHookRequest;

export function piHookEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return bridgeHookEnvironment('pi', env);
}

export class PiHookBridge extends HookBridge {
  constructor(options: {
    readonly bun?: string;
    readonly entry?: string;
    readonly timeoutMs?: number;
    readonly env?: NodeJS.ProcessEnv;
  } = {}) {
    super({
      host: 'pi',
      codePrefix: 'PI',
      entry: options.entry ?? HOOK_ENTRY,
      bun: options.bun,
      timeoutMs: options.timeoutMs,
      env: options.env,
    });
  }
}
