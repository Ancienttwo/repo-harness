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
  renameSync,
  unlinkSync,
  writeSync,
} from 'fs';
import { dirname, join, relative, resolve, sep } from 'path';

import {
  PROVIDER_THREAD_ADAPTER_KIND,
  ProviderThreadEffectError,
  assertProviderThreadEffectTransition,
  buildProviderThreadCapabilityObservation,
  buildProviderThreadEffectCurrent,
  buildProviderThreadEffectIntent,
  buildProviderThreadEffectObservation,
  buildProviderThreadHostAction,
  canonicalProviderThreadCapabilityBytes,
  canonicalProviderThreadEffectCurrentBytes,
  canonicalProviderThreadEffectIntentBytes,
  canonicalProviderThreadEffectObservationBytes,
  deriveProviderThreadEffectId,
  validateProviderThreadCapabilityObservation,
  validateProviderThreadEffectCurrent,
  validateProviderThreadEffectIntent,
  validateProviderThreadEffectObservation,
  type ProviderThreadCapabilityObservationV1,
  type ProviderThreadCapabilityStatus,
  type ProviderThreadEffectCurrentV1,
  type ProviderThreadEffectIntentV1,
  type ProviderThreadEffectObservationV1,
  type ProviderThreadEffectState,
  type ProviderThreadFailureClass,
  type ProviderThreadHostActionV1,
  type ProviderThreadOperation,
  type ProviderThreadUsageV1,
} from '../../core/engineers/provider-thread-effect';
import { resolveGitCommonDirectory } from '../git/common-directory';
import { withExclusiveDirectoryLock } from '../locking/exclusive-directory-lock';
import { readEngineerBindingStatus } from './binding-store';
import {
  readModuleMessageDelivery,
  recordModuleMessageDeliveryObservation,
} from './module-inbox';
import { loadEngineerProfile } from './profile-store';
import { renderModuleMessageTransportPayload } from '../../core/engineers/module-message';

export const PROVIDER_THREAD_EFFECT_RELATIVE_ROOT = 'repo-harness/provider-thread-effects/v1';

export type ProviderThreadEffectStoreErrorCode =
  | 'provider_thread_effect_invalid'
  | 'provider_thread_effect_unreadable'
  | 'provider_thread_effect_persistence_failed'
  | 'provider_thread_effect_not_found'
  | 'provider_thread_effect_conflict'
  | 'provider_thread_effect_binding_stale'
  | 'provider_thread_effect_capability_unsupported'
  | 'provider_thread_effect_transition_invalid';

export class ProviderThreadEffectStoreError extends Error {
  constructor(readonly code: ProviderThreadEffectStoreErrorCode, message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'ProviderThreadEffectStoreError';
  }
}

export interface PrepareProviderThreadEffectInput {
  readonly repo_root: string;
  readonly engineer_id: string;
  readonly message_id: string;
  readonly idempotency_key: string;
  readonly operation: ProviderThreadOperation;
  readonly expected_binding_id: string;
  readonly expected_binding_generation: number;
  readonly expected_engineer_contract_revision: string;
  readonly expected_capability_sha256: string;
  readonly created_at: string;
}

export interface ProviderThreadEffectStatus {
  readonly intent: ProviderThreadEffectIntentV1;
  readonly current: ProviderThreadEffectCurrentV1;
  readonly observation: ProviderThreadEffectObservationV1;
}

export interface StartProviderThreadEffectResult extends ProviderThreadEffectStatus {
  readonly action: ProviderThreadHostActionV1 | null;
}

export interface ObserveProviderThreadEffectInput {
  readonly repo_root: string;
  readonly effect_id: string;
  readonly state: Extract<ProviderThreadEffectState,
    'observed_success' | 'observed_failure' | 'reconciliation_required' | 'stopped'>;
  readonly message_event_digest: string;
  readonly host_id: string;
  readonly provider_thread_id: string;
  readonly provider_turn_id: string | null;
  readonly provider_user_message_id: string | null;
  readonly provider_assistant_message_id: string | null;
  readonly provider_effect_ref: string | null;
  readonly failure_class: ProviderThreadFailureClass;
  readonly usage: ProviderThreadUsageV1;
  readonly observed_at: string;
  readonly crash_hook?: ProviderThreadEffectCrashHook;
}

export type ProviderThreadEffectCrashBoundary = 'after_observation_fsync' | 'after_current_fsync';
export type ProviderThreadEffectCrashHook = (boundary: ProviderThreadEffectCrashBoundary) => void;

interface StorePaths {
  readonly common: string;
  readonly root: string;
  readonly capabilities: string;
  readonly effects: string;
  readonly locks: string;
}

interface EffectPaths {
  readonly store: StorePaths;
  readonly effect_hex: string;
  readonly effect: string;
  readonly intent: string;
  readonly observations: string;
  readonly current: string;
  readonly lock_relative: string;
}

function fail(code: ProviderThreadEffectStoreErrorCode, message: string, cause?: unknown): never {
  throw new ProviderThreadEffectStoreError(code, message, cause);
}

function asStoreError(error: unknown, code: ProviderThreadEffectStoreErrorCode, message: string): ProviderThreadEffectStoreError {
  if (error instanceof ProviderThreadEffectStoreError) return error;
  if (error instanceof ProviderThreadEffectError) {
    const mapped = error.code === 'provider_thread_effect_transition_invalid'
      ? 'provider_thread_effect_transition_invalid'
      : 'provider_thread_effect_invalid';
    return new ProviderThreadEffectStoreError(mapped, error.message, error);
  }
  return new ProviderThreadEffectStoreError(code, message, error);
}

function storePaths(repoRoot: string): StorePaths {
  const common = resolveGitCommonDirectory(repoRoot);
  const root = resolve(common, PROVIDER_THREAD_EFFECT_RELATIVE_ROOT);
  return {
    common,
    root,
    capabilities: join(root, 'capabilities'),
    effects: join(root, 'effects'),
    locks: join(root, 'locks'),
  };
}

function effectHex(effectId: string): string {
  const match = /^sha256:([0-9a-f]{64})$/u.exec(effectId);
  if (!match) return fail('provider_thread_effect_invalid', 'effect_id is invalid');
  return match[1];
}

function effectPaths(repoRoot: string, effectId: string): EffectPaths {
  const store = storePaths(repoRoot);
  const hex = effectHex(effectId);
  const effect = join(store.effects, hex);
  return {
    store,
    effect_hex: hex,
    effect,
    intent: join(effect, 'intent.json'),
    observations: join(effect, 'observations'),
    current: join(effect, 'current.json'),
    lock_relative: `${PROVIDER_THREAD_EFFECT_RELATIVE_ROOT}/locks/${hex}.lock`,
  };
}

function safeKey(value: string, field: string): string {
  if (typeof value !== 'string' || value.length === 0 || Buffer.byteLength(value, 'utf8') > 512) {
    return fail('provider_thread_effect_invalid', `${field} is invalid`);
  }
  return createHash('sha256').update(Buffer.from(value, 'utf8')).digest('hex');
}

function scopedSegments(root: string, target: string): string[] {
  const scoped = relative(root, target);
  if (!scoped || scoped === '..' || scoped.startsWith(`..${sep}`) || /^[A-Za-z]:/u.test(scoped)) {
    return fail('provider_thread_effect_unreadable', `effect path escapes git common directory: ${target}`);
  }
  return scoped.split(sep).filter(Boolean);
}

function safeDirectoryChain(root: string, target: string, create: boolean): boolean {
  let current = root;
  for (const segment of scopedSegments(root, target)) {
    current = join(current, segment);
    try {
      const stat = lstatSync(current);
      if (!stat.isDirectory() || stat.isSymbolicLink()) {
        fail('provider_thread_effect_unreadable', `unsafe effect store directory: ${current}`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw asStoreError(error, 'provider_thread_effect_unreadable', `cannot inspect effect store directory: ${current}`);
      }
      if (!create) return false;
      try {
        mkdirSync(current, { mode: 0o700 });
      } catch (mkdirError) {
        if ((mkdirError as NodeJS.ErrnoException).code !== 'EEXIST') {
          throw asStoreError(mkdirError, 'provider_thread_effect_persistence_failed', `cannot create effect store directory: ${current}`);
        }
      }
      const stat = lstatSync(current);
      if (!stat.isDirectory() || stat.isSymbolicLink()) {
        fail('provider_thread_effect_unreadable', `unsafe effect store directory: ${current}`);
      }
      syncDirectory(dirname(current));
    }
  }
  return true;
}

function prepareStore(paths: StorePaths): void {
  safeDirectoryChain(paths.common, paths.root, true);
  safeDirectoryChain(paths.common, paths.capabilities, true);
  safeDirectoryChain(paths.common, paths.effects, true);
  safeDirectoryChain(paths.common, paths.locks, true);
}

function prepareEffect(paths: EffectPaths): void {
  prepareStore(paths.store);
  safeDirectoryChain(paths.store.common, paths.effect, true);
  safeDirectoryChain(paths.store.common, paths.observations, true);
}

function syncDirectory(path: string): void {
  const fd = openSync(path, constants.O_RDONLY);
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function assertRegularFile(path: string, label: string): void {
  let stat;
  try {
    stat = lstatSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      fail('provider_thread_effect_not_found', `${label} is missing`);
    }
    throw asStoreError(error, 'provider_thread_effect_unreadable', `cannot inspect ${label}`);
  }
  if (!stat.isFile() || stat.isSymbolicLink()) fail('provider_thread_effect_unreadable', `${label} is unsafe`);
}

function readRaw(path: string, label: string): string {
  assertRegularFile(path, label);
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    throw asStoreError(error, 'provider_thread_effect_unreadable', `cannot read ${label}`);
  }
}

function readOptionalRaw(path: string, label: string): string | null {
  if (!existsSync(path)) return null;
  return readRaw(path, label);
}

function writeAll(fd: number, data: Buffer): void {
  let offset = 0;
  while (offset < data.length) offset += writeSync(fd, data, offset, data.length - offset);
}

function writeExclusive(path: string, canonical: string, label: string): boolean {
  let fd: number | null = null;
  try {
    fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    writeAll(fd, Buffer.from(canonical, 'utf8'));
    fsyncSync(fd);
    closeSync(fd);
    fd = null;
    syncDirectory(dirname(path));
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw asStoreError(error, 'provider_thread_effect_persistence_failed', `cannot persist ${label}`);
  } finally {
    if (fd !== null) closeSync(fd);
  }
}

function replaceCanonical(path: string, canonical: string, label: string): void {
  const temporary = join(dirname(path), `.${process.pid}.${randomUUID()}.tmp`);
  let fd: number | null = null;
  try {
    fd = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    writeAll(fd, Buffer.from(canonical, 'utf8'));
    fsyncSync(fd);
    closeSync(fd);
    fd = null;
    renameSync(temporary, path);
    syncDirectory(dirname(path));
  } catch (error) {
    throw asStoreError(error, 'provider_thread_effect_persistence_failed', `cannot publish ${label}`);
  } finally {
    if (fd !== null) closeSync(fd);
    try {
      unlinkSync(temporary);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw asStoreError(error, 'provider_thread_effect_persistence_failed', `cannot clean temporary ${label}`);
      }
    }
  }
}

function withEffectLock<T>(paths: EffectPaths, run: () => T): T {
  prepareStore(paths.store);
  return withExclusiveDirectoryLock(paths.store.common, paths.lock_relative, run, {
    reclaimStaleEmptyDirectory: true,
  });
}

function parseIntent(raw: string): ProviderThreadEffectIntentV1 {
  try {
    const value = validateProviderThreadEffectIntent(JSON.parse(raw));
    if (canonicalProviderThreadEffectIntentBytes(value) !== raw) {
      fail('provider_thread_effect_unreadable', 'effect intent is non-canonical');
    }
    return value;
  } catch (error) {
    throw asStoreError(error, 'provider_thread_effect_unreadable', 'effect intent is malformed');
  }
}

function parseObservation(raw: string): ProviderThreadEffectObservationV1 {
  try {
    const value = validateProviderThreadEffectObservation(JSON.parse(raw));
    if (canonicalProviderThreadEffectObservationBytes(value) !== raw) {
      fail('provider_thread_effect_unreadable', 'effect observation is non-canonical');
    }
    return value;
  } catch (error) {
    throw asStoreError(error, 'provider_thread_effect_unreadable', 'effect observation is malformed');
  }
}

function parseCurrent(raw: string): ProviderThreadEffectCurrentV1 {
  try {
    const value = validateProviderThreadEffectCurrent(JSON.parse(raw));
    if (canonicalProviderThreadEffectCurrentBytes(value) !== raw) {
      fail('provider_thread_effect_unreadable', 'effect current is non-canonical');
    }
    return value;
  } catch (error) {
    throw asStoreError(error, 'provider_thread_effect_unreadable', 'effect current is malformed');
  }
}

function observationPath(paths: EffectPaths, sequence: number): string {
  return join(paths.observations, `${String(sequence).padStart(8, '0')}.json`);
}

function readObservationChain(paths: EffectPaths, intent: ProviderThreadEffectIntentV1): ProviderThreadEffectObservationV1[] {
  let names: string[];
  try {
    names = readdirSync(paths.observations).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw asStoreError(error, 'provider_thread_effect_unreadable', 'cannot list effect observations');
  }
  const observations: ProviderThreadEffectObservationV1[] = [];
  names.forEach((name, index) => {
    if (name !== `${String(index).padStart(8, '0')}.json`) {
      fail('provider_thread_effect_unreadable', `effect observation sequence is not contiguous: ${name}`);
    }
    const observation = parseObservation(readRaw(join(paths.observations, name), 'effect observation'));
    if (observation.effect_id !== intent.effect_id || observation.intent_sha256 !== intent.intent_sha256) {
      fail('provider_thread_effect_unreadable', 'effect observation identity is mismatched');
    }
    if (index > 0) assertProviderThreadEffectTransition(observations[index - 1], observation);
    observations.push(observation);
  });
  return observations;
}

function readStatusLocked(paths: EffectPaths): ProviderThreadEffectStatus {
  const intent = parseIntent(readRaw(paths.intent, 'effect intent'));
  const observations = readObservationChain(paths, intent);
  if (observations.length === 0) fail('provider_thread_effect_unreadable', 'effect has no initial observation');
  const observation = observations[observations.length - 1];
  const projected = buildProviderThreadEffectCurrent(observation);
  const currentRaw = readOptionalRaw(paths.current, 'effect current');
  if (currentRaw !== null) parseCurrent(currentRaw);
  const projectedRaw = canonicalProviderThreadEffectCurrentBytes(projected);
  if (currentRaw !== projectedRaw) replaceCanonical(paths.current, projectedRaw, 'effect current');
  return { intent, current: projected, observation };
}

function appendObservationLocked(
  paths: EffectPaths,
  status: ProviderThreadEffectStatus,
  observation: ProviderThreadEffectObservationV1,
  crashHook?: ProviderThreadEffectCrashHook,
): ProviderThreadEffectStatus {
  assertProviderThreadEffectTransition(status.observation, observation);
  const target = observationPath(paths, observation.sequence);
  const canonical = canonicalProviderThreadEffectObservationBytes(observation);
  if (!writeExclusive(target, canonical, 'effect observation')) {
    const existing = readRaw(target, 'effect observation');
    if (existing !== canonical) fail('provider_thread_effect_conflict', 'effect observation sequence already names different bytes');
  }
  crashHook?.('after_observation_fsync');
  const current = buildProviderThreadEffectCurrent(observation);
  replaceCanonical(paths.current, canonicalProviderThreadEffectCurrentBytes(current), 'effect current');
  crashHook?.('after_current_fsync');
  return { intent: status.intent, current, observation };
}

function initializeEffectLocked(
  paths: EffectPaths,
  intent: ProviderThreadEffectIntentV1,
): ProviderThreadEffectStatus {
  const initial = buildProviderThreadEffectObservation({
    effect_id: intent.effect_id,
    intent_sha256: intent.intent_sha256,
    sequence: 0,
    state: 'intent_persisted',
    host_id: intent.host_id,
    provider_thread_id: intent.provider_thread_id,
    provider_turn_id: null,
    provider_user_message_id: null,
    provider_assistant_message_id: null,
    provider_effect_ref: null,
    failure_class: 'none',
    usage: unavailableUsage(),
    observed_at: intent.created_at,
    previous_observation_sha256: null,
  });
  const canonicalInitial = canonicalProviderThreadEffectObservationBytes(initial);
  if (!writeExclusive(observationPath(paths, 0), canonicalInitial, 'initial effect observation')) {
    const existing = readRaw(observationPath(paths, 0), 'initial effect observation');
    if (existing !== canonicalInitial) fail('provider_thread_effect_conflict', 'initial effect observation conflicts');
  }
  const current = buildProviderThreadEffectCurrent(initial);
  replaceCanonical(paths.current, canonicalProviderThreadEffectCurrentBytes(current), 'effect current');
  return { intent, current, observation: initial };
}

function unavailableUsage(): ProviderThreadUsageV1 {
  return { authority: 'unavailable', input_tokens: null, cached_input_tokens: null, output_tokens: null };
}

function capabilityCurrentPath(paths: StorePaths, hostId: string): string {
  return join(paths.capabilities, `${safeKey(hostId, 'host_id')}.json`);
}

export function recordProviderThreadCapability(
  repoRoot: string,
  input: Omit<ProviderThreadCapabilityObservationV1,
    'protocol' | 'kind' | 'adapter_kind' | 'capability_sha256'>,
): ProviderThreadCapabilityObservationV1 {
  const observation = buildProviderThreadCapabilityObservation(input);
  const paths = storePaths(repoRoot);
  prepareStore(paths);
  const hostLock = `${PROVIDER_THREAD_EFFECT_RELATIVE_ROOT}/locks/capability-${safeKey(observation.host_id, 'host_id')}.lock`;
  return withExclusiveDirectoryLock(paths.common, hostLock, () => {
    const target = capabilityCurrentPath(paths, observation.host_id);
    const existing = readOptionalRaw(target, 'capability observation');
    const canonical = canonicalProviderThreadCapabilityBytes(observation);
    if (existing === canonical) return observation;
    replaceCanonical(target, canonical, 'capability observation');
    return observation;
  }, { reclaimStaleEmptyDirectory: true });
}

export function readProviderThreadCapability(
  repoRoot: string,
  hostId: string,
): ProviderThreadCapabilityObservationV1 {
  const paths = storePaths(repoRoot);
  const raw = readRaw(capabilityCurrentPath(paths, hostId), 'capability observation');
  try {
    const value = validateProviderThreadCapabilityObservation(JSON.parse(raw));
    if (canonicalProviderThreadCapabilityBytes(value) !== raw) {
      fail('provider_thread_effect_unreadable', 'capability observation is non-canonical');
    }
    return value;
  } catch (error) {
    throw asStoreError(error, 'provider_thread_effect_unreadable', 'capability observation is malformed');
  }
}

function assertCurrentBinding(repoRoot: string, intent: ProviderThreadEffectIntentV1): void {
  const profile = loadEngineerProfile(repoRoot, intent.engineer_id);
  const status = readEngineerBindingStatus(repoRoot, intent.engineer_id, profile.engineer_contract_revision);
  const binding = status.binding;
  if (!binding || binding.state !== 'active' || status.current.state !== 'active'
    || binding.binding_id !== intent.binding_id
    || binding.binding_generation !== intent.binding_generation
    || binding.engineer_contract_revision !== intent.engineer_contract_revision
    || binding.host_id !== intent.host_id
    || binding.provider_thread_id !== intent.provider_thread_id
    || binding.provider !== 'codex') {
    fail('provider_thread_effect_binding_stale', 'effect Binding fences do not match the exact current Codex Binding');
  }
}

function assertCapability(
  repoRoot: string,
  hostId: string,
  operation: ProviderThreadOperation,
  expectedDigest: string,
): ProviderThreadCapabilityObservationV1 {
  const capability = readProviderThreadCapability(repoRoot, hostId);
  if (capability.capability_sha256 !== expectedDigest) {
    fail('provider_thread_effect_conflict', 'capability observation digest changed');
  }
  if (capability.operations[operation] !== 'supported') {
    fail('provider_thread_effect_capability_unsupported', `${operation} capability is ${capability.operations[operation]}`);
  }
  return capability;
}

function assertPendingMessage(repoRoot: string, intent: ProviderThreadEffectIntentV1): void {
  const message = readModuleMessageDelivery({
    repo_root: repoRoot,
    engineer_id: intent.engineer_id,
    message_id: intent.message_id,
  });
  if (message.event.event_digest !== intent.message_event_digest
    || message.receipt.delivery_state !== 'pending'
    || message.receipt.attempt + 1 !== intent.delivery_attempt) {
    fail('provider_thread_effect_transition_invalid', 'effect no longer matches the exact pending ME-1C delivery attempt');
  }
}

export function prepareProviderThreadEffect(input: PrepareProviderThreadEffectInput): ProviderThreadEffectStatus {
  const paths = effectPaths(input.repo_root, deriveProviderThreadEffectId(input.idempotency_key));
  return withEffectLock(paths, () => {
    prepareEffect(paths);
    if (existsSync(paths.intent)) {
      const existing = parseIntent(readRaw(paths.intent, 'effect intent'));
      if (existing.idempotency_key !== input.idempotency_key
        || existing.message_id !== input.message_id
        || existing.engineer_id !== input.engineer_id
        || existing.operation !== input.operation
        || existing.binding_id !== input.expected_binding_id
        || existing.binding_generation !== input.expected_binding_generation
        || existing.engineer_contract_revision !== input.expected_engineer_contract_revision
        || existing.capability_sha256 !== input.expected_capability_sha256
        || existing.created_at !== input.created_at) {
        fail('provider_thread_effect_conflict', 'idempotency key already names a different prepare request');
      }
      if (readObservationChain(paths, existing).length > 0) return readStatusLocked(paths);
      assertCurrentBinding(input.repo_root, existing);
      assertCapability(input.repo_root, existing.host_id, existing.operation, existing.capability_sha256);
      assertPendingMessage(input.repo_root, existing);
      return initializeEffectLocked(paths, existing);
    }
    const profile = loadEngineerProfile(input.repo_root, input.engineer_id);
    const bindingStatus = readEngineerBindingStatus(input.repo_root, input.engineer_id, profile.engineer_contract_revision);
    const binding = bindingStatus.binding;
    if (!binding || binding.state !== 'active' || bindingStatus.current.state !== 'active'
      || binding.provider !== 'codex'
      || binding.binding_id !== input.expected_binding_id
      || binding.binding_generation !== input.expected_binding_generation
      || binding.engineer_contract_revision !== input.expected_engineer_contract_revision) {
      fail('provider_thread_effect_binding_stale', 'prepare fences do not match the exact current Codex Binding');
    }
    assertCapability(input.repo_root, binding.host_id, input.operation, input.expected_capability_sha256);
    const message = readModuleMessageDelivery({
      repo_root: input.repo_root,
      engineer_id: input.engineer_id,
      message_id: input.message_id,
    });
    if (message.receipt.delivery_state !== 'pending') {
      fail('provider_thread_effect_transition_invalid', `message receipt is already ${message.receipt.delivery_state}`);
    }
    const intent = buildProviderThreadEffectIntent({
      idempotency_key: input.idempotency_key,
      message_id: message.event.message_id,
      message_event_digest: message.event.event_digest,
      delivery_attempt: message.receipt.attempt + 1,
      engineer_id: input.engineer_id,
      binding_id: binding.binding_id,
      binding_generation: binding.binding_generation,
      engineer_contract_revision: binding.engineer_contract_revision,
      operation: input.operation,
      host_id: binding.host_id,
      provider_thread_id: binding.provider_thread_id,
      capability_sha256: input.expected_capability_sha256,
      payload: renderModuleMessageTransportPayload(message.event),
      created_at: input.created_at,
    });
    const canonicalIntent = canonicalProviderThreadEffectIntentBytes(intent);
    if (!writeExclusive(paths.intent, canonicalIntent, 'effect intent')) {
      const existing = readRaw(paths.intent, 'effect intent');
      if (existing !== canonicalIntent) {
        fail('provider_thread_effect_conflict', 'idempotency key already names different immutable intent bytes');
      }
      return readStatusLocked(paths);
    }
    assertCurrentBinding(input.repo_root, intent);
    assertCapability(input.repo_root, intent.host_id, intent.operation, intent.capability_sha256);
    return initializeEffectLocked(paths, intent);
  });
}

export function readProviderThreadEffectStatus(repoRoot: string, effectId: string): ProviderThreadEffectStatus {
  const paths = effectPaths(repoRoot, effectId);
  return withEffectLock(paths, () => readStatusLocked(paths));
}

export function startProviderThreadEffect(input: {
  readonly repo_root: string;
  readonly effect_id: string;
  readonly started_at: string;
  readonly crash_hook?: ProviderThreadEffectCrashHook;
}): StartProviderThreadEffectResult {
  const paths = effectPaths(input.repo_root, input.effect_id);
  return withEffectLock(paths, () => {
    let status = readStatusLocked(paths);
    if (status.current.state !== 'intent_persisted') {
      if (status.current.state === 'effect_started') {
        const unknown = buildProviderThreadEffectObservation({
          effect_id: status.intent.effect_id,
          intent_sha256: status.intent.intent_sha256,
          sequence: status.observation.sequence + 1,
          state: 'reconciliation_required',
          host_id: status.intent.host_id,
          provider_thread_id: status.intent.provider_thread_id,
          provider_turn_id: null,
          provider_user_message_id: null,
          provider_assistant_message_id: null,
          provider_effect_ref: null,
          failure_class: 'unknown',
          usage: unavailableUsage(),
          observed_at: input.started_at,
          previous_observation_sha256: status.observation.observation_sha256,
        });
        status = appendObservationLocked(paths, status, unknown, input.crash_hook);
      }
      return { ...status, action: null };
    }
    assertCurrentBinding(input.repo_root, status.intent);
    assertCapability(input.repo_root, status.intent.host_id, status.intent.operation, status.intent.capability_sha256);
    assertPendingMessage(input.repo_root, status.intent);
    const started = buildProviderThreadEffectObservation({
      effect_id: status.intent.effect_id,
      intent_sha256: status.intent.intent_sha256,
      sequence: status.observation.sequence + 1,
      state: 'effect_started',
      host_id: status.intent.host_id,
      provider_thread_id: status.intent.provider_thread_id,
      provider_turn_id: null,
      provider_user_message_id: null,
      provider_assistant_message_id: null,
      provider_effect_ref: null,
      failure_class: 'none',
      usage: unavailableUsage(),
      observed_at: input.started_at,
      previous_observation_sha256: status.observation.observation_sha256,
    });
    status = appendObservationLocked(paths, status, started, input.crash_hook);
    return { ...status, action: buildProviderThreadHostAction(status.intent) };
  });
}

function sameProviderEvidence(
  observation: ProviderThreadEffectObservationV1,
  input: ObserveProviderThreadEffectInput,
): boolean {
  return observation.state === input.state
    && observation.host_id === input.host_id
    && observation.provider_thread_id === input.provider_thread_id
    && observation.provider_turn_id === input.provider_turn_id
    && observation.provider_user_message_id === input.provider_user_message_id
    && observation.provider_assistant_message_id === input.provider_assistant_message_id
    && observation.provider_effect_ref === input.provider_effect_ref
    && observation.failure_class === input.failure_class
    && JSON.stringify(observation.usage) === JSON.stringify(input.usage)
    && observation.observed_at === input.observed_at;
}

function projectSuccessfulDelivery(repoRoot: string, status: ProviderThreadEffectStatus): void {
  if (status.intent.operation !== 'send') return;
  recordModuleMessageDeliveryObservation({
    repo_root: repoRoot,
    engineer_id: status.intent.engineer_id,
    message_id: status.intent.message_id,
    expected_message_event_digest: status.intent.message_event_digest,
    expected_attempt: status.intent.delivery_attempt,
    result: {
      outcome: 'delivered',
      provider_delivery_ref: status.observation.provider_effect_ref
        ?? status.observation.provider_assistant_message_id,
      observed_at: status.observation.observed_at,
    },
  });
}

export function observeProviderThreadEffect(input: ObserveProviderThreadEffectInput): ProviderThreadEffectStatus {
  const paths = effectPaths(input.repo_root, input.effect_id);
  return withEffectLock(paths, () => {
    let status = readStatusLocked(paths);
    if (input.message_event_digest !== status.intent.message_event_digest
      || input.host_id !== status.intent.host_id
      || input.provider_thread_id !== status.intent.provider_thread_id) {
      fail('provider_thread_effect_conflict', 'Provider observation does not match exact intent correlation');
    }
    if (status.current.state === 'observed_success' || status.current.state === 'observed_failure'
      || status.current.state === 'stopped') {
      if (!sameProviderEvidence(status.observation, input)) {
        fail('provider_thread_effect_conflict', 'terminal Provider observation conflicts with existing evidence');
      }
      if (status.current.state === 'observed_success') projectSuccessfulDelivery(input.repo_root, status);
      return status;
    }
    if (status.current.state === 'reconciliation_required' && input.state === 'reconciliation_required') {
      if (!sameProviderEvidence(status.observation, input)) {
        fail('provider_thread_effect_conflict', 'repeated reconciliation evidence conflicts with existing unknown outcome');
      }
      return status;
    }
    if (status.current.state !== 'effect_started' && status.current.state !== 'reconciliation_required') {
      fail('provider_thread_effect_transition_invalid', `cannot observe effect from ${status.current.state}`);
    }
    const observation = buildProviderThreadEffectObservation({
      effect_id: status.intent.effect_id,
      intent_sha256: status.intent.intent_sha256,
      sequence: status.observation.sequence + 1,
      state: input.state,
      host_id: input.host_id,
      provider_thread_id: input.provider_thread_id,
      provider_turn_id: input.provider_turn_id,
      provider_user_message_id: input.provider_user_message_id,
      provider_assistant_message_id: input.provider_assistant_message_id,
      provider_effect_ref: input.provider_effect_ref,
      failure_class: input.failure_class,
      usage: input.usage,
      observed_at: input.observed_at,
      previous_observation_sha256: status.observation.observation_sha256,
    });
    status = appendObservationLocked(paths, status, observation, input.crash_hook);
    if (status.current.state === 'observed_success') projectSuccessfulDelivery(input.repo_root, status);
    return status;
  });
}

export function listProviderThreadEffects(
  repoRoot: string,
  engineerId?: string,
): readonly ProviderThreadEffectStatus[] {
  const store = storePaths(repoRoot);
  if (!safeDirectoryChain(store.common, store.effects, false)) return [];
  const names = readdirSync(store.effects).sort();
  return names.map((name) => {
    if (!/^[0-9a-f]{64}$/u.test(name)) {
      fail('provider_thread_effect_unreadable', `invalid effect directory: ${name}`);
    }
    return readProviderThreadEffectStatus(repoRoot, `sha256:${name}`);
  }).filter((status) => engineerId === undefined || status.intent.engineer_id === engineerId);
}

/** Pure operator observation. Unlike the command/status reader this function
 * never repairs `current.json` or creates store/lock paths. */
export function observeProviderThreadEffects(
  repoRoot: string,
  engineerId: string,
): readonly ProviderThreadEffectStatus[] {
  const store = storePaths(repoRoot);
  if (!safeDirectoryChain(store.common, store.effects, false)) return Object.freeze([]);
  const statuses = readdirSync(store.effects).sort().map((name) => {
    if (!/^[0-9a-f]{64}$/u.test(name)) {
      fail('provider_thread_effect_unreadable', `invalid effect directory: ${name}`);
    }
    const paths = effectPaths(repoRoot, `sha256:${name}`);
    const intent = parseIntent(readRaw(paths.intent, 'effect intent'));
    const observations = readObservationChain(paths, intent);
    if (observations.length === 0) fail('provider_thread_effect_unreadable', 'effect has no initial observation');
    const observation = observations[observations.length - 1];
    const projected = buildProviderThreadEffectCurrent(observation);
    const currentRaw = readRaw(paths.current, 'effect current');
    const current = parseCurrent(currentRaw);
    if (currentRaw !== canonicalProviderThreadEffectCurrentBytes(projected)
      || current.current_sha256 !== projected.current_sha256) {
      fail('provider_thread_effect_unreadable', 'effect current projection is stale');
    }
    return Object.freeze({ intent, current, observation });
  }).filter((status) => status.intent.engineer_id === engineerId);
  return Object.freeze(statuses);
}

export function providerThreadCapabilityStatusFor(
  repoRoot: string,
  hostId: string,
  operation: ProviderThreadOperation,
): { readonly capability: ProviderThreadCapabilityObservationV1; readonly status: ProviderThreadCapabilityStatus } {
  const capability = readProviderThreadCapability(repoRoot, hostId);
  return { capability, status: capability.operations[operation] };
}
