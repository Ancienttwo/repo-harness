import { canonicalAdmittedSourceBindingReceiptBytes, validateAdmittedSourceBindingReceipt, type ExternalSourceBindingReceiptV2 } from '../../core/external-sources/admitted-binding';
import { randomUUID } from 'crypto';
import { constants, closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, rmSync, writeSync } from 'fs';
import { dirname, join, relative, resolve, sep } from 'path';

import {
  canonicalExternalSourceBytes,
  canonicalExternalSourceRefreshReceiptBytes,
  canonicalProviderIssueObservationBytes,
  validateExternalSourceRefreshReceipt,
  validateProviderIssueObservation,
  type ExternalSourceRefreshReceiptV1,
  type ProviderIssueObservationV1,
} from '../../core/external-sources/issue-observation';
import {
  canonicalExternalSourceBindingReceiptBytes,
  validateExternalSourceBindingReceipt,
  type ExternalSourceBindingReceiptV1,
} from '../../core/external-sources/binding';
import { resolveGitCommonDirectory } from '../git/common-directory';
import { withExclusiveDirectoryLock } from '../locking/exclusive-directory-lock';

export const EXTERNAL_SOURCE_STORE_RELATIVE_ROOT = 'repo-harness/external-sources/v1';

export type ExternalSourceStoreErrorCode =
  | 'external_source_store_unavailable'
  | 'external_source_store_unsafe'
  | 'external_source_store_conflict'
  | 'external_source_store_invalid'
  | 'external_source_store_limit';

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
  readonly bindings: string;
  readonly locks: string;
}

function fail(code: ExternalSourceStoreErrorCode, message: string, cause?: unknown): never {
  throw new ExternalSourceStoreError(code, message, cause);
}

function pathsFor(repoRoot: string): StorePaths {
  const common = resolve(resolveGitCommonDirectory(repoRoot));
  const root = join(common, EXTERNAL_SOURCE_STORE_RELATIVE_ROOT);
  return Object.freeze({ common, root, observations: join(root, 'observations'), receipts: join(root, 'receipts'), bindings: join(root, 'bindings'), locks: join(root, 'locks') });
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
  for (const path of [paths.root, paths.observations, paths.receipts, paths.bindings, paths.locks]) ensureDirectory(paths.common, path, true);
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

/**
 * Index of the newest refresh receipt, so a bounded reader does not scan the
 * whole receipt history. `receipt_count` lets that reader detect a head that a
 * later receipt write has not yet replaced.
 */
const RECEIPT_HEAD_FILE = 'receipt-head.json';
const RECEIPT_HEAD_KIND = 'repo-harness-external-source-receipt-head';
interface ExternalSourceReceiptHeadV1 {
  readonly protocol: 1;
  readonly kind: typeof RECEIPT_HEAD_KIND;
  readonly receipt_sha256: string;
  readonly receipt_count: number;
}

function writeReceiptHead(repoRoot: string, paths: StorePaths): void {
  const receipts = listExternalSourceRefreshReceipts(repoRoot);
  const newest = receipts.at(-1);
  if (!newest) fail('external_source_store_invalid', 'external source refresh receipt head has no receipt');
  const head: ExternalSourceReceiptHeadV1 = { protocol: 1, kind: RECEIPT_HEAD_KIND, receipt_sha256: newest.receipt_sha256, receipt_count: receipts.length };
  const target = join(paths.root, RECEIPT_HEAD_FILE);
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  if (!writeExclusive(temporary, canonicalExternalSourceBytes(head), 'external source refresh receipt head')) fail('external_source_store_unavailable', 'cannot stage external source refresh receipt head');
  try { renameSync(temporary, target); }
  catch (error) {
    rmSync(temporary, { force: true });
    fail('external_source_store_unavailable', 'cannot replace external source refresh receipt head', error);
  }
  syncDirectory(paths.root);
}

function readReceiptHead(paths: StorePaths): ExternalSourceReceiptHeadV1 {
  const target = join(paths.root, RECEIPT_HEAD_FILE);
  if (!existsSync(target)) fail('external_source_store_invalid', 'external source refresh receipt head is missing; run repo-harness external-source refresh to record it');
  const raw = readRaw(target, 'external source refresh receipt head');
  let value: unknown;
  try { value = JSON.parse(raw); }
  catch (error) { fail('external_source_store_invalid', 'external source refresh receipt head is malformed', error); }
  const record = value as Record<string, unknown>;
  if (!record || typeof record !== 'object' || Array.isArray(record)
    || JSON.stringify(Object.keys(record).sort()) !== JSON.stringify(['kind', 'protocol', 'receipt_count', 'receipt_sha256'])
    || record.protocol !== 1 || record.kind !== RECEIPT_HEAD_KIND || typeof record.receipt_sha256 !== 'string'
    || !Number.isSafeInteger(record.receipt_count) || (record.receipt_count as number) < 1
    || canonicalExternalSourceBytes(record) !== raw) fail('external_source_store_invalid', 'external source refresh receipt head is invalid');
  digestHex(record.receipt_sha256 as string, 'external source refresh receipt head');
  return record as unknown as ExternalSourceReceiptHeadV1;
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
    if (!writeExclusive(target, bytes, 'external source refresh receipt')
      && readRaw(target, 'external source refresh receipt') !== bytes) fail('external_source_store_conflict', 'external source refresh receipt conflicts with immutable existing bytes');
    writeReceiptHead(repoRoot, paths);
    return receipt;
  });
}

/** Persist a correlation with a current admitted session. V1 records are read-only history. */
export function writeExternalSourceBindingReceipt(repoRoot: string, receipt: ExternalSourceBindingReceiptV2): ExternalSourceBindingReceiptV2 {
  validateAdmittedSourceBindingReceipt(receipt);
  const paths = pathsFor(repoRoot);
  const bytes = canonicalAdmittedSourceBindingReceiptBytes(receipt);
  return lock(paths, () => {
    const directory = join(paths.root, 'admitted-bindings');
    ensureDirectory(paths.common, directory, true);
    const target = join(directory, `${digestHex(receipt.binding_id, 'binding id')}.json`);
    if (writeExclusive(target, bytes, 'external source binding receipt')) return receipt;
    if (readRaw(target, 'external source binding receipt') === bytes) return receipt;
    fail('external_source_store_conflict', 'external source binding receipt conflicts with immutable existing bytes');
  });
}

export function listExternalSourceBindingReceipts(repoRoot: string): readonly ExternalSourceBindingReceiptV2[] {
  const paths = pathsFor(repoRoot), directory = join(paths.root, 'admitted-bindings');
  if (!ensureDirectory(paths.common, directory, false)) return [];
  return jsonFiles(directory).map(name => {
    const raw = readRaw(join(directory, name), 'admitted source binding');
    const receipt = validateAdmittedSourceBindingReceipt(JSON.parse(raw));
    if (canonicalAdmittedSourceBindingReceiptBytes(receipt) !== raw
      || name !== `${digestHex(receipt.binding_id, 'binding id')}.json`) fail('external_source_store_invalid', 'admitted binding bytes or path are invalid');
    return receipt;
  }).sort((a, b) => a.bound_at.localeCompare(b.bound_at) || a.binding_id.localeCompare(b.binding_id));
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

export interface ExternalSourceSnapshotLimits {
  readonly max_observations: number;
  readonly max_issue_directories: number;
  readonly max_bytes: number;
}

export interface LatestExternalSourceSnapshot {
  readonly receipt: ExternalSourceRefreshReceiptV1;
  /** Exactly the observations the receipt names; empty unless the receipt is complete. */
  readonly observations: readonly ProviderIssueObservationV1[];
}

/**
 * Reads the newest refresh receipt and the one observation per issue it names.
 * Content reads are bounded by `max_bytes` and `max_observations`, and the
 * issue directory count by `max_issue_directories`. File name listings are not
 * bounded: every receipt file name and every observation file name in each issue
 * directory is still listed, so listing cost grows with refresh history. Over
 * any limit, it fails closed instead of truncating.
 */
export function readLatestExternalSourceSnapshot(repoRoot: string, limits: ExternalSourceSnapshotLimits): LatestExternalSourceSnapshot | null {
  const paths = pathsFor(repoRoot);
  if (!ensureDirectory(paths.common, paths.root, false)) return null;
  const receiptNames = ensureDirectory(paths.common, paths.receipts, false) ? jsonFiles(paths.receipts) : [];
  if (receiptNames.length === 0) {
    if (existsSync(join(paths.root, RECEIPT_HEAD_FILE))) fail('external_source_store_invalid', 'external source refresh receipt head names a missing receipt');
    return null;
  }
  const head = readReceiptHead(paths);
  if (head.receipt_count !== receiptNames.length) {
    fail('external_source_store_invalid', `external source refresh receipt head is stale: it counts ${head.receipt_count} receipts, the store has ${receiptNames.length}`);
  }
  let remainingBytes = limits.max_bytes;
  const readBounded = (path: string, label: string): string => {
    regularFile(path, label);
    if (lstatSync(path).size > remainingBytes) fail('external_source_store_limit', `external source snapshot exceeds ${limits.max_bytes} bytes`);
    const raw = readRaw(path, label);
    remainingBytes -= Buffer.byteLength(raw, 'utf8');
    if (remainingBytes < 0) fail('external_source_store_limit', `external source snapshot exceeds ${limits.max_bytes} bytes`);
    return raw;
  };
  const receiptName = `${digestHex(head.receipt_sha256, 'external source refresh receipt head')}.json`;
  if (!receiptNames.includes(receiptName)) fail('external_source_store_invalid', 'external source refresh receipt head names a missing receipt');
  const receiptRaw = readBounded(join(paths.receipts, receiptName), 'external source refresh receipt');
  let receipt: ExternalSourceRefreshReceiptV1;
  try { receipt = validateExternalSourceRefreshReceipt(JSON.parse(receiptRaw)); }
  catch (error) { fail('external_source_store_invalid', 'external source refresh receipt is malformed', error); }
  if (canonicalExternalSourceRefreshReceiptBytes(receipt) !== receiptRaw || receipt.receipt_sha256 !== head.receipt_sha256) {
    fail('external_source_store_invalid', 'external source refresh receipt does not match its head');
  }
  if (receipt.outcome !== 'complete') return Object.freeze({ receipt, observations: Object.freeze([]) });
  if (receipt.source_revisions.length > limits.max_observations) {
    fail('external_source_store_limit', `external source snapshot names ${receipt.source_revisions.length} observations; the limit is ${limits.max_observations}`);
  }
  const wanted = new Map(receipt.source_revisions.map(revision => [`${digestHex(revision, 'receipt source revision')}.json`, revision]));
  const identities = ensureDirectory(paths.common, paths.observations, false) ? childDirectories(paths.observations) : [];
  if (identities.length > limits.max_issue_directories) {
    fail('external_source_store_limit', `external source store has ${identities.length} issue directories; the limit is ${limits.max_issue_directories}`);
  }
  const located = new Map<string, string>();
  for (const identity of identities) {
    for (const name of jsonFiles(join(paths.observations, identity))) {
      if (!wanted.has(name)) continue;
      if (located.has(name)) fail('external_source_store_invalid', 'a receipt source revision is stored under two issues');
      located.set(name, identity);
    }
  }
  const observations = [...wanted.entries()].map(([name, revision]) => {
    const identity = located.get(name);
    if (identity === undefined) fail('external_source_store_invalid', `observation ${revision} named by the newest refresh receipt is missing`);
    const raw = readBounded(join(paths.observations, identity, name), 'provider issue observation');
    let value: ProviderIssueObservationV1;
    try { value = validateProviderIssueObservation(JSON.parse(raw)); }
    catch (error) { fail('external_source_store_invalid', 'provider issue observation is malformed', error); }
    if (canonicalProviderIssueObservationBytes(value) !== raw || value.source_revision !== revision
      || observationPath(paths, value) !== join(paths.observations, identity, name)) fail('external_source_store_invalid', 'provider issue observation does not match its stored path');
    return value;
  });
  return Object.freeze({ receipt, observations: Object.freeze(observations) });
}

export function listHistoricalExternalSourceBindingReceipts(repoRoot: string): readonly ExternalSourceBindingReceiptV1[] {
  const paths = pathsFor(repoRoot);
  if (!ensureDirectory(paths.common, paths.bindings, false)) return Object.freeze([]);
  const records: ExternalSourceBindingReceiptV1[] = [];
  for (const name of jsonFiles(paths.bindings)) {
    const raw = readRaw(join(paths.bindings, name), 'external source binding receipt');
    try {
      const value = validateExternalSourceBindingReceipt(JSON.parse(raw));
      if (canonicalExternalSourceBindingReceiptBytes(value) !== raw) fail('external_source_store_invalid', 'external source binding receipt is non-canonical');
      records.push(value);
    } catch (error) {
      if (error instanceof ExternalSourceStoreError) throw error;
      fail('external_source_store_invalid', 'external source binding receipt is malformed', error);
    }
  }
  return Object.freeze(records.sort((left, right) => left.bound_at.localeCompare(right.bound_at) || left.binding_id.localeCompare(right.binding_id)));
}

export function externalSourceStoreRoot(repoRoot: string): string {
  return pathsFor(repoRoot).root;
}
