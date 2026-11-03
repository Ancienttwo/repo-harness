import { spawn } from 'node:child_process';
import { devNull } from 'node:os';
import { fileURLToPath } from 'node:url';
import { withoutRepositorySelectingGitEnv } from '../git/runner';
import { spawnRegisteredProcessGroup } from '../process-group-registry';
import { terminateProcessGroup } from '../process-group-termination';
import type { BoardParentsReadFailure, BoardReadFailure } from '../../core/operator/board-read';
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
export type BoardParentsRunFailure = Exclude<BoardParentsReadFailure, 'parents_invalid' | 'parents_busy'>;

export class BoardReadError extends Error {
  constructor(readonly code: BoardRunFailure | BoardParentsRunFailure) {
    super(code);
    this.name = 'BoardReadError';
  }
}

export interface BoardParentsReadInput {
  readonly repository_id: string;
  readonly env: NodeJS.ProcessEnv;
  readonly signal: AbortSignal;
}

export interface BoardReadInput extends BoardParentsReadInput {
  readonly parent: number;
}

type CliError = { readonly error: unknown; readonly code: unknown };

/** The board CLI writes `{ok:false,error,message}` (the parent list adds `code`) to stderr for its typed failures. */
function cliError(stderr: string): CliError | null {
  for (const line of stderr.split('\n')) {
    try {
      const value = JSON.parse(line) as { readonly ok?: unknown; readonly error?: unknown; readonly code?: unknown };
      if (value.ok === false) return { error: value.error, code: value.code };
    } catch { /* not the error line */ }
  }
  return null;
}

/** The codes of one board CLI mode. */
interface BoardCliMode<F extends BoardRunFailure | BoardParentsRunFailure> {
  readonly args: readonly string[];
  readonly timeout: F;
  readonly unavailable: F;
  readonly failure: (error: CliError | null) => F;
}

const BOARD_MODE = (parent: number): BoardCliMode<BoardRunFailure> => ({
  args: ['board', '--parent', String(parent), '--json'],
  timeout: 'board_timeout',
  unavailable: 'board_unavailable',
  failure: error => error?.error === 'BoardCollectError' ? 'board_collect_failed' : error?.error === 'BoardSourceError' ? 'board_source_invalid' : 'board_unavailable',
});

const PARENTS_MODE: BoardCliMode<BoardParentsRunFailure> = {
  args: ['board', 'parents', '--json'],
  timeout: 'parents_timeout',
  unavailable: 'parents_unavailable',
  failure: (error) => {
    if (error?.error === 'BoardSourceError') return 'parents_source_invalid';
    if (error?.error === 'BoardParentsError' && (error.code === 'parents_github_failed' || error.code === 'parents_hc_failed')) return error.code;
    return 'parents_unavailable';
  },
};

/**
 * Run `repo-harness board --parent <n> --json` in the registered repository
 * root and return its stdout as parsed JSON. The caller decodes it.
 */
export function readRepositoryBoard(input: BoardReadInput): Promise<unknown> {
  return runBoardCli(input, BOARD_MODE(input.parent));
}

/** Run `repo-harness board parents --json` the same way: the parent list of the Board page. */
export function readRepositoryBoardParents(input: BoardParentsReadInput): Promise<unknown> {
  return runBoardCli(input, PARENTS_MODE);
}

/**
 * One board CLI run in the registered repository root. On POSIX the child
 * leads a registered process group; a deadline or abort terminates the group
 * (Windows: the `taskkill /T` tree) before the read settles.
 */
function runBoardCli<F extends BoardRunFailure | BoardParentsRunFailure>(input: BoardParentsReadInput, mode: BoardCliMode<F>): Promise<unknown> {
  let root: string;
  try {
    const repository = readRepoHarnessRegistryStrictSnapshot({ env: input.env }).repos.find(repo => repo.id === input.repository_id);
    if (repository === undefined) return Promise.reject(new BoardReadError('repository_not_found'));
    root = repository.path;
  } catch {
    return Promise.reject(new BoardReadError('registry_unavailable'));
  }
  if (input.signal.aborted) return Promise.reject(new BoardReadError(mode.timeout));
  // The registered root alone selects the repository: no GH_REPO or Git
  // repository override from the operator environment reaches the child.
  const env = withoutRepositorySelectingGitEnv(input.env);
  delete env.GH_REPO;
  return new Promise((resolveRead, rejectRead) => {
    // `gh repo view` needs the root as cwd. Bun would then load that
    // repository's bunfig.toml (preload code) and .env, so the child takes
    // neither: the package bunfig holds only test settings.
    const child = spawnRegisteredProcessGroup('operator-board', () => spawn(
      process.execPath,
      ['--no-env-file', `--config=${devNull}`, BOARD_CLI_ENTRY, ...mode.args],
      { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32', windowsHide: true },
    ));
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let size = 0;
    let failure: F | null = null;
    let settled = false;
    const finish = (outcome: { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly code: F }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      input.signal.removeEventListener('abort', onAbort);
      if (outcome.ok) resolveRead(outcome.value);
      else rejectRead(new BoardReadError(outcome.code));
    };
    const terminate = (code: F) => {
      if (settled || failure !== null) return;
      failure = code;
      clearTimeout(timer);
      if (child.pid === undefined) { finish({ ok: false, code }); return; }
      void terminateProcessGroup(child.pid, BOARD_TERMINATION_GRACE_MS)
        .catch(() => { /* already exited */ })
        .then(() => finish({ ok: false, code }));
    };
    const onAbort = () => terminate(mode.timeout);
    const timer = setTimeout(() => terminate(mode.timeout), BOARD_READ_TIMEOUT_MS);
    input.signal.addEventListener('abort', onAbort, { once: true });
    const collect = (into: Buffer[]) => (chunk: Buffer) => {
      if (failure !== null) return;
      size += chunk.length;
      if (size > BOARD_OUTPUT_LIMIT) { terminate(mode.unavailable); return; }
      into.push(chunk);
    };
    child.stdout!.on('data', collect(stdout));
    child.stderr!.on('data', collect(stderr));
    child.once('error', () => finish({ ok: false, code: failure ?? mode.unavailable }));
    child.once('close', (status) => {
      if (failure !== null) return;
      if (status !== 0) { finish({ ok: false, code: mode.failure(cliError(Buffer.concat(stderr).toString('utf8'))) }); return; }
      try {
        finish({ ok: true, value: JSON.parse(Buffer.concat(stdout).toString('utf8')) });
      } catch {
        finish({ ok: false, code: mode.unavailable });
      }
    });
  });
}
