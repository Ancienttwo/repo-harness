import { constants, closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, writeSync } from 'fs';
import { dirname, join, relative, resolve, sep } from 'path';

import {
  canonicalExternalSourceRefreshReceiptBytes,
  canonicalProviderIssueObservationBytes,
  validateExternalSourceRefreshReceipt,
  validateProviderIssueObservation,
  type ExternalSourceRefreshReceiptV1,
  type ProviderIssueObservationV1,
} from '../../core/external-sources/issue-observation';
import { resolveGitCommonDirectory } from '../git/common-directory';
import { withExclusiveDirectoryLock } from '../locking/exclusive-directory-lock';

export const EXTERNAL_SOURCE_STORE_RELATIVE_ROOT = 'repo-harness/external-sources/v1';

export type ExternalSourceStoreErrorCode =
  | 'external_source_store_unavailable'
  | 'external_source_store_unsafe'
  | 'external_source_store_conflict'
  | 'external_source_store_invalid';

export class ExternalSourceStoreError extends Error {
  constructor(readonly code: ExternalSourceStoreErrorCode, message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'ExternalSourceStoreError';
  }
}

interface StorePaths {
  readonly common: string;
  readonly root: string;
  readonly observations: string;
  readonly receipts: string;
  readonly locks: string;
}

function fail(code: ExternalSourceStoreErrorCode, message: string, cause?: unknown): never {
  throw new ExternalSourceStoreError(code, message, cause);
}

function pathsFor(repoRoot: string): StorePaths {
  const common = resolve(resolveGitCommonDirectory(repoRoot));
  const root = join(common, EXTERNAL_SOURCE_STORE_RELATIVE_ROOT);
  return Object.freeze({ common, root, observations: join(root, 'observations'), receipts: join(root, 'receipts'), locks: join(root, 'locks') });
}

function pathSegments(root: string, target: string): string[] {
  const scoped = relative(root, target);
  if (!scoped || scoped === '..' || scoped.startsWith(`..${sep}`) || /^[A-Za-z]:/u.test(scoped)) fail('external_source_store_unsafe', `external source path escapes Git common directory: ${target}`);
  return scoped.split(sep).filter(Boolean);
}

function syncDirectory(path: string): void {
  const descriptor = openSync(path, constants.O_RDONLY);
  try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
}

function ensureDirectory(common: string, target: string, create: boolean): boolean {
  let current = common;
  for (const segment of pathSegments(common, target)) {
    current = join(current, segment);
    try {
      const stat = lstatSync(current);
      if (!stat.isDirectory() || stat.isSymbolicLink()) fail('external_source_store_unsafe', `external source directory is unsafe: ${current}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        if (error instanceof ExternalSourceStoreError) throw error;
        fail('external_source_store_unavailable', `cannot inspect external source directory: ${current}`, error);
      }
      if (!create) return false;
      try { mkdirSync(current, { mode: 0o700 }); }
      catch (mkdirError) { if ((mkdirError as NodeJS.ErrnoException).code !== 'EEXIST') fail('external_source_store_unavailable', `cannot create external source directory: ${current}`, mkdirError); }
      const stat = lstatSync(current);
      if (!stat.isDirectory() || stat.isSymbolicLink()) fail('external_source_store_unsafe', `external source directory is unsafe: ${current}`);
      syncDirectory(dirname(current));
    }
  }
  return true;
}

function ensureStore(paths: StorePaths): void {
  for (const path of [paths.root, paths.observations, paths.receipts, paths.locks]) ensureDirectory(paths.common, path, true);
}

function regularFile(path: string, label: string): void {
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink()) fail('external_source_store_unsafe', `${label} is not a regular file`);
  } catch (error) {
    if (error instanceof ExternalSourceStoreError) throw error;
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') fail('external_source_store_invalid', `${label} is missing`);
    fail('external_source_store_unavailable', `cannot inspect ${label}`, error);
  }
}

function readRaw(path: string, label: string): string {
  regularFile(path, label);
  try { return readFileSync(path, 'utf8'); }
  catch (error) { fail('external_source_store_unavailable', `cannot read ${label}`, error); }
}

function writeAll(descriptor: number, bytes: Buffer): void {
  let offset = 0;
  while (offset < bytes.length) offset += writeSync(descriptor, bytes, offset, bytes.length - offset);
}

function writeExclusive(path: string, bytes: string, label: string): boolean {
  let descriptor: number | null = null;
  try {
    descriptor = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    writeAll(descriptor, Buffer.from(bytes, 'utf8'));
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = null;
    syncDirectory(dirname(path));
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
    fail('external_source_store_unavailable', `cannot persist ${label}`, error);
  } finally {
    if (descriptor !== null) closeSync(descriptor);
  }
  return fail('external_source_store_unavailable', `cannot persist ${label}`);
}

function digestHex(value: string, label: string): string {
  const match = /^sha256:([0-9a-f]{64})$/u.exec(value);
  if (!match) fail('external_source_store_invalid', `${label} digest is invalid`);
  return match[1];
}

function observationPath(paths: StorePaths, observation: ProviderIssueObservationV1): string {
  const identity = `${observation.provider_repository_id}\u0000${observation.provider_issue_id}`;
  const identityHex = Buffer.from(identity, 'utf8').toString('base64url');
  return join(paths.observations, identityHex, `${digestHex(observation.source_revision, 'observation source revision')}.json`);
}

function receiptPath(paths: StorePaths, receipt: ExternalSourceRefreshReceiptV1): string {
  return join(paths.receipts, `${digestHex(receipt.receipt_sha256, 'receipt')}.json`);
}

function lock<T>(paths: StorePaths, action: () => T): T {
  ensureStore(paths);
  return withExclusiveDirectoryLock(paths.common, `${EXTERNAL_SOURCE_STORE_RELATIVE_ROOT}/locks/store`, action, { reclaimStaleEmptyDirectory: true });
}

/** Persist one content-addressed observation. Existing identical bytes are idempotent; different bytes are a hard conflict. */
export function writeProviderIssueObservation(repoRoot: string, observation: ProviderIssueObservationV1): ProviderIssueObservationV1 {
  validateProviderIssueObservation(observation);
  const paths = pathsFor(repoRoot);
  const bytes = canonicalProviderIssueObservationBytes(observation);
  return lock(paths, () => {
    const target = observationPath(paths, observation);
    ensureDirectory(paths.common, dirname(target), true);
    if (writeExclusive(target, bytes, 'provider issue observation')) return observation;
    const existing = readRaw(target, 'provider issue observation');
    if (existing === bytes) return observation;
    try {
      const persisted = validateProviderIssueObservation(JSON.parse(existing));
      // A repeated provider snapshot may have a later local observation time.
      // The first immutable payload remains authoritative; every provider field
      // is covered by source_revision, so any content mismatch takes another path.
      if (persisted.source_revision === observation.source_revision) return persisted;
    } catch {
      // A malformed or foreign payload at this immutable content identity is a conflict.
    }
    fail('external_source_store_conflict', 'provider issue observation conflicts with immutable existing bytes');
  });
}

/** Every refresh attempt gets its own immutable receipt. */
export function writeExternalSourceRefreshReceipt(repoRoot: string, receipt: ExternalSourceRefreshReceiptV1): ExternalSourceRefreshReceiptV1 {
  validateExternalSourceRefreshReceipt(receipt);
  const paths = pathsFor(repoRoot);
  const bytes = canonicalExternalSourceRefreshReceiptBytes(receipt);
  return lock(paths, () => {
    const target = receiptPath(paths, receipt);
    if (writeExclusive(target, bytes, 'external source refresh receipt')) return receipt;
    if (readRaw(target, 'external source refresh receipt') !== bytes) fail('external_source_store_conflict', 'external source refresh receipt conflicts with immutable existing bytes');
    return receipt;
  });
}

function childDirectories(path: string): string[] {
  try {
    return readdirSync(path).sort().filter((name) => {
      const target = join(path, name);
      const stat = lstatSync(target);
      if (stat.isSymbolicLink()) fail('external_source_store_unsafe', `external source store has a symbolic link: ${target}`);
      return stat.isDirectory();
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    if (error instanceof ExternalSourceStoreError) throw error;
    fail('external_source_store_unavailable', `cannot list external source directory: ${path}`, error);
  }
}

function jsonFiles(path: string): string[] {
  try {
    return readdirSync(path).sort().filter((name) => name.endsWith('.json'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    fail('external_source_store_unavailable', `cannot list external source records: ${path}`, error);
  }
}

export function listProviderIssueObservations(repoRoot: string): readonly ProviderIssueObservationV1[] {
  const paths = pathsFor(repoRoot);
  if (!ensureDirectory(paths.common, paths.observations, false)) return Object.freeze([]);
  const records: ProviderIssueObservationV1[] = [];
  for (const identity of childDirectories(paths.observations)) {
    const directory = join(paths.observations, identity);
    for (const name of jsonFiles(directory)) {
      const raw = readRaw(join(directory, name), 'provider issue observation');
      try {
        const value = validateProviderIssueObservation(JSON.parse(raw));
        if (canonicalProviderIssueObservationBytes(value) !== raw) fail('external_source_store_invalid', 'provider issue observation is non-canonical');
        records.push(value);
      } catch (error) {
        if (error instanceof ExternalSourceStoreError) throw error;
        fail('external_source_store_invalid', 'provider issue observation is malformed', error);
      }
    }
  }
  return Object.freeze(records.sort((left, right) => left.observed_at.localeCompare(right.observed_at) || left.observation_sha256.localeCompare(right.observation_sha256)));
}

export function listExternalSourceRefreshReceipts(repoRoot: string): readonly ExternalSourceRefreshReceiptV1[] {
  const paths = pathsFor(repoRoot);
  if (!ensureDirectory(paths.common, paths.receipts, false)) return Object.freeze([]);
  const records: ExternalSourceRefreshReceiptV1[] = [];
  for (const name of jsonFiles(paths.receipts)) {
    const raw = readRaw(join(paths.receipts, name), 'external source refresh receipt');
    try {
      const value = validateExternalSourceRefreshReceipt(JSON.parse(raw));
      if (canonicalExternalSourceRefreshReceiptBytes(value) !== raw) fail('external_source_store_invalid', 'external source refresh receipt is non-canonical');
      records.push(value);
    } catch (error) {
      if (error instanceof ExternalSourceStoreError) throw error;
      fail('external_source_store_invalid', 'external source refresh receipt is malformed', error);
    }
  }
  return Object.freeze(records.sort((left, right) => left.completed_at.localeCompare(right.completed_at) || left.receipt_sha256.localeCompare(right.receipt_sha256)));
}

export function externalSourceStoreRoot(repoRoot: string): string {
  return pathsFor(repoRoot).root;
}
