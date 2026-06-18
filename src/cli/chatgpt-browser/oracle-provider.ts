import { spawn, spawnSync } from 'child_process';
import { accessSync, constants, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { isAbsolute, join, resolve } from 'path';
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
  browserThinkingTime: boolean;
  chatgptUrl: boolean;
  heartbeat: boolean;
}

export interface OracleProbe {
  binary: string;
  version?: string;
  /** True when the binary responded to a `--help`/`--version` probe at all. */
  nodeCompatible: boolean;
  capabilities: OracleCapabilities;
  helpText: string;
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
    browserThinkingTime,
    chatgptUrl: has('--chatgpt-url'),
    heartbeat: has('--heartbeat'),
  };
}

function detectVersion(text: string): string | undefined {
  return text.match(/\b\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?\b/)?.[0];
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
  const versionRun = spawnSync(binary, ['--version'], { encoding: 'utf-8', timeout: 30_000, maxBuffer: 1024 * 1024 });
  const versionText = `${versionRun.stdout ?? ''}\n${versionRun.stderr ?? ''}`;
  const ranOk = !help.error && (help.status === 0 || helpText.trim().length > 0);
  const browserThinkingTime = probeBrowserThinkingTime(binary);
  return {
    binary,
    version: detectVersion(versionText) ?? detectVersion(helpText),
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
  if (input.chatgptUrl) args.push('--chatgpt-url', input.chatgptUrl);
  args.push('--heartbeat', String(input.heartbeatSeconds ?? 59));
  const cookiePath = resolveOracleCookiePath(input);
  if (cookiePath) args.push('--browser-cookie-path', cookiePath);
  for (const file of input.files ?? []) args.push('--file', resolveOracleFilePath(input, file.path));
  for (const followup of input.followups ?? []) args.push('--browser-follow-up', followup);
  return args;
}

function resolveOracleFilePath(input: BrowserConsultInput, filePath: string): string {
  return isAbsolute(filePath) ? filePath : join(input.repoRoot, filePath);
}

export function resolveOracleCookiePath(input: Pick<BrowserConsultInput, 'profileDir' | 'profileDirectory'>): string | undefined {
  if (!input.profileDir) return undefined;
  const selectedProfilePath = input.profileDirectory
    ? join(input.profileDir, input.profileDirectory)
    : input.profileDir;
  const candidates = [
    join(selectedProfilePath, 'Network', 'Cookies'),
    join(selectedProfilePath, 'Cookies'),
  ];
  return candidates.find((candidate) => regularFileExists(candidate));
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
    const child = spawn(binary, args, {
      cwd: opts.cwd,
      env: opts.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      killTimer = setTimeout(() => child.kill('SIGKILL'), 5_000);
    }, opts.timeoutMs);
    const collect = (chunk: Buffer | string, stream: 'stdout' | 'stderr') => {
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf-8');
      if (stream === 'stdout') stdout += text;
      else stderr += text;
      process.stderr.write(text);
    };
    child.stdout?.setEncoding('utf-8');
    child.stderr?.setEncoding('utf-8');
    child.stdout?.on('data', (chunk) => collect(chunk, 'stdout'));
    child.stderr?.on('data', (chunk) => collect(chunk, 'stderr'));
    child.on('error', (error) => {
      spawnError = error;
    });
    child.on('close', (status, signal) => {
      clearTimeout(timeout);
      if (killTimer) clearTimeout(killTimer);
      resolveResult({
        stdout,
        stderr,
        status,
        signal,
        error: spawnError ?? (timedOut ? new Error(`oracle timed out after ${opts.timeoutMs}ms`) : undefined),
      });
    });
  });
}

export async function runOracleProvider(input: BrowserConsultInput, _bundle: PromptBundle): Promise<OracleProviderResult> {
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
  if (input.profileDir && !resolveOracleCookiePath(input)) {
    const selectedProfilePath = input.profileDirectory
      ? join(input.profileDir, input.profileDirectory)
      : input.profileDir;
    return {
      status: 'failed',
      output: `Oracle could not find a Chrome cookie database for the selected ChatGPT profile: ${selectedProfilePath}`,
      command: [resolution.binary, ...buildOracleCommand(input)],
      oracleBinary: resolution.binary,
      error: {
        code: 'ORACLE_PROFILE_COOKIE_NOT_FOUND',
        message: 'Oracle could not find a Chrome cookie database for the selected ChatGPT profile',
        recovery: 'Re-run browser-setup with the correct Chrome profile directory, or omit the profile binding only if you intentionally want Oracle to use its own browser session.',
      },
    };
  }
  const answerDir = mkdtempSync(join(tmpdir(), 'repo-harness-oracle-answer-'));
  const runCwd = mkdtempSync(join(tmpdir(), 'repo-harness-oracle-cwd-'));
  const oracleHomeDir = resolveOracleHomeDir(input);
  mkdirSync(oracleHomeDir, { recursive: true });
  const answerPath = join(answerDir, 'answer.md');
  const args = buildOracleCommand(input, answerPath);
  const command = [resolution.binary, ...args];
  try {
    const result = await runOracleProcess(resolution.binary, args, {
      cwd: runCwd,
      env: buildOracleEnv(oracleHomeDir),
      timeoutMs: input.timeoutMs ?? 1_800_000,
    });
    const stdout = result.stdout?.trimEnd() ?? '';
    const stderr = result.stderr?.trimEnd() ?? '';
    const log = [stdout, stderr ? `\n[stderr]\n${stderr}` : ''].filter(Boolean).join('\n').trimEnd();
    const oracleVersion = detectVersion(`${stdout}\n${stderr}`);
    const conversationUrl = extractConversationUrl(log);
    const providerSessionId = extractProviderSessionId(log);

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
  }
}
