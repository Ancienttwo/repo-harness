/**
 * Durable provider-feedback evidence under the git common directory.
 *
 * Provider facts are immutable files; notification state and repair-attempt
 * evidence live in distinct files so neither can change an event digest.
 */
import { createHash, randomUUID } from 'crypto';
import { closeSync, constants, existsSync, fsyncSync, linkSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, unlinkSync, writeSync } from 'fs';
import { join } from 'path';

import { canonicalFeedbackDeliveryReceiptBytes, canonicalFeedbackEventBytes, transitionFeedbackDeliveryReceipt, validateFeedbackDeliveryReceipt, validateFeedbackEvent, validateReactionAttemptReceipt, type FeedbackDeliveryReceiptV1, type FeedbackEventV1, type ReactionAttemptReceiptV1 } from '../../core/publication/feedback';
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

/** Every owned path of one publication inbox, derived from one Git common-directory read. */
interface PublicationLayout {
  readonly common: string;
  readonly root: string;
  readonly publication: string;
  readonly events: string;
  readonly deliveries: string;
  readonly reactions: string;
}

/**
 * Resolve the Git common directory once per store operation.  Each resolution
 * spawns Git, so derived paths must not resolve it again.
 */
function publicationLayout(repoRoot: string, publicationId: string, gitBin = 'git'): PublicationLayout {
  const common = resolveGitCommonDirectory(repoRoot, gitBin);
  const root = join(common, FEEDBACK_ROOT_RELATIVE_PATH);
  const publication = join(root, publicationComponent(publicationId));
  return {
    common,
    root,
    publication,
    events: join(publication, 'events'),
    deliveries: join(publication, 'deliveries'),
    reactions: join(publication, 'reactions.jsonl'),
  };
}

function eventPathIn(layout: PublicationLayout, providerEventId: string): string {
  return join(layout.events, `${eventComponent(providerEventId)}.json`);
}

function deliveryPathIn(layout: PublicationLayout, providerEventId: string): string {
  return join(layout.deliveries, `${eventComponent(providerEventId)}.json`);
}


export function feedbackEventPath(
  repoRoot: string,
  publicationId: string,
  providerEventId: string,
  gitBin = 'git',
): string {
  return eventPathIn(publicationLayout(repoRoot, publicationId, gitBin), providerEventId);
}

export function feedbackDeliveryReceiptPath(
  repoRoot: string,
  publicationId: string,
  providerEventId: string,
  gitBin = 'git',
): string {
  return deliveryPathIn(publicationLayout(repoRoot, publicationId, gitBin), providerEventId);
}

export function feedbackReactionLedgerPath(repoRoot: string, publicationId: string, gitBin = 'git'): string {
  return publicationLayout(repoRoot, publicationId, gitBin).reactions;
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

function preparePublicationDirectories(layout: PublicationLayout): void {
  // Validate each owned level after creating it.  The common directory itself
  // is realpath-resolved by resolveGitCommonDirectory and is not ours to make.
  ensureDirectory(join(layout.common, 'repo-harness'));
  ensureDirectory(join(layout.common, 'repo-harness', 'feedback'));
  ensureDirectory(layout.root);
  ensureDirectory(layout.publication);
  ensureDirectory(layout.events);
  ensureDirectory(layout.deliveries);
}

/** Validate every owned ancestor before following a read path below it. */
function publicationTreeExists(layout: PublicationLayout): boolean {
  for (const path of [
    join(layout.common, 'repo-harness'),
    join(layout.common, 'repo-harness', 'feedback'),
    layout.root,
    layout.publication,
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
  const layout = publicationLayout(repoRoot, valid.publication_id, gitBin);
  preparePublicationDirectories(layout);
  const path = eventPathIn(layout, valid.provider_event_id);
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
  const layout = publicationLayout(repoRoot, publicationId, gitBin);
  preparePublicationDirectories(layout);
  if (readFeedbackEventIn(layout, publicationId, valid.provider_event_id) === null) {
    throw incomplete('feedback delivery receipt has no immutable provider event');
  }
  const path = deliveryPathIn(layout, valid.provider_event_id);
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
  const parent = layout.deliveries;
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
  return readFeedbackEventIn(publicationLayout(repoRoot, publicationId, gitBin), publicationId, providerEventId);
}

function readFeedbackEventIn(
  layout: PublicationLayout,
  publicationId: string,
  providerEventId: string,
): FeedbackEventV1 | null {
  if (!publicationTreeExists(layout)) return null;
  const path = eventPathIn(layout, providerEventId);
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
  const layout = publicationLayout(repoRoot, publicationId, gitBin);
  if (!publicationTreeExists(layout)) return null;
  const path = deliveryPathIn(layout, providerEventId);
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
  const layout = publicationLayout(repoRoot, publicationId, gitBin);
  if (!publicationTreeExists(layout)) return Object.freeze([]);
  const directory = layout.events;
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
  const layout = publicationLayout(repoRoot, publicationId, gitBin);
  if (!publicationTreeExists(layout)) return Object.freeze([]);
  const directory = layout.deliveries;
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

/** Read historical completion receipts without restoring their retired writer. */
export function readReactionAttemptReceipts(
  repoRoot: string,
  publicationId: string,
  gitBin = 'git',
): readonly ReactionAttemptReceiptV1[] {
  return readReactionAttemptReceiptsIn(publicationLayout(repoRoot, publicationId, gitBin), publicationId);
}

function readReactionAttemptReceiptsIn(
  layout: PublicationLayout,
  publicationId: string,
): readonly ReactionAttemptReceiptV1[] {
  if (!publicationTreeExists(layout)) return Object.freeze([]);
  const path = layout.reactions;
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
