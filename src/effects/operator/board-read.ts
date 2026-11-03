import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { spawnRegisteredProcessGroup } from '../process-group-registry';
import { terminateProcessGroup } from '../process-group-termination';
import type { BoardReadFailure } from '../../core/operator/board-read';
import { readRepoHarnessRegistryStrictSnapshot } from '../repo-registry';

/**
 * The board CLI is the composition root that passes the hc host ports to the
 * collector, so the operator runs it as a child instead of importing the
 * terminal plugin (Surface contract, docs/adr/ADR-0002 rule 5).
 */
const BOARD_CLI_ENTRY = fileURLToPath(new URL('../../cli/index.ts', import.meta.url));
/** One board read makes several GitHub reads and one merge readiness read per open pull request. */
export const BOARD_READ_TIMEOUT_MS = 90_000;
const BOARD_TERMINATION_GRACE_MS = 500;
const BOARD_OUTPUT_LIMIT = 16 * 1024 * 1024;

/** The failures of one CLI run; the route adds its own request, decode and capacity refusals. */
export type BoardRunFailure = Exclude<BoardReadFailure, 'board_parent_invalid' | 'board_invalid' | 'board_busy'>;

export class BoardReadError extends Error {
  constructor(readonly code: BoardRunFailure) {
    super(code);
    this.name = 'BoardReadError';
  }
}

export interface BoardReadInput {
  readonly repository_id: string;
  readonly parent: number;
  readonly env: NodeJS.ProcessEnv;
  readonly signal: AbortSignal;
}

/** The board CLI writes `{ok:false,error,message}` to stderr for its two typed failures. */
function cliFailure(stderr: string): BoardRunFailure {
  for (const line of stderr.split('\n')) {
    try {
      const value = JSON.parse(line) as { readonly ok?: unknown; readonly error?: unknown };
      if (value.ok !== false) continue;
      if (value.error === 'BoardCollectError') return 'board_collect_failed';
      if (value.error === 'BoardSourceError') return 'board_source_invalid';
    } catch { /* not the error line */ }
  }
  return 'board_unavailable';
}

/**
 * Run `repo-harness board --parent <n> --json` in the registered repository
 * root and return its stdout as parsed JSON. The caller decodes it. On POSIX
 * the child leads a registered process group; a deadline or abort terminates
 * the group (Windows: the `taskkill /T` tree) before the read settles.
 */
export function readRepositoryBoard(input: BoardReadInput): Promise<unknown> {
  let root: string;
  try {
    const repository = readRepoHarnessRegistryStrictSnapshot({ env: input.env }).repos.find(repo => repo.id === input.repository_id);
    if (repository === undefined) return Promise.reject(new BoardReadError('repository_not_found'));
    root = repository.path;
  } catch {
    return Promise.reject(new BoardReadError('registry_unavailable'));
  }
  if (input.signal.aborted) return Promise.reject(new BoardReadError('board_timeout'));
  return new Promise((resolveRead, rejectRead) => {
    const child = spawnRegisteredProcessGroup('operator-board', () => spawn(
      process.execPath,
      [BOARD_CLI_ENTRY, 'board', '--parent', String(input.parent), '--json'],
      { cwd: root, env: input.env, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32', windowsHide: true },
    ));
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let size = 0;
    let failure: BoardRunFailure | null = null;
    let settled = false;
    const finish = (outcome: { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly code: BoardRunFailure }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      input.signal.removeEventListener('abort', onAbort);
      if (outcome.ok) resolveRead(outcome.value);
      else rejectRead(new BoardReadError(outcome.code));
    };
    const terminate = (code: BoardRunFailure) => {
      if (settled || failure !== null) return;
      failure = code;
      clearTimeout(timer);
      if (child.pid === undefined) { finish({ ok: false, code }); return; }
      void terminateProcessGroup(child.pid, BOARD_TERMINATION_GRACE_MS)
        .catch(() => { /* already exited */ })
        .then(() => finish({ ok: false, code }));
    };
    const onAbort = () => terminate('board_timeout');
    const timer = setTimeout(() => terminate('board_timeout'), BOARD_READ_TIMEOUT_MS);
    input.signal.addEventListener('abort', onAbort, { once: true });
    const collect = (into: Buffer[]) => (chunk: Buffer) => {
      if (failure !== null) return;
      size += chunk.length;
      if (size > BOARD_OUTPUT_LIMIT) { terminate('board_unavailable'); return; }
      into.push(chunk);
    };
    child.stdout!.on('data', collect(stdout));
    child.stderr!.on('data', collect(stderr));
    child.once('error', () => finish({ ok: false, code: failure ?? 'board_unavailable' }));
    child.once('close', (status) => {
      if (failure !== null) return;
      if (status !== 0) { finish({ ok: false, code: cliFailure(Buffer.concat(stderr).toString('utf8')) }); return; }
      try {
        finish({ ok: true, value: JSON.parse(Buffer.concat(stdout).toString('utf8')) });
      } catch {
        finish({ ok: false, code: 'board_unavailable' });
      }
    });
  });
}
