/**
 * Mutation guard: the in-process decision handler for `PreToolUse.edit`.
 *
 * It keeps only the path boundaries that block: repository scope, `_ref`,
 * `_ops`, and a parseable target. Target paths come from
 * `tool_input.file_path`, or from the apply_patch text in
 * `tool_input.command`. The guard checks them in order and stops at the first
 * denial. A denial writes one stderr reason with its fix and one failure
 * record. An allowed edit can carry the `[CapabilityOwner]` line.
 */

import { appendFileSync, mkdirSync, realpathSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, isAbsolute, join, posix, relative, sep, win32 } from 'path';
import { managedWorktreeRoot } from '../../effects/git/managed-worktree';
import {
  canonicalExternalPath,
  canonicalRepoRelativePath,
  isForeignDriveAbsolutePath,
} from '../../effects/state/collect-state-inputs';
import { parseStatusZ, splitNul } from '../../effects/review/diff-fingerprint';
import { capabilityOwnersForPaths, FAILURE_LOG_FILE, type CapabilityPathOwner } from '../../effects/state/resolve-effective-state';
import { payloadString, type HookIdentity, type HookPayload } from './hook-input';
import { protectedRepoDir } from './mutation-protected-dirs';
import { gitExecFileSync } from '../../effects/git/runner';

export interface MutationGuardInput {
  readonly repoRoot: string;
  readonly payload: HookPayload;
  readonly identity: HookIdentity;
}

export interface MutationGuardResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface Denial {
  readonly guard: string;
  readonly reason: string;
  readonly fix: string;
}

const APPLY_PATCH_SCOPE_DENIAL: Denial = {
  guard: 'ApplyPatchScopeGuard',
  reason: 'Codex apply_patch input did not expose a parseable target path.',
  fix: 'Use a standard *** Add/Update/Delete File patch header so every target can be checked before the write.',
};

const EDIT_SCOPE_DENIAL: Denial = {
  guard: 'EditScopeGuard',
  reason: 'Edit input did not expose a target path in tool_input.file_path.',
  fix: 'Send the target path in tool_input.file_path so it can be checked before the write.',
};

export function runMutationGuard(opts: MutationGuardInput): MutationGuardResult {
  const { repoRoot, payload } = opts;
  const command = payloadString(payload, 'tool_input.command');
  const filePath = payloadString(payload, 'tool_input.file_path');
  const paths = command
    ? extractApplyPatchPaths(repoRoot, command)
    : (filePath ? [normalizeFilePath(repoRoot, filePath)] : []);
  const denial = paths.length === 0
    ? (command ? APPLY_PATCH_SCOPE_DENIAL : EDIT_SCOPE_DENIAL)
    : firstDenial(repoRoot, paths);
  if (denial) return deny(repoRoot, denial, opts.identity.runId);
  return { exitCode: 0, stdout: capabilityOwnerLines(repoRoot, paths), stderr: '' };
}

/** Bash uses the same private path authority; outside the repository it may write only below a Bash write root. */
export function runMutationPathGuard(opts: MutationGuardInput, rawPaths: readonly string[]): MutationGuardResult {
  const paths = rawPaths.map(raw => normalizeFilePath(opts.repoRoot, raw));
  const denial = firstDenial(opts.repoRoot, paths, bashWriteRoots());
  return denial ? deny(opts.repoRoot, denial, opts.identity.runId) : { exitCode: 0, stdout: '', stderr: '' };
}

/** Canonical system temp roots and the managed worktree root. */
function bashWriteRoots(): readonly string[] {
  const roots: string[] = [];
  const candidates: Array<() => string> = [
    () => realpathSync(tmpdir()),
    ...(process.platform === 'win32' ? [] : [() => realpathSync('/tmp')]),
    () => managedWorktreeRoot(),
  ];
  for (const candidate of candidates) {
    // A root that does not exist contains no canonical target, so it adds no allowance.
    try { roots.push(candidate()); } catch { /* fail closed for this root */ }
  }
  return roots;
}

/** Strictly below the root: the root itself and prefix neighbours such as /tmp-x are outside. */
function isBelowRoot(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

function externalTargetAllowed(repoRoot: string, filePath: string, bashRoots: readonly string[] | null): boolean {
  const external = canonicalExternalPath(repoRoot, filePath);
  if (bashRoots === null) return external !== null || isForeignDriveAbsolutePath(repoRoot, filePath);
  return external !== null && bashRoots.some(root => isBelowRoot(root, external));
}

/** A caller that owns its own decision reports it through the same denial record and exit code. */
export function runMutationDenial(opts: MutationGuardInput, denial: Denial): MutationGuardResult {
  return deny(opts.repoRoot, denial, opts.identity.runId);
}

/** `bashRoots` null is the Edit/Write rule: any verified external path passes. */
function firstDenial(repoRoot: string, paths: readonly string[], bashRoots: readonly string[] | null = null): Denial | null {
  for (const filePath of paths) {
    // normalizeFilePath leaves an absolute path raw both for a verified external
    // target and for input it could not resolve (e.g. `/repo/src/../_ops/x`);
    // only the first, or for Edit/Write a foreign Win32 drive path, may skip
    // the repository boundary checks below.
    if (isRepoScopedPath(filePath)
      ? canonicalRepoRelativePath(repoRoot, filePath) !== filePath
      : !externalTargetAllowed(repoRoot, filePath, bashRoots)) {
      return {
        guard: 'RepoScopeGuard',
        reason: bashRoots === null
          ? `${filePath} is not a canonical path contained by the current repository.`
          : `${filePath} is not a canonical path contained by the current repository or below a Bash write root (${bashRoots.join(', ')}).`,
        fix: bashRoots === null
          ? 'Use a canonical repository-relative path without traversal or symlink escape.'
          : 'Write inside the repository or below a system temp root or the managed worktree root, without traversal or symlink escape.',
      };
    }
    if (protectedRepoDir(filePath) === '_ref') {
      return {
        guard: 'ExternalReferenceGuard',
        reason: `${filePath} is under _ref/, external comparison material that is not a product edit surface.`,
        fix: 'Refresh _ref/ from upstream sources when needed, keep it ignored, and do not edit it as repo implementation.',
      };
    }
    if (protectedRepoDir(filePath) === '_ops') {
      return {
        guard: 'OpsPrivateGuard',
        reason: `${filePath} is under _ops/, the ignored local private operations state for secrets, real env files, provider state, artifacts, logs, and scratch files.`,
        fix: 'Commit deploy/ runbooks, release checklists, scripts, submissions, and env examples; do not write _ops/* through agent edits.',
      };
    }
  }
  return null;
}

function deny(repoRoot: string, denial: Denial, runId: string | null): MutationGuardResult {
  let stderr = `[${denial.guard}] ${denial.reason}\n  Fix: ${denial.fix}\n`;
  // The failure record is a diagnostic. Its I/O error must not escape: the
  // runtime turns a throw on this route into a crash block, which would
  // replace this denial's own reason.
  try {
    appendFailureRecord(repoRoot, denial, runId);
  } catch (error) {
    stderr += `[${denial.guard}] Failure log not written: ${error instanceof Error ? error.message : String(error)}\n`;
  }
  return { exitCode: 2, stdout: '', stderr };
}

/**
 * The owner line appears on the first edit of an owned path after its last
 * commit: Git, not a session cursor, says whether the path already changed.
 * The Git check runs only when an ownership authority exists, and ownership
 * resolves only for clean paths, so an edit of a changed path skips
 * `archctx resolve`. Architecture diagnostics never block, so an ownership
 * or Git failure only drops the line.
 */
function capabilityOwnerLines(repoRoot: string, paths: readonly string[]): string {
  const repoPaths = [...new Set(paths.filter(isRepoScopedPath))];
  if (repoPaths.length === 0) return '';
  let owners: ReadonlyMap<string, CapabilityPathOwner>;
  try {
    owners = capabilityOwnersForPaths(repoRoot, repoPaths, (surfaces) => pathsWithNoUncommittedChange(repoRoot, surfaces));
  } catch {
    return '';
  }
  let lines = '';
  for (const filePath of repoPaths) {
    const owner = owners.get(filePath);
    if (owner) lines += `[CapabilityOwner] ${filePath} belongs to ${owner.id} (${owner.module_document}).\n`;
  }
  return lines;
}

/** One `git status` for the batch; a Git failure treats every path as changed. */
function pathsWithNoUncommittedChange(repoRoot: string, paths: readonly string[]): readonly string[] {
  if (paths.length === 0) return paths;
  let changed: readonly string[];
  try {
    changed = parseStatusZ(splitNul(gitExecFileSync(['-C', repoRoot, '--literal-pathspecs', 'status', '--porcelain', '-z', '--untracked-files=all', '--', ...paths], {
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5_000,
    }))).all;
  } catch {
    return [];
  }
  return paths.filter((path) => !changed.some((entry) => entry === path || entry.startsWith(`${path}/`)));
}

// ---------------------------------------------------------------------------
// Path classification
// ---------------------------------------------------------------------------

function isRepoScopedPath(filePath: string): boolean {
  return filePath.length > 0 && !isAbsolutePathInAnyGrammar(filePath);
}

function isAbsolutePathInAnyGrammar(filePath: string): boolean {
  return posix.isAbsolute(filePath)
    || win32.isAbsolute(filePath)
    || /^[A-Za-z]:/.test(filePath);
}

function normalizeFilePath(repoRoot: string, raw: string): string {
  return canonicalRepoRelativePath(repoRoot, raw) ?? raw;
}

// ---------------------------------------------------------------------------
// apply_patch target paths
// ---------------------------------------------------------------------------

// Matches what codex-cli 0.160.0 applies. It trims a file hunk header with
// Rust `str::trim` before it matches the marker, so leading and trailing
// Unicode White_Space is allowed there. That set includes U+0085 and excludes
// U+FEFF, so JS `\s` does not fit. `*** Move to: ` must start at column 0;
// only its trailing whitespace is trimmed. Inner path whitespace is kept.
const PATCH_WS = '[\\t\\n\\v\\f\\r \\u0085\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000]';
const APPLY_PATCH_FILE_LINE = new RegExp(`^${PATCH_WS}*\\*\\*\\* (?:Add|Update|Delete) File: (.+?)${PATCH_WS}*$`, 's');
const APPLY_PATCH_MOVE_LINE = new RegExp(`^\\*\\*\\* Move to: (.+?)${PATCH_WS}*$`, 's');

function extractApplyPatchPaths(repoRoot: string, command: string): readonly string[] {
  const paths: string[] = [];
  for (const line of command.split('\n')) {
    const fileMatch = APPLY_PATCH_FILE_LINE.exec(line);
    const moveMatch = fileMatch ? null : APPLY_PATCH_MOVE_LINE.exec(line);
    const raw = fileMatch?.[1] ?? moveMatch?.[1];
    if (raw) paths.push(normalizeFilePath(repoRoot, raw));
  }
  return paths;
}

// ---------------------------------------------------------------------------
// Failure record
// ---------------------------------------------------------------------------

function appendFailureRecord(repoRoot: string, denial: Denial, runId: string | null): void {
  const target = join(repoRoot, FAILURE_LOG_FILE);
  mkdirSync(dirname(target), { recursive: true });
  const record = {
    ts: formatIsoWithNumericOffset(new Date()),
    guard: denial.guard,
    action: 'block',
    reason: denial.reason,
    fix: denial.fix,
    failure_class: 'state_violation',
    run_id: runId,
  };
  appendFileSync(target, `${JSON.stringify(record)}\n`);
}

/** Local time with a numeric offset and no colon, e.g. `2026-10-13T09:00:00+0800`. */
function formatIsoWithNumericOffset(date: Date): string {
  const pad = (value: number, length = 2): string => String(value).padStart(length, '0');
  const offsetMinutesTotal = -date.getTimezoneOffset();
  const offsetSign = offsetMinutesTotal >= 0 ? '+' : '-';
  const offsetHours = pad(Math.floor(Math.abs(offsetMinutesTotal) / 60));
  const offsetMinutes = pad(Math.abs(offsetMinutesTotal) % 60);
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    + `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
    + `${offsetSign}${offsetHours}${offsetMinutes}`
  );
}
