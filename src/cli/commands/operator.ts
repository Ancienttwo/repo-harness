import { Command } from 'commander';

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
  return {
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

/** Start the local server and keep the CLI alive until an interrupt signal. */
export async function runOperatorServe(options: OperatorServeOptions): Promise<void> {
  const server = await startOperatorServer(options);
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
    .action(async (raw: OperatorServeRawOptions) => {
      try {
        await runOperatorServe(parseOperatorServeOptions(raw));
      } catch (error) {
        outputOperatorError(error);
      }
    });
  return operator;
}
