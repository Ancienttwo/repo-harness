import { createHash } from 'node:crypto';

import { lstatSync, readdirSync, readFileSync, type Stats } from 'node:fs';
import { join } from 'node:path';
import { assertSafeRepoWritePath, writeHookStateFile } from '../../effects/hook-state-file';
import { boundedHookDiagnostic } from './hook-protocol';
import { PROTECTED_REPO_DIRS } from './mutation-protected-dirs';
import { gitExecFileSync } from '../../effects/git/runner';

/**
 * The edit guard denies every Edit, Write and apply_patch target under these
 * directories, so a change here came from Bash, a script or the person (#851).
 * Git ignores both directories, so Stop keeps its own manifest to compare.
 */
const ROOTS = PROTECTED_REPO_DIRS;
const STATE = '.ai/harness/state/protected-paths.json';
const MAX_ENTRIES = 5_000;
const MAX_ROWS = 5;
const MAX_BYTES = 800;

type Manifest = Readonly<Record<string, readonly [size: number, mtimeMs: number]>>;
type ChangeKind = 'added' | 'modified' | 'deleted';

interface ProtectedPathState {
  readonly entries: Manifest;
  readonly notified: string | null;
}

interface Change {
  readonly kind: ChangeKind;
  readonly path: string;
}

export interface ProtectedPathNotice {
  readonly content?: string;
  readonly systemMessage?: string;
  readonly diagnostics?: string;
}

const singleLine = (text: string) => text.replace(/[\r\n\t]+/g, ' ');

/** lstat only: a symbolic link is one entry and is never followed. */
function scan(repoRoot: string): Manifest {
  const entries: Record<string, readonly [number, number]> = {};
  let count = 0;
  const record = (path: string, stat: Stats): void => {
    if (++count > MAX_ENTRIES) throw new Error(`more than ${MAX_ENTRIES} entries under _ops/ and _ref/`);
    if (stat.isDirectory()) {
      for (const name of readdirSync(join(repoRoot, path)).sort()) record(`${path}/${name}`, lstatSync(join(repoRoot, path, name)));
    } else entries[path] = [stat.size, stat.mtimeMs];
  };
  for (const root of ROOTS) {
    const stat = lstatSync(join(repoRoot, root), { throwIfNoEntry: false });
    if (stat) record(root, stat);
  }
  return entries;
}

function readState(repoRoot: string): ProtectedPathState | null {
  try { return JSON.parse(readFileSync(join(repoRoot, STATE), 'utf8')) as ProtectedPathState; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}

function compare(previous: Manifest, current: Manifest): Change[] {
  const changes: Change[] = [];
  for (const [path, [size, mtimeMs]] of Object.entries(current)) {
    const before = previous[path];
    if (!before) changes.push({ kind: 'added', path });
    else if (before[0] !== size || before[1] !== mtimeMs) changes.push({ kind: 'modified', path });
  }
  for (const path of Object.keys(previous)) if (!(path in current)) changes.push({ kind: 'deleted', path });
  return changes.sort((left, right) => left.path.localeCompare(right.path));
}

function currentBranch(repoRoot: string, env: NodeJS.ProcessEnv): string {
  return gitExecFileSync(['-C', repoRoot, 'rev-parse', '--abbrev-ref', 'HEAD'], {
    encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'ignore'], timeout: 3_000,
  }).trim();
}

function stateIgnored(repoRoot: string, env: NodeJS.ProcessEnv): boolean {
  try {
    gitExecFileSync(['-C', repoRoot, 'check-ignore', '-q', '--', STATE], { env, stdio: 'ignore', timeout: 3_000 });
    return true;
  } catch { return false; }
}

/** The state file holds private path names, so it must be Git-ignored before the first write. */
function writeState(repoRoot: string, state: ProtectedPathState, env: NodeJS.ProcessEnv): void {
  assertSafeRepoWritePath(repoRoot, join(repoRoot, STATE));
  if (!stateIgnored(repoRoot, env)) throw new Error(`${STATE} is not Git-ignored`);
  writeHookStateFile(repoRoot, join(repoRoot, STATE), `${JSON.stringify(state)}\n`);
}

/**
 * An empty baseline is still a baseline: without it, the first file that Bash
 * creates under _ops/ would become the silent initial manifest. It holds no
 * private names, so a state path that Git does not ignore skips it silently.
 */
function recordEmptyBaseline(repoRoot: string, env: NodeJS.ProcessEnv): ProtectedPathNotice {
  if (stateIgnored(repoRoot, env)) writeState(repoRoot, { entries: {}, notified: null }, env);
  return {};
}

/** Up to five rows and an exact overflow count inside 800 bytes. The header and footer are never cut. */
function render(changes: readonly Change[]): Required<Pick<ProtectedPathNotice, 'content' | 'systemMessage'>> {
  const count = changes.length;
  const header = `[ProtectedPathChange] ${count} ${count === 1 ? 'path' : 'paths'} under _ops/ or _ref/ changed since the last Stop. `
    + `The edit guard denies every Edit or Write there, so Bash, a script or the person changed ${count === 1 ? 'it' : 'them'}.`;
  const footer = 'Do not change _ops/ or _ref/ through Bash. Tell the user if a change was not intended.';
  const block = (rows: readonly string[]) => {
    const more = count - rows.length;
    return [header, ...rows, ...(more > 0 ? [`(+${more} more)`] : []), footer].join('\n');
  };
  const rows: string[] = [];
  for (const change of changes.slice(0, MAX_ROWS)) {
    const row = `- ${change.kind} ${singleLine(change.path)}`;
    if (Buffer.byteLength(block([...rows, row]), 'utf8') > MAX_BYTES) break;
    rows.push(row);
  }
  const first = singleLine(changes[0]!.path);
  return {
    content: block(rows),
    systemMessage: `Protected paths: ${count} ${count === 1 ? 'change' : 'changes'} under _ops/ or _ref/ since the last Stop (${first}${count > 1 ? ', ...' : ''}).`,
  };
}

/**
 * Compare `_ops/` and `_ref/` with the manifest of the previous Stop. The first
 * Stop records the baseline silently, also when both directories are absent.
 * One path set is reported once per branch. An unchanged manifest is not
 * rewritten. Report only: a failure writes no state and returns one diagnostic.
 */
export function collectProtectedPathNotice(repoRoot: string, env: NodeJS.ProcessEnv): ProtectedPathNotice {
  try {
    const current = scan(repoRoot);
    const previous = readState(repoRoot);
    if (!previous && Object.keys(current).length === 0) return recordEmptyBaseline(repoRoot, env);
    const changes = previous ? compare(previous.entries, current) : [];
    if (previous && changes.length === 0) return {};
    const key = changes.length === 0 ? null
      : createHash('sha256').update(JSON.stringify([currentBranch(repoRoot, env), changes.map(change => change.path)])).digest('hex');
    const report = key !== null && key !== previous?.notified;
    writeState(repoRoot, { entries: current, notified: key ?? previous?.notified ?? null }, env);
    return report ? render(changes) : {};
  } catch (error) {
    const message = singleLine(error instanceof Error ? error.message : String(error));
    return { diagnostics: `${boundedHookDiagnostic(`repo-harness: protected path check unavailable: ${message}`)}\n` };
  }
}
