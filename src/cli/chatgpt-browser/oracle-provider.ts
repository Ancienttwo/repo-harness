import { spawn, spawnSync } from 'child_process';
import { createHash } from 'crypto';
import { accessSync, constants, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'path';
import type { BrowserConsultInput, BrowserImportedArtifact, PromptBundle } from './types';

export interface OracleProviderResult {
  status: 'completed' | 'recoverable' | 'failed';
  output: string;
  conversationUrl?: string;
  providerSessionId?: string;
  oracleBinary?: string;
  oracleVersion?: string;
  artifacts?: BrowserImportedArtifact[];
  error?: {
    code: string;
    message: string;
    recovery?: string;
  };
  command: string[];
}

export interface OracleResolution {
  /** Absolute path to the resolved oracle binary, or undefined when none is found. */
  binary?: string;
  /** Which source in the fixed resolution order provided the binary. */
  source?: '--oracle-bin' | 'REPO_HARNESS_ORACLE_BIN' | 'node_modules/.bin' | 'PATH' | 'missing';
  error?: {
    code: string;
    message: string;
    recovery?: string;
  };
}

export interface OracleCapabilities {
  browserEngine: boolean;
  writeOutput: boolean;
  browserFollowup: boolean;
  sessionFollowup: boolean;
  browserArchive: boolean;
  browserModelStrategy: boolean;
  browserCookiePath: boolean;
  copyProfile: boolean;
  browserChromeProfile: boolean;
  browserThinkingTime: boolean;
  chatgptUrl: boolean;
  heartbeat: boolean;
}

export interface OracleProbe {
  binary: string;
  version?: string;
  /** True only when the binary reports the one Oracle release this transport supports. */
  versionCompatible: boolean;
  /** True when the binary responded to a `--help`/`--version` probe at all. */
  nodeCompatible: boolean;
  capabilities: OracleCapabilities;
  helpText: string;
}

/**
 * Oracle's browser command/output contract is release-specific. Keep this as the
 * single version authority for both consultation and browser-doctor diagnostics.
 */
export const REQUIRED_ORACLE_VERSION = '0.14.1';

const ORACLE_TERM_GRACE_MS = 5_000;

/** Verbatim Oracle refusal when a detached worker still holds the same prompt. */
const ORACLE_SESSION_ALREADY_RUNNING_MARKER = 'A session with the same prompt is already running';

export function supportsBrowserAppPreselect(helpText: string): boolean {
  return helpText.includes('--browser-app');
}

/**
 * Resolve the oracle binary through a fixed, auditable order. We never implicitly
 * download or `npx`-execute an unpinned oracle; a missing binary is a hard,
 * actionable failure (`ORACLE_NOT_INSTALLED`).
 */
function resolveConfiguredOracleBin(value: string, repoRoot: string): string | undefined {
  const hasPathSeparator = value.includes('/') || value.includes('\\');
  if (!hasPathSeparator) {
    const repoRelative = join(repoRoot, value);
    if (existsSync(repoRelative)) return repoRelative;
    return Bun.which(value) ?? undefined;
  }
  const candidate = isAbsolute(value) ? value : resolve(repoRoot, value);
  return existsSync(candidate) ? candidate : undefined;
}

export function resolveOracleBin(input: Pick<BrowserConsultInput, 'repoRoot' | 'oracleBin'>): OracleResolution {
  if (input.oracleBin) {
    const binary = resolveConfiguredOracleBin(input.oracleBin, input.repoRoot);
    if (binary) return { binary, source: '--oracle-bin' };
    return {
      source: '--oracle-bin',
      error: {
        code: 'ORACLE_NOT_INSTALLED',
        message: `oracle binary was not found at --oracle-bin ${input.oracleBin}`,
        recovery: 'Pass a valid --oracle-bin path, install oracle locally, or remove --oracle-bin to use the configured fallback order.',
      },
    };
  }
  const fromEnv = process.env.REPO_HARNESS_ORACLE_BIN;
  if (fromEnv) {
    const binary = resolveConfiguredOracleBin(fromEnv, input.repoRoot);
    if (binary) return { binary, source: 'REPO_HARNESS_ORACLE_BIN' };
    return {
      source: 'REPO_HARNESS_ORACLE_BIN',
      error: {
        code: 'ORACLE_NOT_INSTALLED',
        message: `oracle binary was not found at REPO_HARNESS_ORACLE_BIN=${fromEnv}`,
        recovery: 'Fix REPO_HARNESS_ORACLE_BIN, install oracle locally, or unset it to use the configured fallback order.',
      },
    };
  }
  const repoLocal = join(input.repoRoot, 'node_modules', '.bin', 'oracle');
  if (existsSync(repoLocal)) return { binary: repoLocal, source: 'node_modules/.bin' };
  const onPath = Bun.which('oracle');
  if (onPath) return { binary: onPath, source: 'PATH' };
  return {
    source: 'missing',
    error: {
      code: 'ORACLE_NOT_INSTALLED',
      message: 'oracle CLI could not be resolved via --oracle-bin, REPO_HARNESS_ORACLE_BIN, node_modules/.bin, or PATH',
      recovery: 'Install oracle (pin the version; do not auto-download), pass --oracle-bin, set REPO_HARNESS_ORACLE_BIN, or rerun with --dry-run.',
    },
  };
}

function detectCapabilities(helpText: string, browserThinkingTime: boolean): OracleCapabilities {
  const has = (flag: string) => helpText.includes(flag);
  return {
    browserEngine: has('--engine'),
    writeOutput: has('--write-output'),
    browserFollowup: has('--browser-follow-up'),
    sessionFollowup: has('--followup'),
    browserArchive: has('--browser-archive'),
    browserModelStrategy: has('--browser-model-strategy'),
    browserCookiePath: has('--browser-cookie-path'),
    // Oracle hides --browser-chrome-profile from `--help`; probeOracle folds
    // `--debug-help` into the same text so both transport flags are visible.
    copyProfile: has('--copy-profile'),
    browserChromeProfile: has('--browser-chrome-profile'),
    browserThinkingTime,
    chatgptUrl: has('--chatgpt-url'),
    heartbeat: has('--heartbeat'),
  };
}

function detectVersion(text: string): string | undefined {
  return text.match(/\b\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?\b/)?.[0];
}

export function validateOracleVersion(version: string | undefined): {
  compatible: boolean;
  error?: { code: 'ORACLE_VERSION_UNSUPPORTED'; message: string; recovery: string };
} {
  if (version === REQUIRED_ORACLE_VERSION) return { compatible: true };
  const detected = version ? `detected ${version}` : 'could not detect a version';
  return {
    compatible: false,
    error: {
      code: 'ORACLE_VERSION_UNSUPPORTED',
      message: `oracle ${detected}; repo-harness requires exactly ${REQUIRED_ORACLE_VERSION}`,
      recovery: `Install or select @steipete/oracle@${REQUIRED_ORACLE_VERSION}, then rerun browser-doctor before a real consult.`,
    },
  };
}

function probeOracleVersion(binary: string): string | undefined {
  const versionRun = spawnSync(binary, ['--version'], { encoding: 'utf-8', timeout: 30_000, maxBuffer: 1024 * 1024 });
  return detectVersion(`${versionRun.stdout ?? ''}\n${versionRun.stderr ?? ''}`);
}

/**
 * Probe an oracle binary's help/version output to confirm it actually accepts
 * the flags we send. The probe is the readiness gate — version comparison alone
 * is not enough, because the binary may not support the browser-mode surface.
 */
export function probeOracle(binary: string): OracleProbe {
  const help = spawnSync(binary, ['--help'], { encoding: 'utf-8', timeout: 30_000, maxBuffer: 4 * 1024 * 1024 });
  const debugHelp = spawnSync(binary, ['--debug-help'], { encoding: 'utf-8', timeout: 30_000, maxBuffer: 4 * 1024 * 1024 });
  const helpText = `${help.stdout ?? ''}\n${help.stderr ?? ''}\n${debugHelp.stdout ?? ''}\n${debugHelp.stderr ?? ''}`;
  // `--version` is the compatibility authority. A help banner is not a valid
  // substitute: it can omit or embed unrelated version-like strings.
  const version = probeOracleVersion(binary);
  const ranOk = !help.error && (help.status === 0 || helpText.trim().length > 0);
  const browserThinkingTime = probeBrowserThinkingTime(binary);
  return {
    binary,
    version,
    versionCompatible: validateOracleVersion(version).compatible,
    nodeCompatible: ranOk,
    capabilities: detectCapabilities(helpText, browserThinkingTime),
    helpText,
  };
}

function probeBrowserThinkingTime(binary: string): boolean {
  const probeDir = mkdtempSync(join(tmpdir(), 'repo-harness-oracle-probe-'));
  try {
    const result = spawnSync(binary, [
      '--engine',
      'browser',
      '--browser-thinking-time',
      'heavy',
      '--dry-run',
      'json',
      '--prompt',
      'repo-harness parser probe',
    ], {
      cwd: probeDir,
      env: buildOracleEnv(probeDir),
      encoding: 'utf-8',
      timeout: 30_000,
      maxBuffer: 2 * 1024 * 1024,
    });
    const text = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    return !result.error && result.status === 0 && !/unknown option|error: option/i.test(text);
  } catch (_error) {
    return false;
  } finally {
    rmSync(probeDir, { recursive: true, force: true });
  }
}

/**
 * Build the oracle browser-mode command. All behavior is passed explicitly so we
 * never silently inherit `.oracle/config.json` defaults. `answerPath`, when given,
 * is oracle's authoritative `--write-output` answer file (an internal managed path,
 * distinct from the user's repo-relative `--write-output` copy-out).
 */
export function buildOracleCommand(input: BrowserConsultInput, answerPath?: string): string[] {
  const args = ['--engine', 'browser', '--browser-archive', 'never', '--prompt', input.prompt];
  if (answerPath) args.push('--write-output', answerPath);
  if (input.providerSessionId) args.push('--followup', input.providerSessionId);
  if (input.model) args.push('--model', input.model, '--browser-model-strategy', 'select');
  else args.push('--browser-model-strategy', 'current');
  if (input.thinking) args.push('--browser-thinking-time', input.thinking);
  if (input.chatgptApp) args.push('--browser-app', input.chatgptApp);
  if (input.chatgptUrl) args.push('--chatgpt-url', input.chatgptUrl);
  args.push('--heartbeat', String(input.heartbeatSeconds ?? 59));
  if (input.profileDir) {
    args.push('--copy-profile', input.profileDir);
    if (input.profileDirectory) args.push('--browser-chrome-profile', input.profileDirectory);
  }
  for (const file of input.files ?? []) args.push('--file', resolveOracleFilePath(input, file.path));
  for (const followup of input.followups ?? []) args.push('--browser-follow-up', followup);
  return args;
}

function resolveOracleFilePath(input: BrowserConsultInput, filePath: string): string {
  return isAbsolute(filePath) ? filePath : join(input.repoRoot, filePath);
}

function stageScanBoundOracleFiles(input: BrowserConsultInput, bundle: PromptBundle): {
  root: string;
  files: NonNullable<BrowserConsultInput['files']>;
} | undefined {
  if (input.requireSecretScan !== true || bundle.files.length === 0) return undefined;
  const root = mkdtempSync(join(tmpdir(), 'repo-harness-oracle-egress-'));
  try {
    const files = bundle.files.map((file) => {
      const target = resolve(root, file.path);
      const relativeTarget = relative(root, target);
      if (!relativeTarget || relativeTarget === '..' || relativeTarget.startsWith(`..${sep}`) || isAbsolute(relativeTarget)) {
        throw new Error(`PROMPT_BUNDLE_STAGING_FAILED: invalid scan-bound file path ${file.path}`);
      }
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, file.content, 'utf-8');
      const stagedBytes = readFileSync(target);
      const stagedHash = createHash('sha256').update(stagedBytes).digest('hex');
      if (stagedHash !== file.sha256) {
        throw new Error(`PROMPT_BUNDLE_STAGING_FAILED: staged bytes do not match the scanned bundle for ${file.path}`);
      }
      return { path: target, delivery: 'inline' as const };
    });
    return { root, files };
  } catch (error) {
    rmSync(root, { recursive: true, force: true });
    throw error;
  }
}

/**
 * Validate the bound Chrome profile against what `--copy-profile` needs: a real
 * Chrome user data directory, its `Local State`, and an explicitly named profile
 * subdirectory. Without the explicit name Oracle would fall back to `Local
 * State`'s `last_used` profile, which is not deterministic, so this fails closed
 * instead of guessing.
 */
export function validateOracleProfileBinding(
  input: Pick<BrowserConsultInput, 'profileDir' | 'profileDirectory'>,
): { message: string; recovery: string } | undefined {
  if (!input.profileDir) return undefined;
  const recovery = 'Re-run browser-setup against the signed-in Chrome user data directory with an explicit --profile-directory, or omit the profile binding only if you intentionally want Oracle to use its own browser session.';
  if (!directoryExists(input.profileDir)) {
    return { message: `Chrome user data directory for the selected ChatGPT profile is not a directory: ${input.profileDir}`, recovery };
  }
  const localState = join(input.profileDir, 'Local State');
  if (!regularFileExists(localState)) {
    return { message: `Chrome user data directory has no readable Local State file: ${localState}`, recovery };
  }
  if (!input.profileDirectory) {
    return {
      message: `ChatGPT profile binding for ${input.profileDir} names no Chrome profile directory; Oracle would pick the Local State last_used profile instead`,
      recovery,
    };
  }
  const selectedProfilePath = join(input.profileDir, input.profileDirectory);
  if (!directoryExists(selectedProfilePath)) {
    return { message: `Selected Chrome profile directory does not exist: ${selectedProfilePath}`, recovery };
  }
  return undefined;
}

function directoryExists(path: string): boolean {
  try {
    if (lstatSync(path).isSymbolicLink()) return false;
    return statSync(path).isDirectory();
  } catch (_error) {
    return false;
  }
}

function regularFileExists(path: string): boolean {
  try {
    if (lstatSync(path).isSymbolicLink()) return false;
    if (!statSync(path).isFile()) return false;
    accessSync(path, constants.R_OK);
    return true;
  } catch (_error) {
    return false;
  }
}

function resolveOracleHomeDir(input: BrowserConsultInput): string {
  return join(input.repoRoot, '.ai', 'harness', 'chatgpt', 'oracle-home');
}

function buildOracleEnv(oracleHomeDir: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('ORACLE_')) continue;
    env[key] = value;
  }
  env.ORACLE_HOME_DIR = oracleHomeDir;
  return env;
}

function extractConversationUrl(text: string): string | undefined {
  return text.match(/https:\/\/chatgpt\.com\/c\/[^\s)]+/)?.[0];
}

function extractProviderSessionId(text: string): string | undefined {
  return text.match(/\b(?:oracle[_ -]?session|session(?: id)?)[:=]\s*([A-Za-z0-9_.:-]+)/i)?.[1];
}

interface OracleProcessResult {
  stdout: string;
  stderr: string;
  status: number | null;
  signal: NodeJS.Signals | null;
  error?: Error;
}

function oracleProcessTreeSupportError(): { code: 'ORACLE_PROCESS_TREE_UNSUPPORTED'; message: string; recovery: string } | undefined {
  if (process.platform !== 'win32') return undefined;
  return {
    code: 'ORACLE_PROCESS_TREE_UNSUPPORTED',
    message: 'Oracle browser consults are unsupported on win32 because repo-harness cannot guarantee bounded process-tree termination.',
    recovery: 'Run the Oracle consult from a POSIX host where repo-harness can supervise the dedicated Oracle process group.',
  };
}

function signalOracleProcessGroup(pid: number | undefined, signal: NodeJS.Signals): Error | undefined {
  if (!pid) return new Error('oracle process did not report a PID for process-group supervision');
  try {
    process.kill(-pid, signal);
    return undefined;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return undefined;
    return error instanceof Error ? error : new Error(String(error));
  }
}

function runOracleProcess(
  binary: string,
  args: string[],
  opts: { cwd: string; env: NodeJS.ProcessEnv; timeoutMs: number },
): Promise<OracleProcessResult> {
  return new Promise((resolveResult) => {
    let stdout = '';
    let stderr = '';
    let spawnError: Error | undefined;
    let timedOut = false;
    let killTimer: NodeJS.Timeout | undefined;
    let settled = false;
    const child = spawn(binary, args, {
      cwd: opts.cwd,
      env: opts.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      // A fresh POSIX process group lets a timeout terminate Oracle wrappers and
      // their descendants together instead of leaving inherited pipes open.
      detached: true,
    });
    const collect = (chunk: Buffer | string, stream: 'stdout' | 'stderr') => {
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf-8');
      if (stream === 'stdout') stdout += text;
      else stderr += text;
      process.stderr.write(text);
    };
    const stopCollecting = () => {
      child.stdout?.removeListener('data', onStdout);
      child.stderr?.removeListener('data', onStderr);
      child.stdout?.destroy();
      child.stderr?.destroy();
    };
    const settle = (result: OracleProcessResult, destroyPipes = false) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (killTimer) clearTimeout(killTimer);
      child.removeListener('error', onError);
      child.removeListener('close', onClose);
      if (destroyPipes) stopCollecting();
      resolveResult(result);
    };
    const onStdout = (chunk: Buffer | string) => collect(chunk, 'stdout');
    const onStderr = (chunk: Buffer | string) => collect(chunk, 'stderr');
    const onError = (error: Error) => {
      spawnError = error;
      settle({ stdout, stderr, status: null, signal: null, error }, true);
    };
    const onClose = (status: number | null, signal: NodeJS.Signals | null) => {
      // A wrapper can exit from TERM before a SIGTERM-resistant descendant. Keep
      // the group watchdog alive until the bounded SIGKILL pass has completed.
      if (timedOut) return;
      settle({
        stdout,
        stderr,
        status,
        signal,
        error: spawnError ?? (timedOut ? new Error(`oracle timed out after ${opts.timeoutMs}ms`) : undefined),
      });
    };
    const timeout = setTimeout(() => {
      if (settled) return;
      timedOut = true;
      const termError = signalOracleProcessGroup(child.pid, 'SIGTERM');
      killTimer = setTimeout(() => {
        if (settled) return;
        const killError = signalOracleProcessGroup(child.pid, 'SIGKILL');
        settle({
          stdout,
          stderr,
          status: null,
          signal: 'SIGKILL',
          error: killError
            ? new Error(`oracle process-group forced termination failed: ${killError.message}`)
            : termError
              ? new Error(`oracle process-group termination failed: ${termError.message}`)
              : new Error(`oracle timed out after ${opts.timeoutMs}ms`),
        }, true);
      }, ORACLE_TERM_GRACE_MS);
    }, opts.timeoutMs);
    child.stdout?.setEncoding('utf-8');
    child.stderr?.setEncoding('utf-8');
    child.stdout?.on('data', onStdout);
    child.stderr?.on('data', onStderr);
    child.on('error', onError);
    child.on('close', onClose);
  });
}

export async function runOracleProvider(input: BrowserConsultInput, bundle: PromptBundle): Promise<OracleProviderResult> {
  const resolution = resolveOracleBin(input);
  if (input.sourceSessionId && !input.providerSessionId) {
    return {
      status: 'failed',
      output: `Oracle follow-up requires providerSessionId for source session ${input.sourceSessionId}.`,
      command: ['oracle', ...buildOracleCommand(input)],
      oracleBinary: resolution.binary,
      error: {
        code: 'ORACLE_PROVIDER_SESSION_MISSING',
        message: 'Oracle follow-up requires the upstream provider session id',
        recovery: 'Start from a session whose meta.json contains providerSessionId, or run a new browser consult.',
      },
    };
  }
  if (!resolution.binary) {
    return {
      status: 'failed',
      output: resolution.error?.message ?? 'Oracle CLI is not installed or not visible to repo-harness.',
      command: [input.oracleBin ?? process.env.REPO_HARNESS_ORACLE_BIN ?? 'oracle', ...buildOracleCommand(input)],
      error: {
        code: resolution.error?.code ?? 'ORACLE_NOT_INSTALLED',
        message: resolution.error?.message ?? 'oracle CLI could not be resolved via --oracle-bin, REPO_HARNESS_ORACLE_BIN, node_modules/.bin, or PATH',
        recovery: resolution.error?.recovery ?? 'Install oracle (pin the version; do not auto-download), or pass --oracle-bin / set REPO_HARNESS_ORACLE_BIN, or rerun with --dry-run.',
      },
    };
  }
  const resolvedOracleVersion = probeOracleVersion(resolution.binary);
  const versionValidation = validateOracleVersion(resolvedOracleVersion);
  if (!versionValidation.compatible) {
    return {
      status: 'failed',
      output: versionValidation.error!.message,
      command: [resolution.binary, ...buildOracleCommand(input)],
      oracleBinary: resolution.binary,
      oracleVersion: resolvedOracleVersion,
      error: versionValidation.error,
    };
  }
  const processTreeSupportError = oracleProcessTreeSupportError();
  if (processTreeSupportError) {
    return {
      status: 'failed',
      output: processTreeSupportError.message,
      command: [resolution.binary, ...buildOracleCommand(input)],
      oracleBinary: resolution.binary,
      oracleVersion: resolvedOracleVersion,
      error: processTreeSupportError,
    };
  }
  const oracleBinary = resolution.binary;
  let cachedProbe: OracleProbe | undefined;
  const probeResolvedOracle = (): OracleProbe => (cachedProbe ??= probeOracle(oracleBinary));
  if (input.chatgptApp) {
    if (!supportsBrowserAppPreselect(probeResolvedOracle().helpText)) {
      return {
        status: 'failed',
        output: `Oracle binary does not support ChatGPT app preselection for "${input.chatgptApp}".`,
        command: [oracleBinary, ...buildOracleCommand(input)],
        oracleBinary,
        oracleVersion: resolvedOracleVersion,
        error: {
          code: 'ORACLE_APP_PRESELECT_UNSUPPORTED',
          message: 'oracle binary did not report --browser-app support',
          recovery: 'Upgrade or point repo-harness at an Oracle binary that supports --browser-app, omit --chatgpt-app, or manually select the ChatGPT app in the composer before relying on MCP tools.',
        },
      };
    }
  }
  if (input.profileDir) {
    // The bound-profile transport is `--copy-profile` plus an explicit
    // `--browser-chrome-profile`. There is no second transport to fall back to,
    // so a binary without both flags fails before the prompt is submitted.
    const capabilities = probeResolvedOracle().capabilities;
    const missingTransportFlags = [
      ...(capabilities.copyProfile ? [] : ['--copy-profile']),
      ...(capabilities.browserChromeProfile ? [] : ['--browser-chrome-profile']),
    ];
    if (missingTransportFlags.length > 0) {
      const message = `oracle binary did not report ${missingTransportFlags.join(' and ')} support, which the bound ChatGPT profile transport requires`;
      return {
        status: 'failed',
        output: message,
        command: [oracleBinary, ...buildOracleCommand(input)],
        oracleBinary,
        oracleVersion: resolvedOracleVersion,
        error: {
          code: 'ORACLE_COPY_PROFILE_UNSUPPORTED',
          message,
          recovery: 'Upgrade or point repo-harness at an Oracle binary that supports --copy-profile and --browser-chrome-profile, then rerun browser-doctor --provider oracle --json.',
        },
      };
    }
    const bindingError = validateOracleProfileBinding(input);
    if (bindingError) {
      return {
        status: 'failed',
        output: bindingError.message,
        command: [oracleBinary, ...buildOracleCommand(input)],
        oracleBinary,
        oracleVersion: resolvedOracleVersion,
        error: {
          code: 'ORACLE_PROFILE_NOT_FOUND',
          message: bindingError.message,
          recovery: bindingError.recovery,
        },
      };
    }
  }
  const answerDir = mkdtempSync(join(tmpdir(), 'repo-harness-oracle-answer-'));
  const runCwd = mkdtempSync(join(tmpdir(), 'repo-harness-oracle-cwd-'));
  let egressRoot: string | undefined;
  try {
    const staged = stageScanBoundOracleFiles(input, bundle);
    egressRoot = staged?.root;
    const providerInput = input.requireSecretScan === true
      ? {
        ...input,
        prompt: bundle.prompt,
        followups: bundle.followups,
        files: staged?.files ?? [],
      }
      : input;
    const oracleHomeDir = resolveOracleHomeDir(input);
    mkdirSync(oracleHomeDir, { recursive: true });
    const answerPath = join(answerDir, 'answer.md');
    const args = buildOracleCommand(providerInput, answerPath);
    const command = [resolution.binary, ...args];
    const result = await runOracleProcess(resolution.binary, args, {
      cwd: runCwd,
      env: buildOracleEnv(oracleHomeDir),
      timeoutMs: input.timeoutMs ?? 1_800_000,
    });
    const stdout = result.stdout?.trimEnd() ?? '';
    const stderr = result.stderr?.trimEnd() ?? '';
    const log = [stdout, stderr ? `\n[stderr]\n${stderr}` : ''].filter(Boolean).join('\n').trimEnd();
    const oracleVersion = resolvedOracleVersion;
    const conversationUrl = extractConversationUrl(log);
    const providerSessionId = extractProviderSessionId(log);

    // A detached Oracle worker from an earlier run of the same prompt blocks the
    // new run. Reattaching or cleaning up is the user's call; repo-harness never
    // adds `--force` on its own because that would abandon a live session.
    if (log.includes(ORACLE_SESSION_ALREADY_RUNNING_MARKER)) {
      return {
        status: 'failed',
        output: log,
        command,
        oracleBinary: resolution.binary,
        oracleVersion,
        conversationUrl,
        providerSessionId,
        error: {
          code: 'ORACLE_SESSION_ALREADY_RUNNING',
          message: 'oracle refused the prompt because a session with the same prompt is already running',
          recovery: `Reattach to the running session with \`oracle session <id>\` under the repo-harness-controlled ORACLE_HOME_DIR (${oracleHomeDir}), or terminate the detached Oracle worker and its throwaway Chrome before retrying. repo-harness never adds \`--force\` on your behalf.`,
        },
      };
    }

    // Pre/at-start failures are safe to surface as failed; the prompt never landed.
    if (result.error) {
      return {
        status: 'failed',
        output: log || result.error.message,
        command,
        oracleBinary: resolution.binary,
        oracleVersion,
        error: { code: 'ORACLE_EXEC_FAILED', message: result.error.message },
      };
    }
    if (result.status !== 0) {
      return {
        status: 'failed',
        output: log || `oracle exited with status ${result.status ?? result.signal ?? 'unknown'}`,
        command,
        oracleBinary: resolution.binary,
        oracleVersion,
        conversationUrl,
        providerSessionId,
        error: { code: 'ORACLE_EXIT_NONZERO', message: `oracle exited with status ${result.status ?? result.signal ?? 'unknown'}` },
      };
    }

    // Authority is the --write-output answer file plus the terminal exit state.
    // stdout/stderr are diagnostics only. An empty/missing answer file on a clean
    // exit means oracle submitted but capture did not land: recoverable, NOT completed.
    const answer = existsSync(answerPath) ? readFileSync(answerPath, 'utf-8') : '';
    if (answer.trim().length === 0) {
      return {
        status: 'recoverable',
        output: [
          'Oracle exited successfully but produced no answer file.',
          'The prompt may have been submitted; do not auto-retry on another provider.',
          providerSessionId ? `Oracle session: ${providerSessionId}` : '',
          log ? `\n[log]\n${log}` : '',
        ].filter(Boolean).join('\n'),
        command,
        oracleBinary: resolution.binary,
        oracleVersion,
        conversationUrl,
        providerSessionId,
        error: {
          code: 'ORACLE_CAPTURE_INCOMPLETE',
          message: 'oracle returned no answer file; the prompt may already be submitted',
          recovery: 'Reconnect with browser-followup using the saved providerSessionId instead of re-sending the prompt.',
        },
      };
    }

    return {
      status: 'completed',
      output: answer.trimEnd(),
      conversationUrl,
      providerSessionId,
      oracleBinary: resolution.binary,
      oracleVersion,
      artifacts: [],
      command,
    };
  } finally {
    rmSync(answerDir, { recursive: true, force: true });
    rmSync(runCwd, { recursive: true, force: true });
    if (egressRoot) rmSync(egressRoot, { recursive: true, force: true });
  }
}
