/**
 * Durable provider-feedback evidence under the git common directory.
 *
 * Provider facts are immutable files; notification state and repair-attempt
 * evidence live in distinct files so neither can change an event digest.
 */
import { createHash, randomUUID } from 'crypto';
import {
  closeSync,
  constants,
  existsSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeSync,
} from 'fs';
import { join } from 'path';

import {
  canonicalFeedbackDeliveryReceiptBytes,
  canonicalFeedbackEventBytes,
  canonicalReactionAttemptReceiptBytes,
  canonicalRepairDispatchProofBytes,
  transitionFeedbackDeliveryReceipt,
  transitionRepairDispatchProof as transitionRepairDispatchProofCore,
  validateFeedbackDeliveryReceipt,
  validateFeedbackEvent,
  validateReactionAttemptReceipt,
  validateRepairDispatchProof,
  type FeedbackDeliveryReceiptV1,
  type FeedbackEventV1,
  type ReactionAttemptReceiptV1,
  type RepairDispatchProofV1,
  type RepairDispatchSuccessorInput,
} from '../../core/publication/feedback';
import { resolveGitCommonDirectory } from '../git/common-directory';

export const FEEDBACK_ROOT_RELATIVE_PATH = 'repo-harness/feedback/v1';

export type FeedbackStoreErrorCode =
  | 'feedback_unreadable'
  | 'provider_event_conflict'
  | 'repair_dispatch_conflict'
  | 'repair_not_dispatched'
  | 'reaction_receipt_conflict'
  | 'feedback_incomplete';

export class FeedbackStoreError extends Error {
  constructor(readonly code: FeedbackStoreErrorCode, message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'FeedbackStoreError';
  }
}

function unreadable(message: string, cause?: unknown): FeedbackStoreError {
  return new FeedbackStoreError('feedback_unreadable', message, cause);
}

function incomplete(message: string, cause?: unknown): FeedbackStoreError {
  return new FeedbackStoreError('feedback_incomplete', message, cause);
}

function hash(value: string): string {
  return createHash('sha256').update(value, 'utf-8').digest('hex');
}

function publicationComponent(publicationId: string): string {
  if (!/^sha256:[0-9a-f]{64}$/.test(publicationId)) throw unreadable('publication id is invalid');
  return publicationId.slice('sha256:'.length);
}

function eventComponent(providerEventId: string): string {
  if (typeof providerEventId !== 'string' || providerEventId.trim() === '') {
    throw unreadable('provider event id is invalid');
  }
  // Provider node IDs are opaque strings, never trusted path components.
  return hash(providerEventId);
}

function root(repoRoot: string, gitBin = 'git'): string {
  return join(resolveGitCommonDirectory(repoRoot, gitBin), FEEDBACK_ROOT_RELATIVE_PATH);
}

function publicationDirectory(repoRoot: string, publicationId: string, gitBin = 'git'): string {
  return join(root(repoRoot, gitBin), publicationComponent(publicationId));
}

function eventDirectory(repoRoot: string, publicationId: string, gitBin = 'git'): string {
  return join(publicationDirectory(repoRoot, publicationId, gitBin), 'events');
}

function deliveryDirectory(repoRoot: string, publicationId: string, gitBin = 'git'): string {
  return join(publicationDirectory(repoRoot, publicationId, gitBin), 'deliveries');
}

function repairsDirectory(repoRoot: string, publicationId: string, gitBin = 'git'): string {
  return join(publicationDirectory(repoRoot, publicationId, gitBin), 'repairs');
}

export function feedbackEventPath(
  repoRoot: string,
  publicationId: string,
  providerEventId: string,
  gitBin = 'git',
): string {
  return join(eventDirectory(repoRoot, publicationId, gitBin), `${eventComponent(providerEventId)}.json`);
}

export function feedbackDeliveryReceiptPath(
  repoRoot: string,
  publicationId: string,
  providerEventId: string,
  gitBin = 'git',
): string {
  return join(deliveryDirectory(repoRoot, publicationId, gitBin), `${eventComponent(providerEventId)}.json`);
}

export function feedbackReactionLedgerPath(repoRoot: string, publicationId: string, gitBin = 'git'): string {
  return join(publicationDirectory(repoRoot, publicationId, gitBin), 'reactions.jsonl');
}

export function repairDispatchProofPath(
  repoRoot: string,
  publicationId: string,
  repairId: string,
  gitBin = 'git',
): string {
  return join(repairsDirectory(repoRoot, publicationId, gitBin), `${publicationComponent(repairId)}.json`);
}

function ensureDirectory(path: string): void {
  try {
    mkdirSync(path, { recursive: true, mode: 0o700 });
    const stat = lstatSync(path);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw unreadable(`feedback directory is unsafe: ${path}`);
  } catch (error) {
    if (error instanceof FeedbackStoreError) throw error;
    throw incomplete(`cannot create feedback directory: ${path}`, error);
  }
}

function requireDirectory(path: string, optional: boolean): boolean {
  try {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw unreadable(`feedback directory is unsafe: ${path}`);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' && optional) return false;
    if (error instanceof FeedbackStoreError) throw error;
    throw unreadable(`feedback directory is unreadable: ${path}`, error);
  }
}

function preparePublicationDirectories(repoRoot: string, publicationId: string, gitBin = 'git'): void {
  const base = root(repoRoot, gitBin);
  // Validate each owned level after creating it.  The common directory itself
  // is realpath-resolved by resolveGitCommonDirectory and is not ours to make.
  ensureDirectory(join(resolveGitCommonDirectory(repoRoot, gitBin), 'repo-harness'));
  ensureDirectory(join(resolveGitCommonDirectory(repoRoot, gitBin), 'repo-harness', 'feedback'));
  ensureDirectory(base);
  ensureDirectory(publicationDirectory(repoRoot, publicationId, gitBin));
  ensureDirectory(eventDirectory(repoRoot, publicationId, gitBin));
  ensureDirectory(deliveryDirectory(repoRoot, publicationId, gitBin));
  ensureDirectory(repairsDirectory(repoRoot, publicationId, gitBin));
}

/** Validate every owned ancestor before following a read path below it. */
function publicationTreeExists(repoRoot: string, publicationId: string, gitBin = 'git'): boolean {
  const common = resolveGitCommonDirectory(repoRoot, gitBin);
  const base = root(repoRoot, gitBin);
  for (const path of [
    join(common, 'repo-harness'),
    join(common, 'repo-harness', 'feedback'),
    base,
    publicationDirectory(repoRoot, publicationId, gitBin),
  ]) {
    if (!requireDirectory(path, true)) return false;
  }
  return true;
}

function fsyncDirectory(path: string): void {
  const fd = openSync(path, constants.O_RDONLY);
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function writeAll(fd: number, bytes: Buffer): void {
  let offset = 0;
  while (offset < bytes.length) offset += writeSync(fd, bytes, offset, bytes.length - offset);
}

function readRegular(path: string, label: string): Buffer {
  let stat;
  try {
    stat = lstatSync(path);
  } catch (error) {
    throw unreadable(`${label} is unreadable: ${path}`, error);
  }
  if (stat.isSymbolicLink() || !stat.isFile()) throw unreadable(`${label} is unsafe: ${path}`);
  try {
    return readFileSync(path);
  } catch (error) {
    throw unreadable(`${label} cannot be read: ${path}`, error);
  }
}

function existingRegular(path: string, label: string): Buffer | null {
  try {
    return readRegular(path, label);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    if (error instanceof FeedbackStoreError && (error.cause as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') return null;
    throw error;
  }
}

function parseEvent(bytes: Buffer, path: string): FeedbackEventV1 {
  try {
    return validateFeedbackEvent(JSON.parse(bytes.toString('utf-8')));
  } catch (error) {
    throw unreadable(`feedback event is malformed: ${path}`, error);
  }
}

function parseDelivery(bytes: Buffer, path: string): FeedbackDeliveryReceiptV1 {
  try {
    return validateFeedbackDeliveryReceipt(JSON.parse(bytes.toString('utf-8')));
  } catch (error) {
    throw unreadable(`feedback delivery receipt is malformed: ${path}`, error);
  }
}

function parseReaction(line: string, path: string, lineNumber: number): ReactionAttemptReceiptV1 {
  try {
    return validateReactionAttemptReceipt(JSON.parse(line));
  } catch (error) {
    throw unreadable(`feedback reaction receipt is malformed at ${path}:${lineNumber}`, error);
  }
}

function parseRepairDispatchProof(bytes: Buffer, path: string): RepairDispatchProofV1 {
  try {
    return validateRepairDispatchProof(JSON.parse(bytes.toString('utf-8')));
  } catch (error) {
    throw unreadable(`repair dispatch proof is malformed: ${path}`, error);
  }
}

function publishImmutable(path: string, bytes: Buffer, equivalent: () => boolean): void {
  if (existsSync(path)) {
    if (!equivalent()) throw new FeedbackStoreError('provider_event_conflict', `feedback event conflicts with immutable record: ${path}`);
    return;
  }
  const parent = join(path, '..');
  const temporary = join(parent, `.${hash(path)}.${process.pid}.${randomUUID()}.tmp`);
  let fd: number | null = null;
  try {
    fd = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
    writeAll(fd, bytes);
    fsyncSync(fd);
  } catch (error) {
    throw incomplete(`cannot write immutable feedback event: ${path}`, error);
  } finally {
    if (fd !== null) closeSync(fd);
  }
  try {
    linkSync(temporary, path);
    fsyncDirectory(parent);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      if (!equivalent()) throw new FeedbackStoreError('provider_event_conflict', `feedback event conflicts with immutable record: ${path}`, error);
    } else {
      throw incomplete(`cannot publish immutable feedback event: ${path}`, error);
    }
  } finally {
    try { unlinkSync(temporary); } catch { /* The publish error, if any, wins. */ }
  }
}

/**
 * Create one provider event once.  The opaque provider event ID is hashed only
 * for the filename; the full ID remains part of canonical provider evidence.
 */
export function writeFeedbackEvent(repoRoot: string, event: FeedbackEventV1, gitBin = 'git'): string {
  const valid = validateFeedbackEvent(event);
  preparePublicationDirectories(repoRoot, valid.publication_id, gitBin);
  const path = feedbackEventPath(repoRoot, valid.publication_id, valid.provider_event_id, gitBin);
  const bytes = Buffer.from(`${canonicalFeedbackEventBytes(valid)}\n`, 'utf-8');
  publishImmutable(path, bytes, () => {
    const current = readRegular(path, 'feedback event');
    const stored = parseEvent(current, path);
    return canonicalFeedbackEventBytes(stored) === canonicalFeedbackEventBytes(valid);
  });
  return path;
}

/** Atomically replace mutable delivery state after its core transition was validated. */
export function writeFeedbackDeliveryReceipt(
  repoRoot: string,
  publicationId: string,
  receipt: FeedbackDeliveryReceiptV1,
  gitBin = 'git',
): string {
  const valid = validateFeedbackDeliveryReceipt(receipt);
  preparePublicationDirectories(repoRoot, publicationId, gitBin);
  if (readFeedbackEvent(repoRoot, publicationId, valid.provider_event_id, gitBin) === null) {
    throw incomplete('feedback delivery receipt has no immutable provider event');
  }
  const path = feedbackDeliveryReceiptPath(repoRoot, publicationId, valid.provider_event_id, gitBin);
  const previous = existingRegular(path, 'feedback delivery receipt');
  if (previous !== null) {
    const current = parseDelivery(previous, path);
    const currentBytes = canonicalFeedbackDeliveryReceiptBytes(current);
    const nextBytes = canonicalFeedbackDeliveryReceiptBytes(valid);
    if (currentBytes !== nextBytes) {
      const transitioned = transitionFeedbackDeliveryReceipt(current, {
        delivery_state: valid.delivery_state === 'pending' ? 'delivered' : valid.delivery_state,
        ...(valid.delivery_state === 'delivered' || valid.delivery_state === 'acknowledged'
          ? { delivery_channel: valid.delivery_channel === 'none' ? undefined : valid.delivery_channel }
          : {}),
        transitioned_at: valid.delivery_state === 'delivered'
          ? valid.delivered_at!
          : valid.delivery_state === 'acknowledged'
            ? valid.acknowledged_at!
            : valid.superseded_at!,
      });
      if (canonicalFeedbackDeliveryReceiptBytes(transitioned) !== nextBytes) {
        throw new FeedbackStoreError('feedback_incomplete', `feedback delivery receipt is not a legal transition: ${path}`);
      }
    }
  }
  const bytes = Buffer.from(`${canonicalFeedbackDeliveryReceiptBytes(valid)}\n`, 'utf-8');
  const parent = deliveryDirectory(repoRoot, publicationId, gitBin);
  const temporary = join(parent, `.${hash(path)}.${process.pid}.${randomUUID()}.tmp`);
  let fd: number | null = null;
  try {
    fd = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
    writeAll(fd, bytes);
    fsyncSync(fd);
  } catch (error) {
    throw incomplete(`cannot write feedback delivery receipt: ${path}`, error);
  } finally {
    if (fd !== null) closeSync(fd);
  }
  try {
    renameSync(temporary, path);
    fsyncDirectory(parent);
  } catch (error) {
    throw incomplete(`cannot publish feedback delivery receipt: ${path}`, error);
  } finally {
    try { unlinkSync(temporary); } catch { /* The publish error, if any, wins. */ }
  }
  return path;
}

export function readFeedbackEvent(
  repoRoot: string,
  publicationId: string,
  providerEventId: string,
  gitBin = 'git',
): FeedbackEventV1 | null {
  if (!publicationTreeExists(repoRoot, publicationId, gitBin)) return null;
  const path = feedbackEventPath(repoRoot, publicationId, providerEventId, gitBin);
  const bytes = existingRegular(path, 'feedback event');
  if (bytes === null) return null;
  const event = parseEvent(bytes, path);
  if (event.publication_id !== publicationId || event.provider_event_id !== providerEventId) {
    throw unreadable(`feedback event does not match its storage key: ${path}`);
  }
  return event;
}

export function readFeedbackDeliveryReceipt(
  repoRoot: string,
  publicationId: string,
  providerEventId: string,
  gitBin = 'git',
): FeedbackDeliveryReceiptV1 | null {
  if (!publicationTreeExists(repoRoot, publicationId, gitBin)) return null;
  const path = feedbackDeliveryReceiptPath(repoRoot, publicationId, providerEventId, gitBin);
  const bytes = existingRegular(path, 'feedback delivery receipt');
  if (bytes === null) return null;
  const receipt = parseDelivery(bytes, path);
  if (receipt.provider_event_id !== providerEventId) {
    throw unreadable(`feedback delivery receipt does not match its storage key: ${path}`);
  }
  return receipt;
}

function listedFiles(directory: string, optional: boolean): readonly string[] {
  if (!requireDirectory(directory, optional)) return [];
  try {
    return readdirSync(directory).sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
  } catch (error) {
    throw unreadable(`feedback directory cannot be listed: ${directory}`, error);
  }
}

/** Read every immutable event, rejecting any unknown filename or malformed record. */
export function readFeedbackEvents(repoRoot: string, publicationId: string, gitBin = 'git'): readonly FeedbackEventV1[] {
  if (!publicationTreeExists(repoRoot, publicationId, gitBin)) return Object.freeze([]);
  const directory = eventDirectory(repoRoot, publicationId, gitBin);
  const events: FeedbackEventV1[] = [];
  for (const name of listedFiles(directory, true)) {
    if (!/^[0-9a-f]{64}\.json$/.test(name)) throw unreadable(`unexpected feedback event filename: ${name}`);
    const path = join(directory, name);
    const event = parseEvent(readRegular(path, 'feedback event'), path);
    if (event.publication_id !== publicationId || eventComponent(event.provider_event_id) !== name.slice(0, -'.json'.length)) {
      throw unreadable(`feedback event does not match its storage key: ${path}`);
    }
    events.push(event);
  }
  return Object.freeze(events);
}

/** Read every delivery receipt separately from immutable event identity. */
export function readFeedbackDeliveryReceipts(
  repoRoot: string,
  publicationId: string,
  gitBin = 'git',
): readonly FeedbackDeliveryReceiptV1[] {
  if (!publicationTreeExists(repoRoot, publicationId, gitBin)) return Object.freeze([]);
  const directory = deliveryDirectory(repoRoot, publicationId, gitBin);
  const receipts: FeedbackDeliveryReceiptV1[] = [];
  for (const name of listedFiles(directory, true)) {
    if (!/^[0-9a-f]{64}\.json$/.test(name)) throw unreadable(`unexpected feedback delivery filename: ${name}`);
    const path = join(directory, name);
    const receipt = parseDelivery(readRegular(path, 'feedback delivery receipt'), path);
    if (eventComponent(receipt.provider_event_id) !== name.slice(0, -'.json'.length)) {
      throw unreadable(`feedback delivery receipt does not match its storage key: ${path}`);
    }
    receipts.push(receipt);
  }
  return Object.freeze(receipts);
}

/** Read one evidence-only dispatch proof by its internally derived repair ID. */
export function readRepairDispatchProof(
  repoRoot: string,
  publicationId: string,
  repairId: string,
  gitBin = 'git',
): RepairDispatchProofV1 | null {
  if (!publicationTreeExists(repoRoot, publicationId, gitBin)) return null;
  if (!requireDirectory(repairsDirectory(repoRoot, publicationId, gitBin), true)) return null;
  const path = repairDispatchProofPath(repoRoot, publicationId, repairId, gitBin);
  const bytes = existingRegular(path, 'repair dispatch proof');
  if (bytes === null) return null;
  const proof = parseRepairDispatchProof(bytes, path);
  if (proof.publication_id !== publicationId || proof.repair_id !== repairId) {
    throw unreadable(`repair dispatch proof does not match its storage key: ${path}`);
  }
  return proof;
}

/**
 * Strict recovery locator for a source publication whose former pointer may no
 * longer be current. Selection remains the effect layer's fenced operation;
 * this function never guesses between multiple proofs.
 */
export function readRepairDispatchProofs(
  repoRoot: string,
  publicationId: string,
  gitBin = 'git',
): readonly RepairDispatchProofV1[] {
  if (!publicationTreeExists(repoRoot, publicationId, gitBin)) return Object.freeze([]);
  const directory = repairsDirectory(repoRoot, publicationId, gitBin);
  const proofs: RepairDispatchProofV1[] = [];
  for (const name of listedFiles(directory, true)) {
    if (!/^[0-9a-f]{64}\.json$/u.test(name)) throw unreadable(`unexpected repair dispatch filename: ${name}`);
    const path = join(directory, name);
    const proof = parseRepairDispatchProof(readRegular(path, 'repair dispatch proof'), path);
    if (proof.publication_id !== publicationId || publicationComponent(proof.repair_id) !== name.slice(0, -'.json'.length)) {
      throw unreadable(`repair dispatch proof does not match its storage key: ${path}`);
    }
    proofs.push(proof);
  }
  return Object.freeze(proofs);
}

/**
 * Persist a repair proof only as its legal state machine allows: first
 * `prepared`, then the one exact `dispatched` successor.  The proof records
 * observed lifecycle facts but is never an authority to perform them.
 */
export function writeRepairDispatchProof(
  repoRoot: string,
  publicationId: string,
  proof: RepairDispatchProofV1,
  gitBin = 'git',
): string {
  const valid = validateRepairDispatchProof(proof);
  if (valid.publication_id !== publicationId) {
    throw new FeedbackStoreError('repair_dispatch_conflict', 'repair dispatch proof publication does not match its inbox');
  }
  preparePublicationDirectories(repoRoot, publicationId, gitBin);
  const path = repairDispatchProofPath(repoRoot, publicationId, valid.repair_id, gitBin);
  const previous = existingRegular(path, 'repair dispatch proof');
  if (previous !== null) {
    const current = parseRepairDispatchProof(previous, path);
    const currentBytes = canonicalRepairDispatchProofBytes(current);
    const nextBytes = canonicalRepairDispatchProofBytes(valid);
    if (currentBytes === nextBytes) return path;
    if (current.phase !== 'prepared' || valid.phase !== 'dispatched') {
      throw new FeedbackStoreError('repair_dispatch_conflict', `repair dispatch proof is not a legal transition: ${path}`);
    }
    let transitioned: RepairDispatchProofV1;
    try {
      transitioned = transitionRepairDispatchProofCore(current, {
        successor_claim_id: valid.successor_claim_id!,
        successor_generation: valid.successor_generation!,
        successor_state: valid.successor_state!,
      });
    } catch (error) {
      throw new FeedbackStoreError('repair_dispatch_conflict', `repair dispatch proof successor is invalid: ${path}`, error);
    }
    if (canonicalRepairDispatchProofBytes(transitioned) !== nextBytes) {
      throw new FeedbackStoreError('repair_dispatch_conflict', `repair dispatch proof immutable fields changed: ${path}`);
    }
  } else if (valid.phase !== 'prepared') {
    throw new FeedbackStoreError('repair_dispatch_conflict', 'repair dispatch proof must start prepared');
  }

  const bytes = Buffer.from(`${canonicalRepairDispatchProofBytes(valid)}\n`, 'utf-8');
  const parent = repairsDirectory(repoRoot, publicationId, gitBin);
  const temporary = join(parent, `.${hash(path)}.${process.pid}.${randomUUID()}.tmp`);
  let fd: number | null = null;
  try {
    fd = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
    writeAll(fd, bytes);
    fsyncSync(fd);
  } catch (error) {
    throw incomplete(`cannot write repair dispatch proof: ${path}`, error);
  } finally {
    if (fd !== null) closeSync(fd);
  }
  try {
    renameSync(temporary, path);
    fsyncDirectory(parent);
  } catch (error) {
    throw incomplete(`cannot publish repair dispatch proof: ${path}`, error);
  } finally {
    try { unlinkSync(temporary); } catch { /* The publish error, if any, wins. */ }
  }
  return path;
}

export function transitionRepairDispatchProof(
  repoRoot: string,
  publicationId: string,
  repairId: string,
  successor: RepairDispatchSuccessorInput,
  gitBin = 'git',
): RepairDispatchProofV1 {
  const current = readRepairDispatchProof(repoRoot, publicationId, repairId, gitBin);
  if (current === null) {
    throw new FeedbackStoreError('repair_not_dispatched', 'repair dispatch proof is unavailable');
  }
  let next: RepairDispatchProofV1;
  try {
    next = transitionRepairDispatchProofCore(current, successor);
  } catch (error) {
    throw new FeedbackStoreError('repair_dispatch_conflict', 'repair dispatch proof transition is invalid', error);
  }
  writeRepairDispatchProof(repoRoot, publicationId, next, gitBin);
  return next;
}

/**
 * Append under the caller's already-held task lock.  `completion_id` is the
 * durable idempotency key: replaying identical canonical evidence is a no-op,
 * while any alternate completion fact for the same ID fails closed.
 */
export function appendReactionAttemptReceipt(
  repoRoot: string,
  publicationId: string,
  receipt: ReactionAttemptReceiptV1,
  gitBin = 'git',
): string {
  const valid = validateReactionAttemptReceipt(receipt);
  if (valid.publication_id !== publicationId) {
    throw new FeedbackStoreError('reaction_receipt_conflict', 'reaction receipt publication does not match its ledger');
  }
  preparePublicationDirectories(repoRoot, publicationId, gitBin);
  const proof = readRepairDispatchProof(repoRoot, publicationId, valid.repair_id, gitBin);
  if (proof === null || proof.phase !== 'dispatched') {
    throw new FeedbackStoreError('repair_not_dispatched', 'reaction receipt has no dispatched repair proof');
  }
  if (proof.successor_claim_id !== valid.successor_claim_id
    || proof.successor_generation !== valid.successor_generation) {
    throw new FeedbackStoreError('reaction_receipt_conflict', 'reaction receipt successor does not match its dispatched proof');
  }
  const path = feedbackReactionLedgerPath(repoRoot, publicationId, gitBin);
  const current = existingRegular(path, 'feedback reaction ledger');
  if (current !== null) {
    const existing = readReactionAttemptReceipts(repoRoot, publicationId, gitBin);
    for (const receipt of existing) {
      if (receipt.completion_id !== valid.completion_id) continue;
      if (canonicalReactionAttemptReceiptBytes(receipt) === canonicalReactionAttemptReceiptBytes(valid)) return path;
      throw new FeedbackStoreError('reaction_receipt_conflict', 'reaction completion_id conflicts with existing receipt');
    }
  }
  const line = Buffer.from(`${canonicalReactionAttemptReceiptBytes(valid)}\n`, 'utf-8');
  let fd: number | null = null;
  try {
    fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND, 0o600);
    writeAll(fd, line);
    fsyncSync(fd);
  } catch (error) {
    throw incomplete(`cannot append feedback reaction receipt: ${path}`, error);
  } finally {
    if (fd !== null) closeSync(fd);
  }
  return path;
}

export function readReactionAttemptReceipts(
  repoRoot: string,
  publicationId: string,
  gitBin = 'git',
): readonly ReactionAttemptReceiptV1[] {
  if (!publicationTreeExists(repoRoot, publicationId, gitBin)) return Object.freeze([]);
  const path = feedbackReactionLedgerPath(repoRoot, publicationId, gitBin);
  const bytes = existingRegular(path, 'feedback reaction ledger');
  if (bytes === null) return Object.freeze([]);
  const text = bytes.toString('utf-8');
  const receipts: ReactionAttemptReceiptV1[] = [];
  const lines = text.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index] === '' && index === lines.length - 1) continue;
    const receipt = parseReaction(lines[index], path, index + 1);
    if (receipt.publication_id !== publicationId) {
      throw unreadable(`feedback reaction receipt does not match its ledger: ${path}:${index + 1}`);
    }
    receipts.push(receipt);
  }
  return Object.freeze(receipts);
}
