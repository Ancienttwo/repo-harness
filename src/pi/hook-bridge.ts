import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { MANAGED_STOP_TIMEOUT_SECONDS } from '../core/hook-work-budget';
import type { HookEvent, RouteId } from '../cli/hook/route-registry';
import { boundedHookDiagnostic, type HookJsonOutput } from '../cli/hook/hook-protocol';
import { parseHookJsonOutput } from './hook-protocol';

const MAX_INPUT_BYTES = 16 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 1024 * 1024;

export interface HookRequest {
  readonly event: HookEvent;
  readonly route: RouteId;
  readonly cwd: string;
  readonly sessionId: string;
  readonly runId: string;
  readonly payload: Record<string, unknown>;
  readonly signal?: AbortSignal;
}

export class PiHookBridge {
  private readonly operations = new Set<AbortController>();
  constructor(private readonly packageRoot: string, private readonly options: {
    bun?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv;
  } = {}) {}

  async invoke(request: HookRequest): Promise<HookJsonOutput> {
    const input = JSON.stringify({ ...request.payload, source: 'pi', session_id: request.sessionId, run_id: request.runId });
    if (Buffer.byteLength(input) > MAX_INPUT_BYTES) throw new Error('PI_HOOK_INPUT_TOO_LARGE');
    if (request.signal?.aborted) throw new Error('PI_HOOK_CANCELLED');
    const controller = new AbortController();
    this.operations.add(controller);
    const cancel = () => controller.abort();
    request.signal?.addEventListener('abort', cancel, { once: true });
    const env = { ...(this.options.env ?? process.env) };
    for (const key of Object.keys(env)) {
      if (key.startsWith('HOOK_') || ['REPO_HARNESS_SOURCE_ROOT', 'REPO_HARNESS_HELPER_SOURCE_PATH',
        'REPO_HARNESS_TARGET_REPO_ROOT', 'REPO_HARNESS_WORKFLOW_STATE_LIB'].includes(key)) delete env[key];
    }
    // Identity travels only in the payload; HOOK_HOST selects the Pi JSON renderer.
    Object.assign(env, { HOOK_HOST: 'pi', REPO_HARNESS_CLI: join(this.packageRoot, 'src/cli/index.ts') });
    try {
      return await new Promise<HookJsonOutput>((resolve, reject) => {
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
        const finish = (error?: Error, output?: HookJsonOutput) => {
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
        const timeoutMs = this.options.timeoutMs ?? (request.event === 'Stop' ? MANAGED_STOP_TIMEOUT_SECONDS * 1000 : 10_000);
        const timer = setTimeout(() => stop('PI_HOOK_TIMEOUT'), timeoutMs);
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
          let output: HookJsonOutput;
          try {
            if (exit.signal || exit.code === null) throw new Error('PI_HOOK_TERMINATED');
            output = parseHookJsonOutput(Buffer.concat(stdout).toString('utf8'), request.event, request.route);
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
