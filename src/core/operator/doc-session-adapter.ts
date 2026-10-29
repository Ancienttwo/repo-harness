import { DOC_SESSION_EVENT_MAX_PATHS, DOC_SESSION_EVENT_TEXT_MAX_BYTES, DOC_SESSION_TEXT_WITHHELD, isRepositoryRelativePath, type DocSessionEventInput, type DocSessionToolCategory } from './doc-session-events';

/**
 * OAR session events -> doc session event records (PRD G3, G4; issue #1021).
 * Only the root agent's events are kept. A record takes message text, the
 * tool category, repository-relative paths, the execution status, turn
 * boundaries and the failure category; reasoning, tool input, tool output,
 * commands, usage and the model are never read into a record. Message text is
 * held until the message ends, so the writer redacts it whole: a secret that
 * arrives in two deltas, with any pause between them, is redacted as if it
 * came at once.
 */

/** A record without its cursor; the host gives each one `epoch`, `seq` and `at`. */
export type DocSessionEventBody = DocSessionEventInput extends infer E ? E extends unknown ? Omit<E, 'epoch' | 'seq' | 'at'> : never : never;

/** The fields of an OAR `Event` that the mapping reads. Any OAR `Event` is one. */
export interface DocSessionOarEvent {
  readonly kind: string;
  readonly agentPath: readonly string[];
  readonly callId?: string;
  readonly tool?: string;
  readonly input?: string;
  readonly text?: string;
  readonly messageId?: string;
  readonly result?: 'ok' | 'failed';
  readonly exitCode?: number | null;
  /** A turn outcome object on `turn_ended`; other events use the name for a plain word. */
  readonly outcome?: unknown;
  readonly action?: string;
}

/**
 * The most raw text one message holds. Overflow withholds the whole message:
 * cutting before redaction can leave a secret fragment that no longer matches.
 */
export const DOC_SESSION_MESSAGE_HOLD_CHARS = 4 * DOC_SESSION_EVENT_TEXT_MAX_BYTES;

/** Why the host aborts a turn: a user stop or cancel, or a host time bound. */
export type DocSessionAbortCause = 'cancelled' | 'timeout';

/** Codex tool names (OAR codex projection) -> the page's categories. Codex reports reads and searches as commands. */
const TOOL_CATEGORIES: Readonly<Record<string, DocSessionToolCategory>> = {
  fileChange: 'edit',
  commandExecution: 'command',
  webSearch: 'web',
};

/**
 * A worktree path as a repository-relative path, or null when it is outside
 * the worktree or not a plain relative path. `worktree` is canonical.
 */
export function docSessionRepositoryPath(worktree: string, path: string): string | null {
  let relative = path;
  if (path.startsWith('/')) {
    if (!path.startsWith(`${worktree}/`)) return null;
    relative = path.slice(worktree.length + 1);
  }
  relative = relative.replace(/^(?:\.\/)+/u, '');
  return isRepositoryRelativePath(relative) ? relative : null;
}

/** Paths of a codex `fileChange` input (`JSON.stringify(item.changes)`); the diff text is never kept. */
function changedPaths(worktree: string, input: string | undefined): string[] {
  if (input === undefined) return [];
  let changes: unknown;
  try { changes = JSON.parse(input); } catch { return []; }
  if (!Array.isArray(changes)) return [];
  const paths: string[] = [];
  for (const change of changes) {
    const path = typeof change === 'object' && change !== null ? (change as { path?: unknown }).path : undefined;
    const relative = typeof path === 'string' ? docSessionRepositoryPath(worktree, path) : null;
    if (relative !== null && !paths.includes(relative)) paths.push(relative);
    if (paths.length === DOC_SESSION_EVENT_MAX_PATHS) break;
  }
  return paths;
}

/** One adapter per host session. It keeps the open tool calls and whether a turn is open. */
export class DocSessionAdapter {
  private readonly tools = new Map<string, { readonly category: DocSessionToolCategory; readonly paths: readonly string[] }>();
  private open = false;
  private abortCause: DocSessionAbortCause = 'cancelled';
  private disposing = false;
  private message: { readonly key: string; text: string; dropped: boolean; readonly after: DocSessionEventBody[] } | null = null;

  constructor(private readonly worktree: string) {}

  get turnOpen(): boolean { return this.open; }

  /** The next aborted turn ends with this failure category. */
  aborting(cause: DocSessionAbortCause): void { this.abortCause = cause; }

  /** The host disposes the session, so the runtime exit that follows is not a failure. */
  disposed(): void { this.disposing = true; }

  /** The whole message or its withheld marker. The host calls it before it records a failure or the end of a turn itself. */
  flush(): DocSessionEventBody[] {
    const held = this.message;
    this.message = null;
    if (held === null) return [];
    if (held.text === '') return held.after;
    return [{ type: 'message', role: 'agent', text: held.text, ...(held.dropped ? { truncated: true as const } : {}) }, ...held.after];
  }

  map(event: DocSessionOarEvent): DocSessionEventBody[] {
    if (event.agentPath.length !== 0) return [];
    if (event.kind === 'text_delta') return this.hold(event.messageId ?? '', event.text ?? '');
    const records = this.step(event);
    // An input refusal does not end the agent message. Keep its failure after the whole text for redaction.
    if (event.kind === 'input_dropped' && this.message !== null && this.message.text !== '') {
      this.message.after.push(...records);
      return [];
    }
    // Ignored events keep the message and its overflow latch; an exit ends it even during disposal.
    return records.length > 0 || event.kind === 'exited' ? [...this.flush(), ...records] : [];
  }

  private hold(key: string, text: string): DocSessionEventBody[] {
    const ended = this.message !== null && this.message.key !== key ? this.flush() : [];
    const held = this.message ??= { key, text: '', dropped: false, after: [] };
    if (held.dropped) return ended;
    if (held.text.length + text.length > DOC_SESSION_MESSAGE_HOLD_CHARS) {
      held.text = DOC_SESSION_TEXT_WITHHELD;
      held.dropped = true;
    } else {
      held.text += text;
    }
    return ended;
  }

  private step(event: DocSessionOarEvent): DocSessionEventBody[] {
    switch (event.kind) {
      case 'turn_started':
        this.open = true;
        return [{ type: 'turn', boundary: 'started' }];
      case 'tool_call_started': {
        const category = TOOL_CATEGORIES[event.tool ?? ''] ?? 'other';
        const paths = category === 'edit' ? changedPaths(this.worktree, event.input) : [];
        this.tools.set(event.callId ?? '', { category, paths });
        return [{ type: 'tool', category, status: 'started', paths: [...paths] }];
      }
      case 'tool_call_ended': {
        const call = this.tools.get(event.callId ?? '') ?? { category: 'other' as const, paths: [] };
        this.tools.delete(event.callId ?? '');
        // Only a success that OAR reported is a success.
        const succeeded = event.result === 'ok' || (event.result === undefined && event.exitCode === 0);
        return [{ type: 'tool', category: call.category, status: succeeded ? 'succeeded' : 'failed', paths: [...call.paths] }];
      }
      case 'turn_ended': {
        const kind = typeof event.outcome === 'object' && event.outcome !== null ? (event.outcome as { readonly kind?: unknown }).kind : undefined;
        const cause = this.abortCause;
        this.abortCause = 'cancelled';
        return this.endTurn(kind === 'completed' ? [] : [{ type: 'failure', category: kind === 'aborted' ? cause : 'runtime_error' }]);
      }
      case 'control_rejected':
        return event.action === 'prompt' ? [{ type: 'failure', category: 'runtime_error' }] : [];
      case 'input_dropped':
        return [{ type: 'failure', category: 'runtime_error' }];
      case 'exited':
        return this.disposing ? [] : this.endTurn([{ type: 'failure', category: 'runtime_error' }], true);
      default:
        return [];
    }
  }

  /** The failure first, then the end of an open turn. */
  private endTurn(failures: DocSessionEventBody[], onlyIfOpen = false): DocSessionEventBody[] {
    const wasOpen = this.open;
    this.open = false;
    return onlyIfOpen && !wasOpen ? failures : [...failures, { type: 'turn', boundary: 'ended' }];
  }
}
