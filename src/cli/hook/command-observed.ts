/**
 * Typed PostToolUse/Bash observer.
 *
 * The handler returns host output instead of writing to stdout or stderr
 * itself; the hook runtime owns host protocol shaping and telemetry.
 *
 * The exit status comes only from a safe-integer `exit_code` field. Pi sends
 * one; Claude and Codex send none, so their status is unknown and nothing is
 * recorded for it. A known failing test run feeds the RepairLimit circuit. A
 * publication command that is not known to fail reports owed architecture
 * updates.
 */

import { recordCircuitAttempt, type CircuitDecision } from './circuit-breaker';
import { payloadString, payloadValue, type HookPayload } from './hook-input';
import { resolveCapabilityOwnership, resolveEffectiveStateReadOnly } from '../../effects/state/resolve-effective-state';
import { owedCapabilities, renderOwedCapabilities } from '../../effects/state/owed-capabilities';

export interface CommandObservedDependencies {
  readonly recordCircuit?: typeof recordCircuitAttempt;
}

export interface CommandObservedInput {
  readonly repoRoot: string;
  readonly payload: HookPayload;
  readonly dependencies?: CommandObservedDependencies;
}

export interface CommandObservedResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly reason?: string;
}

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

/** The host exit status, or null when the payload carries no safe integer. */
function payloadExitCode(payload: HookPayload): number | null {
  const value = payload.exit_code;
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : null;
}

function failureSignal(output: string): boolean {
  if (!output) return false;
  return /(^|[\s])(FAIL|FAILED|failed)([\s:,:]|$)|Traceback|panic:|fatal:|error.*test/iu.test(output);
}

/**
 * The RepairLimit circuit for a known failing test run. The progress token
 * comes from a read-only state resolution, which takes no state lock and
 * writes nothing. Any error denies: the circuit cannot count without it.
 */
function circuitFailure(
  repoRoot: string,
  command: string,
  deps: CommandObservedDependencies,
): { readonly denied: boolean; readonly stderr: string } {
  try {
    const decision: CircuitDecision = (deps.recordCircuit ?? recordCircuitAttempt)(repoRoot, {
      kind: 'repair',
      guard: 'RepairLimit',
      reason: 'automatic repair loop cap',
      pathOrAction: command,
      progressToken: resolveEffectiveStateReadOnly(repoRoot).progress_token,
      fingerprint: `repair|${command}`,
    });
    return decision.allowed
      ? { denied: false, stderr: '' }
      : { denied: true, stderr: `${JSON.stringify(decision)}\n` };
  } catch (error) {
    return { denied: true, stderr: `[RepairLimit] ${error instanceof Error ? error.message : String(error)}\n` };
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
 * Before a pull request, a `git commit`, `git push` or `gh pr create` that is
 * not known to fail reports owed architecture updates. An unknown exit status
 * counts as not failed. Architecture diagnostics never block, so an ownership
 * or Git failure only drops the line.
 */
function publicationOwedSignal(repoRoot: string, command: string, exitCode: number | null): string {
  if ((exitCode !== null && exitCode !== 0) || !runsPublicationCommand(command)) return '';
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
  const deps = opts.dependencies ?? {};
  const payload = opts.payload;
  const command = payloadString(payload, 'tool_input.command');
  const exitCode = payloadExitCode(payload);

  let stdout = '';
  if (exitCode !== null && exitCode !== 0
    && failureSignal(outputText(toolResponseOutput(payloadValue(payload, 'tool_response') ?? '')))) {
    const circuit = circuitFailure(opts.repoRoot, command, deps);
    if (circuit.denied) return { exitCode: 2, stdout: '', stderr: circuit.stderr, reason: 'repair-circuit-tripped' };
    stdout += '[PostBash] Tests failed. Reminder: failure = rewrite module, not patching.\n';
  }

  stdout += publicationOwedSignal(opts.repoRoot, command, exitCode);
  return { exitCode: 0, stdout, stderr: '', reason: 'ok' };
}
