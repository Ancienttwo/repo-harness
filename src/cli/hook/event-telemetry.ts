import { createHash, randomUUID } from 'crypto';
import { performance } from 'perf_hooks';
import { join } from 'path';
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
  /** `commandNames` of the tool call's shell command; omit for other events. */
  readonly commandNames?: readonly string[];
}

export interface HookEventTelemetry {
  finalize(result: HookEventTelemetryResult): HookEventTelemetryRecord;
}

export interface CreateHookEventTelemetryInput {
  readonly repoRoot: string;
  readonly event: HookEvent;
  readonly routeId: RouteId;
}

const COMMAND_NAME = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/u;
const COMMAND_NAME_LIMIT = 16;
/** Words that run the next word as the program. */
const COMMAND_PREFIXES = new Set(['sudo', 'env', 'exec', 'time', 'command', 'nohup', 'xargs']);

/** A word that held quoted or escaped text; it can never pass COMMAND_NAME. */
const QUOTED = '\u0000';

/**
 * Words of each simple command in a shell line. Separators (`;`, `|`, `&`,
 * `(`, `)`, backtick, newline) split only outside quotes. Quoted text and
 * heredoc bodies never start a segment, so argument data cannot reach a
 * command position. An unterminated quote or heredoc ends the scan: the rest
 * is data.
 */
function shellSegments(command: string): string[][] {
  const segments: string[][] = [];
  let words: string[] = [];
  let word = '';
  let quoted = false;
  let heredocs: { delimiter: string; strip: boolean }[] = [];
  const endWord = () => {
    if (word !== '' || quoted) words.push(quoted ? `${QUOTED}${word}` : word);
    word = '';
    quoted = false;
  };
  const endSegment = () => {
    endWord();
    if (words.length > 0) segments.push(words);
    words = [];
  };
  let i = 0;
  scan: while (i < command.length) {
    const c = command[i]!;
    if (c === '\\') {
      word += command[i + 1] ?? '';
      quoted = true;
      i += 2;
    } else if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < command.length && command[j] !== c) j += c === '"' && command[j] === '\\' ? 2 : 1;
      if (j >= command.length) { quoted = true; break; }
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
      let delimiter = '';
      while (j < command.length && !/[\s;|&()<>]/u.test(command[j]!)) {
        if (command[j] !== "'" && command[j] !== '"' && command[j] !== '\\') delimiter += command[j];
        j += 1;
      }
      heredocs.push({ delimiter, strip });
      i = j;
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
 * command, after `NAME=value` assignments and runner prefixes, reduced to its
 * basename. A word with quoted text, `$` or globs is dropped.
 */
export function commandNames(command: string): string[] {
  const names = new Set<string>();
  for (const words of shellSegments(command)) {
    let index = 0;
    while (index < words.length && (/^[A-Za-z_][A-Za-z0-9_]*=/u.test(words[index]!) || COMMAND_PREFIXES.has(words[index]!))) index += 1;
    const word = words[index];
    // The whole word must be a plain path: quoted text or `$` anywhere drops it.
    if (word === undefined || !/^[A-Za-z0-9._+/-]+$/u.test(word)) continue;
    const name = word.slice(word.lastIndexOf('/') + 1);
    if (COMMAND_NAME.test(name)) names.add(name);
    if (names.size === COMMAND_NAME_LIMIT) break;
  }
  return [...names];
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
        command_names: [...(result.commandNames ?? [])],
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
