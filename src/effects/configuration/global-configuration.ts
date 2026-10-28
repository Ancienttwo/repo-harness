import { createHash } from 'node:crypto';
import { closeSync, constants, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, unlinkSync, writeSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { syncDirectoryDurably } from '../atomic-append';
import { ExclusiveLockContentionError } from '../locking/exclusive-directory-lock';
import { assertRuntimeTransactionContext, globalRuntimeScope, withRuntimeTransactionContext, type RuntimeTransactionContext } from '../locking/runtime-transaction-lock';

export class GlobalConfigurationError extends Error {
  constructor(readonly code: 'config_invalid' | 'config_is_link' | 'revision_conflict' | 'busy', message: string) {
    super(message);
    this.name = 'GlobalConfigurationError';
  }
}

export function globalConfigurationPath(env: NodeJS.ProcessEnv = process.env): string {
  const home = env.HOME ?? process.env.HOME ?? homedir();
  if (!isAbsolute(home)) throw new Error('global configuration requires an absolute HOME');
  return join(home, '.repo-harness', 'config.json');
}

/** The digest of the exact file bytes, or `absent` when there is no file. */
export function globalConfigurationRevision(bytes: Buffer | null): string {
  return bytes === null ? 'absent' : `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function assertWritableConfiguration(path: string): void {
  for (const [entry, directory] of [[dirname(path), true], [path, false]] as const) {
    try {
      const stat = lstatSync(entry);
      if (stat.isSymbolicLink()) throw new GlobalConfigurationError('config_is_link', 'The repo-harness configuration path is a symbolic link. Writes require a regular file in a real directory.');
      if (directory ? !stat.isDirectory() : !stat.isFile()) throw new GlobalConfigurationError('config_invalid', 'The repo-harness configuration path has an invalid file type.');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}

function replaceGlobalConfiguration(path: string, bytes: Buffer | null, assertOwned: () => void): void {
  assertWritableConfiguration(path);
  const directory = dirname(path);
  const created = mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (created !== undefined) syncDirectoryDurably(dirname(directory));
  if (bytes === null) {
    assertOwned();
    try { unlinkSync(path); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    syncDirectoryDurably(directory);
    return;
  }
  const temporary = `${path}.tmp-${process.pid}-${randomUUID()}`;
  const fd = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
  try {
    try {
      if (writeSync(fd, bytes) !== bytes.byteLength) throw new Error('configuration was only partly written');
      fsyncSync(fd);
    } finally { closeSync(fd); }
    assertOwned();
    assertWritableConfiguration(path);
    renameSync(temporary, path);
    syncDirectoryDurably(directory);
  } finally { rmSync(temporary, { force: true }); }
}

/** Restore the exact installer preimage while its original transaction is still held. */
export function restoreGlobalConfiguration(path: string, bytes: Buffer | null, runtimeLock: RuntimeTransactionContext): void {
  if (path !== join(dirname(dirname(path)), '.repo-harness', 'config.json')) throw new Error('invalid configuration snapshot path');
  const scope = process.platform === 'win32' ? globalRuntimeScope() : { kind: 'global' as const, root: dirname(dirname(path)) };
  assertRuntimeTransactionContext(runtimeLock, scope);
  if (bytes !== null) {
    const value: unknown = JSON.parse(bytes.toString('utf8'));
    if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new GlobalConfigurationError('config_invalid', 'The configuration preimage is not a valid JSON object.');
  }
  replaceGlobalConfiguration(path, bytes, () => assertRuntimeTransactionContext(runtimeLock, scope));
}

/** All product writers join the install transaction lock before reading this document. */
export function mutateGlobalConfiguration<T>(
  env: NodeJS.ProcessEnv,
  mutate: (config: Record<string, unknown>) => { readonly config?: Record<string, unknown> | null; readonly value: T },
  options: { readonly expectedRevision?: string; readonly runtimeLock?: RuntimeTransactionContext } = {},
): { readonly path: string; readonly revision: string; readonly changed: boolean; readonly value: T } {
  const scope = globalRuntimeScope(env);
  try {
    return withRuntimeTransactionContext(scope, options.runtimeLock, (context) => {
      // Windows maps each explicit target HOME to the same account lock. The target stays at the supplied HOME.
      if (process.platform !== 'win32') assertRuntimeTransactionContext(context, { kind: 'global', root: dirname(dirname(globalConfigurationPath(env))) });
      const path = globalConfigurationPath(env);
      assertWritableConfiguration(path);
      let document: ReturnType<typeof readGlobalConfiguration>;
      try { document = readGlobalConfiguration(env); }
      catch { throw new GlobalConfigurationError('config_invalid', 'The repo-harness configuration file is not a valid JSON object.'); }
      if (options.expectedRevision !== undefined && options.expectedRevision !== document.revision) {
        throw new GlobalConfigurationError('revision_conflict', 'The configuration changed after it was read.');
      }
      const next = mutate(document.config);
      if (next.config === undefined) return { path, revision: document.revision, changed: false, value: next.value };
      const bytes = next.config === null ? null : Buffer.from(`${JSON.stringify(next.config, null, 2)}\n`, 'utf8');
      const revision = globalConfigurationRevision(bytes);
      if (revision === document.revision) return { path, revision, changed: false, value: next.value };
      replaceGlobalConfiguration(path, bytes, () => assertRuntimeTransactionContext(context, scope));
      return { path, revision, changed: true, value: next.value };
    }, { waitTimeoutMs: 1 });
  } catch (error) {
    if (error instanceof ExclusiveLockContentionError) throw new GlobalConfigurationError('busy', 'A runtime transaction is changing configuration. Nothing was changed. Retry after it ends.');
    throw error;
  }
}

/** One host configuration document; typed consumers validate their own section. */
export function readGlobalConfiguration(env: NodeJS.ProcessEnv = process.env): { path: string; config: Record<string, unknown>; revision: string } {
  const path = globalConfigurationPath(env);
  let bytes: Buffer | null = null;
  let value: unknown;
  try {
    bytes = readFileSync(path);
    value = JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error(`Invalid global configuration at ${path}: ${error instanceof Error ? error.message : String(error)}`);
    value = {};
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Global configuration must be an object: ${path}`);
  return { path, config: value as Record<string, unknown>, revision: globalConfigurationRevision(bytes) };
}
