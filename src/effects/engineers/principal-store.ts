import { constants, closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'fs';
import { createHash } from 'crypto';
import { dirname, join } from 'path';

import {
  EngineerPrincipalError,
  buildEngineerPrincipalMapping,
  canonicalEngineerPrincipalMappingBytes,
  revokeEngineerPrincipalMapping,
  validateEngineerPrincipalMapping,
  type EngineerPrincipalMappingV1,
} from '../../core/engineers/principal-claim';
import type { EngineerBindingV1 } from '../../core/engineers/profile-binding';
import { repoHarnessRegisteredReposPath } from '../repo-registry';
import { withExclusiveDirectoryLock } from '../locking/exclusive-directory-lock';

const PRINCIPAL_ROOT = 'engineer-principals/v1';
const PRINCIPAL_LOCK = `${PRINCIPAL_ROOT}/store.lock`;

function storeRoot(env: NodeJS.ProcessEnv): string {
  return join(dirname(repoHarnessRegisteredReposPath(env)), PRINCIPAL_ROOT);
}

function mappingKey(repositoryId: string, authorizationId: string): string {
  return createHash('sha256').update(`${repositoryId}\0${authorizationId}`).digest('hex');
}

function mappingPath(env: NodeJS.ProcessEnv, repositoryId: string, authorizationId: string): string {
  return join(storeRoot(env), `${mappingKey(repositoryId, authorizationId)}.json`);
}

function fail(message: string, cause?: unknown): never {
  throw new EngineerPrincipalError('engineer_principal_store_corrupt', message, cause);
}

function fsyncDirectory(path: string): void {
  const fd = openSync(path, constants.O_RDONLY);
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

function assertStoreRootSafe(env: NodeJS.ProcessEnv): void {
  const root = storeRoot(env);
  if (!existsSync(root)) return;
  const stat = lstatSync(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail('principal mapping root is unsafe');
}

function readMapping(path: string): EngineerPrincipalMappingV1 | null {
  if (!existsSync(path)) return null;
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink()) fail('principal mapping path is unsafe');
    const raw = readFileSync(path, 'utf8');
    const mapping = validateEngineerPrincipalMapping(JSON.parse(raw));
    if (raw !== canonicalEngineerPrincipalMappingBytes(mapping)) fail('principal mapping is not canonical');
    return mapping;
  } catch (error) {
    if (error instanceof EngineerPrincipalError) throw error;
    return fail('principal mapping is unreadable', error);
  }
}

function publishMapping(env: NodeJS.ProcessEnv, mapping: EngineerPrincipalMappingV1): void {
  const root = storeRoot(env);
  mkdirSync(root, { recursive: true, mode: 0o700 });
  assertStoreRootSafe(env);
  const target = mappingPath(env, mapping.repository_id, mapping.authorization_id);
  const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
  try {
    writeFileSync(temp, canonicalEngineerPrincipalMappingBytes(mapping), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    const fd = openSync(temp, constants.O_RDONLY | constants.O_NOFOLLOW);
    try { fsyncSync(fd); } finally { closeSync(fd); }
    renameSync(temp, target);
    fsyncDirectory(root);
  } finally {
    try { unlinkSync(temp); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}

function withStoreLock<T>(env: NodeJS.ProcessEnv, run: () => T): T {
  const home = dirname(repoHarnessRegisteredReposPath(env));
  mkdirSync(home, { recursive: true, mode: 0o700 });
  return withExclusiveDirectoryLock(home, PRINCIPAL_LOCK, run);
}

export interface EnrollEngineerPrincipalInput {
  readonly repository_id: string;
  readonly authorization_id: string;
  readonly binding: EngineerBindingV1;
  readonly created_at?: string;
  readonly env?: NodeJS.ProcessEnv;
}

export function enrollEngineerPrincipal(input: EnrollEngineerPrincipalInput): EngineerPrincipalMappingV1 {
  const env = input.env ?? process.env;
  if (input.binding.state !== 'active') throw new EngineerPrincipalError('engineer_principal_stale', 'only an active Binding can be enrolled');
  return withStoreLock(env, () => {
    const path = mappingPath(env, input.repository_id, input.authorization_id);
    const existing = readMapping(path);
    if (existing && (existing.repository_id !== input.repository_id || existing.authorization_id !== input.authorization_id)) {
      fail('principal mapping identity does not match its store key');
    }
    if (existing && existing.state === 'active'
      && existing.repository_id === input.repository_id
      && existing.authorization_id === input.authorization_id
      && existing.engineer_id === input.binding.engineer_id
      && existing.binding_id === input.binding.binding_id
      && existing.binding_generation === input.binding.binding_generation
      && existing.engineer_contract_revision === input.binding.engineer_contract_revision) return existing;
    const next = buildEngineerPrincipalMapping({
      repository_id: input.repository_id,
      authorization_id: input.authorization_id,
      binding: input.binding,
      created_at: input.created_at ?? new Date().toISOString(),
    });
    if (existing) {
      throw new EngineerPrincipalError('engineer_principal_mismatch', 'authorization already has a different principal mapping');
    }
    publishMapping(env, next);
    return next;
  });
}

export function readEngineerPrincipalMapping(
  repositoryId: string,
  authorizationId: string,
  env: NodeJS.ProcessEnv = process.env,
): EngineerPrincipalMappingV1 | null {
  assertStoreRootSafe(env);
  const mapping = readMapping(mappingPath(env, repositoryId, authorizationId));
  if (mapping && (mapping.repository_id !== repositoryId || mapping.authorization_id !== authorizationId)) {
    fail('principal mapping identity does not match its store key');
  }
  return mapping;
}

export function revokeEngineerPrincipal(
  repositoryId: string,
  authorizationId: string,
  options: { readonly revoked_at?: string; readonly env?: NodeJS.ProcessEnv } = {},
): EngineerPrincipalMappingV1 {
  const env = options.env ?? process.env;
  return withStoreLock(env, () => {
    const current = readMapping(mappingPath(env, repositoryId, authorizationId));
    if (!current) throw new EngineerPrincipalError('engineer_principal_unmapped', 'authorization has no principal mapping');
    if (current.repository_id !== repositoryId || current.authorization_id !== authorizationId) {
      fail('principal mapping identity does not match its store key');
    }
    const next = revokeEngineerPrincipalMapping(current, options.revoked_at ?? new Date().toISOString());
    if (next !== current) publishMapping(env, next);
    return next;
  });
}

export function listEngineerPrincipalMappings(env: NodeJS.ProcessEnv = process.env): readonly EngineerPrincipalMappingV1[] {
  const root = storeRoot(env);
  if (!existsSync(root)) return Object.freeze([]);
  try {
    assertStoreRootSafe(env);
    const stat = lstatSync(root);
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail('principal mapping root is unsafe');
    return Object.freeze(readdirSync(root)
      .filter((name) => /^[0-9a-f]{64}\.json$/.test(name))
      .sort()
      .map((name) => readMapping(join(root, name))!));
  } catch (error) {
    if (error instanceof EngineerPrincipalError) throw error;
    return fail('principal mapping root is unreadable', error);
  }
}
