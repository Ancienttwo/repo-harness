import type { HookEvent, RouteId } from '../cli/hook/route-registry';
import { HOOK_DIAGNOSTIC_BYTES, type HookJsonOutput } from '../cli/hook/hook-protocol';

/** Validate the wire result before a Pi tool can use it as an admission decision. */
export function parseHookJsonOutput(text: string, event: HookEvent, route: RouteId): HookJsonOutput {
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('PI_HOOK_INVALID_RESULT');
  const result = value as Record<string, unknown>;
  const keys = ['protocol', 'event', 'route_id', 'host', 'repo_root', 'exit_code', 'reason', 'decision', 'additional_context', 'diagnostics'];
  if (Object.keys(result).length !== keys.length || keys.some(key => !(key in result))
    || result.protocol !== 1 || result.event !== event || result.route_id !== route || result.host !== 'pi'
    || (result.repo_root !== null && typeof result.repo_root !== 'string')
    || !Number.isSafeInteger(result.exit_code) || Number(result.exit_code) < 0
    || typeof result.reason !== 'string' || typeof result.decision !== 'string' || !['allow', 'block', 'none'].includes(result.decision)
    || (result.additional_context !== null && typeof result.additional_context !== 'string')
    || typeof result.diagnostics !== 'string' || Buffer.byteLength(result.diagnostics) > HOOK_DIAGNOSTIC_BYTES
    || (result.exit_code !== 0 && result.decision !== 'block')) throw new Error('PI_HOOK_INVALID_RESULT');
  return result as unknown as HookJsonOutput;
}
