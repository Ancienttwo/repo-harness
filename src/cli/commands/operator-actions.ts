import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { version as PACKAGE_VERSION } from '../../../package.json';
import { OPERATOR_WEB_PACKAGE_NAME } from '../../core/skill-surface/plugin-manifest';
import { findInstalledPackageRoot, readPackageManifest } from './global-runtime';
import { hostConfigurationRoot, assertConfigurationPath } from '../installer/configuration-ownership';
import { inspectGlobalContext, parseReportLanguageFlag, preflightGlobalContextRefresh, setReportingLanguage } from '../installer/global-context';
import type { OperatorLanguageSettingsAdapter } from '../../effects/operator/language-settings-route';
import { OperatorWriteRefusal } from '../../effects/operator/write-run';
import { acquireRuntimeTransactionLock, globalRuntimeScope } from '../../effects/locking/runtime-transaction-lock';
import { ExclusiveLockContentionError } from '../../effects/locking/exclusive-directory-lock';
import { RUNTIME_CAPTURE_PYTHON_UNAVAILABLE } from '../../effects/operator/runtime-capture-pty';
import { runRuntimeCapture } from '../../effects/operator/runtime-capture';
import { RUNTIME_CAPTURE_OWNERSHIP_UNSUPPORTED } from '../../effects/operator/runtime-capture-writer';
import { runtimeCaptureId, type NativeRuntimeProvider } from '../../core/operator/runtime-capture';
import { readRepoHarnessRegistryStrictSnapshot } from '../../effects/repo-registry';
import { runCleanupInvestigationJob, type CleanupReviewHost } from '../../effects/operator/worktree-cleanup-investigation';
import type { CliUsageSource } from '../../effects/setup/cli-inventory';
import { HOOK_EVENT_TELEMETRY_PATH } from '../hook/event-telemetry';
import { OperatorServerError, startOperatorServer, type OperatorServerOptions } from '../../effects/operator/server';
import { OPERATOR_DEFAULT_HOST, OPERATOR_DEFAULT_MAX_CONCURRENCY, OPERATOR_DEFAULT_PORT, OPERATOR_DEFAULT_TIMEOUT_MS } from '../../core/review/operator-console-port';

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

/** Agent use for the CLI inventory: the hook telemetry of every registered repository. An invalid registry fails the cycle. */
function registeredHookTelemetry(): readonly CliUsageSource[] {
  return readRepoHarnessRegistryStrictSnapshot().repos.map(repo => ({ repo_root: repo.path, telemetry_path: HOOK_EVENT_TELEMETRY_PATH }));
}

export function resolveOperatorAssets(
  cliPackageRoot = fileURLToPath(new URL('../../../', import.meta.url)),
): Pick<OperatorServerOptions, 'static_root' | 'static_error'> {
  const root = findInstalledPackageRoot(cliPackageRoot, OPERATOR_WEB_PACKAGE_NAME);
  if (root === null) return {};
  let version: unknown;
  try {
    version = readPackageManifest(root)?.version;
  } catch {
    return {};
  }
  if (typeof version !== 'string') return {};
  if (version !== PACKAGE_VERSION) {
    return { static_error: 'operator_assets_version_mismatch' };
  }
  return { static_root: join(root, 'dist') };
}

export function createOperatorLanguageSettings(
  env: NodeJS.ProcessEnv = process.env,
  sourceRoot = fileURLToPath(new URL('../../../', import.meta.url)),
): OperatorLanguageSettingsAdapter {
  const home = hostConfigurationRoot(env);
  const hosts = ['claude', 'codex'] as const;
  return {
    readReportingLanguage() {
      const plan = preflightGlobalContextRefresh(sourceRoot, home, hosts, undefined);
      return { hosts: plan.files.map((file, index) => ({
        host: hosts[index]!, state: file.state,
        preset: file.state === 'unsafe' || file.state === 'unreadable' || file.current === null
          ? null : inspectGlobalContext(file.current, sourceRoot).language?.preset ?? null,
      })) };
    },
    parseReportingPreset: parseReportLanguageFlag,
    setReportingLanguage(preset) {
      let lock;
      try { lock = acquireRuntimeTransactionLock(globalRuntimeScope(env), { waitTimeoutMs: 1 }); }
      catch (error) {
        if (!(error instanceof ExclusiveLockContentionError)) throw error;
        throw new OperatorWriteRefusal(409, 'runtime_busy', 'An install or update holds the runtime transaction lock.',
          'Wait for repo-harness update or install to finish, then save again.');
      }
      try { return setReportingLanguage(home, sourceRoot, hosts, preset); }
      finally { lock.release(); }
    },
    assertPolicyPath: assertConfigurationPath,
  };
}

/**
 * Start the local server and keep the CLI alive until an interrupt signal.
 * `serve` owns the background Dev Activity, setup, notify, Bot access, CLI
 * inventory, docs and tests collectors; the server stops them on close.
 */
export async function runOperatorServe(options: OperatorServeOptions): Promise<void> {
  const server = await startOperatorServer({
    ...options,
    ...resolveOperatorAssets(),
    language_settings: createOperatorLanguageSettings(options.env),
    dev_activity_collector: true,
    setup_collector: true,
    notify_collector: true,
    bot_access_collector: true,
    docs_collector: true,
    tests_collector: true,
    execution_collector: true,
    worktree_collector: true,
    architecture_map_collector: true,
    cli_inventory_collector: { usage_sources: registeredHookTelemetry },
  });
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

export async function serve(raw: OperatorServeRawOptions): Promise<void> {
  try {
    await runOperatorServe(parseOperatorServeOptions(raw));
  } catch (error) {
    outputOperatorError(error);
  }
}

export interface OperatorCaptureRawOptions { readonly provider: string; readonly sourceId: string; readonly snapshot: string }

export async function capture(argv: string[], raw: OperatorCaptureRawOptions): Promise<void> {
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
}

export async function cleanupInvestigationJob(sessionId: string, jobId: string, deadlineMs: string, reviewHost: CleanupReviewHost): Promise<void> {
  await runCleanupInvestigationJob(sessionId, jobId, Number(deadlineMs), reviewHost);
}
