/**
 * The canonical authority a claim is validated against.
 *
 * A claim never reads the caller's working tree or its local active-sprint
 * marker: a worktree cut from an older commit would otherwise claim against
 * its own stale copy of the backlog. The sprint text is read out of an
 * explicitly named ref, so every worktree of the clone validates against the
 * same bytes.
 *
 * Repo identity is the resolved git common directory. It is stable across
 * every linked worktree of one clone -- which is exactly the coordination
 * plane's scope -- and the contract puts cross-clone and cross-machine
 * coordination out of scope, so nothing needs an identity that outlives the
 * clone's location.
 */
import { resolveRepoIdentity } from '../git/repository-identity';
import { assertUniqueCanonicalTaskIds } from '../../core/state/coordination-identity';
import {
  SPRINT_BACKLOG_SCHEMA_V2,
  sprintBacklogSchema,
} from '../../core/state/sprint-backlog-rows';
import { markdownHeader } from '../../core/state/artifact-parsers';
import { gitExecFileSync } from '../git/runner';

const DEFAULT_SPRINTS_DIRECTORY = 'plans/sprints';
const SPRINT_STATUSES = new Set(['Draft', 'Approved', 'Executing', 'Done', 'Archived']);
const LIVE_SPRINT_STATUSES = new Set(['Approved', 'Executing']);

export interface CanonicalSprintSource {
  /** Ref naming the canonical commit, for example `main` or `origin/main`. */
  readonly targetRef: string;
  /** Repo-relative sprint path as it exists on that ref. */
  readonly sprintPath: string;
}

export type CanonicalSprintRead =
  | { readonly ok: true; readonly commit: string; readonly text: string }
  | { readonly ok: false; readonly error: string };

function unsafeSprintPath(sprintPath: string): boolean {
  return sprintPath.length === 0
    || sprintPath.startsWith('/')
    || sprintPath.startsWith('-')
    || sprintPath.includes('\0')
    || sprintPath.includes('\n')
    || sprintPath.includes('\r')
    || sprintPath.split('/').includes('..');
}

function git(cwd: string, args: readonly string[]): string {
  return gitExecFileSync([...args], {
    cwd,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  });
}

export function canonicalSprintsDirectory(
  cwd: string, commit: string, readFile: typeof readCanonicalFileAtCommit = readCanonicalFileAtCommit,
): string {
  const policyText = readFile(cwd, commit, '.ai/harness/policy.json');
  if (policyText === null) return DEFAULT_SPRINTS_DIRECTORY;
  let policy: unknown;
  try {
    policy = JSON.parse(policyText);
  } catch (error) {
    throw new Error(`canonical workflow policy is invalid: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (policy === null || typeof policy !== 'object' || Array.isArray(policy)) {
    throw new Error('canonical workflow policy is not an object');
  }
  const configured = (policy as { sprints?: { dir?: unknown } }).sprints?.dir;
  if (configured === undefined) return DEFAULT_SPRINTS_DIRECTORY;
  if (typeof configured !== 'string' || configured.trim().length === 0) {
    throw new Error('canonical workflow policy .sprints.dir is not a non-empty string');
  }
  const directory = configured.trim().replace(/\/+$/, '');
  if (unsafeSprintPath(directory)) {
    throw new Error(`canonical workflow policy has unsafe .sprints.dir: ${JSON.stringify(configured)}`);
  }
  return directory;
}

function isLiveSprint(sprintPath: string, text: string): boolean {
  const match = text.match(/^> \*\*Status\*\*:[\t ]*(.*)\r?$/m);
  if (match === null) {
    throw new Error(`canonical sprint ${sprintPath} is missing required > **Status**: metadata`);
  }
  const status = match[1]!.trim();
  if (!SPRINT_STATUSES.has(status)) {
    throw new Error(`canonical sprint ${sprintPath} has unknown status '${status}'`);
  }
  return LIVE_SPRINT_STATUSES.has(status);
}

export interface CanonicalSprintIdentityValidationInput {
  /** Exact commit whose live Sprint carriers define the shared lease namespace. */
  readonly commit: string;
  /** The carrier being read or proposed; this content replaces its commit bytes. */
  readonly sprintPath: string;
  readonly sprintText: string;
}

/**
 * Validate a proposed carrier against every live carrier at one fixed commit.
 *
 * Materializers call this with their candidate Sprint content before CAS.  It
 * reads the sibling carriers from `commit`, substitutes the proposed content
 * only for `sprintPath`, and never consults the mutable worktree.
 */
export function assertCanonicalSprintTaskIdsUniqueAtCommit(
  cwd: string,
  input: CanonicalSprintIdentityValidationInput,
): void {
  if (!/^[0-9a-f]{40,64}$/.test(input.commit)) {
    throw new Error(`unsafe canonical commit: ${JSON.stringify(input.commit)}`);
  }
  if (unsafeSprintPath(input.sprintPath)) {
    throw new Error(`unsafe canonical sprint path: ${JSON.stringify(input.sprintPath)}`);
  }
  const directory = canonicalSprintsDirectory(cwd, input.commit);
  const prefix = `${directory}/`;
  const paths = git(cwd, ['ls-tree', '-r', '--name-only', input.commit, '--', directory])
    .split(/\r?\n/)
    .filter((path) => path.startsWith(prefix)
      && !path.slice(prefix.length).includes('/')
      && path.endsWith('.sprint.md'))
    .sort();
  const carriers = new Map<string, string>();
  for (const path of paths) {
    if (path === input.sprintPath) {
      carriers.set(path, input.sprintText);
      continue;
    }
    const text = readCanonicalFileAtCommit(cwd, input.commit, path);
    if (text === null) throw new Error(`canonical sprint ${path} is absent at ${input.commit}`);
    carriers.set(path, text);
  }
  if (!input.sprintPath.startsWith(prefix) || input.sprintPath.slice(prefix.length).includes('/') || !input.sprintPath.endsWith('.sprint.md')) {
    throw new Error(`canonical sprint ${input.sprintPath} is outside policy sprint directory ${directory}`);
  }
  carriers.set(input.sprintPath, input.sprintText);
  const repoIdentity = resolveRepoIdentity(cwd);
  assertUniqueCanonicalTaskIds([...carriers]
    .filter(([sprintPath, text]) => isLiveSprint(sprintPath, text))
    // Schema 1 has no persisted ID authority to compare. Its explicit
    // migration and completing-residue reconciliation read the canonical raw
    // bytes, while every execution identity projection remains fail-closed in
    // projectCanonicalTasks. The migration validates the rewritten schema 2
    // carrier against this same cross-carrier namespace before publishing it.
    .filter(([sprintPath, text]) => {
      try {
        return sprintBacklogSchema(text) === SPRINT_BACKLOG_SCHEMA_V2;
      } catch (error) {
        throw new Error(`canonical sprint ${sprintPath} has invalid backlog schema: ${error instanceof Error ? error.message : String(error)}`);
      }
    })
    .map(([sprintPath, sprintText]) => ({
      repoIdentity,
      sprintPath,
      sprintText,
    })));
}

/**
 * Read one repo-relative file at one already-resolved commit, or `null` when
 * the commit does not carry it.
 *
 * `readCanonicalSprint` resolves the ref and returns the sprint; a caller that
 * must also compare a *sibling* of that sprint -- the Work Graph carrier -- has
 * to read it at the same commit, not from the working tree, or it would bind a
 * receipt to bytes the commit never had.
 */
export function readCanonicalFileAtCommit(
  cwd: string,
  commit: string,
  repoRelativePath: string,
): string | null {
  if (unsafeSprintPath(repoRelativePath)) {
    throw new Error(`unsafe canonical path: ${JSON.stringify(repoRelativePath)}`);
  }
  if (!/^[0-9a-f]{40,64}$/.test(commit)) {
    throw new Error(`unsafe canonical commit: ${JSON.stringify(commit)}`);
  }
  try {
    return git(cwd, ['show', `${commit}:${repoRelativePath}`]);
  } catch {
    return null;
  }
}

/**
 * Read one sprint file at one commit. The ref is resolved to a commit first,
 * so the returned bytes and the returned SHA are the same observation and a
 * caller re-reading after its write can tell a moved ref from a moved file.
 */
export function readCanonicalSprint(
  cwd: string,
  source: CanonicalSprintSource,
): CanonicalSprintRead {
  if (unsafeSprintPath(source.sprintPath)) {
    return { ok: false, error: `unsafe canonical sprint path: ${JSON.stringify(source.sprintPath)}` };
  }
  if (source.targetRef.length === 0 || source.targetRef.startsWith('-')) {
    return { ok: false, error: `unsafe canonical target ref: ${JSON.stringify(source.targetRef)}` };
  }

  let commit: string;
  try {
    commit = git(cwd, ['rev-parse', '--verify', '--end-of-options', `${source.targetRef}^{commit}`]).trim();
  } catch {
    return { ok: false, error: `canonical target ref does not resolve to a commit: ${source.targetRef}` };
  }
  if (!/^[0-9a-f]{40,64}$/.test(commit)) {
    return { ok: false, error: `canonical target ref resolved to an unexpected commit: ${commit}` };
  }

  let text: string;
  try {
    // `git show <sha>:<path>` takes one object name, so no `--` separator is
    // available here; both halves are validated above instead.
    text = git(cwd, ['show', `${commit}:${source.sprintPath}`]);
  } catch {
    return {
      ok: false,
      error: `canonical sprint ${source.sprintPath} is absent at ${source.targetRef} (${commit})`,
    };
  }
  try {
    assertCanonicalSprintTaskIdsUniqueAtCommit(cwd, {
      commit,
      sprintPath: source.sprintPath,
      sprintText: text,
    });
  } catch (error) {
    return {
      ok: false,
      error: `canonical sprint task identity is invalid at ${commit}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  return { ok: true, commit, text };
}
