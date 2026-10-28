import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { HookEvent, RouteId } from '../cli/hook/route-registry';
import { PI_HOOK_PROTOCOL, type PiHookOutput } from '../cli/hook/hook-protocol';

export const PI_HOOK_TIMEOUT_MS = 30_000;
export const PI_HOOK_INPUT_BYTES = 16 * 1024 * 1024;
export const PI_HOOK_OUTPUT_BYTES = 1024 * 1024;
const HOOK_ENTRY = fileURLToPath(new URL('../../dist/hook-entry.js', import.meta.url));

export interface PiHookRequest {
  readonly event: HookEvent;
  readonly routeId: RouteId;
  readonly cwd: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export function piHookEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const childEnv = Object.fromEntries(Object.entries(env).filter(([key]) => !key.startsWith('HOOK_')));
  delete childEnv.REPO_HARNESS_SOURCE_ROOT;
  delete childEnv.REPO_HARNESS_HELPER_SOURCE_PATH;
  delete childEnv.REPO_HARNESS_TARGET_REPO_ROOT;
  return { ...childEnv, HOOK_HOST: 'pi' };
}

function parseOutput(text: string, request: PiHookRequest, status: number | null): PiHookOutput {
  let value: unknown;
  try { value = JSON.parse(text); }
  catch { throw new Error('PI_HOOK_INVALID_OUTPUT'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('PI_HOOK_INVALID_OUTPUT');
  const v = value as Record<string, unknown>;
  if (v.protocol !== PI_HOOK_PROTOCOL) throw new Error('PI_HOOK_PROTOCOL_MISMATCH');
  if (v.event !== request.event || v.route_id !== request.routeId || !Number.isInteger(v.exit_code)
    || v.exit_code !== status || typeof v.reason !== 'string'
    || !['allow', 'block', 'none'].includes(v.decision as string)
    || !(v.additional_context === null || typeof v.additional_context === 'string')
    || !(v.system_message === null || typeof v.system_message === 'string') || typeof v.diagnostics !== 'string'
    || (v.updated_input !== undefined && (!v.updated_input || typeof v.updated_input !== 'object' || Array.isArray(v.updated_input)))) {
    throw new Error('PI_HOOK_INVALID_OUTPUT');
  }
  return value as PiHookOutput;
}

/** Own only these hook children. Cancellation never targets the Pi process. */
export class PiHookBridge {
  private readonly pending = new Set<() => void>();
  private closed = false;

  constructor(private readonly options: {
    readonly bun?: string;
    readonly entry?: string;
    readonly timeoutMs?: number;
    readonly env?: NodeJS.ProcessEnv;
  } = {}) {}

  call(request: PiHookRequest): Promise<PiHookOutput> {
    if (this.closed) return Promise.reject(new Error('PI_HOOK_CANCELLED'));
    const input = JSON.stringify(request.payload);
    if (Buffer.byteLength(input) > PI_HOOK_INPUT_BYTES) return Promise.reject(new Error('PI_HOOK_INPUT_LIMIT'));
    return new Promise((resolve, reject) => {
      const child = spawn(this.options.bun ?? 'bun', [this.options.entry ?? HOOK_ENTRY, request.event, '--route', request.routeId], {
        cwd: request.cwd, env: piHookEnvironment(this.options.env ?? process.env), stdio: ['pipe', 'pipe', 'ignore'],
      });
      let finished = false;
      let bytes = 0;
      const chunks: Buffer[] = [];
      const finish = (error?: Error, output?: PiHookOutput) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        this.pending.delete(cancel);
        if (error) { child.kill('SIGKILL'); reject(error); }
        else resolve(output!);
      };
      const cancel = () => finish(new Error('PI_HOOK_CANCELLED'));
      const timer = setTimeout(() => finish(new Error('PI_HOOK_TIMEOUT')), this.options.timeoutMs ?? PI_HOOK_TIMEOUT_MS);
      this.pending.add(cancel);
      child.once('error', (error) => finish(error));
      child.stdin.once('error', (error) => finish(error));
      child.stdout.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > PI_HOOK_OUTPUT_BYTES) finish(new Error('PI_HOOK_OUTPUT_LIMIT'));
        else chunks.push(chunk);
      });
      child.once('close', (code) => {
        if (finished) return;
        try { finish(undefined, parseOutput(Buffer.concat(chunks).toString('utf8'), request, code)); }
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
