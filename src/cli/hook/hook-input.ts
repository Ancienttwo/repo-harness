import { realpathSync } from 'fs';
import { basename, dirname } from 'path';
import type { RouteHost } from './route-registry';

/**
 * The runtime reads the host payload once. Handlers receive the parsed object
 * and the resolved identity through `HookHandlerContext`; they never reparse
 * stdin or read identity from the environment.
 */
export type HookPayload = Readonly<Record<string, unknown>>;

export interface HookIdentity {
  readonly host: RouteHost;
  readonly sessionId: string | null;
  readonly runId: string | null;
  readonly turnId: string | null;
}

export class HookPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HookPayloadError';
  }
}

/** Empty input is an empty payload. Anything else must be one JSON object. */
export function parseHookPayload(input: string | Buffer | undefined): HookPayload {
  const text = input === undefined ? '' : input.toString().trim();
  if (!text) return {};
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new HookPayloadError('hook payload is not valid JSON');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HookPayloadError('hook payload is not a JSON object');
  }
  return value as HookPayload;
}

/** Value at a dotted path such as `tool_input.command`, or undefined. */
export function payloadValue(payload: HookPayload, path: string): unknown {
  let current: unknown = payload;
  for (const part of path.split('.')) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/** String at a dotted path; any other value is ''. */
export function payloadString(payload: HookPayload, path: string): string {
  const value = payloadValue(payload, path);
  return typeof value === 'string' ? value : '';
}

/** Non-empty trimmed string field, or null. */
export function payloadIdentityField(payload: HookPayload, key: string): string | null {
  const value = payload[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/**
 * The hook identity is the payload's own `session_id`, `run_id` and
 * `turn_id`. No environment alias is read, and no id is minted or stored: a
 * missing value stays null.
 */
export function hookIdentity(payload: HookPayload, host: RouteHost): HookIdentity {
  return {
    host,
    sessionId: payloadIdentityField(payload, 'session_id'),
    runId: payloadIdentityField(payload, 'run_id'),
    turnId: payloadIdentityField(payload, 'turn_id'),
  };
}

/**
 * Make a host-reported absolute path repository relative. Paths outside the
 * repository stay absolute; the host may report a symlinked temp directory for
 * a file that does not exist yet, so only the parent is resolved.
 */
export function normalizeRepoRelativePath(repoRoot: string, raw: string): string {
  if (!raw || !raw.startsWith('/')) return raw;
  if (raw === repoRoot || raw.startsWith(`${repoRoot}/`)) return raw.slice(repoRoot.length + 1);

  let rootReal = '';
  try {
    rootReal = realpathSync(repoRoot);
  } catch {
    rootReal = '';
  }
  if (rootReal && (raw === rootReal || raw.startsWith(`${rootReal}/`))) {
    return raw.slice(rootReal.length + 1);
  }
  try {
    const canonical = `${realpathSync(dirname(raw))}/${basename(raw)}`;
    if (rootReal && (canonical === rootReal || canonical.startsWith(`${rootReal}/`))) {
      return canonical.slice(rootReal.length + 1);
    }
    if (canonical === repoRoot || canonical.startsWith(`${repoRoot}/`)) {
      return canonical.slice(repoRoot.length + 1);
    }
  } catch {
    // An unresolvable parent keeps the original absolute path.
  }
  return raw;
}
