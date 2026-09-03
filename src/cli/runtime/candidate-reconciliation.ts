import { createHash, randomUUID } from 'crypto';
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  openSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { homedir } from 'os';
import { isAbsolute, join, relative, resolve, sep } from 'path';

import type { InstallTargetSpec } from '../commands/install';
import type { InstallProfile } from '../installer/install-profile';
import {
  buildManagedHooks,
  canonicalManagedHookProjection,
  type HookHost,
  type HooksByEvent,
} from '../installer/managed-entries';
import { ROUTES } from '../hook/route-registry';
import { readExclusiveDirectoryLockOwner } from '../../effects/locking/exclusive-directory-lock';

export const CANDIDATE_RECONCILIATION_PROTOCOL = 1;
export const CANDIDATE_RECONCILIATION_CAPABILITY_PROTOCOL = 1;
export const GLOBAL_RUNTIME_LOCK_RELATIVE_PATH = '.repo-harness/transactions/global-runtime.lock';
const CANDIDATE_CAPABILITY_NAME = '.candidate-runtime-reconciliation-capability.v1.json';

interface FileIdentity {
  readonly dev: number;
  readonly ino: number;
}

export interface CandidateReconciliationCapability {
  readonly protocol: typeof CANDIDATE_RECONCILIATION_CAPABILITY_PROTOCOL;
  readonly transaction_id: string;
  readonly parent_token: string;
  readonly parent_pid: number;
  readonly lock_path: string;
  readonly lock_owner_token: string;
  readonly created_at: string;
}

export interface CandidateReconciliationCapabilityInput {
  readonly transactionId: string;
  readonly transactionBackupRoot: string;
  readonly parentToken: string;
  readonly parentPid: number;
  readonly lockPath: string;
  readonly lockOwnerToken: string;
}

export interface CandidatePackageIdentity {
  readonly root: string;
  readonly version: string;
  readonly package_digest: string;
}

export interface CandidateReconciliationReceipt {
  readonly protocol: typeof CANDIDATE_RECONCILIATION_PROTOCOL;
  readonly transaction_id: string;
  readonly candidate_package_root: string;
  readonly candidate_version: string;
  readonly candidate_package_digest: string;
  readonly route_registry_digest: string;
  readonly selected_target: InstallTargetSpec;
  readonly adapter_projection_digests: Readonly<Partial<Record<HookHost, string>>>;
  readonly ownership_manifest_digest: string | null;
  readonly reconciliation_scope: 'complete' | 'partial';
  readonly verified_at: string;
}

export interface CandidateReconciliationRequest {
  readonly protocol: typeof CANDIDATE_RECONCILIATION_PROTOCOL;
  readonly transaction_id: string;
  readonly transaction_backup_root: string;
  readonly parent_token: string;
  readonly candidate: CandidatePackageIdentity;
  readonly cwd: string;
  readonly target: InstallTargetSpec;
  readonly profile: InstallProfile;
  readonly sync_skill: boolean;
  readonly host_adapters: boolean;
  readonly external_skills: boolean;
  readonly reverse_skill: boolean;
  readonly obsidian_skills: boolean;
  readonly codegraph: boolean;
  readonly brain_root?: string;
}

export interface CandidateReceiptExpectation {
  readonly transaction_id: string;
  readonly candidate: CandidatePackageIdentity;
  readonly target: InstallTargetSpec;
  readonly profile: InstallProfile;
  readonly require_complete: boolean;
  readonly require_adapter_projection?: boolean;
}

export function sha256(value: string | Buffer): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function fileIdentity(stat: { readonly dev: number; readonly ino: number }): FileIdentity {
  return { dev: stat.dev, ino: stat.ino };
}

function sameFileIdentity(left: FileIdentity, right: FileIdentity): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function canonicalDirectory(path: string, label: string): string {
  const resolved = resolve(path);
  const stat = lstatSync(resolved);
  if (!stat.isDirectory()) throw new Error(`${label} is not a directory: ${resolved}`);
  return realpathSync(resolved);
}

function pathWithin(path: string, root: string): boolean {
  const normalized = relative(root, path);
  return normalized === '' || (
    normalized !== '..'
    && !normalized.startsWith(`..${sep}`)
    && !isAbsolute(normalized)
  );
}

function candidateCapabilityPath(transactionBackupRoot: string): string {
  return join(transactionBackupRoot, CANDIDATE_CAPABILITY_NAME);
}

function parseCapability(raw: string): CandidateReconciliationCapability {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('candidate reconciliation capability is not valid JSON');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('candidate reconciliation capability is not an object');
  }
  const value = parsed as Record<string, unknown>;
  if (
    value.protocol !== CANDIDATE_RECONCILIATION_CAPABILITY_PROTOCOL
    || typeof value.transaction_id !== 'string' || !value.transaction_id.startsWith('sha256:')
    || typeof value.parent_token !== 'string' || !/^[a-f0-9]{64}$/i.test(value.parent_token)
    || !Number.isSafeInteger(value.parent_pid) || (value.parent_pid as number) < 1
    || typeof value.lock_path !== 'string' || !isAbsolute(value.lock_path)
    || typeof value.lock_owner_token !== 'string' || !/^[1-9]\d*-\d+-[0-9a-f-]{36}$/i.test(value.lock_owner_token)
    || typeof value.created_at !== 'string'
  ) {
    throw new Error('candidate reconciliation capability has invalid shape');
  }
  return value as unknown as CandidateReconciliationCapability;
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}

/**
 * Publish the one-shot capability only while the predecessor owns the global
 * runtime lock. A hard-link publication avoids replacing a concurrently
 * created capability file.
 */
export function publishCandidateReconciliationCapability(
  input: CandidateReconciliationCapabilityInput,
): CandidateReconciliationCapability {
  const backupRoot = canonicalDirectory(input.transactionBackupRoot, 'candidate reconciliation transaction backup');
  const record: CandidateReconciliationCapability = {
    protocol: CANDIDATE_RECONCILIATION_CAPABILITY_PROTOCOL,
    transaction_id: input.transactionId,
    parent_token: input.parentToken,
    parent_pid: input.parentPid,
    lock_path: input.lockPath,
    lock_owner_token: input.lockOwnerToken,
    created_at: new Date().toISOString(),
  };
  parseCapability(JSON.stringify(record));
  const path = candidateCapabilityPath(backupRoot);
  const temporary = join(backupRoot, `.${CANDIDATE_CAPABILITY_NAME}.${randomUUID()}.tmp`);
  let fd: number | null = null;
  try {
    fd = openSync(
      temporary,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    );
    writeFileSync(fd, `${JSON.stringify(record)}\n`);
    fsyncSync(fd);
    const temporaryIdentity = fileIdentity(fstatSync(fd));
    closeSync(fd);
    fd = null;
    // link(2) is an atomic no-replace publication fence in this directory.
    linkSync(temporary, path);
    const published = lstatSync(path);
    if (!published.isFile() || !sameFileIdentity(fileIdentity(published), temporaryIdentity)) {
      throw new Error('candidate reconciliation capability publication lost ownership');
    }
    unlinkSync(temporary);
    return record;
  } catch (error) {
    if (fd !== null) closeSync(fd);
    try {
      unlinkSync(temporary);
    } catch {
      // The transaction rollback owns cleanup after a failed publication.
    }
    throw error;
  }
}

/**
 * Consume a parent-published capability before candidate code mutates any
 * managed surface. The parent PID, one-shot token, and live global lock must
 * all agree; argv/env values alone are never authority.
 */
export function consumeCandidateReconciliationCapability(
  request: CandidateReconciliationRequest,
  home: string,
): CandidateReconciliationCapability {
  if (request.transaction_id !== sha256(request.transaction_backup_root)) {
    throw new Error('candidate reconciliation transaction identifier is not bound to its backup root');
  }
  const canonicalHome = canonicalDirectory(home, 'candidate reconciliation home');
  const transactionRoot = canonicalDirectory(join(canonicalHome, '.repo-harness', 'transactions'), 'candidate reconciliation transaction root');
  const backupRoot = canonicalDirectory(request.transaction_backup_root, 'candidate reconciliation transaction backup');
  if (!pathWithin(backupRoot, transactionRoot) || backupRoot === transactionRoot) {
    throw new Error(`candidate reconciliation transaction backup is outside the active transaction root: ${backupRoot}`);
  }
  const path = candidateCapabilityPath(backupRoot);
  const observed = lstatSync(path);
  if (!observed.isFile()) throw new Error('candidate reconciliation capability is not a regular file');
  const observedIdentity = fileIdentity(observed);
  const capability = parseCapability(readFileSync(path, 'utf-8'));
  if (
    capability.transaction_id !== request.transaction_id
    || capability.parent_token !== request.parent_token
  ) {
    throw new Error('candidate reconciliation capability binding mismatch');
  }
  if (capability.parent_pid !== process.ppid || !processIsAlive(capability.parent_pid)) {
    throw new Error('candidate reconciliation parent process is not the live transaction owner');
  }
  const expectedLockPath = join(canonicalHome, GLOBAL_RUNTIME_LOCK_RELATIVE_PATH);
  if (capability.lock_path !== expectedLockPath) {
    throw new Error('candidate reconciliation capability lock path mismatch');
  }
  const lockOwner = readExclusiveDirectoryLockOwner(canonicalHome, GLOBAL_RUNTIME_LOCK_RELATIVE_PATH);
  if (
    lockOwner === null
    || lockOwner.lockPath !== capability.lock_path
    || lockOwner.pid !== capability.parent_pid
    || lockOwner.token !== capability.lock_owner_token
  ) {
    throw new Error('candidate reconciliation parent does not own the active global runtime lock');
  }
  const consumed = join(backupRoot, `.${CANDIDATE_CAPABILITY_NAME}.consumed-${randomUUID()}`);
  renameSync(path, consumed);
  const claimed = lstatSync(consumed);
  if (!claimed.isFile() || !sameFileIdentity(fileIdentity(claimed), observedIdentity)) {
    throw new Error('candidate reconciliation capability changed before consumption');
  }
  return capability;
}

function packageTreeDigest(root: string): string {
  const hash = createHash('sha256');
  const excludedDirectories = new Set(['.ai', '.codegraph', '.git', 'node_modules', '_ops']);
  const visit = (directory: string, prefix: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        hash.update(`D\0${relative}\0`);
        visit(path, relative);
      } else if (entry.isSymbolicLink()) {
        hash.update(`L\0${relative}\0${readlinkSync(path)}\0`);
      } else if (entry.isFile()) {
        hash.update(`F\0${relative}\0`);
        hash.update(readFileSync(path));
        hash.update('\0');
      }
    }
  };
  visit(root, '');
  return `sha256:${hash.digest('hex')}`;
}

function readPackageIdentity(root: string): CandidatePackageIdentity {
  const packagePath = join(root, 'package.json');
  const raw = readFileSync(packagePath);
  const manifest = JSON.parse(raw.toString('utf-8')) as { name?: unknown; version?: unknown };
  if (manifest.name !== 'repo-harness' || typeof manifest.version !== 'string' || manifest.version.length === 0) {
    throw new Error(`candidate package identity is invalid: ${packagePath}`);
  }
  return {
    root,
    version: manifest.version,
    package_digest: packageTreeDigest(root),
  };
}

export function candidatePackageIdentity(packageRoot: string): CandidatePackageIdentity {
  const resolved = resolve(packageRoot);
  if (!existsSync(join(resolved, 'package.json'))) {
    throw new Error(`candidate package is missing package.json: ${resolved}`);
  }
  return readPackageIdentity(realpathSync(resolved));
}

export function routeRegistryDigest(): string {
  return sha256(JSON.stringify(ROUTES));
}

export function managedProjectionDigest(hooks: HooksByEvent | unknown): string {
  return sha256(JSON.stringify(canonicalManagedHookProjection(hooks)));
}

export function hostsForTarget(target: InstallTargetSpec): readonly HookHost[] {
  return target === 'both' ? ['claude', 'codex'] : [target];
}

export function expectedAdapterProjectionDigests(
  target: InstallTargetSpec,
  profile: InstallProfile,
): Readonly<Record<HookHost, string>> {
  return Object.fromEntries(hostsForTarget(target).map((host) => [
    host,
    managedProjectionDigest(buildManagedHooks(host, profile)),
  ])) as Record<HookHost, string>;
}

export function adapterPath(host: HookHost, env: NodeJS.ProcessEnv = process.env): string {
  const home = env.HOME ?? homedir();
  return host === 'codex' ? join(home, '.codex', 'hooks.json') : join(home, '.claude', 'settings.json');
}

export function installedAdapterProjectionDigest(path: string): string | null {
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as { hooks?: HooksByEvent };
    return managedProjectionDigest(parsed.hooks ?? {});
  } catch {
    return null;
  }
}

export function assertInstalledAdapterProjection(
  target: InstallTargetSpec,
  profile: InstallProfile,
  env: NodeJS.ProcessEnv = process.env,
): Readonly<Record<HookHost, string>> {
  const expected = expectedAdapterProjectionDigests(target, profile);
  for (const host of hostsForTarget(target)) {
    const actual = installedAdapterProjectionDigest(adapterPath(host, env));
    if (actual !== expected[host]) {
      throw new Error(`adapter projection mismatch for ${host}: expected=${expected[host]}; actual=${actual ?? 'missing'}`);
    }
  }
  return expected;
}

/**
 * Candidate-side proof. This intentionally calculates expected projection from
 * the currently executing package, never the predecessor that launched it.
 */
export function assertCandidateReconciliationReceipt(
  receipt: CandidateReconciliationReceipt,
  expected: CandidateReceiptExpectation,
): void {
  if (receipt.protocol !== CANDIDATE_RECONCILIATION_PROTOCOL) {
    throw new Error(`candidate reconciliation protocol mismatch: expected=${CANDIDATE_RECONCILIATION_PROTOCOL}; actual=${String(receipt.protocol)}`);
  }
  if (receipt.transaction_id !== expected.transaction_id) {
    throw new Error('candidate reconciliation transaction mismatch');
  }
  if (
    receipt.candidate_package_root !== expected.candidate.root
    || receipt.candidate_version !== expected.candidate.version
    || receipt.candidate_package_digest !== expected.candidate.package_digest
  ) {
    throw new Error('candidate reconciliation package identity mismatch');
  }
  if (receipt.route_registry_digest !== routeRegistryDigest()) {
    throw new Error('candidate reconciliation route registry mismatch');
  }
  if (receipt.selected_target !== expected.target) {
    throw new Error('candidate reconciliation target mismatch');
  }
  if (expected.require_complete && receipt.reconciliation_scope !== 'complete') {
    throw new Error('candidate reconciliation is partial');
  }
  if (expected.require_adapter_projection !== false) {
    const expectedDigests = expectedAdapterProjectionDigests(expected.target, expected.profile);
    for (const host of hostsForTarget(expected.target)) {
      if (receipt.adapter_projection_digests[host] !== expectedDigests[host]) {
        throw new Error(`adapter projection mismatch for ${host}`);
      }
    }
  }
  if (expected.require_complete && receipt.ownership_manifest_digest === null) {
    throw new Error('candidate reconciliation ownership ledger is missing');
  }
}

export function parseCandidateReceipt(stdout: string): CandidateReconciliationReceipt {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout.trim());
  } catch {
    throw new Error('candidate reconciliation did not emit a JSON receipt');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('candidate reconciliation receipt is not an object');
  }
  const receipt = parsed as Record<string, unknown>;
  const digestKeys = ['candidate_package_digest', 'route_registry_digest'];
  if (
    receipt.protocol !== CANDIDATE_RECONCILIATION_PROTOCOL
    || typeof receipt.transaction_id !== 'string'
    || typeof receipt.candidate_package_root !== 'string'
    || typeof receipt.candidate_version !== 'string'
    || digestKeys.some((key) => typeof receipt[key] !== 'string' || !(receipt[key] as string).startsWith('sha256:'))
    || !['codex', 'claude', 'both'].includes(String(receipt.selected_target))
    || !['complete', 'partial'].includes(String(receipt.reconciliation_scope))
    || typeof receipt.verified_at !== 'string'
    || typeof receipt.adapter_projection_digests !== 'object'
    || receipt.adapter_projection_digests === null
    || Array.isArray(receipt.adapter_projection_digests)
    || (receipt.ownership_manifest_digest !== null && (
      typeof receipt.ownership_manifest_digest !== 'string'
      || !receipt.ownership_manifest_digest.startsWith('sha256:')
    ))
  ) {
    throw new Error('candidate reconciliation receipt has invalid shape');
  }
  for (const [host, digest] of Object.entries(receipt.adapter_projection_digests as Record<string, unknown>)) {
    if (!['codex', 'claude'].includes(host) || typeof digest !== 'string' || !digest.startsWith('sha256:')) {
      throw new Error('candidate reconciliation receipt has invalid adapter projection digests');
    }
  }
  return receipt as unknown as CandidateReconciliationReceipt;
}

export function encodeCandidateRequest(request: CandidateReconciliationRequest): string {
  return Buffer.from(JSON.stringify(request), 'utf-8').toString('base64url');
}

export function parseCandidateRequest(encoded: string): CandidateReconciliationRequest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf-8'));
  } catch {
    throw new Error('candidate reconciliation request is not valid base64url JSON');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('candidate reconciliation request is not an object');
  }
  const request = parsed as Record<string, unknown>;
  const requiredStrings = ['transaction_id', 'transaction_backup_root', 'parent_token', 'cwd'];
  const booleans = [
    'sync_skill', 'host_adapters', 'external_skills', 'reverse_skill', 'obsidian_skills', 'codegraph',
  ];
  if (
    request.protocol !== CANDIDATE_RECONCILIATION_PROTOCOL
    || requiredStrings.some((key) => typeof request[key] !== 'string' || !(request[key] as string).length)
    || typeof request.candidate !== 'object'
    || request.candidate === null
    || Array.isArray(request.candidate)
    || !['codex', 'claude', 'both'].includes(String(request.target))
    || !['minimal', 'full'].includes(String(request.profile))
    || booleans.some((key) => typeof request[key] !== 'boolean')
    || (request.brain_root !== undefined && typeof request.brain_root !== 'string')
  ) {
    throw new Error('candidate reconciliation request has invalid shape');
  }
  const candidate = request.candidate as Record<string, unknown>;
  if (
    typeof candidate.root !== 'string'
    || typeof candidate.version !== 'string'
    || typeof candidate.package_digest !== 'string'
    || !candidate.package_digest.startsWith('sha256:')
  ) {
    throw new Error('candidate reconciliation request has invalid package identity');
  }
  return request as unknown as CandidateReconciliationRequest;
}
