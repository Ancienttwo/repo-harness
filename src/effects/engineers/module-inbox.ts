import { createHash, randomUUID } from 'crypto';
import {
  closeSync,
  constants,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeSync,
} from 'fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'path';

import {
  ModuleMessageError,
  acknowledgeModuleMessageReceipt,
  applyModuleMessageObservation,
  buildModuleMessageDeliveryObservation,
  buildModuleMessageDeliveryReceipt,
  canonicalModuleMessageDeliveryObservationBytes,
  canonicalModuleMessageDeliveryReceiptBytes,
  canonicalModuleMessageEventBytes,
  renderModuleMessageTransportPayload,
  supersedeModuleMessageReceipt,
  validateModuleMessageDeliveryObservation,
  validateModuleMessageDeliveryReceipt,
  validateModuleMessageEvent,
  type ModuleMessageDeliveryObservationV1,
  type ModuleMessageDeliveryOutcome,
  type ModuleMessageDeliveryReceiptV1,
  type ModuleMessageEventV1,
} from '../../core/engineers/module-message';
import type { EngineerPrincipalV1 } from '../../core/engineers/principal-claim';
import { resolveGitCommonDirectory } from '../git/common-directory';
import { withExclusiveDirectoryLock } from '../locking/exclusive-directory-lock';
import { readEngineerBindingStatus } from './binding-store';
import { loadEngineerProfile } from './profile-store';

export const MODULE_INBOX_RELATIVE_PATH = 'repo-harness/engineer-inbox/v1';

export type ModuleInboxErrorCode =
  | 'module_message_invalid'
  | 'module_message_conflict'
  | 'module_message_unreadable'
  | 'module_message_persistence_failed'
  | 'module_message_binding_stale'
  | 'module_message_transition_invalid'
  | 'module_message_resource_invalid'
  | 'module_message_resource_digest_mismatch';

export class ModuleInboxError extends Error {
  constructor(readonly code: ModuleInboxErrorCode, message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'ModuleInboxError';
  }
}

export interface ModuleMessageTransportInput {
  readonly event_digest: string;
  readonly attempt: number;
  readonly target_engineer_id: string;
  readonly target_binding_id: string;
  readonly target_binding_generation: number;
  readonly provider: string;
  readonly provider_thread_id: string;
  readonly payload: string;
}

export interface ModuleMessageTransportResult {
  readonly outcome: ModuleMessageDeliveryOutcome;
  readonly provider_delivery_ref: string | null;
  readonly observed_at: string;
}

export interface ModuleMessageTransport {
  deliver(input: ModuleMessageTransportInput): ModuleMessageTransportResult;
}

export interface SendModuleMessageInput {
  readonly repo_root: string;
  readonly event: ModuleMessageEventV1;
  readonly transport?: ModuleMessageTransport;
  readonly now?: () => string;
}

export interface ModuleInboxEntry {
  readonly event: ModuleMessageEventV1;
  readonly receipt: ModuleMessageDeliveryReceiptV1;
}

export interface ModuleInboxListResult {
  readonly engineer_id: string;
  readonly entries: readonly ModuleInboxEntry[];
  readonly superseded_count: number;
}

export interface ModuleInboxObservationSummary {
  readonly pending: number;
  readonly delivery_failed: number;
  readonly revision: string;
}

export interface SendModuleMessageResult extends ModuleInboxEntry {
  readonly event_path: string;
  readonly created: boolean;
  readonly observation: ModuleMessageDeliveryObservationV1 | null;
}

export interface RecordModuleMessageDeliveryObservationInput {
  readonly repo_root: string;
  readonly engineer_id: string;
  readonly message_id: string;
  readonly expected_message_event_digest: string;
  readonly expected_attempt: number;
  readonly result: ModuleMessageTransportResult;
}

interface EngineerInboxPaths {
  readonly common: string;
  readonly root: string;
  readonly engineer: string;
  readonly events: string;
  readonly receipts: string;
  readonly observations: string;
  readonly lock: string;
}

function fail(code: ModuleInboxErrorCode, message: string, cause?: unknown): never {
  throw new ModuleInboxError(code, message, cause);
}

function asInboxError(error: unknown, code: ModuleInboxErrorCode, message: string): ModuleInboxError {
  if (error instanceof ModuleInboxError) return error;
  if (error instanceof ModuleMessageError) return new ModuleInboxError(error.code, error.message, error);
  return new ModuleInboxError(code, message, error);
}

function engineerKey(engineerId: string): string {
  if (!/^engineer:capability\.[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$/u.test(engineerId)) {
    return fail('module_message_invalid', 'engineer_id cannot be mapped to a safe inbox key');
  }
  return createHash('sha256').update(Buffer.from(engineerId, 'utf-8')).digest('hex');
}

function pathsFor(repoRoot: string, engineerId: string): EngineerInboxPaths {
  const common = resolveGitCommonDirectory(repoRoot);
  const root = join(common, MODULE_INBOX_RELATIVE_PATH);
  const key = engineerKey(engineerId);
  const engineer = join(root, 'engineers', key);
  return {
    common,
    root,
    engineer,
    events: join(engineer, 'events'),
    receipts: join(engineer, 'receipts'),
    observations: join(engineer, 'observations'),
    lock: join(MODULE_INBOX_RELATIVE_PATH, 'locks', `${key}.lock`),
  };
}

export function moduleInboxEngineerDirectory(repoRoot: string, engineerId: string): string {
  return pathsFor(repoRoot, engineerId).engineer;
}

function scopedSegments(root: string, target: string): string[] {
  const scoped = relative(root, target);
  if (!scoped || isAbsolute(scoped) || scoped === '..' || scoped.startsWith(`..${sep}`)) {
    fail('module_message_unreadable', `module inbox path escapes git common directory: ${target}`);
  }
  return scoped.split(sep).filter(Boolean);
}

function safeDirectoryChain(root: string, target: string, create: boolean, label: string): boolean {
  let current = root;
  for (const segment of scopedSegments(root, target)) {
    current = join(current, segment);
    let stat;
    try {
      stat = lstatSync(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw asInboxError(error, 'module_message_unreadable', `cannot inspect ${label}: ${current}`);
      }
      if (!create) return false;
      try {
        mkdirSync(current, { mode: 0o700 });
        stat = lstatSync(current);
      } catch (mkdirError) {
        throw asInboxError(mkdirError, 'module_message_persistence_failed', `cannot create ${label}: ${current}`);
      }
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail('module_message_unreadable', `${label} is unsafe: ${current}`);
  }
  return true;
}

function preparePaths(paths: EngineerInboxPaths): void {
  safeDirectoryChain(paths.common, paths.root, true, 'module inbox root');
  safeDirectoryChain(paths.common, paths.engineer, true, 'Engineer inbox');
  safeDirectoryChain(paths.common, paths.events, true, 'module message events');
  safeDirectoryChain(paths.common, paths.receipts, true, 'module message receipts');
  safeDirectoryChain(paths.common, paths.observations, true, 'module message observations');
}

function withInboxLock<T>(paths: EngineerInboxPaths, run: () => T): T {
  try {
    safeDirectoryChain(paths.common, paths.root, true, 'module inbox root');
    safeDirectoryChain(paths.common, join(paths.root, 'locks'), true, 'module inbox locks');
    return withExclusiveDirectoryLock(paths.common, paths.lock, run, { reclaimStaleEmptyDirectory: true });
  } catch (error) {
    throw asInboxError(error, 'module_message_unreadable', 'cannot acquire Engineer inbox lock');
  }
}

function assertRegularFile(path: string, label: string): void {
  let stat;
  try {
    stat = lstatSync(path);
  } catch (error) {
    throw asInboxError(error, 'module_message_unreadable', `cannot inspect ${label}: ${path}`);
  }
  if (stat.isSymbolicLink() || !stat.isFile()) fail('module_message_unreadable', `${label} is unsafe: ${path}`);
}

function readCanonical(path: string, label: string): string {
  assertRegularFile(path, label);
  let raw: string;
  try {
    raw = readFileSync(path, 'utf-8');
  } catch (error) {
    throw asInboxError(error, 'module_message_unreadable', `cannot read ${label}: ${path}`);
  }
  if (!raw.endsWith('\n')) fail('module_message_unreadable', `${label} framing is invalid: ${path}`);
  return raw.slice(0, -1);
}

function eventPath(paths: EngineerInboxPaths, messageId: string): string {
  return join(paths.events, `${messageId}.json`);
}

function receiptPath(paths: EngineerInboxPaths, messageId: string): string {
  return join(paths.receipts, `${messageId}.json`);
}

function observationPath(paths: EngineerInboxPaths, messageId: string, attempt: number): string {
  return join(paths.observations, messageId, `${String(attempt).padStart(8, '0')}.json`);
}

function readEvent(path: string): ModuleMessageEventV1 {
  try {
    const raw = readCanonical(path, 'module message event');
    const event = validateModuleMessageEvent(JSON.parse(raw));
    if (canonicalModuleMessageEventBytes(event) !== raw) fail('module_message_unreadable', `module message event is non-canonical: ${path}`);
    return event;
  } catch (error) {
    throw asInboxError(error, 'module_message_unreadable', `module message event is malformed: ${path}`);
  }
}

function readReceipt(path: string): ModuleMessageDeliveryReceiptV1 {
  try {
    const raw = readCanonical(path, 'module message receipt');
    const receipt = validateModuleMessageDeliveryReceipt(JSON.parse(raw));
    if (canonicalModuleMessageDeliveryReceiptBytes(receipt) !== raw) fail('module_message_unreadable', `module message receipt is non-canonical: ${path}`);
    return receipt;
  } catch (error) {
    throw asInboxError(error, 'module_message_unreadable', `module message receipt is malformed: ${path}`);
  }
}

function readObservation(path: string): ModuleMessageDeliveryObservationV1 {
  try {
    const raw = readCanonical(path, 'module message observation');
    const observation = validateModuleMessageDeliveryObservation(JSON.parse(raw));
    if (canonicalModuleMessageDeliveryObservationBytes(observation) !== raw) {
      fail('module_message_unreadable', `module message observation is non-canonical: ${path}`);
    }
    return observation;
  } catch (error) {
    throw asInboxError(error, 'module_message_unreadable', `module message observation is malformed: ${path}`);
  }
}

function writeAll(fd: number, data: Buffer): void {
  let offset = 0;
  while (offset < data.length) offset += writeSync(fd, data, offset, data.length - offset);
}

function syncDirectory(path: string): void {
  const fd = openSync(path, constants.O_RDONLY);
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function writeExclusive(path: string, canonical: string, label: string): boolean {
  const directory = dirname(path);
  safeDirectoryChain(pathsRoot(path), directory, true, label);
  let fd: number | null = null;
  try {
    fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
    writeAll(fd, Buffer.from(`${canonical}\n`, 'utf-8'));
    fsyncSync(fd);
    closeSync(fd);
    fd = null;
    syncDirectory(directory);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw asInboxError(error, 'module_message_persistence_failed', `cannot persist ${label}: ${path}`);
  } finally {
    if (fd !== null) closeSync(fd);
  }
}

function pathsRoot(path: string): string {
  const marker = `${sep}repo-harness${sep}engineer-inbox${sep}v1${sep}`;
  const index = path.indexOf(marker);
  if (index < 0) fail('module_message_unreadable', `module inbox path is outside its root: ${path}`);
  return path.slice(0, index);
}

function replaceCanonical(path: string, canonical: string, label: string): void {
  const directory = dirname(path);
  const temporary = join(directory, `.${process.pid}.${randomUUID()}.tmp`);
  let fd: number | null = null;
  try {
    fd = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
    writeAll(fd, Buffer.from(`${canonical}\n`, 'utf-8'));
    fsyncSync(fd);
    closeSync(fd);
    fd = null;
    renameSync(temporary, path);
    syncDirectory(directory);
  } catch (error) {
    throw asInboxError(error, 'module_message_persistence_failed', `cannot persist ${label}: ${path}`);
  } finally {
    if (fd !== null) closeSync(fd);
    try {
      unlinkSync(temporary);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw asInboxError(error, 'module_message_persistence_failed', `cannot clean temporary ${label}`);
      }
    }
  }
}

function validateTarget(repoRoot: string, event: ModuleMessageEventV1) {
  const profile = loadEngineerProfile(repoRoot, event.target_engineer_id);
  if (profile.profile.capability_id !== event.capability_id) {
    fail('module_message_invalid', 'message capability does not match target Engineer Profile');
  }
  const status = readEngineerBindingStatus(repoRoot, event.target_engineer_id, profile.engineer_contract_revision);
  const binding = status.binding;
  if (!binding || status.current.state !== 'active' || binding.state !== 'active') {
    fail('module_message_binding_stale', 'target Engineer has no active Binding');
  }
  if (event.scope === 'assignment'
    && (event.target_binding_id !== binding.binding_id
      || event.target_binding_generation !== binding.binding_generation
      || event.target_engineer_contract_revision !== profile.engineer_contract_revision)) {
    fail('module_message_binding_stale', 'assignment message fences do not match the exact current Binding');
  }
  return { profile, binding };
}

function assertPrincipal(repoRoot: string, principal: EngineerPrincipalV1) {
  const profile = loadEngineerProfile(repoRoot, principal.engineer_id);
  const status = readEngineerBindingStatus(repoRoot, principal.engineer_id, profile.engineer_contract_revision);
  const binding = status.binding;
  if (!binding || status.current.state !== 'active' || binding.state !== 'active'
    || binding.binding_id !== principal.binding_id
    || binding.binding_generation !== principal.binding_generation
    || binding.engineer_contract_revision !== principal.engineer_contract_revision) {
    fail('module_message_binding_stale', 'Engineer principal no longer matches the exact current Binding');
  }
  return { profile, binding };
}

function persistEventAndReceipt(paths: EngineerInboxPaths, event: ModuleMessageEventV1): { created: boolean; receipt: ModuleMessageDeliveryReceiptV1 } {
  preparePaths(paths);
  const target = eventPath(paths, event.message_id);
  const canonical = canonicalModuleMessageEventBytes(event);
  const created = writeExclusive(target, canonical, 'module message event');
  if (!created) {
    const existing = readEvent(target);
    if (canonicalModuleMessageEventBytes(existing) !== canonical) {
      fail('module_message_conflict', `message_id ${event.message_id} already names different immutable bytes`);
    }
  }
  const receiptTarget = receiptPath(paths, event.message_id);
  if (existsSync(receiptTarget)) {
    const receipt = readReceipt(receiptTarget);
    if (receipt.message_event_digest !== event.event_digest) fail('module_message_unreadable', 'receipt event digest is mismatched');
    return { created, receipt };
  }
  const receipt = buildModuleMessageDeliveryReceipt(event);
  if (!writeExclusive(receiptTarget, canonicalModuleMessageDeliveryReceiptBytes(receipt), 'module message receipt')) {
    const existing = readReceipt(receiptTarget);
    if (canonicalModuleMessageDeliveryReceiptBytes(existing) !== canonicalModuleMessageDeliveryReceiptBytes(receipt)) {
      fail('module_message_conflict', 'initial module message receipt conflicts with existing bytes');
    }
    return { created, receipt: existing };
  }
  return { created, receipt };
}

function appendObservation(
  paths: EngineerInboxPaths,
  event: ModuleMessageEventV1,
  receipt: ModuleMessageDeliveryReceiptV1,
  result: ModuleMessageTransportResult,
  expectedAttempt = receipt.attempt + 1,
): { receipt: ModuleMessageDeliveryReceiptV1; observation: ModuleMessageDeliveryObservationV1 } {
  validateTransportResult(result);
  if (!Number.isSafeInteger(expectedAttempt) || expectedAttempt < 1) {
    fail('module_message_invalid', 'expected delivery attempt is invalid');
  }
  const target = observationPath(paths, event.message_id, expectedAttempt);
  if (existsSync(target)) {
    const existing = readObservation(target);
    const expectedPrevious = receipt.attempt === expectedAttempt
      ? existing.previous_observation_digest
      : receipt.latest_observation_digest;
    const expected = buildModuleMessageDeliveryObservation({
      message_event_digest: event.event_digest,
      recipient_engineer_id: event.target_engineer_id,
      target_binding_generation: event.target_binding_generation,
      attempt: expectedAttempt,
      outcome: result.outcome,
      provider_delivery_ref: result.provider_delivery_ref,
      observed_at: result.observed_at,
      previous_observation_digest: expectedPrevious,
    });
    if (canonicalModuleMessageDeliveryObservationBytes(existing)
      !== canonicalModuleMessageDeliveryObservationBytes(expected)) {
      fail('module_message_conflict', `delivery attempt ${expectedAttempt} already names different immutable bytes`);
    }
    if (receipt.attempt === expectedAttempt) {
      if (receipt.latest_observation_digest !== existing.observation_digest) {
        fail('module_message_unreadable', 'receipt does not reference its persisted observation');
      }
      return { receipt, observation: existing };
    }
    if (receipt.attempt !== expectedAttempt - 1) {
      fail('module_message_transition_invalid', 'delivery observation does not continue the receipt attempt chain');
    }
    const recovered = applyModuleMessageObservation(receipt, existing);
    replaceCanonical(receiptPath(paths, event.message_id), canonicalModuleMessageDeliveryReceiptBytes(recovered), 'module message receipt');
    return { receipt: recovered, observation: existing };
  }
  if (receipt.attempt !== expectedAttempt - 1) {
    fail('module_message_transition_invalid', 'delivery observation does not continue the receipt attempt chain');
  }
  const observation = buildModuleMessageDeliveryObservation({
    message_event_digest: event.event_digest,
    recipient_engineer_id: event.target_engineer_id,
    target_binding_generation: event.target_binding_generation,
    attempt: expectedAttempt,
    outcome: result.outcome,
    provider_delivery_ref: result.provider_delivery_ref,
    observed_at: result.observed_at,
    previous_observation_digest: receipt.latest_observation_digest,
  });
  const directory = join(paths.observations, event.message_id);
  safeDirectoryChain(paths.common, directory, true, 'module message observation chain');
  if (!writeExclusive(
    target,
    canonicalModuleMessageDeliveryObservationBytes(observation),
    'module message observation',
  )) {
    fail('module_message_conflict', `delivery attempt ${observation.attempt} already exists`);
  }
  const next = applyModuleMessageObservation(receipt, observation);
  replaceCanonical(receiptPath(paths, event.message_id), canonicalModuleMessageDeliveryReceiptBytes(next), 'module message receipt');
  return { receipt: next, observation };
}

function transportAttempt(
  repoRoot: string,
  paths: EngineerInboxPaths,
  event: ModuleMessageEventV1,
  receipt: ModuleMessageDeliveryReceiptV1,
  transport: ModuleMessageTransport,
  now: () => string,
): { receipt: ModuleMessageDeliveryReceiptV1; observation: ModuleMessageDeliveryObservationV1 } {
  let result: ModuleMessageTransportResult;
  try {
    const { binding } = validateTarget(repoRoot, event);
    result = transport.deliver({
      event_digest: event.event_digest,
      attempt: receipt.attempt + 1,
      target_engineer_id: event.target_engineer_id,
      target_binding_id: binding.binding_id,
      target_binding_generation: binding.binding_generation,
      provider: binding.provider,
      provider_thread_id: binding.provider_thread_id,
      payload: renderModuleMessageTransportPayload(readEvent(eventPath(paths, event.message_id))),
    });
    validateTransportResult(result);
  } catch (error) {
    if (error instanceof ModuleInboxError && error.code === 'module_message_binding_stale') {
      result = { outcome: 'binding_stale', provider_delivery_ref: null, observed_at: now() };
    } else {
      result = { outcome: 'transport_error', provider_delivery_ref: null, observed_at: now() };
    }
  }
  return appendObservation(paths, event, receipt, result);
}

function validateTransportResult(result: ModuleMessageTransportResult): void {
  if (!result || typeof result !== 'object'
    || (result.outcome !== 'delivered' && result.outcome !== 'transport_error'
      && result.outcome !== 'recipient_unavailable' && result.outcome !== 'binding_stale'
      && result.outcome !== 'adapter_unavailable')
    || (result.provider_delivery_ref !== null && typeof result.provider_delivery_ref !== 'string')
    || typeof result.observed_at !== 'string') {
    fail('module_message_invalid', 'transport returned an invalid delivery observation');
  }
}

export function sendModuleMessage(input: SendModuleMessageInput): SendModuleMessageResult {
  let event: ModuleMessageEventV1;
  try {
    event = validateModuleMessageEvent(input.event);
  } catch (error) {
    throw asInboxError(error, 'module_message_invalid', 'module message event is invalid');
  }
  const paths = pathsFor(input.repo_root, event.target_engineer_id);
  return withInboxLock(paths, () => {
    validateTarget(input.repo_root, event);
    const persisted = persistEventAndReceipt(paths, event);
    let receipt = persisted.receipt;
    let observation: ModuleMessageDeliveryObservationV1 | null = null;
    if (input.transport && receipt.delivery_state === 'pending') {
      ({ receipt, observation } = transportAttempt(
        input.repo_root,
        paths,
        readEvent(eventPath(paths, event.message_id)),
        receipt,
        input.transport,
        input.now ?? (() => new Date().toISOString()),
      ));
    }
    return { event: readEvent(eventPath(paths, event.message_id)), receipt, observation, event_path: eventPath(paths, event.message_id), created: persisted.created };
  });
}

export function readModuleMessageDelivery(input: {
  readonly repo_root: string;
  readonly engineer_id: string;
  readonly message_id: string;
}): ModuleInboxEntry {
  const paths = pathsFor(input.repo_root, input.engineer_id);
  return withInboxLock(paths, () => {
    const event = readEvent(eventPath(paths, input.message_id));
    if (event.target_engineer_id !== input.engineer_id) {
      fail('module_message_invalid', 'message does not belong to the requested Engineer inbox');
    }
    validateTarget(input.repo_root, event);
    const receipt = readReceipt(receiptPath(paths, event.message_id));
    if (receipt.message_event_digest !== event.event_digest) {
      fail('module_message_unreadable', 'receipt event digest is mismatched');
    }
    return { event, receipt };
  });
}

export function recordModuleMessageDeliveryObservation(
  input: RecordModuleMessageDeliveryObservationInput,
): ModuleInboxEntry & { readonly observation: ModuleMessageDeliveryObservationV1 } {
  const paths = pathsFor(input.repo_root, input.engineer_id);
  return withInboxLock(paths, () => {
    const event = readEvent(eventPath(paths, input.message_id));
    if (event.target_engineer_id !== input.engineer_id
      || event.event_digest !== input.expected_message_event_digest) {
      fail('module_message_conflict', 'external delivery observation does not match the exact persisted event');
    }
    const receipt = readReceipt(receiptPath(paths, event.message_id));
    const recorded = appendObservation(paths, event, receipt, input.result, input.expected_attempt);
    return { event, receipt: recorded.receipt, observation: recorded.observation };
  });
}

function eventNames(paths: EngineerInboxPaths): string[] {
  if (!safeDirectoryChain(paths.common, paths.events, false, 'module message events')) return [];
  return readdirSync(paths.events).sort().map((name) => {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.json$/iu.test(name)) {
      fail('module_message_unreadable', `invalid module message event filename: ${name}`);
    }
    return name;
  });
}

function entriesFor(paths: EngineerInboxPaths): ModuleInboxEntry[] {
  return eventNames(paths).map((name) => {
    const event = readEvent(join(paths.events, name));
    const receipt = readReceipt(receiptPath(paths, event.message_id));
    if (event.target_engineer_id === '' || receipt.message_event_digest !== event.event_digest) {
      fail('module_message_unreadable', `module message identity is mismatched: ${name}`);
    }
    return { event, receipt };
  }).sort((left, right) => left.event.created_at.localeCompare(right.event.created_at)
    || left.event.message_id.localeCompare(right.event.message_id));
}

/** Pure read model for operator projections. It never creates inbox or lock
 * paths; concurrent mutation is detected by the caller's double read. */
export function observeModuleInboxSummary(repoRoot: string, engineerId: string): ModuleInboxObservationSummary {
  const paths = pathsFor(repoRoot, engineerId);
  const entries = entriesFor(paths);
  let deliveryFailed = 0;
  const revisions = entries.map(({ event, receipt }) => {
    let latestOutcome: ModuleMessageDeliveryOutcome | null = null;
    let latestObservationDigest: string | null = null;
    if (receipt.attempt > 0) {
      const observation = readObservation(observationPath(paths, event.message_id, receipt.attempt));
      if (observation.observation_digest !== receipt.latest_observation_digest) {
        fail('module_message_unreadable', 'message receipt does not match its latest observation');
      }
      latestOutcome = observation.outcome;
      latestObservationDigest = observation.observation_digest;
      if (observation.outcome !== 'delivered') deliveryFailed += 1;
    }
    return {
      message_id: event.message_id,
      event_digest: event.event_digest,
      receipt_digest: receipt.receipt_digest,
      latest_observation_digest: latestObservationDigest,
      latest_outcome: latestOutcome,
    };
  });
  return Object.freeze({
    pending: entries.filter(({ receipt }) => receipt.delivery_state === 'pending').length,
    delivery_failed: deliveryFailed,
    revision: `sha256:${createHash('sha256').update(JSON.stringify(revisions)).digest('hex')}`,
  });
}

export function listModuleInbox(input: { readonly repo_root: string; readonly principal: EngineerPrincipalV1 }): ModuleInboxListResult {
  assertPrincipal(input.repo_root, input.principal);
  const paths = pathsFor(input.repo_root, input.principal.engineer_id);
  return withInboxLock(paths, () => ({
    engineer_id: input.principal.engineer_id,
    entries: entriesFor(paths),
    superseded_count: 0,
  }));
}

export function receiveModuleInbox(input: {
  readonly repo_root: string;
  readonly principal: EngineerPrincipalV1;
  readonly delivered_at?: string;
}): ModuleInboxListResult {
  assertPrincipal(input.repo_root, input.principal);
  const paths = pathsFor(input.repo_root, input.principal.engineer_id);
  return withInboxLock(paths, () => {
    let superseded = 0;
    const deliveredAt = input.delivered_at ?? new Date().toISOString();
    const entries = entriesFor(paths).map(({ event, receipt }) => {
      // The assignment fence is evaluated before the terminal-state check: a
      // receipt delivered to the previous Binding is still addressed to a fence
      // this principal cannot acknowledge, so `pending` and `delivered` both
      // leave through supersede instead of stranding on rotation.
      if (event.scope === 'assignment'
        && (receipt.delivery_state === 'pending' || receipt.delivery_state === 'delivered')
        && (event.target_binding_id !== input.principal.binding_id
          || event.target_binding_generation !== input.principal.binding_generation
          || event.target_engineer_contract_revision !== input.principal.engineer_contract_revision)) {
        const next = supersedeModuleMessageReceipt(receipt);
        replaceCanonical(receiptPath(paths, event.message_id), canonicalModuleMessageDeliveryReceiptBytes(next), 'module message receipt');
        superseded += 1;
        return { event, receipt: next };
      }
      if (receipt.delivery_state === 'acknowledged' || receipt.delivery_state === 'superseded' || receipt.delivery_state === 'delivered') {
        return { event, receipt };
      }
      const observed = appendObservation(paths, event, receipt, {
        outcome: 'delivered',
        provider_delivery_ref: null,
        observed_at: deliveredAt,
      });
      return { event, receipt: observed.receipt };
    });
    return { engineer_id: input.principal.engineer_id, entries, superseded_count: superseded };
  });
}

const RESOURCE_ROOTS: Readonly<Record<ModuleMessageEventV1['resource_refs'][number]['kind'], readonly string[]>> = {
  contract: ['tasks/contracts/'],
  work_envelope: ['.ai/harness/handoff/'],
  capability_context: ['docs/architecture/modules/', '.archcontext/model/nodes/'],
  verified_context: ['.ai/context/'],
  evidence: ['.ai/harness/checks/', 'tasks/reviews/'],
};

export function verifyModuleMessageResources(repoRoot: string, event: ModuleMessageEventV1): void {
  const root = realpathSync(repoRoot);
  for (const resource of event.resource_refs) {
    if (!RESOURCE_ROOTS[resource.kind].some((prefix) => resource.locator.startsWith(prefix))) {
      fail('module_message_resource_invalid', `${resource.kind} locator is outside its owning resource roots`);
    }
    const absolute = resolve(root, resource.locator);
    const scoped = relative(root, absolute);
    if (!scoped || scoped === '..' || scoped.startsWith(`..${sep}`) || isAbsolute(scoped)) {
      fail('module_message_resource_invalid', `resource escapes repository: ${resource.locator}`);
    }
    let current = root;
    for (const segment of scoped.split(sep)) {
      current = join(current, segment);
      let stat;
      try {
        stat = lstatSync(current);
      } catch (error) {
        throw new ModuleInboxError('module_message_resource_invalid', `resource is missing: ${resource.locator}`, error);
      }
      if (stat.isSymbolicLink()) fail('module_message_resource_invalid', `resource path contains a symlink: ${resource.locator}`);
    }
    if (!lstatSync(absolute).isFile()) fail('module_message_resource_invalid', `resource is not a regular file: ${resource.locator}`);
    const actual = `sha256:${createHash('sha256').update(readFileSync(absolute)).digest('hex')}`;
    if (actual !== resource.sha256) {
      fail('module_message_resource_digest_mismatch', `resource digest mismatch: ${resource.locator}`);
    }
  }
}

export function acknowledgeModuleMessage(input: {
  readonly repo_root: string;
  readonly principal: EngineerPrincipalV1;
  readonly message_id: string;
}): ModuleInboxEntry {
  assertPrincipal(input.repo_root, input.principal);
  const paths = pathsFor(input.repo_root, input.principal.engineer_id);
  return withInboxLock(paths, () => {
    const event = readEvent(eventPath(paths, input.message_id));
    if (event.target_engineer_id !== input.principal.engineer_id) fail('module_message_invalid', 'message recipient does not match principal');
    if (event.scope === 'assignment'
      && (event.target_binding_id !== input.principal.binding_id
        || event.target_binding_generation !== input.principal.binding_generation
        || event.target_engineer_contract_revision !== input.principal.engineer_contract_revision)) {
      fail('module_message_binding_stale', 'assignment message does not match current principal fences');
    }
    const receipt = readReceipt(receiptPath(paths, event.message_id));
    verifyModuleMessageResources(input.repo_root, event);
    const acknowledged = acknowledgeModuleMessageReceipt(receipt, input.principal.binding_generation);
    if (canonicalModuleMessageDeliveryReceiptBytes(acknowledged) !== canonicalModuleMessageDeliveryReceiptBytes(receipt)) {
      replaceCanonical(receiptPath(paths, event.message_id), canonicalModuleMessageDeliveryReceiptBytes(acknowledged), 'module message receipt');
    }
    return { event, receipt: acknowledged };
  });
}
