import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { createHash, randomBytes } from 'crypto';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'path';
import { withExclusiveDirectoryLock } from '../../effects/locking/exclusive-directory-lock';

export const DELEGATION_STATE_RELATIVE = '.ai/harness/delegation';
export const DELEGATION_STATE_LOCK_RELATIVE = `${DELEGATION_STATE_RELATIVE}/latest.json.lock`;
export const DELEGATION_LOCK_WAIT_TIMEOUT_MS = 2_000;

export interface DelegationScope {
  readonly source: string;
  readonly id: string;
}

export interface DelegationState {
  readonly [key: string]: unknown;
  readonly eligible?: unknown;
  readonly explicit?: unknown;
  readonly spawned?: unknown;
  readonly fallback_used?: unknown;
  readonly scope_id?: unknown;
  readonly state_file?: unknown;
  readonly created_at_epoch?: unknown;
  readonly native_role_routing?: {
    readonly required?: unknown;
    readonly evidence_dir?: unknown;
    readonly [key: string]: unknown;
  };
}

export interface DelegationStatePaths {
  readonly latestPath: string;
  readonly statePath: string;
  readonly stateFile: string;
}

export interface DelegationStateSnapshot {
  readonly latest: DelegationState | null;
  readonly state: DelegationState | null;
  readonly paths: DelegationStatePaths | null;
}

export interface DelegationStateTransaction {
  readonly snapshot: DelegationStateSnapshot;
  /**
   * Merge and persist one state update while the delegation lock is held.
   * `stateFile` is only used when creating a new scoped state; existing state
   * always follows the validated latest projection.
   */
  commit(
    update: DelegationState,
    options?: { readonly stateFile?: string; readonly replace?: boolean },
  ): DelegationState | null;
}

export interface DelegationStateTransactionOptions {
  readonly waitTimeoutMs?: number;
}

interface JsonObject {
  readonly [key: string]: unknown;
}

function firstString(input: JsonObject, keys: readonly string[]): string {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function sanitizeScope(value: string): string {
  return value.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 120);
}

/** Resolve scope candidates in the same priority order for every writer. */
export function delegationScopes(
  input: JsonObject,
  env: NodeJS.ProcessEnv,
): DelegationScope[] {
  const scopes: DelegationScope[] = [];
  const turnId = firstString(input, ['turn_id']);
  if (turnId) scopes.push({ source: 'turn_id', id: `turn-${sanitizeScope(turnId)}` });
  const runId = firstString(input, ['run_id']);
  if (runId) scopes.push({ source: 'run_id', id: `run-${sanitizeScope(runId)}` });
  const sessionId = firstString(input, ['session_id']);
  if (sessionId) scopes.push({ source: 'session_id', id: `session-${sanitizeScope(sessionId)}` });
  const transcriptPath = firstString(input, ['transcript_path']);
  if (transcriptPath) scopes.push({
    source: 'transcript_path',
    id: `transcript-${createHash('sha1').update(transcriptPath).digest('hex').slice(0, 16)}`,
  });
  const envSession = env.CODEX_SESSION_ID || env.CLAUDE_SESSION_ID || '';
  if (envSession) scopes.push({ source: 'env_session', id: `session-${sanitizeScope(envSession)}` });
  return scopes;
}

export function delegationScope(
  input: JsonObject,
  env: NodeJS.ProcessEnv,
): DelegationScope | null {
  return delegationScopes(input, env)[0] ?? null;
}

function readJson(path: string): DelegationState | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as DelegationState
      : null;
  } catch {
    return null;
  }
}

function atomicWriteJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    renameSync(temporary, path);
  } catch (error) {
    try {
      // A failed rename must not leave an untracked projection temporary.
      // The cleanup is intentionally best effort; the original error wins.
      unlinkSync(temporary);
    } catch {
      // No temporary file was committed, or another actor removed it.
    }
    throw error;
  }
}

function isSafeStateFile(stateFile: string): boolean {
  return Boolean(stateFile)
    && !isAbsolute(stateFile)
    && !stateFile.includes('\\')
    && !stateFile.includes('\n')
    && !stateFile.includes('\r')
    && stateFile !== '..'
    && !stateFile.startsWith('../')
    && !stateFile.includes('/../');
}

function statePathFor(stateDir: string, stateFile: string): string | null {
  if (!isSafeStateFile(stateFile)) return null;
  const root = resolve(stateDir);
  const candidate = resolve(root, stateFile);
  if (candidate === root || !candidate.startsWith(`${root}${sep}`)) return null;
  return candidate;
}

function assertSafeStateWritePath(stateDir: string, path: string): void {
  const root = resolve(stateDir);
  const target = resolve(path);
  const rel = relative(root, target);
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`delegation-state: write path escapes state directory: ${path}`);
  }
  let current = root;
  for (const part of rel.split(sep)) {
    current = join(current, part);
    if (!existsSync(current)) continue;
    const entry = lstatSync(current);
    if (entry.isSymbolicLink()) throw new Error(`delegation-state: symlinked write path is forbidden: ${current}`);
    if (current !== target && !entry.isDirectory()) {
      throw new Error(`delegation-state: non-directory write ancestor: ${current}`);
    }
  }
}

function scopedId(scopes: readonly DelegationScope[]): string | null {
  return scopes.length > 0 ? scopes[0].id : null;
}

function resolveSnapshot(
  stateDir: string,
  latest: DelegationState | null,
  scopes: readonly DelegationScope[],
): DelegationStateSnapshot {
  const latestPath = join(stateDir, 'latest.json');
  if (!latest) return { latest: null, state: null, paths: null };

  const latestScope = typeof latest.scope_id === 'string' && latest.scope_id ? latest.scope_id : null;
  if (latestScope && !scopes.some((scope) => scope.id === latestScope)) {
    return { latest, state: null, paths: null };
  }
  const stateFile = typeof latest.state_file === 'string' && latest.state_file
    ? latest.state_file
    : latestScope ? `turns/${latestScope}.json` : 'latest.json';
  const statePath = statePathFor(stateDir, stateFile);
  if (!statePath) return { latest, state: null, paths: null };
  try {
    assertSafeStateWritePath(stateDir, latestPath);
    assertSafeStateWritePath(stateDir, statePath);
  } catch {
    return { latest, state: null, paths: null };
  }
  const state = readJson(statePath);
  if (state) {
    const stateScope = typeof state.scope_id === 'string' && state.scope_id ? state.scope_id : null;
    const declaredStateFile = typeof state.state_file === 'string' && state.state_file
      ? state.state_file
      : null;
    if (stateScope !== latestScope || (declaredStateFile !== null && declaredStateFile !== stateFile)) {
      return { latest, state: null, paths: null };
    }
  }
  return {
    latest,
    state,
    paths: { latestPath, statePath, stateFile },
  };
}

function mergeMonotonic(
  current: DelegationState | null,
  update: DelegationState,
): DelegationState {
  const previous = current ?? {};
  const merged: Record<string, unknown> = { ...previous, ...update };
  for (const key of ['spawned', 'fallback_used'] as const) {
    const wasTrue = previous[key] === true;
    const isTrue = update[key] === true;
    if (wasTrue || isTrue) merged[key] = true;
  }
  // These timestamps describe the first successful claim. A later writer may
  // update other metadata, but must not make a monotonic transition appear to
  // move backwards or happen again.
  if (previous.spawned === true && previous.spawned_at !== undefined) {
    merged.spawned_at = previous.spawned_at;
  }
  if (previous.fallback_used === true && previous.fallback_used_at !== undefined) {
    merged.fallback_used_at = previous.fallback_used_at;
  }
  return merged;
}

function writeProjections(
  stateDir: string,
  paths: DelegationStatePaths,
  state: DelegationState,
): void {
  assertSafeStateWritePath(stateDir, paths.statePath);
  assertSafeStateWritePath(stateDir, paths.latestPath);
  if (paths.statePath === paths.latestPath) {
    atomicWriteJson(paths.latestPath, state);
    return;
  }
  atomicWriteJson(paths.statePath, state);
  atomicWriteJson(paths.latestPath, state);
}

/**
 * Run one delegation-state read/eligibility/merge/projection transaction.
 * Both Stop and SubagentStart use this authority, so no caller can update a
 * scoped state and the latest pointer from separate critical sections.
 */
export function withDelegationStateTransaction<T>(
  repoRoot: string,
  scopes: readonly DelegationScope[],
  run: (transaction: DelegationStateTransaction) => T,
  options: DelegationStateTransactionOptions = {},
): T {
  const canonicalRoot = realpathSync(repoRoot);
  return withExclusiveDirectoryLock(
    canonicalRoot,
    DELEGATION_STATE_LOCK_RELATIVE,
    () => {
      const stateDir = join(canonicalRoot, DELEGATION_STATE_RELATIVE);
      const latestPath = join(stateDir, 'latest.json');
      // Every transaction rereads the latest pointer after entering the lock.
      // A scope mismatch is represented by paths=null and cannot be committed.
      const snapshot = resolveSnapshot(stateDir, readJson(latestPath), scopes);
      let committed = false;
      const transaction: DelegationStateTransaction = {
        snapshot,
        commit(update, commitOptions = {}) {
          if (committed) throw new Error('delegation-state: transaction already committed');
          const replacing = commitOptions.replace === true;
          let paths = replacing ? null : snapshot.paths;
          let current = replacing ? null : snapshot.state;
          if (replacing) {
            const requestedScope = scopedId(scopes);
            const stateFile = commitOptions.stateFile
              ?? (requestedScope ? `turns/${requestedScope}.json` : 'latest.json');
            const statePath = statePathFor(stateDir, stateFile);
            if (!statePath) throw new Error('delegation-state: unsafe state file');
            paths = { latestPath, statePath, stateFile };
          }
          if (!paths || (!replacing && !current)) return null;
          const normalized: Record<string, unknown> = {
            ...mergeMonotonic(current, update),
            state_file: paths.stateFile,
          };
          const identityScope = replacing
            ? scopedId(scopes)
            : typeof snapshot.latest?.scope_id === 'string' && snapshot.latest.scope_id
              ? snapshot.latest.scope_id
              : null;
          if (identityScope) normalized.scope_id = identityScope;
          else delete normalized.scope_id;
          writeProjections(stateDir, paths, normalized);
          committed = true;
          return normalized;
        },
      };
      return run(transaction);
    },
    {
      reclaimStaleOwner: false,
      waitTimeoutMs: options.waitTimeoutMs ?? DELEGATION_LOCK_WAIT_TIMEOUT_MS,
    },
  );
}
