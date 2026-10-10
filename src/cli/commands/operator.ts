import { isAbsolute } from 'node:path';
import { Command } from 'commander';
import { RUNTIME_CAPTURE_PYTHON_UNAVAILABLE } from '../../effects/operator/runtime-capture-pty';
import { runRuntimeCapture } from '../../effects/operator/runtime-capture';
import { RUNTIME_CAPTURE_OWNERSHIP_UNSUPPORTED } from '../../effects/operator/runtime-capture-writer';
import { runtimeCaptureId, type NativeRuntimeProvider } from '../../core/operator/runtime-capture';

import {
  OPERATOR_DEFAULT_HOST,
  OPERATOR_DEFAULT_MAX_CONCURRENCY,
  OPERATOR_DEFAULT_PORT,
  OPERATOR_DEFAULT_TIMEOUT_MS,
  OperatorServerError,
  startOperatorServer,
  type OperatorServerOptions,
} from '../../effects/operator/server';

export interface OperatorServeRawOptions {
  readonly host?: string;
  readonly port?: string;
  readonly maxConcurrency?: string;
  readonly timeoutMs?: string;
  readonly runtimeStatusConfig?: string;
}

export interface OperatorServeOptions extends OperatorServerOptions {
  readonly host: string;
  readonly port: number;
  readonly max_concurrency: number;
  readonly timeout_ms: number;
}

export class OperatorArgumentError extends Error {
  readonly code = 'invalid_argument' as const;

  constructor(message: string) {
    super(message);
    this.name = 'OperatorArgumentError';
  }
}

function integerOption(
  value: string | undefined,
  name: string,
  minimum: number,
  maximum: number,
): number {
  if (value === undefined) {
    throw new OperatorArgumentError(`--${name} is required`);
  }
  const trimmed = value.trim();
  if (!/^\d+$/u.test(trimmed)) {
    throw new OperatorArgumentError(`--${name} must be an integer`);
  }
  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new OperatorArgumentError(`--${name} must be an integer from ${minimum} through ${maximum}`);
  }
  return parsed;
}

export function parseOperatorServeOptions(raw: OperatorServeRawOptions): OperatorServeOptions {
  const host = raw.host?.trim() || OPERATOR_DEFAULT_HOST;
  if (host !== '127.0.0.1' && host !== '::1') {
    throw new OperatorArgumentError('--host must be 127.0.0.1 or ::1');
  }
  const port = raw.port === undefined ? OPERATOR_DEFAULT_PORT : integerOption(raw.port, 'port', 0, 65_535);
  const maxConcurrency = raw.maxConcurrency === undefined
    ? OPERATOR_DEFAULT_MAX_CONCURRENCY
    : integerOption(raw.maxConcurrency, 'max-concurrency', 1, 16);
  const timeoutMs = raw.timeoutMs === undefined
    ? OPERATOR_DEFAULT_TIMEOUT_MS
    : integerOption(raw.timeoutMs, 'timeout-ms', 1_000, 30_000);
  if (raw.runtimeStatusConfig !== undefined && !isAbsolute(raw.runtimeStatusConfig)) throw new OperatorArgumentError('--runtime-status-config must be an absolute path');
  return {
    ...(raw.runtimeStatusConfig ? { runtime_status_config: raw.runtimeStatusConfig } : {}),
    host,
    port,
    max_concurrency: maxConcurrency,
    timeout_ms: timeoutMs,
  };
}

function outputOperatorError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const invalid = error instanceof OperatorArgumentError
    || (error instanceof OperatorServerError && error.code === 'invalid_argument');
  process.stderr.write(`${JSON.stringify({ ok: false, error: invalid ? 'invalid_argument' : 'operator_server_unavailable', message })}\n`);
  process.exitCode = invalid ? 2 : 1;
}

/**
 * Start the local server and keep the CLI alive until an interrupt signal.
 * `serve` owns the background Dev Activity and setup collectors; the server stops them on close.
 */
export async function runOperatorServe(options: OperatorServeOptions): Promise<void> {
  const server = await startOperatorServer({ ...options, dev_activity_collector: true, setup_collector: true });
  process.stdout.write(`${server.url}\n`);
  let shutdown: (() => void) | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      let shuttingDown = false;
      shutdown = () => {
        if (shuttingDown) return;
        shuttingDown = true;
        void server.close().then(resolve, reject);
      };
      process.once('SIGINT', shutdown);
      process.once('SIGTERM', shutdown);
    });
  } finally {
    if (shutdown !== undefined) {
      process.removeListener('SIGINT', shutdown);
      process.removeListener('SIGTERM', shutdown);
    }
  }
}

export function buildOperatorCommand(): Command {
  const operator = new Command('operator').description('Serve the local read-only Human Control Board');
  operator
    .command('serve')
    .description('Serve the loopback-only read-only Human Control Board')
    .option('--host <host>', 'Loopback bind host (127.0.0.1 or ::1)', OPERATOR_DEFAULT_HOST)
    .option('--port <port>', 'TCP port (0 selects an ephemeral test port)', String(OPERATOR_DEFAULT_PORT))
    .option('--max-concurrency <count>', 'Bounded Fleet collection concurrency (1-16)', String(OPERATOR_DEFAULT_MAX_CONCURRENCY))
    .option('--timeout-ms <milliseconds>', 'Fleet collection deadline (1000-30000)', String(OPERATOR_DEFAULT_TIMEOUT_MS))
    .option('--runtime-status-config <path>', 'Explicit read-only runtime source configuration; disabled when absent')
    .action(async (raw: OperatorServeRawOptions) => {
      try {
        await runOperatorServe(parseOperatorServeOptions(raw));
      } catch (error) {
        outputOperatorError(error);
      }
    });
  operator
    .command('capture')
    .description('Capture native runtime status from one explicit owned child')
    .requiredOption('--provider <provider>', 'Native provider (codex, claude, pi)')
    .requiredOption('--source-id <id>', 'Bounded source identity')
    .requiredOption('--snapshot <path>', 'New absolute snapshot path in an owned private directory')
    .argument('<argv...>', 'Child command and arguments after --')
    .action(async (argv: string[], raw: { provider: string; sourceId: string; snapshot: string }) => {
      try {
        if (!['codex', 'claude', 'pi'].includes(raw.provider) || !isAbsolute(raw.snapshot)) throw new OperatorArgumentError('Invalid capture options');
        runtimeCaptureId(raw.sourceId);
        process.exitCode = await runRuntimeCapture({ provider: raw.provider as NativeRuntimeProvider, source_id: raw.sourceId, snapshot_path: raw.snapshot, argv });
      } catch (error) {
        // Publish only fixed codes. Native payloads, paths and argv stay private.
        const code = error instanceof Error && (error.message === RUNTIME_CAPTURE_OWNERSHIP_UNSUPPORTED || error.message === RUNTIME_CAPTURE_PYTHON_UNAVAILABLE) ? error.message : 'runtime_capture_unavailable';
        process.stderr.write(`${JSON.stringify({ ok: false, error: code })}\n`);
        process.exitCode = 1;
      }
    });
  return operator;
}
