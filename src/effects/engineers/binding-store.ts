import { createHash, randomUUID } from 'crypto';
import {
  closeSync,
  constants,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { dirname, join, relative, resolve, sep } from 'path';

import {
  ENGINEER_BINDING_CURRENT_KIND,
  ENGINEER_BINDING_KIND,
  ENGINEER_PROFILE_PROTOCOL,
  EngineerProfileBindingError,
  buildEngineerBindingCurrent,
  buildEngineerBindingEvent,
  buildEngineerGenesisCurrent,
  canonicalEngineerBindingCurrentBytes,
  canonicalEngineerBindingEventBytes,
  deriveEngineerTransitionId,
  engineerCurrentPayloadSha256,
  engineerOperationFingerprint,
  validateEngineerBindingCurrent,
  validateEngineerBindingEvent,
  type EngineerBindingCurrentV1,
  type EngineerBindingEventV1,
  type EngineerBindingTransition,
  type EngineerBindingV1,
  type EngineerTransitionRequest,
} from '../../core/engineers/profile-binding';
import { resolveGitCommonDirectory } from '../git/common-directory';
import {
  ExclusiveLockContentionError,
  withExclusiveDirectoryLock,
} from '../locking/exclusive-directory-lock';
import { assertNoLiveClaimForBindingRotation } from './bound-task-rotation';

const ENGINEER_STORE_RELATIVE_ROOT = 'repo-harness/engineers/v1';

export interface EngineerBindingStatus {
  readonly current: EngineerBindingCurrentV1;
  readonly binding: EngineerBindingV1 | null;
  readonly event: EngineerBindingEventV1 | null;
  readonly genesis: boolean;
}

export interface BindEngineerInput {
  readonly engineer_id: string;
  readonly idempotency_key: string;
  readonly provider: string;
  readonly provider_thread_id: string;
  readonly host_id: string;
  readonly engineer_contract_revision: string;
  readonly expected_current_digest: string | null;
  readonly expected_binding_generation: number;
  readonly expected_binding_id: string | null;
  readonly expected_engineer_contract_revision: string;
  readonly now?: () => string;
  readonly binding_id?: () => string;
  readonly crash_hook?: EngineerBindingCrashHook;
  readonly lock_wait_timeout_ms?: number;
}

export interface RetireEngineerInput {
  readonly engineer_id: string;
  readonly idempotency_key: string;
  readonly expected_current_digest: string;
  readonly expected_binding_generation: number;
  readonly expected_binding_id: string;
  readonly expected_engineer_contract_revision: string;
  readonly now?: () => string;
  readonly crash_hook?: EngineerBindingCrashHook;
  readonly lock_wait_timeout_ms?: number;
}

export type EngineerBindingCrashBoundary = 'before_event' | 'after_event_fsync' | 'after_current_fsync';
export type EngineerBindingCrashHook = (boundary: EngineerBindingCrashBoundary) => void;

interface StorePaths {
  readonly common: string;
  readonly root: string;
  readonly engineerKey: string;
  readonly engineer: string;
  readonly events: string;
  readonly current: string;
  readonly lockRelative: string;
}

interface CurrentRead {
  readonly status: EngineerBindingStatus;
  readonly raw: string | null;
}

function fail(
  code: 'binding_state_corrupt' | 'binding_stale' | 'idempotency_conflict' | 'binding_lock_timeout' | 'unsafe_engineer_path',
  message: string,
  cause?: unknown,
): never {
  throw new EngineerProfileBindingError(code, message, cause);
}

function pathKey(engineerId: string): string {
  if (typeof engineerId !== 'string' || !/^engineer:capability\.[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$/u.test(engineerId)) {
    return fail('unsafe_engineer_path', 'engineer_id cannot be mapped to a safe store key');
  }
  return createHash('sha256').update(Buffer.from(engineerId, 'utf8')).digest('hex');
}

function ensureSafeDirectory(root: string, target: string): void {
  const scoped = relative(root, target);
  if (!scoped || scoped === '..' || scoped.startsWith(`..${sep}`)) fail('unsafe_engineer_path', `store path escapes root: ${target}`);
  let current = root;
  for (const component of scoped.split(sep)) {
    current = join(current, component);
    try {
      const stat = lstatSync(current);
      if (!stat.isDirectory() || stat.isSymbolicLink()) fail('unsafe_engineer_path', `unsafe store directory: ${current}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      try {
        mkdirSync(current, { mode: 0o700 });
      } catch (mkdirError) {
        if ((mkdirError as NodeJS.ErrnoException).code !== 'EEXIST') throw mkdirError;
      }
      const stat = lstatSync(current);
      if (!stat.isDirectory() || stat.isSymbolicLink()) fail('unsafe_engineer_path', `unsafe store directory: ${current}`);
      fsyncDirectory(dirname(current));
    }
  }
}

function storePaths(cwd: string, engineerId: string): StorePaths {
  const common = resolveGitCommonDirectory(cwd);
  const root = resolve(common, ENGINEER_STORE_RELATIVE_ROOT);
  const engineerKey = pathKey(engineerId);
  const engineer = join(root, engineerKey);
  return {
    common,
    root,
    engineerKey,
    engineer,
    events: join(engineer, 'events'),
    current: join(engineer, 'current.json'),
    lockRelative: `${ENGINEER_STORE_RELATIVE_ROOT}/locks/${engineerKey}.lock`,
  };
}

export function engineerBindingStoreRoot(cwd: string): string {
  return resolve(resolveGitCommonDirectory(cwd), ENGINEER_STORE_RELATIVE_ROOT);
}

function fsyncDirectory(path: string): void {
  const fd = openSync(path, constants.O_RDONLY);
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function readRegularFile(path: string, subject: string): string | null {
  let stat;
  try {
    stat = lstatSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    return fail('binding_state_corrupt', `${subject} cannot be inspected`, error);
  }
  if (!stat.isFile() || stat.isSymbolicLink()) fail('unsafe_engineer_path', `${subject} is not a regular file`);
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    return fail('binding_state_corrupt', `${subject} cannot be read`, error);
  }
}

function eventEntries(paths: StorePaths): readonly string[] {
  try {
    const stat = lstatSync(paths.events);
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail('unsafe_engineer_path', 'events path is unsafe');
    const entries = readdirSync(paths.events)
      .sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
    for (const entry of entries) {
      if (!/^[0-9a-f]{64}\.json$/u.test(entry)) fail('binding_state_corrupt', `unexpected events entry: ${entry}`);
      const entryStat = lstatSync(join(paths.events, entry));
      if (!entryStat.isFile() || entryStat.isSymbolicLink()) fail('unsafe_engineer_path', `unsafe events entry: ${entry}`);
    }
    return entries;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

function parseEvent(raw: string, subject: string): EngineerBindingEventV1 {
  try {
    const event = validateEngineerBindingEvent(JSON.parse(raw));
    if (raw !== canonicalEngineerBindingEventBytes(event)) fail('binding_state_corrupt', `${subject} is not canonical`);
    return event;
  } catch (error) {
    if (error instanceof EngineerProfileBindingError && error.code === 'binding_state_corrupt') throw error;
    return fail('binding_state_corrupt', `${subject} is invalid`, error);
  }
}

function parseCurrent(raw: string): EngineerBindingCurrentV1 {
  try {
    const current = validateEngineerBindingCurrent(JSON.parse(raw));
    if (raw !== canonicalEngineerBindingCurrentBytes(current)) fail('binding_state_corrupt', 'current.json is not canonical');
    return current;
  } catch (error) {
    if (error instanceof EngineerProfileBindingError && error.code === 'binding_state_corrupt') throw error;
    return fail('binding_state_corrupt', 'current.json is invalid', error);
  }
}

function readPersistedCurrent(paths: StorePaths, engineerId: string): CurrentRead | null {
  const raw = readRegularFile(paths.current, 'current.json');
  if (raw === null) return null;
  const current = parseCurrent(raw);
  if (current.engineer_id !== engineerId) fail('binding_state_corrupt', 'current engineer_id does not match store key');
  if (current.state === 'unbound') fail('binding_state_corrupt', 'generation-0 genesis must not be persisted');
  const eventPath = join(paths.events, `${current.current_transition_id!.slice('sha256:'.length)}.json`);
  const eventRaw = readRegularFile(eventPath, 'current event');
  if (eventRaw === null) fail('binding_state_corrupt', 'current event is missing');
  const event = parseEvent(eventRaw, 'current event');
  if (event.transition_id !== current.current_transition_id
    || event.event_digest !== current.current_event_digest
    || event.engineer_id !== engineerId) {
    fail('binding_state_corrupt', 'current/event digest binding is invalid');
  }
  const projected = buildEngineerBindingCurrent(event);
  if (canonicalEngineerBindingCurrentBytes(projected) !== raw) fail('binding_state_corrupt', 'current payload does not match current event');
  return {
    raw,
    status: Object.freeze({ current, binding: event.next_binding, event, genesis: false }),
  };
}

function readCurrent(paths: StorePaths, engineerId: string, contractRevision: string): CurrentRead {
  const persisted = readPersistedCurrent(paths, engineerId);
  if (persisted) return persisted;
  if (eventEntries(paths).length > 0) fail('binding_state_corrupt', 'events exist without current.json');
  return {
    raw: null,
    status: Object.freeze({
      current: buildEngineerGenesisCurrent(engineerId, contractRevision),
      binding: null,
      event: null,
      genesis: true,
    }),
  };
}

export function readEngineerBindingStatus(
  cwd: string,
  engineerId: string,
  engineerContractRevision: string,
): EngineerBindingStatus {
  const paths = storePaths(cwd, engineerId);
  try {
    const rootStat = lstatSync(paths.root);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) fail('unsafe_engineer_path', 'Engineer store root is unsafe');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return Object.freeze({
        current: buildEngineerGenesisCurrent(engineerId, engineerContractRevision),
        binding: null,
        event: null,
        genesis: true,
      });
    }
    throw error;
  }
  return readCurrent(paths, engineerId, engineerContractRevision).status;
}

function requestForBind(input: BindEngineerInput, transition: EngineerBindingTransition): EngineerTransitionRequest {
  return {
    engineer_id: input.engineer_id,
    idempotency_key: input.idempotency_key,
    transition,
    expected_current_digest: input.expected_current_digest,
    expected_binding_generation: input.expected_binding_generation,
    expected_binding_id: input.expected_binding_id,
    expected_engineer_contract_revision: input.expected_engineer_contract_revision,
    engineer_contract_revision: input.engineer_contract_revision,
    provider: input.provider,
    provider_thread_id: input.provider_thread_id,
    host_id: input.host_id,
  };
}

function requestForRetire(input: RetireEngineerInput): EngineerTransitionRequest {
  return {
    engineer_id: input.engineer_id,
    idempotency_key: input.idempotency_key,
    transition: 'retire',
    expected_current_digest: input.expected_current_digest,
    expected_binding_generation: input.expected_binding_generation,
    expected_binding_id: input.expected_binding_id,
    expected_engineer_contract_revision: input.expected_engineer_contract_revision,
    engineer_contract_revision: input.expected_engineer_contract_revision,
    provider: null,
    provider_thread_id: null,
    host_id: null,
  };
}

function assertExpected(current: EngineerBindingCurrentV1, request: EngineerTransitionRequest, genesis: boolean): void {
  const actualDigest = genesis ? null : current.current_digest;
  if (request.expected_current_digest !== actualDigest
    || request.expected_binding_generation !== current.binding_generation
    || request.expected_binding_id !== current.current_binding_id
    || request.expected_engineer_contract_revision !== current.engineer_contract_revision) {
    fail('binding_stale', 'expected binding current does not match authoritative current.json');
  }
}

function writeExclusiveDurably(path: string, bytes: string): void {
  let fd: number | null = null;
  try {
    fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    writeFileSync(fd, bytes, 'utf8');
    fsyncSync(fd);
  } finally {
    if (fd !== null) closeSync(fd);
  }
}

function writeCurrentDurably(paths: StorePaths, current: EngineerBindingCurrentV1, expectedRaw: string | null): void {
  const observed = readRegularFile(paths.current, 'current.json');
  if (observed !== expectedRaw) fail('binding_stale', 'current.json changed before publication');
  const temp = join(paths.engineer, `.current.tmp-${process.pid}-${randomUUID()}`);
  try {
    writeExclusiveDurably(temp, canonicalEngineerBindingCurrentBytes(current));
    const target = readRegularFile(paths.current, 'current.json');
    if (target !== expectedRaw) fail('binding_stale', 'current.json changed during publication');
    renameSync(temp, paths.current);
    fsyncDirectory(paths.engineer);
  } catch (error) {
    try {
      unlinkSync(temp);
    } catch {
      // The original error is authoritative.
    }
    throw error;
  }
}

function eventPath(paths: StorePaths, transitionId: string): string {
  return join(paths.events, `${transitionId.slice('sha256:'.length)}.json`);
}

function readEventForTransition(paths: StorePaths, transitionId: string): { readonly raw: string; readonly event: EngineerBindingEventV1 } | null {
  const raw = readRegularFile(eventPath(paths, transitionId), 'binding event');
  return raw === null ? null : { raw, event: parseEvent(raw, 'binding event') };
}

function currentForExistingEvent(
  cwd: string,
  paths: StorePaths,
  event: EngineerBindingEventV1,
  request: EngineerTransitionRequest,
): EngineerBindingCurrentV1 {
  if (event.operation_fingerprint !== engineerOperationFingerprint(request)) {
    fail('idempotency_conflict', 'idempotency key is already bound to a different transition request');
  }
  if (event.transition !== request.transition
    || event.expected_current_digest !== request.expected_current_digest
    || event.expected_binding_generation !== request.expected_binding_generation
    || event.previous_binding_id !== request.expected_binding_id) {
    fail('binding_state_corrupt', 'transition event does not encode its operation fingerprint request');
  }
  if (request.transition !== 'retire'
    && (event.next_binding?.provider !== request.provider
      || event.next_binding?.provider_thread_id !== request.provider_thread_id
      || event.next_binding?.host_id !== request.host_id)) {
    fail('binding_state_corrupt', 'transition event provider fields do not match its operation request');
  }
  const persisted = readPersistedCurrent(paths, request.engineer_id);
  if (persisted?.status.current.current_transition_id === event.transition_id) return persisted.status.current;

  let before: CurrentRead;
  if (persisted) {
    before = persisted;
  } else {
    const entries = eventEntries(paths);
    if (request.expected_binding_generation !== 0
      || request.expected_current_digest !== null
      || entries.length !== 1
      || entries[0] !== `${event.transition_id.slice('sha256:'.length)}.json`) {
      fail('binding_state_corrupt', 'only the exact genesis transition may resume an events-without-current state');
    }
    before = {
      raw: null,
      status: Object.freeze({
        current: buildEngineerGenesisCurrent(request.engineer_id, request.expected_engineer_contract_revision),
        binding: null,
        event: null,
        genesis: true,
      }),
    };
  }
  assertExpected(before.status.current, request, before.status.genesis);
  if ((request.transition === 'replace' || request.transition === 'retire')
    && before.status.current.current_binding_id !== null) {
    assertNoLiveClaimForBindingRotation(cwd, request.engineer_id, before.status.current.current_binding_id);
  }
  if (request.transition === 'retire' && before.status.binding !== null) {
    const expectedRetired = { ...before.status.binding, state: 'retired', retired_at: event.next_binding?.retired_at };
    if (JSON.stringify(event.next_binding) !== JSON.stringify(expectedRetired)) {
      fail('binding_state_corrupt', 'retire event does not preserve the active binding fields');
    }
  }
  const next = buildEngineerBindingCurrent(event);
  writeCurrentDurably(paths, next, before.raw);
  return next;
}

function publishNewEvent(
  paths: StorePaths,
  before: CurrentRead,
  request: EngineerTransitionRequest,
  nextBinding: EngineerBindingV1,
  createdAt: string,
  crashHook?: EngineerBindingCrashHook,
): EngineerBindingCurrentV1 {
  const currentBasis = {
    protocol: ENGINEER_PROFILE_PROTOCOL,
    kind: ENGINEER_BINDING_CURRENT_KIND,
    engineer_id: request.engineer_id,
    binding_generation: nextBinding.binding_generation,
    state: nextBinding.state,
    current_binding_id: nextBinding.binding_id,
    engineer_contract_revision: nextBinding.engineer_contract_revision,
  } as const;
  const event = buildEngineerBindingEvent({
    transition_id: deriveEngineerTransitionId(request.engineer_id, request.idempotency_key),
    idempotency_key: request.idempotency_key,
    operation_fingerprint: engineerOperationFingerprint(request),
    engineer_id: request.engineer_id,
    transition: request.transition,
    expected_current_digest: request.expected_current_digest,
    expected_binding_generation: request.expected_binding_generation,
    previous_binding_id: before.status.current.current_binding_id,
    next_binding: nextBinding,
    next_current_payload_sha256: engineerCurrentPayloadSha256(currentBasis),
    created_at: createdAt,
  });
  crashHook?.('before_event');
  try {
    writeExclusiveDurably(eventPath(paths, event.transition_id), canonicalEngineerBindingEventBytes(event));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const existing = readEventForTransition(paths, event.transition_id);
    if (!existing || existing.raw !== canonicalEngineerBindingEventBytes(event)) {
      fail('idempotency_conflict', 'transition event already exists with different bytes', error);
    }
  }
  fsyncDirectory(paths.events);
  crashHook?.('after_event_fsync');
  const current = buildEngineerBindingCurrent(event);
  writeCurrentDurably(paths, current, before.raw);
  crashHook?.('after_current_fsync');
  return current;
}

function withEngineerLock<T>(
  paths: StorePaths,
  waitTimeoutMs: number | undefined,
  run: () => T,
): T {
  ensureSafeDirectory(paths.common, paths.root);
  ensureSafeDirectory(paths.root, join(paths.root, 'locks'));
  try {
    return withExclusiveDirectoryLock(paths.common, paths.lockRelative, run, {
      reclaimStaleEmptyDirectory: true,
      waitTimeoutMs,
    });
  } catch (error) {
    if (error instanceof ExclusiveLockContentionError) {
      return fail('binding_lock_timeout', error.message, error);
    }
    throw error;
  }
}

/** Serialize operations whose correctness depends on one Engineer Binding. */
export function withEngineerBindingLock<T>(
  cwd: string,
  engineerId: string,
  run: () => T,
  waitTimeoutMs?: number,
): T {
  return withEngineerLock(storePaths(cwd, engineerId), waitTimeoutMs, run);
}

export function bindEngineer(cwd: string, input: BindEngineerInput): EngineerBindingCurrentV1 {
  const paths = storePaths(cwd, input.engineer_id);
  return withEngineerBindingLock(cwd, input.engineer_id, () => {
    ensureSafeDirectory(paths.root, paths.engineer);
    ensureSafeDirectory(paths.engineer, paths.events);
    const transitionId = deriveEngineerTransitionId(input.engineer_id, input.idempotency_key);
    const existing = readEventForTransition(paths, transitionId);
    if (existing) {
      if (existing.event.transition === 'retire') fail('idempotency_conflict', 'idempotency key belongs to a retire request');
      return currentForExistingEvent(cwd, paths, existing.event, requestForBind(input, existing.event.transition));
    }

    const before = readCurrent(paths, input.engineer_id, input.engineer_contract_revision);
    const transition: EngineerBindingTransition = before.status.genesis
      ? 'initialize'
      : before.status.current.state === 'active' ? 'replace' : 'bind';
    const request = requestForBind(input, transition);
    assertExpected(before.status.current, request, before.status.genesis);
    if (transition === 'replace' && before.status.current.current_binding_id !== null) {
      assertNoLiveClaimForBindingRotation(cwd, input.engineer_id, before.status.current.current_binding_id);
    }
    const now = (input.now ?? (() => new Date().toISOString()))();
    const nextBinding: EngineerBindingV1 = Object.freeze({
      protocol: ENGINEER_PROFILE_PROTOCOL,
      kind: ENGINEER_BINDING_KIND,
      binding_id: (input.binding_id ?? randomUUID)(),
      engineer_id: input.engineer_id,
      binding_generation: before.status.current.binding_generation + 1,
      provider: input.provider,
      provider_thread_id: input.provider_thread_id,
      host_id: input.host_id,
      engineer_contract_revision: input.engineer_contract_revision,
      state: 'active',
      previous_binding_id: before.status.current.current_binding_id,
      bound_at: now,
      retired_at: null,
    });
    return publishNewEvent(paths, before, request, nextBinding, now, input.crash_hook);
  }, input.lock_wait_timeout_ms);
}

export function retireEngineer(cwd: string, input: RetireEngineerInput): EngineerBindingCurrentV1 {
  const paths = storePaths(cwd, input.engineer_id);
  return withEngineerBindingLock(cwd, input.engineer_id, () => {
    ensureSafeDirectory(paths.root, paths.engineer);
    ensureSafeDirectory(paths.engineer, paths.events);
    const transitionId = deriveEngineerTransitionId(input.engineer_id, input.idempotency_key);
    const existing = readEventForTransition(paths, transitionId);
    const request = requestForRetire(input);
    if (existing) {
      if (existing.event.transition !== 'retire') fail('idempotency_conflict', 'idempotency key belongs to a bind request');
      return currentForExistingEvent(cwd, paths, existing.event, request);
    }
    const before = readCurrent(paths, input.engineer_id, input.expected_engineer_contract_revision);
    assertExpected(before.status.current, request, before.status.genesis);
    if (before.status.current.state !== 'active' || before.status.binding === null) {
      fail('binding_stale', 'only an active binding can be retired');
    }
    assertNoLiveClaimForBindingRotation(cwd, input.engineer_id, before.status.binding.binding_id);
    const now = (input.now ?? (() => new Date().toISOString()))();
    const nextBinding: EngineerBindingV1 = Object.freeze({
      ...before.status.binding,
      state: 'retired',
      retired_at: now,
    });
    return publishNewEvent(paths, before, request, nextBinding, now, input.crash_hook);
  }, input.lock_wait_timeout_ms);
}
