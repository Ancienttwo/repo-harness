import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { HOOK_TIMEOUT_SECONDS, type HookEvent, type RouteId } from '../cli/hook/route-registry';
import { boundedHookDiagnostic, HOOK_DIAGNOSTIC_BYTES, type PiHookResult } from '../cli/hook/hook-protocol';

const MAX_INPUT_BYTES = 16 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 1024 * 1024;
const RESULT_KEYS = ['protocol', 'event', 'route_id', 'exit_code', 'reason', 'decision', 'additional_context', 'system_message', 'diagnostics'];
/** Inherited host identity. The payload carries the Pi identity; the hook resolves the repository from its cwd. */
const IDENTITY_VARIABLES = ['REPO_HARNESS_SOURCE_ROOT', 'REPO_HARNESS_HELPER_SOURCE_PATH', 'REPO_HARNESS_TARGET_REPO_ROOT'];

export interface HookRequest {
  readonly event: HookEvent;
  readonly route: RouteId;
  readonly cwd: string;
  readonly sessionId: string;
  readonly runId: string;
  readonly payload: Record<string, unknown>;
  readonly signal?: AbortSignal;
}

/** Validate the wire result before a Pi tool call can use it as an admission decision. */
export function parsePiHookResult(text: string, event: HookEvent, route: RouteId): PiHookResult {
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('PI_HOOK_INVALID_RESULT');
  const result = value as Record<string, unknown>;
  if (Object.keys(result).length !== RESULT_KEYS.length || RESULT_KEYS.some(key => !(key in result))
    || result.protocol !== 1 || result.event !== event || result.route_id !== route
    || !Number.isSafeInteger(result.exit_code) || Number(result.exit_code) < 0
    || typeof result.reason !== 'string'
    || typeof result.decision !== 'string' || !['allow', 'block', 'none'].includes(result.decision)
    || (result.additional_context !== null && typeof result.additional_context !== 'string')
    || (result.system_message !== null && typeof result.system_message !== 'string')
    || typeof result.diagnostics !== 'string' || Buffer.byteLength(result.diagnostics) > HOOK_DIAGNOSTIC_BYTES
    || (result.exit_code === 2) !== (result.decision === 'block' && result.exit_code !== 0)) {
    throw new Error('PI_HOOK_INVALID_RESULT');
  }
  return result as unknown as PiHookResult;
}

/**
 * Runs one route in the package's own bundled hook with Bun. It never searches
 * PATH for another `repo-harness-hook`, so the hook always matches the
 * extension. A timeout or cancel stops only the hook child; nothing is retried.
 */
export class PiHookBridge {
  private readonly operations = new Set<AbortController>();
  constructor(private readonly packageRoot: string, private readonly options: {
    bun?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv;
  } = {}) {}

  async invoke(request: HookRequest): Promise<PiHookResult> {
    const input = JSON.stringify({ ...request.payload, session_id: request.sessionId, run_id: request.runId });
    if (Buffer.byteLength(input) > MAX_INPUT_BYTES) throw new Error('PI_HOOK_INPUT_TOO_LARGE');
    if (request.signal?.aborted) throw new Error('PI_HOOK_CANCELLED');
    const controller = new AbortController();
    this.operations.add(controller);
    const cancel = () => controller.abort();
    request.signal?.addEventListener('abort', cancel, { once: true });
    const env = { ...(this.options.env ?? process.env) };
    for (const key of Object.keys(env)) {
      if (key.startsWith('HOOK_') || IDENTITY_VARIABLES.includes(key)) delete env[key];
    }
    env.HOOK_HOST = 'pi';
    try {
      return await new Promise<PiHookResult>((resolve, reject) => {
        const child = spawn(this.options.bun ?? 'bun', [join(this.packageRoot, 'dist/hook-entry.js'), request.event,
          '--route', request.route], { cwd: request.cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
        const stdout: Buffer[] = [], stderr: Buffer[] = [];
        let bytes = 0, settled = false;
        let stopReason: { code: string; detail: string } | null = null;
        let killTimer: ReturnType<typeof setTimeout> | undefined;
        // 'pending' until the request is fully written. An Error means the child did not receive the complete input.
        let delivery: 'pending' | 'written' | Error = 'pending';
        let exit: { code: number | null; signal: NodeJS.Signals | null } | null = null;
        const failure = (code: string, detail = '') => {
          const diagnostic = [detail, Buffer.concat(stderr).toString('utf8')].filter(Boolean).join('\n');
          return new Error(diagnostic ? `${code}: ${boundedHookDiagnostic(diagnostic)}` : code);
        };
        const finish = (error?: Error, output?: PiHookResult) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (killTimer) clearTimeout(killTimer);
          controller.signal.removeEventListener('abort', abort);
          child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy();
          if (error) reject(error); else resolve(output!);
        };
        const stop = (code: string, detail = '') => {
          if (settled || killTimer) return;
          stopReason = { code, detail };
          child.kill('SIGTERM');
          killTimer = setTimeout(() => { child.kill('SIGKILL'); finish(failure(code, detail)); }, 250);
        };
        const abort = () => stop('PI_HOOK_CANCELLED');
        const timer = setTimeout(() => stop('PI_HOOK_TIMEOUT'), this.options.timeoutMs ?? HOOK_TIMEOUT_SECONDS * 1000);
        controller.signal.addEventListener('abort', abort, { once: true });
        for (const [stream, chunks] of [[child.stdout, stdout], [child.stderr, stderr]] as const) {
          stream.on('data', (chunk: Buffer) => {
            bytes += chunk.length;
            if (bytes > MAX_OUTPUT_BYTES) stop('PI_HOOK_OUTPUT_TOO_LARGE');
            else chunks.push(chunk);
          });
        }
        // Classify only after exit. An invalid result is reported as such whatever the stdin timing.
        // A valid result is accepted only after the complete input was written to the child.
        const classify = () => {
          if (!exit) return;
          if (stopReason) { finish(failure(stopReason.code, stopReason.detail)); return; }
          let output: PiHookResult;
          try {
            if (exit.signal || exit.code === null) throw new Error('PI_HOOK_TERMINATED');
            output = parsePiHookResult(Buffer.concat(stdout).toString('utf8'), request.event, request.route);
            if (exit.code !== output.exit_code) throw new Error('PI_HOOK_EXIT_MISMATCH');
          } catch (error) {
            finish(failure('PI_HOOK_INVALID_RESULT', error instanceof Error ? error.message : String(error)));
            return;
          }
          if (delivery === 'written') finish(undefined, output);
          else if (delivery instanceof Error) finish(failure('PI_HOOK_INPUT_FAILED', delivery.message));
        };
        child.on('error', error => finish(new Error(`PI_HOOK_START_FAILED: ${error.message}`)));
        child.stdin.on('finish', () => { if (delivery === 'pending') delivery = 'written'; classify(); });
        child.stdin.on('error', (error: NodeJS.ErrnoException) => {
          if (delivery === 'pending') delivery = error;
          // EPIPE means the child closed its input. Wait for its exit so the result keeps its stderr.
          if (error.code !== 'EPIPE') stop('PI_HOOK_INPUT_FAILED', error.message);
          classify();
        });
        child.on('close', (code, signal) => { exit = { code, signal }; classify(); });
        child.stdin.end(input);
        if (controller.signal.aborted) abort();
      });
    } finally {
      request.signal?.removeEventListener('abort', cancel);
      this.operations.delete(controller);
    }
  }

  cancel(): void {
    for (const operation of this.operations) operation.abort();
  }
}
