import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'fs';
import { randomUUID } from 'crypto';
import { join } from 'path';
import { repoHarnessHome } from '../repo-harness-home.ts';
import {
  acquireExclusiveDirectoryLock,
  ExclusiveLockContentionError,
  exclusiveDirectoryLockOwnerLiveness,
  readExclusiveDirectoryLockOwner,
  type ExclusiveDirectoryLockHandle,
  type ExclusiveDirectoryLockOwnerLiveness,
} from './exclusive-directory-lock.ts';
import { currentProcessStartTime } from './process-start-time.ts';

/**
 * Set in the environment of a queued run. A nested gate inside that run (a
 * lane that runs tests, a test that runs a lane) is already in the queue.
 */
export const HOST_TEST_QUEUE_HOLDER_ENV = 'REPO_HARNESS_HOST_TEST_QUEUE_HOLDER';

export const HOST_TEST_RUN_KINDS = ['release', 'full', 'affected'] as const;
export type HostTestRunKind = (typeof HOST_TEST_RUN_KINDS)[number];

const QUEUE_DIR = 'host-test-queue';
const LOCK_PATH = `${QUEUE_DIR}/holder.lock`;
const TICKETS_PATH = `${QUEUE_DIR}/tickets`;
const DEFAULT_POLL_MS = 1_000;

export interface HostTestRunRequest {
  readonly kind: HostTestRunKind;
  readonly cwd: string;
  readonly command: readonly string[];
}

export interface HostTestQueueEntry extends HostTestRunRequest {
  readonly token: string;
  readonly pid: number;
  readonly startTime: string;
  readonly enqueuedAt: string;
  readonly acquiredAt: string | null;
}

export interface HostTestQueueState {
  readonly root: string;
  /** The process that holds the lock; null when the queue is free. */
  readonly holder: { readonly pid: number; readonly liveness: ExclusiveDirectoryLockOwnerLiveness; readonly entry: HostTestQueueEntry | null } | null;
  /** Waiting entries in run order: release checks first, then FIFO. */
  readonly waiting: readonly (HostTestQueueEntry & { readonly liveness: ExclusiveDirectoryLockOwnerLiveness })[];
}

export interface HostTestQueueHandle {
  readonly token: string;
  release(): void;
}

export interface EnterHostTestQueueOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly pollMs?: number;
  /** Called when the wait starts and each time the holder or position changes. */
  readonly onWait?: (state: HostTestQueueState, position: number) => void;
  readonly onStaleReclaim?: (lockPath: string) => void;
}

function queueHome(env: NodeJS.ProcessEnv): string {
  const home = repoHarnessHome(env);
  mkdirSync(join(home, TICKETS_PATH), { recursive: true, mode: 0o700 });
  // The lock primitive takes a canonical root.
  return realpathSync(home);
}

// The name sorts in run order: rank, then enqueue time, then token.
function ticketName(entry: HostTestQueueEntry): string {
  const rank = entry.kind === 'release' ? 0 : 1;
  return `${rank}-${String(Date.parse(entry.enqueuedAt)).padStart(15, '0')}-${entry.token}.json`;
}

function toRecord(entry: HostTestQueueEntry): Record<string, unknown> {
  return {
    token: entry.token,
    pid: entry.pid,
    start_time: entry.startTime,
    kind: entry.kind,
    cwd: entry.cwd,
    command: entry.command,
    enqueued_at: entry.enqueuedAt,
    acquired_at: entry.acquiredAt,
  };
}

function parseEntry(text: string): HostTestQueueEntry | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const { token, pid, start_time, kind, cwd, command, enqueued_at, acquired_at } = record;
  if (typeof token !== 'string'
    || typeof pid !== 'number' || !Number.isSafeInteger(pid) || pid < 1
    || typeof start_time !== 'string' || start_time === ''
    || !HOST_TEST_RUN_KINDS.includes(kind as HostTestRunKind)
    || typeof cwd !== 'string'
    || !Array.isArray(command) || !command.every((part) => typeof part === 'string')
    || typeof enqueued_at !== 'string' || Number.isNaN(Date.parse(enqueued_at))
    || (acquired_at !== null && typeof acquired_at !== 'string')) return null;
  return {
    token,
    pid,
    startTime: start_time,
    kind: kind as HostTestRunKind,
    cwd,
    command,
    enqueuedAt: enqueued_at,
    acquiredAt: acquired_at,
  };
}

function writeTicket(root: string, entry: HostTestQueueEntry): string {
  const path = join(root, TICKETS_PATH, ticketName(entry));
  const staged = `${path}.tmp`;
  writeFileSync(staged, `${JSON.stringify(toRecord(entry))}\n`, { mode: 0o600 });
  renameSync(staged, path);
  return path;
}

function removeFile(path: string): void {
  try {
    unlinkSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

interface Ticket {
  readonly path: string;
  readonly entry: HostTestQueueEntry;
}

/** Tickets in run order. A malformed ticket names no process and is skipped. */
function readTickets(root: string): Ticket[] {
  const dir = join(root, TICKETS_PATH);
  const tickets: Ticket[] = [];
  for (const name of readdirSync(dir).filter((entry) => entry.endsWith('.json')).sort()) {
    const path = join(dir, name);
    let text: string;
    try {
      text = readFileSync(path, 'utf-8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw error;
    }
    const entry = parseEntry(text);
    if (entry !== null) tickets.push({ path, entry });
  }
  return tickets;
}

function liveness(entry: HostTestQueueEntry): ExclusiveDirectoryLockOwnerLiveness {
  return exclusiveDirectoryLockOwnerLiveness({ lockPath: '', pid: entry.pid, startTime: entry.startTime, token: entry.token });
}

function stateOf(root: string, tickets: readonly Ticket[]): HostTestQueueState {
  const owner = readExclusiveDirectoryLockOwner(root, LOCK_PATH);
  const holderTicket = owner === null
    ? undefined
    : tickets.find(({ entry }) => entry.pid === owner.pid && entry.startTime === owner.startTime && entry.acquiredAt !== null);
  return {
    root: join(root, QUEUE_DIR),
    holder: owner === null
      ? null
      : { pid: owner.pid, liveness: exclusiveDirectoryLockOwnerLiveness(owner), entry: holderTicket?.entry ?? null },
    waiting: tickets
      .filter((ticket) => ticket !== holderTicket)
      .map(({ entry }) => ({ ...entry, liveness: liveness(entry) })),
  };
}

/** Reads who holds the host test queue and who waits. It writes nothing. */
export function readHostTestQueueState(env: NodeJS.ProcessEnv = process.env): HostTestQueueState {
  const home = repoHarnessHome(env);
  if (!existsSync(join(home, TICKETS_PATH))) return { root: join(home, QUEUE_DIR), holder: null, waiting: [] };
  const root = realpathSync(home);
  return stateOf(root, readTickets(root));
}

/**
 * Removes the tickets ahead of `token` whose process is proven dead, and
 * returns the position of `token` (0 = next to run).
 */
function pruneAhead(tickets: readonly Ticket[], token: string): number {
  let position = 0;
  for (const ticket of tickets) {
    if (ticket.entry.token === token) return position;
    if (liveness(ticket.entry) === 'dead') removeFile(ticket.path);
    else position += 1;
  }
  throw new Error(`host test queue ticket ${token} disappeared while it waited`);
}

/**
 * Waits for the turn of this run and takes the host test lock. Every run is
 * exclusive; the order is release checks first, then FIFO. A holder or waiter
 * whose PID is free or reused is skipped, and its lock is reclaimed.
 */
export async function enterHostTestQueue(
  request: HostTestRunRequest,
  options: EnterHostTestQueueOptions = {},
): Promise<HostTestQueueHandle> {
  const root = queueHome(options.env ?? process.env);
  const pollMs = options.pollMs ?? DEFAULT_POLL_MS;
  const waiting: HostTestQueueEntry = {
    ...request,
    token: `${process.pid}-${randomUUID()}`,
    pid: process.pid,
    startTime: currentProcessStartTime(),
    enqueuedAt: new Date().toISOString(),
    acquiredAt: null,
  };
  const ticketPath = writeTicket(root, waiting);
  let lock: ExclusiveDirectoryLockHandle | null = null;
  try {
    let reported = '';
    for (;;) {
      const tickets = readTickets(root);
      const position = pruneAhead(tickets, waiting.token);
      if (position === 0) {
        try {
          lock = acquireExclusiveDirectoryLock(root, LOCK_PATH, {
            waitTimeoutMs: 1,
            reclaimStaleOwner: true,
            onStaleReclaim: options.onStaleReclaim,
          });
          break;
        } catch (error) {
          if (!(error instanceof ExclusiveLockContentionError)) throw error;
        }
      }
      if (options.onWait) {
        const state = stateOf(root, readTickets(root));
        const key = `${state.holder?.pid ?? ''}:${position}`;
        if (key !== reported) {
          reported = key;
          options.onWait(state, position);
        }
      }
      await Bun.sleep(pollMs);
    }
    writeTicket(root, { ...waiting, acquiredAt: new Date().toISOString() });
  } catch (error) {
    lock?.release();
    removeFile(ticketPath);
    throw error;
  }
  const held = lock;
  let released = false;
  return {
    token: waiting.token,
    release() {
      if (released) return;
      released = true;
      removeFile(ticketPath);
      held.release();
    },
  };
}
