import { spawn } from 'node:child_process';
import type { AdapterHost, HookEvent, RouteHost, RouteId } from './route-registry';
import { BRIDGE_HOOK_PROTOCOL, type BridgeHookOutput } from './hook-protocol';
import { withoutRepositorySelectingGitEnv } from '../../effects/git/runner';

/**
 * Shared client for the direct package hosts (Pi, DSH). Both hosts load a
 * repo-harness package entry that runs `dist/hook-entry.js` as a child process
 * and reads one JSON object from stdout. The adapter hosts (Claude, Codex)
 * never use this client: they bind the route registry through their own config
 * files.
 */

/** Hosts without a JSON adapter file; their package entry calls the hook runtime directly. */
export type BridgeHost = Exclude<RouteHost, AdapterHost>;

export const BRIDGE_HOOK_TIMEOUT_MS = 30_000;
export const BRIDGE_HOOK_INPUT_BYTES = 16 * 1024 * 1024;
export const BRIDGE_HOOK_OUTPUT_BYTES = 1024 * 1024;

export interface BridgeHookRequest {
  readonly event: HookEvent;
  readonly routeId: RouteId;
  readonly cwd: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

/**
 * Child environment for one bridge call. Repository-selecting Git variables
 * and every inherited `HOOK_*` identity are removed; the bridge owns the host
 * tag. The rest of the environment, including `REPO_HARNESS_HOME`, passes
 * through as it does for the adapter hosts.
 */
export function bridgeHookEnvironment(host: BridgeHost, env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const childEnv = Object.fromEntries(Object.entries(withoutRepositorySelectingGitEnv(env)).filter(([key]) => !key.startsWith('HOOK_')));
  delete childEnv.REPO_HARNESS_SOURCE_ROOT;
  delete childEnv.REPO_HARNESS_HELPER_SOURCE_PATH;
  delete childEnv.REPO_HARNESS_TARGET_REPO_ROOT;
  return { ...childEnv, HOOK_HOST: host };
}

function parseOutput(
  text: string,
  request: BridgeHookRequest,
  status: number | null,
  codePrefix: string,
): BridgeHookOutput {
  let value: unknown;
  try { value = JSON.parse(text); }
  catch { throw new Error(`${codePrefix}_HOOK_INVALID_OUTPUT`); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${codePrefix}_HOOK_INVALID_OUTPUT`);
  const v = value as Record<string, unknown>;
  if (v.protocol !== BRIDGE_HOOK_PROTOCOL) throw new Error(`${codePrefix}_HOOK_PROTOCOL_MISMATCH`);
  if (v.event !== request.event || v.route_id !== request.routeId || !Number.isInteger(v.exit_code)
    || v.exit_code !== status || typeof v.reason !== 'string'
    || !['allow', 'block', 'none'].includes(v.decision as string)
    || !(v.additional_context === null || typeof v.additional_context === 'string')
    || !(v.system_message === null || typeof v.system_message === 'string') || typeof v.diagnostics !== 'string'
    || (v.updated_input !== undefined && (!v.updated_input || typeof v.updated_input !== 'object' || Array.isArray(v.updated_input)))) {
    throw new Error(`${codePrefix}_HOOK_INVALID_OUTPUT`);
  }
  return value as BridgeHookOutput;
}

export interface HookBridgeOptions {
  readonly host: BridgeHost;
  /** Error-code prefix; each host keeps its own stable vocabulary (`PI_HOOK_*`, `DSH_HOOK_*`). */
  readonly codePrefix: 'PI' | 'DSH';
  /** Absolute path to the packaged `dist/hook-entry.js`. */
  readonly entry: string;
  readonly bun?: string;
  readonly timeoutMs?: number;
  readonly env?: NodeJS.ProcessEnv;
}

/** Owns only the hook children it starts. Cancellation never targets the host process. */
export class HookBridge {
  private readonly pending = new Set<() => void>();
  private closed = false;

  constructor(private readonly options: HookBridgeOptions) {}

  call(request: BridgeHookRequest): Promise<BridgeHookOutput> {
    const code = this.options.codePrefix;
    if (this.closed) return Promise.reject(new Error(`${code}_HOOK_CANCELLED`));
    const input = JSON.stringify(request.payload);
    if (Buffer.byteLength(input) > BRIDGE_HOOK_INPUT_BYTES) return Promise.reject(new Error(`${code}_HOOK_INPUT_LIMIT`));
    return new Promise((resolve, reject) => {
      const child = spawn(this.options.bun ?? 'bun', [this.options.entry, request.event, '--route', request.routeId], {
        cwd: request.cwd,
        env: bridgeHookEnvironment(this.options.host, this.options.env ?? process.env),
        stdio: ['pipe', 'pipe', 'ignore'],
      });
      let finished = false;
      let bytes = 0;
      const chunks: Buffer[] = [];
      const finish = (error?: Error, output?: BridgeHookOutput) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        this.pending.delete(cancel);
        if (error) { child.kill('SIGKILL'); reject(error); }
        else resolve(output!);
      };
      const cancel = () => finish(new Error(`${code}_HOOK_CANCELLED`));
      const timer = setTimeout(() => finish(new Error(`${code}_HOOK_TIMEOUT`)), this.options.timeoutMs ?? BRIDGE_HOOK_TIMEOUT_MS);
      this.pending.add(cancel);
      child.once('error', (error) => finish(error));
      child.stdin.once('error', (error) => finish(error));
      child.stdout.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > BRIDGE_HOOK_OUTPUT_BYTES) finish(new Error(`${code}_HOOK_OUTPUT_LIMIT`));
        else chunks.push(chunk);
      });
      child.once('close', (status) => {
        if (finished) return;
        try { finish(undefined, parseOutput(Buffer.concat(chunks).toString('utf8'), request, status, code)); }
        catch (error) { finish(error instanceof Error ? error : new Error(String(error))); }
      });
      child.stdin.end(input);
    });
  }

  close(): void {
    this.closed = true;
    for (const cancel of this.pending) cancel();
  }
}
