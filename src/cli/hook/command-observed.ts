/**
 * Typed PostToolUse/Bash observer.
 *
 * This is the in-process authority for the former `post-bash.sh` route.  The
 * handler deliberately returns host output instead of writing to stdout or
 * stderr itself; the hook runtime owns host protocol shaping and telemetry.
 */

import { accessSync, constants, existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'fs';
import { createHash } from 'crypto';
import { join, dirname } from 'path';
import { recordCircuitAttempt, type CircuitDecision } from './circuit-breaker';
import { parseHookInput, type HookInputFs } from './hook-input';

export interface CommandObservedFs extends HookInputFs {
  mkdirSync(path: string, options?: { readonly recursive?: boolean }): void;
  writeFileSync(path: string, data: string): void;
}

export interface CommandObservedDependencies {
  readonly fs?: CommandObservedFs;
  readonly now?: () => Date;
  readonly hasExecutable?: (name: string) => boolean;
  readonly recordCircuit?: typeof recordCircuitAttempt;
}

export interface CommandObservedInput {
  readonly repoRoot: string;
  readonly input?: string | Buffer;
  readonly env?: NodeJS.ProcessEnv;
  readonly dependencies?: CommandObservedDependencies;
}

export interface CommandObservedResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly reason?: string;
}

const DEFAULT_FS: CommandObservedFs = {
  existsSync,
  readFileSync: (path, encoding) => readFileSync(path, encoding),
  realpathSync,
  statSync,
  mkdirSync: (path, options) => mkdirSync(path, options),
  writeFileSync: (path, data) => writeFileSync(path, data),
};

function outputText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  try { return JSON.stringify(value); } catch { return String(value); }
}

function numberValue(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string' && /^-?\d+$/u.test(value.trim())) return Number.parseInt(value.trim(), 10);
  return fallback;
}

function outputLineCount(output: string): number {
  if (!output) return 0;
  const lines = output.split('\n');
  return output.endsWith('\n') ? lines.length - 1 : lines.length;
}

function failureSignal(output: string): boolean {
  if (!output) return false;
  return /(^|[\s])(FAIL|FAILED|failed)([\s:,:]|$)|Traceback|panic:|fatal:|error.*test/iu.test(output);
}

function broadCommand(command: string): boolean {
  const trimmed = command.trim();
  if (!trimmed) return false;
  if (/(^|[;&|]\s*)find\s+\.\/?(?:\s|$)/u.test(trimmed)) return true;
  if (/(^|[;&|]\s*)ls\s+-[^;&|]*R/u.test(trimmed)) return true;
  if (/^\s*rg(?:\s+-[-A-Za-z0-9_=]+)*\s+[^\s]+\s*$/u.test(trimmed)) return true;
  if (/^\s*grep\s+-[A-Za-z]*R[A-Za-z]*(?:\s+-[-A-Za-z0-9_=]+)*\s+[^\s]+\s*$/u.test(trimmed)
      || /^\s*grep\s+-[A-Za-z]*r[A-Za-z]*(?:\s+-[-A-Za-z0-9_=]+)*\s+[^\s]+\s*$/u.test(trimmed)) return true;
  if (/(^|[;&|]\s*)cat\s+([^;&|]*[*?][^;&|]*|\.\/?(?:\s|$)|[^;&|]*\s[^;&|]*\s[^;&|]*)/u.test(trimmed)) return true;
  return false;
}

function executable(name: string, env: NodeJS.ProcessEnv): boolean {
  const pathValue = env.PATH ?? process.env.PATH ?? '';
  for (const directory of pathValue.split(':')) {
    if (!directory) continue;
    try { accessSync(join(directory, name), constants.X_OK); return true; } catch { /* next PATH entry */ }
  }
  return false;
}

function policyRunsDir(repoRoot: string, fsApi: CommandObservedFs): string {
  const policyPath = join(repoRoot, '.ai/harness/policy.json');
  try {
    const parsed = JSON.parse(fsApi.readFileSync(policyPath, 'utf8')) as {
      harness?: { runs_dir?: unknown };
    };
    const configured = parsed.harness?.runs_dir;
    if (typeof configured === 'string' && configured.startsWith('.ai/harness/')) return configured;
  } catch { /* default workflow surface */ }
  return '.ai/harness/runs';
}

function timestamp(now: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}T${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function offsetTimestamp(now: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  const offset = -now.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const minutes = Math.abs(offset);
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}${sign}${pad(Math.floor(minutes / 60))}${pad(minutes % 60)}`;
}

function workflowProfile(env: NodeJS.ProcessEnv): 'lite' | 'standard' | 'strict' {
  const profile = env.REPO_HARNESS_WORKFLOW_PROFILE;
  return profile === 'lite' || profile === 'strict' ? profile : 'standard';
}

function progressToken(repoRoot: string, fsApi: CommandObservedFs): string {
  try {
    const parsed = JSON.parse(fsApi.readFileSync(join(repoRoot, '.ai/harness/state/effective.json'), 'utf8')) as { progress_token?: unknown };
    return typeof parsed.progress_token === 'string' && parsed.progress_token ? parsed.progress_token : 'unknown';
  } catch { return 'unknown'; }
}

function circuitFailure(
  repoRoot: string,
  env: NodeJS.ProcessEnv,
  fsApi: CommandObservedFs,
  command: string,
  deps: CommandObservedDependencies,
): { readonly denied: boolean; readonly stderr: string } {
  const attempt = {
    kind: 'repair' as const,
    guard: 'RepairLimit',
    reason: 'automatic repair loop cap',
    pathOrAction: command,
    progressToken: progressToken(repoRoot, fsApi),
    fingerprint: `repair|${command}`,
    profile: workflowProfile(env),
  };
  try {
    const decision: CircuitDecision = (deps.recordCircuit ?? recordCircuitAttempt)(repoRoot, attempt);
    return decision.allowed
      ? { denied: false, stderr: '' }
      : { denied: true, stderr: `${JSON.stringify(decision)}\n` };
  } catch (error) {
    return { denied: true, stderr: `${String(error instanceof Error ? error.message : error)}\n` };
  }
}

export function runCommandObserved(opts: CommandObservedInput): CommandObservedResult {
  const env = opts.env ?? process.env;
  const deps = opts.dependencies ?? {};
  const fsApi = deps.fs ?? DEFAULT_FS;
  const now = (deps.now ?? (() => new Date()))();
  const parsed = parseHookInput(opts.input, { env, repoRoot: opts.repoRoot });
  // Hook input parsing is lazy; accessors add warnings on first use.
  const warnings = (): string => parsed.warnings.length > 0 ? `${parsed.warnings.join('\n')}\n` : '';
  const command = parsed.getString('.tool_input.command', '');
  const rawToolOutput = env.TOOL_OUTPUT ? env.TOOL_OUTPUT : parsed.get('.tool_output', '');
  const toolOutput = outputText(rawToolOutput);
  // post-bash.sh reads the top-level exit_code (its host adapter historically
  // passes this field separately from the trace observer's tool_response).
  const exitCode = numberValue(parsed.get('.exit_code', env.EXIT_CODE ?? '0'), 0);
  const lines = outputLineCount(toolOutput);
  const bytes = Buffer.byteLength(toolOutput, 'utf8');
  const broad = broadCommand(command);
  const failed = failureSignal(toolOutput);
  const rtkAvailable = (deps.hasExecutable ?? ((name: string) => executable(name, env)))('rtk');
  const longLines = 200;
  const longBytes = 32768;
  let verbosity: 'inline' | 'failure' | 'long' = 'inline';
  let suggestedRunner: 'inline' | 'raw' | 'rtk' = 'inline';
  if (exitCode !== 0) {
    verbosity = 'failure';
    suggestedRunner = 'raw';
  } else if (lines >= longLines || bytes >= longBytes) {
    verbosity = 'long';
    suggestedRunner = broad && rtkAvailable ? 'rtk' : 'raw';
  }

  let rawPath: string | null = null;
  let rawSha: string | null = null;
  try {
    if (verbosity !== 'inline') {
      rawSha = createHash('sha256').update(toolOutput).digest('hex');
      const outputDir = join(opts.repoRoot, policyRunsDir(opts.repoRoot, fsApi), 'bash-output');
      fsApi.mkdirSync(outputDir, { recursive: true });
      rawPath = `${policyRunsDir(opts.repoRoot, fsApi)}/bash-output/post-bash-${timestamp(now)}-${process.pid}-${rawSha.slice(0, 12)}.log`;
      fsApi.writeFileSync(join(opts.repoRoot, rawPath), toolOutput);
    }

    let stdout = '';
    if (exitCode !== 0 && failed) {
      const circuit = circuitFailure(opts.repoRoot, env, fsApi, command, deps);
      if (circuit.denied) return { exitCode: 2, stdout: '', stderr: `${warnings()}${circuit.stderr}`, reason: 'repair-circuit-tripped' };
      stdout += '[PostBash] Tests failed. Reminder: failure = rewrite module, not patching.\n';
    }

    const checksRelative = '.ai/harness/checks/latest.json';
    const postBashRelative = '.ai/harness/checks/post-bash-latest.json';
    const checksPath = join(opts.repoRoot, checksRelative);
    fsApi.mkdirSync(dirname(join(opts.repoRoot, postBashRelative)), { recursive: true });
    const record = {
      source: 'post-bash',
      command,
      exit_code: exitCode,
      status: exitCode === 0 ? 'pass' : 'fail',
      broad_command: broad,
      output_line_count: lines,
      verbosity_class: verbosity,
      suggested_runner: suggestedRunner,
      raw_output_path: rawPath,
      raw_output_bytes: bytes,
      raw_output_sha256: rawSha,
      failure_signal: failed,
      rtk_available: rtkAvailable,
      recommended_next_tool: broad ? 'codegraph_context' : '',
      generated_at: offsetTimestamp(now),
    };
    fsApi.writeFileSync(join(opts.repoRoot, postBashRelative), `${JSON.stringify(record, null, 2)}\n`);
    if (fsApi.existsSync(checksPath)) {
      stdout += `[ChecksFile] Preserved ${checksRelative}; updated ${postBashRelative}.\n`;
    } else {
      stdout += `[ChecksFile] Updated ${postBashRelative}; ${checksRelative} remains reserved for repo-harness-run-trace.v1.\n`;
    }
    return { exitCode: 0, stdout, stderr: warnings(), reason: 'ok' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { exitCode: 1, stdout: '', stderr: `${warnings()}[PostBash] ${message}\n`, reason: 'write-failed' };
  }
}
