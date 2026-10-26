import { createHash, randomUUID } from 'crypto';
import { accessSync, constants, statSync } from 'fs';
import { performance } from 'perf_hooks';
import { delimiter, isAbsolute, join } from 'path';
import type { HookIdentity } from './hook-input';
import type { HookEvent, RouteHost, RouteId } from './route-registry';
import { appendSegmentedLog } from '../../effects/segmented-log';

export const HOOK_EVENT_TELEMETRY_PROTOCOL = 'loop-engine-hook-event/v2' as const;
export const HOOK_EVENT_TELEMETRY_PATH = '.ai/harness/runs/hook-events.jsonl';

/**
 * One record per handled hook event. Telemetry is not an authority: the
 * profile benchmark reads `elapsed_ms`, `blocked` and `fingerprint`, and no
 * hook decision reads it back.
 */
export interface HookEventTelemetryRecord {
  readonly protocol: typeof HOOK_EVENT_TELEMETRY_PROTOCOL;
  readonly event_id: string;
  readonly started_at: string;
  readonly completed_at: string;
  readonly host: RouteHost;
  readonly session_id: string | null;
  readonly run_id: string | null;
  readonly turn_id: string | null;
  readonly event: HookEvent;
  readonly route_id: RouteId;
  readonly exit_code: number;
  /** True only for exit 2 or a deny decision. */
  readonly blocked: boolean;
  /** `handler-failed` only for a throw; `blocked` for a policy block. */
  readonly reason: string;
  readonly elapsed_ms: number;
  readonly fingerprint: string;
  /**
   * Program names of a shell tool call, e.g. `["git", "gh"]`; empty for other
   * events. Never arguments: the CLI inventory reads only names and times.
   */
  readonly command_names: readonly string[];
}

export interface HookEventTelemetryResult {
  readonly identity: HookIdentity;
  readonly exitCode: number;
  readonly blocked: boolean;
  readonly reason: string;
  /** The tool call's raw shell command; omit for other events. Only names on the hook PATH are recorded. */
  readonly command?: string;
}

export interface HookEventTelemetry {
  finalize(result: HookEventTelemetryResult): HookEventTelemetryRecord;
}

export interface CreateHookEventTelemetryInput {
  readonly repoRoot: string;
  readonly event: HookEvent;
  readonly routeId: RouteId;
  /** The hook process PATH; without it no command name is recorded. */
  readonly pathValue?: string;
}

const COMMAND_NAME = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/u;
const COMMAND_NAME_LIMIT = 16;
/** Words that run the next word as the program. */
const COMMAND_PREFIXES = new Set(['sudo', 'env', 'exec', 'time', 'command', 'nohup', 'xargs']);

/** A word that held quoted or escaped text; it can never pass COMMAND_NAME. */
const QUOTED = '\u0000';

/** The heredoc delimiter forms the scanner models: `NAME`, `'NAME'`, `"NAME"` and `\NAME`. */
const HEREDOC_TOKEN = /^(?:'([A-Za-z0-9_.-]+)'|"([A-Za-z0-9_.-]+)"|\\([A-Za-z0-9_.-]+)|([A-Za-z0-9_.-]+))(?=[\s;|&()<>]|$)/u;
/** Command words whose syntax the scanner does not model. */
const UNMODELED_COMMANDS = new Set(['case', '[[']);
/** A word that `(` may follow: `$(`, `NAME=$(`, `<(` and `>(`. */
const SUBSTITUTION_OPENERS = /^(?:[$<>]|[A-Za-z_][A-Za-z0-9_]*=\$)$/u;
/** A word before the program: an assignment or a runner prefix. */
const isPrefixWord = (word: string): boolean => /^[A-Za-z_][A-Za-z0-9_]*=/u.test(word) || COMMAND_PREFIXES.has(word);

/**
 * Words of each simple command in a shell line. Separators (`;`, `|`, `&`,
 * `(`, `)`, backtick, newline) split only outside quotes, `#` at a word start
 * comments out the rest of the line, and heredoc bodies are skipped. The scan
 * fails closed: at a construct it does not model it stops and drops the rest
 * of the text, because a heredoc body or a quoted value can continue past the
 * next newline. Names found before the stop stay. Unmodeled: an unterminated
 * quote or heredoc; `$(`, `${` or a backtick inside double quotes; `${`, `$((`
 * and `$'` outside them; a heredoc delimiter other than `NAME`, `'NAME'`,
 * `"NAME"` or `\NAME`; `case` or `[[` as the command; `(` after a word other
 * than `$`, `NAME=$`, `<` or `>` (`NAME=(`, extglob `@(`), or after the first word of a
 * command (zsh `ls (a|b)`, `f () {`).
 */
function shellSegments(command: string): string[][] {
  const segments: string[][] = [];
  let words: string[] = [];
  let word = '';
  let quoted = false;
  let heredocs: { delimiter: string; strip: boolean }[] = [];
  let halted = false;
  const endWord = () => {
    if (!quoted && UNMODELED_COMMANDS.has(word) && words.every(isPrefixWord)) halted = true;
    else if (word !== '' || quoted) words.push(quoted ? `${QUOTED}${word}` : word);
    word = '';
    quoted = false;
  };
  const endSegment = () => {
    endWord();
    if (words.length > 0) segments.push(words);
    words = [];
  };
  const stop = () => {
    word = '';
    quoted = false;
  };
  let i = 0;
  scan: while (i < command.length && !halted) {
    const c = command[i]!;
    if (c === '$' && (command.startsWith('${', i) || command.startsWith('$((', i) || command.startsWith("$'", i))) {
      stop();
      break;
    } else if (c === '#' && word === '' && !quoted) {
      const lineEnd = command.indexOf('\n', i);
      i = lineEnd === -1 ? command.length : lineEnd;
    } else if (c === '(' && (quoted || (word !== '' && !SUBSTITUTION_OPENERS.test(word)) || (word === '' && words.length > 0))) {
      stop();
      break;
    } else if (c === '\\') {
      word += command[i + 1] ?? '';
      quoted = true;
      i += 2;
    } else if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < command.length && command[j] !== c) {
        if (c === '"' && (command.startsWith('$(', j) || command.startsWith('${', j) || command[j] === '`')) {
          stop();
          break scan;
        }
        j += c === '"' && command[j] === '\\' ? 2 : 1;
      }
      if (j >= command.length) { stop(); break; }
      word += command.slice(i + 1, j);
      quoted = true;
      i = j + 1;
    } else if (command.startsWith('<<<', i)) {
      endWord();
      i += 3;
    } else if (command.startsWith('<<', i)) {
      endWord();
      let j = i + 2;
      const strip = command[j] === '-';
      if (strip) j += 1;
      while (command[j] === ' ' || command[j] === '\t') j += 1;
      const token = HEREDOC_TOKEN.exec(command.slice(j));
      if (token === null) {
        stop();
        break;
      }
      heredocs.push({ delimiter: token[1] ?? token[2] ?? token[3] ?? token[4]!, strip });
      i = j + token[0].length;
    } else if (c === '\n') {
      endSegment();
      i += 1;
      for (const heredoc of heredocs) {
        for (;;) {
          if (i >= command.length) break scan;
          const lineEnd = command.indexOf('\n', i) === -1 ? command.length : command.indexOf('\n', i);
          const line = command.slice(i, lineEnd);
          i = lineEnd + 1;
          if ((heredoc.strip ? line.replace(/^\t+/u, '') : line) === heredoc.delimiter) break;
        }
      }
      heredocs = [];
    } else if (c === '&' && (command[i - 1] === '>' || command[i - 1] === '<' || command[i + 1] === '>')) {
      // `2>&1`, `&>file`: a redirection, not a separator.
      word += c;
      i += 1;
    } else if (';|&()`'.includes(c)) {
      endSegment();
      i += 1;
    } else if (/\s/u.test(c)) {
      endWord();
      i += 1;
    } else {
      word += c;
      i += 1;
    }
  }
  endSegment();
  return segments;
}

/**
 * Program names in a shell command line: the first word of each simple
 * command, after `NAME=value` assignments and runner prefixes. A word with
 * quoted text, `$`, globs or a `/` is dropped: a command given by path is not
 * counted.
 */
export function commandNames(command: string): string[] {
  const names = new Set<string>();
  for (const words of shellSegments(command)) {
    let index = 0;
    while (index < words.length && isPrefixWord(words[index]!)) index += 1;
    const word = words[index];
    if (word !== undefined && COMMAND_NAME.test(word)) names.add(word);
    if (names.size === COMMAND_NAME_LIMIT) break;
  }
  return [...names];
}

function isExecutableFile(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/**
 * `commandNames` reduced to executables found in an absolute directory of
 * `pathValue` (the hook process PATH). This is the privacy boundary, and only
 * `finalize` calls it: the scanner cannot model all shell syntax, but a data
 * word such as a token is not an executable on PATH, so it never reaches the
 * log. The CLI inventory matches the names only against installed CLIs, so it
 * loses nothing it reads. The check stats each candidate name; it never lists
 * a directory.
 */
function commandNamesOnPath(command: string, pathValue: string | undefined): string[] {
  const dirs = (pathValue ?? '').split(delimiter).filter(dir => isAbsolute(dir));
  return commandNames(command).filter(name => dirs.some(dir => isExecutableFile(join(dir, name))));
}

function roundMs(value: number): number {
  return Math.max(0, Math.round(value * 100) / 100);
}

export function createHookEventTelemetry(options: CreateHookEventTelemetryInput): HookEventTelemetry {
  const startedAt = new Date();
  const startedMonotonic = performance.now();
  return {
    finalize(result): HookEventTelemetryRecord {
      const unsigned = {
        protocol: HOOK_EVENT_TELEMETRY_PROTOCOL,
        event_id: randomUUID(),
        started_at: startedAt.toISOString(),
        completed_at: new Date().toISOString(),
        host: result.identity.host,
        session_id: result.identity.sessionId,
        run_id: result.identity.runId,
        turn_id: result.identity.turnId,
        event: options.event,
        route_id: options.routeId,
        exit_code: result.exitCode,
        blocked: result.blocked,
        reason: result.reason,
        elapsed_ms: roundMs(performance.now() - startedMonotonic),
        command_names: commandNamesOnPath(result.command ?? '', options.pathValue),
      };
      const semanticFingerprint = {
        event: options.event,
        route_id: options.routeId,
        exit_code: result.exitCode,
        blocked: result.blocked,
        reason: result.reason,
      };
      const record: HookEventTelemetryRecord = {
        ...unsigned,
        fingerprint: `sha256:${createHash('sha256').update(JSON.stringify(semanticFingerprint)).digest('hex')}`,
      };
      try {
        appendSegmentedLog(join(options.repoRoot, HOOK_EVENT_TELEMETRY_PATH), `${JSON.stringify(record)}\n`, options.repoRoot);
      } catch {
        // Runtime telemetry is non-authoritative and must never alter hook safety.
      }
      return record;
    },
  };
}
