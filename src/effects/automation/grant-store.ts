/**
 * Where `ProgramAuthorizationV1` grants live.
 *
 * The PRD is explicit that a grant is "stored in REPO_HARNESS_HOME, not
 * candidate branch" and "minted only by operator/Host profile". A grant that
 * travels inside the budget object it authorizes is not an authority at all --
 * anything that can build the budget can build the grant. So the budget store
 * accepts a grant only when its digest resolves to byte-identical bytes in this
 * account-level store, which lives outside every repository working tree and is
 * written by one operator verb.
 */
import { constants, closeSync, existsSync, fsyncSync, linkSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, unlinkSync, writeSync } from 'fs';
import { dirname, join, resolve } from 'path';

import {
  canonicalAutomationJson,
  validateProgramAuthorization,
  type ProgramAuthorizationV1,
} from '../../core/automation/budget';
import { resolveGitCommonDirectory } from '../git/common-directory';
import { repoHarnessHome, repoHarnessRepoIdFor } from '../repo-registry';

export type AutomationGrantStoreErrorCode =
  | 'automation_grant_not_a_repository'
  | 'automation_grant_unavailable'
  | 'automation_grant_unsafe'
  | 'automation_grant_invalid'
  | 'automation_grant_not_found'
  | 'automation_grant_conflict';

export class AutomationGrantStoreError extends Error {
  constructor(readonly code: AutomationGrantStoreErrorCode, message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'AutomationGrantStoreError';
  }
}

function fail(code: AutomationGrantStoreErrorCode, message: string, cause?: unknown): never {
  throw new AutomationGrantStoreError(code, message, cause);
}

/**
 * The gate keys by the same identity the ledger does: the Git common directory.
 *
 * A grant authorizes work on a clone, not on one checkout of it. Keying by the
 * working-tree path would hide a minted grant from every linked worktree of the
 * same clone, while the budget ledger those worktrees share lives under the
 * common directory -- two different identities for one authority. The real path
 * is used so a symlinked checkout resolves to the same key.
 */
export function automationGrantRepoKey(repoRoot: string): string {
  let identity: string;
  try {
    identity = resolveGitCommonDirectory(resolve(repoRoot));
  } catch (error) {
    // There is no path key to fall back to. A grant filed under a plain
    // directory path would be abandoned the moment that directory became a
    // repository, because the key would change and the stored grant would stop
    // resolving -- an authority that silently disappears is worse than none.
    return fail(
      'automation_grant_not_a_repository',
      `automation grants are keyed by the Git common directory, and ${resolve(repoRoot)} is not inside a Git repository`,
      error,
    );
  }
  try {
    identity = realpathSync(identity);
  } catch {
    // The common directory resolved, so its literal path is a valid key even if
    // it cannot be canonicalised on this filesystem.
  }
  return repoHarnessRepoIdFor(identity);
}

export function automationGrantStoreDirectory(repoRoot: string, env: NodeJS.ProcessEnv = process.env): string {
  return join(repoHarnessHome(env), 'gates', automationGrantRepoKey(repoRoot), 'program-authorizations');
}

function ensureDirectory(path: string): void {
  try {
    mkdirSync(path, { recursive: true, mode: 0o700 });
  } catch (error) {
    fail('automation_grant_unavailable', `cannot create the automation grant store: ${path}`, error);
  }
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    fail('automation_grant_unsafe', `automation grant store path is unsafe: ${path}`);
  }
}

function grantPath(repoRoot: string, authorizationSha256: string, env: NodeJS.ProcessEnv): string {
  if (!/^[0-9a-f]{64}$/u.test(authorizationSha256)) {
    fail('automation_grant_unsafe', 'unsafe program authorization digest');
  }
  return join(automationGrantStoreDirectory(repoRoot, env), `${authorizationSha256}.json`);
}

function writeCreateOnce(path: string, bytes: string): boolean {
  const temp = join(dirname(path), `.${'grant'}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  let descriptor: number | null = null;
  try {
    descriptor = openSync(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    const buffer = Buffer.from(bytes, 'utf8');
    let offset = 0;
    while (offset < buffer.length) offset += writeSync(descriptor, buffer, offset, buffer.length - offset);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = null;
    try {
      // `link` publishes atomically and fails EEXIST, so a stored grant is
      // always complete bytes and is never silently replaced.
      linkSync(temp, path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
      throw error;
    }
    return true;
  } catch (error) {
    return fail('automation_grant_unavailable', `cannot persist the program authorization: ${path}`, error);
  } finally {
    if (descriptor !== null) closeSync(descriptor);
    try {
      unlinkSync(temp);
    } catch {
      // The temporary file may never have existed.
    }
  }
}

export interface MintProgramAuthorizationInput {
  readonly repo_root: string;
  readonly authorization: ProgramAuthorizationV1;
  readonly env?: NodeJS.ProcessEnv;
}

/**
 * The operator verb's effect. Minting is create-once and idempotent for
 * identical bytes; a different grant claiming the same digest is impossible,
 * and a different byte sequence at the same path is a conflict, not an update.
 */
export function mintProgramAuthorization(input: MintProgramAuthorizationInput): string {
  const env = input.env ?? process.env;
  const authorization = validateProgramAuthorization(input.authorization);
  const directory = automationGrantStoreDirectory(input.repo_root, env);
  ensureDirectory(directory);
  const path = grantPath(input.repo_root, authorization.authorization_sha256, env);
  const bytes = `${canonicalAutomationJson(authorization)}\n`;
  if (!writeCreateOnce(path, bytes) && readFileSync(path, 'utf8') !== bytes) {
    fail('automation_grant_conflict', 'a different program authorization is already stored under this digest');
  }
  return path;
}

export function listStoredProgramAuthorizations(repoRoot: string, env: NodeJS.ProcessEnv = process.env): readonly string[] {
  const directory = automationGrantStoreDirectory(repoRoot, env);
  if (!existsSync(directory)) return Object.freeze([]);
  try {
    return Object.freeze(
      readdirSync(directory)
        .filter((entry) => /^[0-9a-f]{64}\.json$/u.test(entry))
        .map((entry) => entry.replace(/\.json$/u, ''))
        .sort(),
    );
  } catch (error) {
    return fail('automation_grant_unavailable', 'cannot list the automation grant store', error);
  }
}

export function readStoredProgramAuthorization(
  repoRoot: string,
  authorizationSha256: string,
  env: NodeJS.ProcessEnv = process.env,
): ProgramAuthorizationV1 {
  const path = grantPath(repoRoot, authorizationSha256, env);
  let raw: string;
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink()) fail('automation_grant_unsafe', 'stored program authorization is not a regular file');
    raw = readFileSync(path, 'utf8');
  } catch (error) {
    if (error instanceof AutomationGrantStoreError) throw error;
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      fail('automation_grant_not_found', `no program authorization ${authorizationSha256} is stored for this repository`);
    }
    return fail('automation_grant_unavailable', 'cannot read the stored program authorization', error);
  }
  let parsed: ProgramAuthorizationV1;
  try {
    parsed = validateProgramAuthorization(JSON.parse(raw) as ProgramAuthorizationV1);
  } catch (error) {
    return fail('automation_grant_invalid', `stored program authorization is invalid: ${(error as Error).message}`, error);
  }
  if (`${canonicalAutomationJson(parsed)}\n` !== raw) {
    fail('automation_grant_invalid', 'stored program authorization bytes are not canonical');
  }
  if (parsed.authorization_sha256 !== authorizationSha256) {
    fail('automation_grant_invalid', 'stored program authorization digest does not match its path');
  }
  return parsed;
}

/**
 * The anchor check the budget store runs before it accepts any budget: the
 * embedded grant must be byte-identical to one an operator minted here.
 */
export function assertProgramAuthorizationAnchored(
  repoRoot: string,
  authorization: ProgramAuthorizationV1,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const stored = readStoredProgramAuthorization(repoRoot, authorization.authorization_sha256, env);
  if (canonicalAutomationJson(stored) !== canonicalAutomationJson(authorization)) {
    fail('automation_grant_conflict', 'the embedded program authorization does not match the stored grant bytes');
  }
}
