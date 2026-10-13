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
import { importPostBashObservation } from '../../effects/evidence/post-bash-importer';
import { resolveRunIdentity } from './run-identity';
import { resolveCapabilityOwnership } from '../../effects/state/resolve-effective-state';
import { owedCapabilities, renderOwedCapabilities } from '../../effects/state/owed-capabilities';

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

/**
 * `tool_response` is the only host field for the command result. Claude Code
 * sends Bash results as `{ stdout, stderr, interrupted, ... }`; the observed
 * output is both streams, in that order. Codex documents the field only as
 * the model-facing output, so a string is kept and any other shape is
 * serialized.
 */
function toolResponseOutput(response: unknown): unknown {
  if (!response || typeof response !== 'object' || Array.isArray(response)) return response;
  const { stdout, stderr } = response as { stdout?: unknown; stderr?: unknown };
  if (typeof stdout !== 'string' && typeof stderr !== 'string') return response;
  const out = typeof stdout === 'string' ? stdout : '';
  const err = typeof stderr === 'string' ? stderr : '';
  if (!out || !err) return out || err;
  return out.endsWith('\n') ? `${out}${err}` : `${out}\n${err}`;
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

function workflowProfile(env: NodeJS.ProcessEnv): 'routine' | 'high' {
  const profile = env.REPO_HARNESS_WORKFLOW_PROFILE;
  return profile === 'routine' || profile === 'high' ? profile : 'routine';
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

// `git -h` global options that take the next word as their value. The long
// ones also accept `--option=value`. Every other leading `-` word is a flag.
const GIT_OPTIONS_WITH_VALUE: ReadonlySet<string> = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--config-env']);

/** Shell words of one command line, split into simple commands at `;`, `&`, `|`, `(`, `)` and newlines. */
function simpleCommands(command: string): string[][] {
  const commands: string[][] = [[]];
  let word: string | null = null;
  let quote: '"' | "'" | null = null;
  const endWord = () => { if (word !== null) commands.at(-1)!.push(word); word = null; };
  for (const char of command) {
    if (quote) {
      if (char === quote) quote = null;
      else word = (word ?? '') + char;
    } else if (char === '"' || char === "'") {
      quote = char;
      word = word ?? '';
    } else if (/\s/u.test(char) && char !== '\n') {
      endWord();
    } else if (';&|()\n'.includes(char)) {
      endWord();
      commands.push([]);
    } else {
      word = (word ?? '') + char;
    }
  }
  endWord();
  return commands.filter((words) => words.length > 0);
}

/** True for `git [global options] commit|push` and `gh pr create`, after leading `NAME=value` words. */
function isPublicationCommand(words: readonly string[]): boolean {
  let index = 0;
  while (index < words.length && /^[A-Za-z_][A-Za-z0-9_]*=/u.test(words[index]!)) index += 1;
  const program = words[index];
  if (program === 'gh') return words[index + 1] === 'pr' && words[index + 2] === 'create';
  if (program !== 'git') return false;
  index += 1;
  while (index < words.length && words[index]!.startsWith('-')) {
    index += GIT_OPTIONS_WITH_VALUE.has(words[index]!) ? 2 : 1;
  }
  return words[index] === 'commit' || words[index] === 'push';
}

/**
 * Before a pull request, a successful `git commit`, `git push` or `gh pr
 * create` reports owed architecture updates. Architecture diagnostics never
 * block, so an ownership or Git failure only drops the line.
 */
function publicationOwedSignal(repoRoot: string, command: string, exitCode: number | null): string {
  if (exitCode !== 0 || !runsPublicationCommand(command)) return '';
  try {
    const ownership = resolveCapabilityOwnership(repoRoot);
    const content = ownership ? renderOwedCapabilities(owedCapabilities(repoRoot, ownership)) : null;
    return content ? `${content}\n` : '';
  } catch {
    return '';
  }
}

/** Whether a shell command line runs `git commit`, `git push` or `gh pr create` in any simple command. */
export function runsPublicationCommand(command: string): boolean {
  return simpleCommands(command).some(isPublicationCommand);
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
  const toolOutput = outputText(toolResponseOutput(parsed.get('.tool_response', '')));
  // post-bash.sh reads the top-level exit_code (its host adapter historically
  // passes this field separately from the trace observer's tool_response).
  const piExitCode = (parsed.value as { exit_code?: unknown } | null)?.exit_code;
  const exitCode = env.HOOK_HOST === 'pi' && (typeof piExitCode !== 'number' || !Number.isSafeInteger(piExitCode))
    ? null : numberValue(parsed.get('.exit_code', env.EXIT_CODE ?? '0'), 0);
  const lines = outputLineCount(toolOutput);
  const bytes = Buffer.byteLength(toolOutput, 'utf8');
  const broad = broadCommand(command);
  const failed = failureSignal(toolOutput);
  const rtkAvailable = (deps.hasExecutable ?? ((name: string) => executable(name, env)))('rtk');
  const longLines = 200;
  const longBytes = 32768;
  let verbosity: 'inline' | 'failure' | 'long' = 'inline';
  let suggestedRunner: 'inline' | 'raw' | 'rtk' = 'inline';
  if (exitCode !== null && exitCode !== 0) {
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
    if (exitCode !== null && exitCode !== 0 && failed) {
      const circuit = circuitFailure(opts.repoRoot, env, fsApi, command, deps);
      if (circuit.denied) return { exitCode: 2, stdout: '', stderr: `${warnings()}${circuit.stderr}`, reason: 'repair-circuit-tripped' };
      stdout += '[PostBash] Tests failed. Reminder: failure = rewrite module, not patching.\n';
    }

    const postBashRelative = '.ai/harness/checks/post-bash-latest.json';
    fsApi.mkdirSync(dirname(join(opts.repoRoot, postBashRelative)), { recursive: true });
    const record = {
      source: 'post-bash',
      command,
      exit_code: exitCode,
      status: exitCode === null ? 'unknown' : exitCode === 0 ? 'pass' : 'fail',
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
    // No [ChecksFile] stdout notice here: hosts forward hook stdout into agent
    // context, so a fixed per-command status line is pure token noise. The
    // checks files are contract-documented state; consumers read the paths
    // from .ai/harness/policy.json, not from per-call output.

    // Additive ledger import (EPC-03): one `observed` EvidenceEvent per
    // observation, after the post-bash-latest.json write above. Failure
    // semantics match this function's existing catch-all exactly -- a
    // thrown message is caught by the same `catch` below and produces the
    // same exitCode 1 / reason 'write-failed' envelope as any other
    // failure in this try block; no new fallback, no new severity.
    const durationMs = numberValue(parsed.get('.duration_ms', parsed.get('.tool_response.duration_ms', env.HOOK_DURATION_MS ?? '0')), 0);
    // Unified run-identity resolution (payload -> HOOK_RUN_ID -> CODEX_RUN_ID
    // -> CLAUDE_RUN_ID -> session-state lookup by session_id -> null). When a
    // session-scoped run identity is resolvable, it is threaded through so
    // this hook-path write never relies on the writer's own
    // `run-${Date.now()}` self-mint; only a fully unresolvable case (no
    // session ever started) reaches that pre-existing fallback.
    const runIdentity = resolveRunIdentity(
      opts.repoRoot,
      { session_id: parsed.get('.session_id'), run_id: parsed.get('.run_id') },
      env,
    );
    if (exitCode !== null) {
      const importResult = importPostBashObservation({
        repoRoot: opts.repoRoot,
        command,
        exitCode,
        durationMs,
        rawOutputPath: rawPath,
        correlationRunId: runIdentity.runId ?? undefined,
      });
      if (!importResult.ok) {
        throw new Error(`ledger import failed (${importResult.reason}): ${importResult.message}`);
      }
    }

    stdout += publicationOwedSignal(opts.repoRoot, command, exitCode);
    return { exitCode: 0, stdout, stderr: warnings(), reason: 'ok' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { exitCode: 1, stdout: '', stderr: `${warnings()}[PostBash] ${message}\n`, reason: 'write-failed' };
  }
}
