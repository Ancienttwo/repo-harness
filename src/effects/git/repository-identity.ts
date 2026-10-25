/**
 * Repository identity (R-T9). Git owns both ids; a directory name or the
 * invoking cwd never does.
 *
 * - Repository id: the realpath of `git rev-parse --git-common-dir`, written
 *   `{common}`. Every linked worktree of one clone shares it.
 * - Worktree id: the realpath of `git rev-parse --show-toplevel`. Each checkout
 *   of the clone has its own.
 *
 * Every stored identifier is a deterministic projection of one or both ids,
 * and each projection has exactly one function. The projections keep the bytes
 * of the identifiers that existed before these ids were named, so no stored
 * record moves:
 *
 * | Identifier | Projection | Function |
 * | --- | --- | --- |
 * | coordination `repository_id` | repository id, verbatim | `resolveRepoIdentity` |
 * | worktree trash prefix | sha256(repository id), 32 hex | `worktreeTrashPrefix` |
 * | task-agent session key | sha256(JSON[repository id, task, role]) | `taskSessionKey` |
 * | task-workspace key | sha256(JSON[repository id, worktree id]) | `taskWorkspaceKey` |
 * | gates directory | sha256(worktree id), 64 hex | `gatesDirectoryName` |
 * | registry repo id | `repo_` + sha256(canonical registered root), 16 hex | `repoHarnessRepoIdFor` in `repo-registry.ts` |
 *
 * Gates are worktree-scoped on purpose: an acceptance receipt binds the source
 * snapshot of one checkout, so a clone-scoped gates directory would let one
 * linked worktree overwrite the receipt of another.
 */
import { createHash } from 'crypto';
import { realpathSync } from 'fs';
import { configuredGitBinary, resolveGitCommonDirectory } from './common-directory';
import { gitExecFileSync } from './runner';

export interface RepositoryIdentity {
  readonly repositoryId: string;
  readonly worktreeId: string;
}

export function resolveRepoIdentity(cwd: string, gitBin = configuredGitBinary()): string {
  return resolveGitCommonDirectory(cwd, gitBin);
}

export function resolveWorktreeId(cwd: string, gitBin = configuredGitBinary()): string {
  const topLevel = gitExecFileSync(['rev-parse', '--show-toplevel'], {
    cwd,
    gitBin,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  if (!topLevel) throw new Error(`Git worktree top level is empty for ${cwd}`);
  return realpathSync(topLevel);
}

export function resolveRepositoryIdentity(cwd: string, gitBin = configuredGitBinary()): RepositoryIdentity {
  return { repositoryId: resolveRepoIdentity(cwd, gitBin), worktreeId: resolveWorktreeId(cwd, gitBin) };
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function worktreeTrashPrefix(repositoryId: string): string {
  return `.repo-harness-wt-trash-${sha256Hex(repositoryId).slice(0, 32)}-`;
}

export function taskSessionKey(repositoryId: string, task: string, role: string): string {
  return sha256Hex(JSON.stringify([repositoryId, task, role]));
}

export function taskWorkspaceKey(repositoryId: string, worktreeId: string): string {
  return sha256Hex(JSON.stringify([repositoryId, worktreeId]));
}

export function gatesDirectoryName(worktreeId: string): string {
  return sha256Hex(worktreeId);
}
