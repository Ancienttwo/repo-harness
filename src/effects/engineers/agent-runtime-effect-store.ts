import { sameTaskMessageClaim, type TaskMessageClaim } from '../../core/messages/task-message-claim';
import type { FleetBoardDeliveryEvidenceV1 } from '../../core/fleet/board';
import { createHash, randomUUID } from 'crypto';
import {
  closeSync, constants, existsSync, fsyncSync, lstatSync, mkdirSync, openSync,
  readFileSync, readdirSync, renameSync, unlinkSync, writeSync,
} from 'fs';
import { dirname, join, relative, resolve, sep } from 'path';

import {
  AgentRuntimeEffectError,
  agentRuntimeControlRef,
  agentRuntimeControlSha256,
  assertAgentRuntimeEffectTransition,
  assertAgentRuntimeReceiptKindForOperation,
  buildAgentRuntimeCapabilityObservation,
  buildAgentRuntimeControllerStepReceipt,
  buildAgentRuntimeEffectCurrent,
  buildAgentRuntimeEffectIntent,
  buildAgentRuntimeEffectObservation,
  buildAgentRuntimeHostAction,
  buildAgentRuntimeOfferWakeLedger,
  buildAgentRuntimeOfferWakeSnapshot,
  canonicalAgentRuntimeCapabilityBytes,
  canonicalAgentRuntimeControllerStepReceiptBytes,
  canonicalAgentRuntimeEffectCurrentBytes,
  canonicalAgentRuntimeEffectIntentBytes,
  canonicalAgentRuntimeEffectObservationBytes,
  canonicalAgentRuntimeOfferWakeLedgerBytes,
  decideAgentRuntimeOfferWake,
  deriveAgentRuntimeEffectId,
  deriveAgentRuntimeOfferWakeIdempotencyKey,
  validateAgentRuntimeCapabilityObservation,
  validateAgentRuntimeControllerStepReceipt,
  validateAgentRuntimeEffectCurrent,
  validateAgentRuntimeEffectIntent,
  validateAgentRuntimeEffectObservation,
  validateAgentRuntimeOfferWakeLedger,
  type AgentRuntimeAdapterKind,
  type AgentRuntimeAdapterObservationV2,
  type AgentRuntimeCapabilityObservationV2,
  type AgentRuntimeControllerStepReceiptV2,
  type AgentRuntimeEffectCurrentV2,
  type AgentRuntimeEffectIntentV2,
  type AgentRuntimeEffectObservationV2,
  type AgentRuntimeEffectState,
  type AgentRuntimeFailureClass,
  type AgentRuntimeHostActionV2,
  type AgentRuntimeNotifyInboxIntentV2,
  type AgentRuntimeOfferWakeIntentV2,
  type AgentRuntimeOfferWakeLedgerV2,
  type AgentRuntimeOfferWakePendingV2,
  type AgentRuntimeOfferWakeReason,
  type AgentRuntimeOperation,
  type AgentRuntimeReceiptKind,
  type RuntimeEndpointFenceV2,
  type RuntimeMessageRefV2,
} from '../../core/engineers/agent-runtime-effect';
import { validateProviderEngineerOffers, type ProviderEngineerOffersV2 } from '../../core/engineers/scheduling';
import { canonicalTaskMessageDeliveryReceiptBytes } from '../../core/fleet/admitted-task-message';
import { canonicalEngineerJson, engineerSha256 } from '../../core/engineers/profile-binding';
import { readTaskAgent } from '../terminal/task-session';
import { herdrEndpointIdentity } from './agent-runtime-adapters/herdr-cli-agent';
import { readRepoHarnessRegistryStrictSnapshot, repoHarnessAuthorizationRevision } from '../repo-registry';
import { resolveGitCommonDirectory } from '../git/common-directory';
import { withExclusiveDirectoryLock } from '../locking/exclusive-directory-lock';
import { assertAgentRuntimeActionEnabled, assertAgentRuntimePrepareEnabled } from './agent-runtime-feature';
import { resolveRegisteredRepoForWorktree } from './scheduling';
import { readTaskMessageDelivery, observeTaskInboxContext, readAdmittedTaskActivity, type TaskInboxSessionSource } from '../fleet/task-inbox';
import type { RuntimeDeliveryState, RuntimeReachability } from '../../core/fleet/board';

export const AGENT_RUNTIME_EFFECT_RELATIVE_ROOT = 'repo-harness/agent-runtime-effects/admitted-v2';

export type AgentRuntimeEffectStoreErrorCode =
  | 'agent_runtime_effect_invalid' | 'agent_runtime_effect_unreadable' | 'agent_runtime_effect_persistence_failed'
  | 'agent_runtime_effect_not_found' | 'agent_runtime_effect_conflict' | 'agent_runtime_effect_binding_stale'
  | 'agent_runtime_effect_claim_stale' | 'agent_runtime_effect_capability_unsupported'
  | 'agent_runtime_effect_transition_invalid'
  | 'agent_runtime_effect_authorization_stale'
  | 'agent_runtime_effect_wake_superseded' | 'agent_runtime_effect_wake_coalescing';

export class AgentRuntimeEffectStoreError extends Error {
  constructor(readonly code: AgentRuntimeEffectStoreErrorCode, message: string, readonly cause?: unknown) {
    super(message); this.name = 'AgentRuntimeEffectStoreError';
  }
}

export type PrepareAgentRuntimeEffectInput = Readonly<{
  repo_root: string; idempotency_key: string; expected_capability_sha256: string; created_at: string;
  message_kind: 'task_message'; task_id: string; message_id: string; expected_admission_sha256: string;
  source: TaskInboxSessionSource;
}>;

export interface AgentRuntimeEffectStatus {
  readonly intent: AgentRuntimeEffectIntentV2;
  readonly current: AgentRuntimeEffectCurrentV2;
  readonly observation: AgentRuntimeEffectObservationV2;
}
export interface StartAgentRuntimeEffectResult extends AgentRuntimeEffectStatus { readonly action: AgentRuntimeHostActionV2 | null }
export type AgentRuntimeEffectCrashBoundary = 'after_observation_fsync' | 'after_current_fsync';
export type AgentRuntimeEffectCrashHook = (boundary: AgentRuntimeEffectCrashBoundary) => void;

interface StorePaths { common: string; root: string; capabilities: string; effects: string; locks: string; migrations: string; wakes: string }
interface EffectPaths { store: StorePaths; effect: string; intent: string; observations: string; current: string; controller_step: string; lock_relative: string }

function fail(code: AgentRuntimeEffectStoreErrorCode, message: string, cause?: unknown): never { throw new AgentRuntimeEffectStoreError(code, message, cause); }
function mapped(error: unknown, code: AgentRuntimeEffectStoreErrorCode, message: string): AgentRuntimeEffectStoreError {
  if (error instanceof AgentRuntimeEffectStoreError) return error;
  if (error instanceof AgentRuntimeEffectError) return new AgentRuntimeEffectStoreError(error.code, error.message, error);
  return new AgentRuntimeEffectStoreError(code, message, error);
}
function pathsFor(repoRoot: string): StorePaths {
  const common = resolve(resolveGitCommonDirectory(repoRoot)); const root = join(common, AGENT_RUNTIME_EFFECT_RELATIVE_ROOT);
  return { common, root, capabilities: join(root, 'capabilities'), effects: join(root, 'effects'), locks: join(root, 'locks'), migrations: join(root, 'migrations'), wakes: join(root, 'wakes') };
}
function effectHex(effectId: string): string { const match = /^sha256:([0-9a-f]{64})$/u.exec(effectId); return match ? match[1] : fail('agent_runtime_effect_invalid', 'effect_id is invalid'); }
function effectPaths(repoRoot: string, effectId: string): EffectPaths {
  const store = pathsFor(repoRoot); const hex = effectHex(effectId); const effect = join(store.effects, hex);
  return { store, effect, intent: join(effect, 'intent.json'), observations: join(effect, 'observations'), current: join(effect, 'current.json'), controller_step: join(effect, 'controller-step.json'), lock_relative: `${AGENT_RUNTIME_EFFECT_RELATIVE_ROOT}/locks/${hex}.lock` };
}
function syncDirectory(path: string): void { const fd = openSync(path, constants.O_RDONLY); try { fsyncSync(fd); } finally { closeSync(fd); } }
function segments(root: string, target: string): string[] {
  const scoped = relative(root, target); if (!scoped || scoped === '..' || scoped.startsWith(`..${sep}`) || /^[A-Za-z]:/u.test(scoped)) fail('agent_runtime_effect_unreadable', `runtime path escapes Git common directory: ${target}`); return scoped.split(sep).filter(Boolean);
}
function ensureDirectory(root: string, target: string, create: boolean): boolean {
  let current = root;
  for (const segment of segments(root, target)) {
    current = join(current, segment);
    try { const stat = lstatSync(current); if (!stat.isDirectory() || stat.isSymbolicLink()) fail('agent_runtime_effect_unreadable', `unsafe runtime directory: ${current}`); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw mapped(error, 'agent_runtime_effect_unreadable', `cannot inspect runtime directory: ${current}`);
      if (!create) return false;
      try { mkdirSync(current, { mode: 0o700 }); } catch (mkdirError) { if ((mkdirError as NodeJS.ErrnoException).code !== 'EEXIST') throw mapped(mkdirError, 'agent_runtime_effect_persistence_failed', `cannot create runtime directory: ${current}`); }
      const stat = lstatSync(current); if (!stat.isDirectory() || stat.isSymbolicLink()) fail('agent_runtime_effect_unreadable', `unsafe runtime directory: ${current}`); syncDirectory(dirname(current));
    }
  }
  return true;
}
function prepareStore(paths: StorePaths): void { ensureDirectory(paths.common, paths.root, true); for (const path of [paths.capabilities, paths.effects, paths.locks, paths.migrations, paths.wakes]) ensureDirectory(paths.common, path, true); }
function prepareEffect(paths: EffectPaths): void { prepareStore(paths.store); ensureDirectory(paths.store.common, paths.effect, true); ensureDirectory(paths.store.common, paths.observations, true); }
function regular(path: string, label: string): void {
  try { const stat = lstatSync(path); if (!stat.isFile() || stat.isSymbolicLink()) fail('agent_runtime_effect_unreadable', `${label} is unsafe`); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') fail('agent_runtime_effect_not_found', `${label} is missing`); throw mapped(error, 'agent_runtime_effect_unreadable', `cannot inspect ${label}`); }
}
function readRaw(path: string, label: string): string { regular(path, label); try { return readFileSync(path, 'utf8'); } catch (error) { throw mapped(error, 'agent_runtime_effect_unreadable', `cannot read ${label}`); } }
function writeAll(fd: number, bytes: Buffer): void { let offset = 0; while (offset < bytes.length) offset += writeSync(fd, bytes, offset, bytes.length - offset); }
function writeExclusive(path: string, bytes: string, label: string): boolean {
  let fd: number | null = null;
  try { fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600); writeAll(fd, Buffer.from(bytes)); fsyncSync(fd); closeSync(fd); fd = null; syncDirectory(dirname(path)); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false; throw mapped(error, 'agent_runtime_effect_persistence_failed', `cannot persist ${label}`); }
  finally { if (fd !== null) closeSync(fd); }
}
function replace(path: string, bytes: string, label: string): void {
  const temporary = join(dirname(path), `.${process.pid}.${randomUUID()}.tmp`); let fd: number | null = null;
  try { fd = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600); writeAll(fd, Buffer.from(bytes)); fsyncSync(fd); closeSync(fd); fd = null; renameSync(temporary, path); syncDirectory(dirname(path)); }
  catch (error) { throw mapped(error, 'agent_runtime_effect_persistence_failed', `cannot publish ${label}`); }
  finally { if (fd !== null) closeSync(fd); try { unlinkSync(temporary); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw mapped(error, 'agent_runtime_effect_persistence_failed', `cannot clean ${label}`); } }
}
function lock<T>(paths: EffectPaths, run: () => T): T { prepareStore(paths.store); return withExclusiveDirectoryLock(paths.store.common, paths.lock_relative, run, { reclaimStaleEmptyDirectory: true }); }
function parseIntent(raw: string): AgentRuntimeEffectIntentV2 { try { const value = validateAgentRuntimeEffectIntent(JSON.parse(raw)); if (canonicalAgentRuntimeEffectIntentBytes(value) !== raw) fail('agent_runtime_effect_unreadable', 'effect intent is non-canonical'); return value; } catch (error) { throw mapped(error, 'agent_runtime_effect_unreadable', 'effect intent is malformed'); } }
function parseObservation(raw: string): AgentRuntimeEffectObservationV2 { try { const value = validateAgentRuntimeEffectObservation(JSON.parse(raw)); if (canonicalAgentRuntimeEffectObservationBytes(value) !== raw) fail('agent_runtime_effect_unreadable', 'effect observation is non-canonical'); return value; } catch (error) { throw mapped(error, 'agent_runtime_effect_unreadable', 'effect observation is malformed'); } }
function parseCurrent(raw: string): AgentRuntimeEffectCurrentV2 { try { const value = validateAgentRuntimeEffectCurrent(JSON.parse(raw)); if (canonicalAgentRuntimeEffectCurrentBytes(value) !== raw) fail('agent_runtime_effect_unreadable', 'effect current is non-canonical'); return value; } catch (error) { throw mapped(error, 'agent_runtime_effect_unreadable', 'effect current is malformed'); } }
function observationPath(paths: EffectPaths, sequence: number): string { return join(paths.observations, `${String(sequence).padStart(8, '0')}.json`); }
function chain(paths: EffectPaths, intent: AgentRuntimeEffectIntentV2): AgentRuntimeEffectObservationV2[] {
  let names: string[]; try { names = readdirSync(paths.observations).sort(); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw mapped(error, 'agent_runtime_effect_unreadable', 'cannot list observations'); }
  const result: AgentRuntimeEffectObservationV2[] = [];
  names.forEach((name, index) => {
    if (name !== `${String(index).padStart(8, '0')}.json`) fail('agent_runtime_effect_unreadable', `observation sequence is not contiguous: ${name}`);
    const value = parseObservation(readRaw(join(paths.observations, name), 'effect observation'));
    if (value.effect_id !== intent.effect_id || value.intent_sha256 !== intent.intent_sha256) fail('agent_runtime_effect_unreadable', 'observation identity mismatches intent');
    if (index > 0) assertAgentRuntimeEffectTransition(result[index - 1], value); result.push(value);
  }); return result;
}
function readLocked(paths: EffectPaths, repair: boolean): AgentRuntimeEffectStatus {
  const intent = parseIntent(readRaw(paths.intent, 'effect intent')); const observations = chain(paths, intent); if (!observations.length) fail('agent_runtime_effect_unreadable', 'effect has no initial observation');
  const observation = observations[observations.length - 1]; const current = buildAgentRuntimeEffectCurrent(observation); const expected = canonicalAgentRuntimeEffectCurrentBytes(current);
  if (!existsSync(paths.current)) { if (!repair) fail('agent_runtime_effect_unreadable', 'effect current is missing'); replace(paths.current, expected, 'effect current'); }
  else { const raw = readRaw(paths.current, 'effect current'); parseCurrent(raw); if (raw !== expected) { if (!repair) fail('agent_runtime_effect_unreadable', 'effect current projection is stale'); replace(paths.current, expected, 'effect current'); } }
  return Object.freeze({ intent, current, observation });
}
function initialAdapter(adapter_kind: AgentRuntimeAdapterKind): AgentRuntimeAdapterObservationV2 { return Object.freeze({ adapter_kind, outcome: 'unknown', process_exit_code: null, process_signal: null }); }
function initialize(paths: EffectPaths, intent: AgentRuntimeEffectIntentV2): AgentRuntimeEffectStatus {
  const observation = buildAgentRuntimeEffectObservation({ effect_id: intent.effect_id, intent_sha256: intent.intent_sha256, sequence: 0, state: 'intent_persisted', adapter: initialAdapter(intent.endpoint_fence.adapter_kind), receipt_kind: null, receipt_sha256: null, failure_class: 'none', observed_at: intent.created_at, previous_observation_sha256: null });
  const bytes = canonicalAgentRuntimeEffectObservationBytes(observation); if (!writeExclusive(observationPath(paths, 0), bytes, 'initial observation') && readRaw(observationPath(paths, 0), 'initial observation') !== bytes) fail('agent_runtime_effect_conflict', 'initial observation conflicts');
  const current = buildAgentRuntimeEffectCurrent(observation); replace(paths.current, canonicalAgentRuntimeEffectCurrentBytes(current), 'effect current'); return Object.freeze({ intent, current, observation });
}
function append(paths: EffectPaths, status: AgentRuntimeEffectStatus, observation: AgentRuntimeEffectObservationV2, crash?: AgentRuntimeEffectCrashHook): AgentRuntimeEffectStatus {
  assertAgentRuntimeEffectTransition(status.observation, observation); const bytes = canonicalAgentRuntimeEffectObservationBytes(observation); const target = observationPath(paths, observation.sequence);
  if (!writeExclusive(target, bytes, 'effect observation') && readRaw(target, 'effect observation') !== bytes) fail('agent_runtime_effect_conflict', 'observation sequence conflicts'); crash?.('after_observation_fsync');
  const current = buildAgentRuntimeEffectCurrent(observation); replace(paths.current, canonicalAgentRuntimeEffectCurrentBytes(current), 'effect current'); crash?.('after_current_fsync'); return Object.freeze({ intent: status.intent, current, observation });
}
/** Named transport identity comes from the exact admitted runtime, never an actor alias. */
export function observeAgentRuntimeEndpoint(repoRoot: string, source: TaskInboxSessionSource): RuntimeEndpointFenceV2 {
  try {
  const admitted = observeTaskInboxContext({ repo_root: repoRoot, source, task_id: source.session.task });
  const { binding, dir } = readTaskAgent(repoRoot, source.session.task, source.session.role);
  if (binding.runtime !== 'herdr' || existsSync(join(dir, 'closed.json'))) fail('agent_runtime_effect_binding_stale', 'admitted session is not an available Herdr transport');
  const profile = admitted.identity.engineer_profile;
  if (!profile) fail('agent_runtime_effect_binding_stale', 'runtime effect requires an explicit admitted engineer profile');
  return Object.freeze({ task: binding.task, role: binding.role,
    engineer_id: profile.engineer_id, engineer_contract_revision: profile.engineer_contract_revision,
    session_binding_sha256: engineerSha256(canonicalEngineerJson(binding)),
    admission_sha256: admitted.approval.admission_sha256, grant_sha256: admitted.approval.grant_sha256,
    adapter_kind: 'herdr-cli-agent', transport_endpoint_sha256: herdrEndpointIdentity(binding.endpoint), endpoint_id: binding.agent_name });
  } catch (error) { throw mapped(error, 'agent_runtime_effect_binding_stale', 'current admitted runtime session or selected profile is unavailable'); }
}
function assertEndpoint(repoRoot: string, expected: RuntimeEndpointFenceV2, source: TaskInboxSessionSource): void {
  const actual = observeAgentRuntimeEndpoint(repoRoot, source);
  if (canonicalEngineerJson(actual) !== canonicalEngineerJson(expected)) fail('agent_runtime_effect_binding_stale', 'effect endpoint differs from exact current admitted session and profile');
}
function messageDelivery(repoRoot: string, source: TaskInboxSessionSource, taskId: string, messageId: string, claim: TaskMessageClaim) {
  const { binding } = readTaskAgent(repoRoot, source.session.task, source.session.role);
  return readTaskMessageDelivery({ repo_root: repoRoot, source, task_id: taskId, message_id: messageId,
    execution_worktree: binding.execution_root, recipient: { kind: 'claim', claim } });
}
function capabilityPath(paths: StorePaths, hostId: string, adapter: AgentRuntimeAdapterKind): string {
  const key = createHash('sha256').update(`${adapter}\0${hostId}`).digest('hex'); return join(paths.capabilities, `${key}.json`);
}

export function recordAgentRuntimeCapability(repoRoot: string, input: Omit<AgentRuntimeCapabilityObservationV2, 'protocol' | 'kind' | 'capability_sha256'>): AgentRuntimeCapabilityObservationV2 {
   const observation = buildAgentRuntimeCapabilityObservation(input); const paths = pathsFor(repoRoot); prepareStore(paths);
  const lockPath = `${AGENT_RUNTIME_EFFECT_RELATIVE_ROOT}/locks/capability-${createHash('sha256').update(`${observation.adapter_kind}\0${observation.transport_endpoint_sha256}`).digest('hex')}.lock`;
  return withExclusiveDirectoryLock(paths.common, lockPath, () => { const target = capabilityPath(paths, observation.transport_endpoint_sha256, observation.adapter_kind); const bytes = canonicalAgentRuntimeCapabilityBytes(observation); if (existsSync(target) && readRaw(target, 'capability observation') === bytes) return observation; replace(target, bytes, 'capability observation'); return observation; }, { reclaimStaleEmptyDirectory: true });
}
export function readAgentRuntimeCapability(repoRoot: string, hostId: string, adapter: AgentRuntimeAdapterKind): AgentRuntimeCapabilityObservationV2 {
  const raw = readRaw(capabilityPath(pathsFor(repoRoot), hostId, adapter), 'capability observation'); try { const value = validateAgentRuntimeCapabilityObservation(JSON.parse(raw)); if (canonicalAgentRuntimeCapabilityBytes(value) !== raw || value.transport_endpoint_sha256 !== hostId || value.adapter_kind !== adapter) fail('agent_runtime_effect_unreadable', 'capability observation identity or canonical bytes mismatch'); return value; } catch (error) { throw new AgentRuntimeEffectStoreError('agent_runtime_effect_unreadable', 'capability observation is malformed', error); }
}
function assertCapability(repoRoot: string, endpoint: RuntimeEndpointFenceV2, expected: string, operation: AgentRuntimeOperation): void {
  const capability = readAgentRuntimeCapability(repoRoot, endpoint.transport_endpoint_sha256, endpoint.adapter_kind); if (capability.capability_sha256 !== expected) fail('agent_runtime_effect_conflict', 'capability digest changed'); if (capability.operations[operation] !== 'supported') fail('agent_runtime_effect_capability_unsupported', `${operation} capability is ${capability.operations[operation]}`);
}
function notifyIntent(intent: AgentRuntimeEffectIntentV2): AgentRuntimeNotifyInboxIntentV2 {
  if (intent.operation !== 'notify_inbox') fail('agent_runtime_effect_invalid', 'effect does not notify a message inbox'); return intent;
}
function wakeIntent(intent: AgentRuntimeEffectIntentV2): AgentRuntimeOfferWakeIntentV2 {
  if (intent.operation !== 'wake_for_offer') fail('agent_runtime_effect_invalid', 'effect is not a task-offer wake'); return intent;
}
function taskEndpointAndReference(input: PrepareAgentRuntimeEffectInput): { endpoint: RuntimeEndpointFenceV2; message: RuntimeMessageRefV2 } {
  const endpoint = observeAgentRuntimeEndpoint(input.repo_root, input.source);
  if (input.task_id !== endpoint.task || input.expected_admission_sha256 !== endpoint.admission_sha256) fail('agent_runtime_effect_claim_stale', 'prepare does not match current session admission');
  const claim = input.source.authority.claim;
  const entry = messageDelivery(input.repo_root, input.source, input.task_id, input.message_id, claim);
  if ((entry.receipt !== null && entry.receipt.delivery_state !== 'pending') || entry.event.admission_sha256 !== input.expected_admission_sha256
    || entry.event.scope !== 'claim' || !sameTaskMessageClaim(entry.event.target_claim, claim)) fail('agent_runtime_effect_transition_invalid', 'message does not match exact pending admitted claim');
  return { endpoint, message: Object.freeze({ kind: 'task_message', message_id: entry.event.message_id,
    message_event_digest: entry.event.event_digest, task_id: entry.event.task_id,
    admission_sha256: entry.event.admission_sha256, claim, delivery_attempt: 1 }) };
}
function assertLiveMessage(repoRoot: string, intent: AgentRuntimeNotifyInboxIntentV2, source: TaskInboxSessionSource): void {
  assertEndpoint(repoRoot, intent.endpoint_fence, source);
  const ref = intent.message_ref;
  if (!sameTaskMessageClaim(ref.claim, source.authority.claim)) fail('agent_runtime_effect_claim_stale', 'effect claim differs from supplied admission');
  const entry = messageDelivery(repoRoot, source, ref.task_id, ref.message_id, ref.claim);
  if ((entry.receipt !== null && entry.receipt.delivery_state !== 'pending') || entry.event.event_digest !== ref.message_event_digest) fail('agent_runtime_effect_transition_invalid', 'task message fence is stale');
}

/** A replay must name the same target the first request named. Message ids
 * are caller-generated UUIDs, so key, capability, timestamp and message id
 * alone do not identify a request: the full Task/Claim
 * fence is compared against the persisted intent before a replay is served. */
function replayRequestIdentityMatches(input: PrepareAgentRuntimeEffectInput, existing: AgentRuntimeEffectIntentV2): boolean {
  if (existing.operation !== 'notify_inbox') return false;
  const ref = existing.message_ref;
  return ref.kind === 'task_message' && ref.task_id === input.task_id && ref.admission_sha256 === input.expected_admission_sha256 && sameTaskMessageClaim(ref.claim, input.source.authority.claim) && existing.endpoint_fence.task === input.source.session.task && existing.endpoint_fence.role === input.source.session.role;
}

export function prepareAgentRuntimeEffect(input: PrepareAgentRuntimeEffectInput): AgentRuntimeEffectStatus {
  assertAgentRuntimePrepareEnabled(input.repo_root);  const paths = effectPaths(input.repo_root, deriveAgentRuntimeEffectId(input.idempotency_key));
  return lock(paths, () => {
    prepareEffect(paths); if (existsSync(paths.intent)) { const existing = parseIntent(readRaw(paths.intent, 'effect intent')); assertEndpoint(input.repo_root, existing.endpoint_fence, input.source); if (existing.idempotency_key !== input.idempotency_key || existing.capability_sha256 !== input.expected_capability_sha256 || existing.created_at !== input.created_at || !replayRequestIdentityMatches(input, existing) || notifyIntent(existing).message_ref.kind !== input.message_kind || notifyIntent(existing).message_ref.message_id !== input.message_id) fail('agent_runtime_effect_conflict', 'idempotency key names another prepare request'); return chain(paths, existing).length ? readLocked(paths, true) : initialize(paths, existing); }
    const { endpoint, message } = taskEndpointAndReference(input);
    assertCapability(input.repo_root, endpoint, input.expected_capability_sha256, 'notify_inbox');
    const intent = buildAgentRuntimeEffectIntent({ idempotency_key: input.idempotency_key, message_ref: message, endpoint_fence: endpoint, operation: 'notify_inbox', capability_sha256: input.expected_capability_sha256, created_at: input.created_at });
    const bytes = canonicalAgentRuntimeEffectIntentBytes(intent); if (!writeExclusive(paths.intent, bytes, 'effect intent') && readRaw(paths.intent, 'effect intent') !== bytes) fail('agent_runtime_effect_conflict', 'idempotency key names different intent bytes'); assertLiveMessage(input.repo_root, notifyIntent(intent), input.source); return initialize(paths, intent);
  });
}
export function readAgentRuntimeEffectStatus(repoRoot: string, effectId: string): AgentRuntimeEffectStatus { const paths = effectPaths(repoRoot, effectId); return lock(paths, () => readLocked(paths, true)); }
export function observeAgentRuntimeEffectStatus(repoRoot: string, effectId: string): AgentRuntimeEffectStatus { return readLocked(effectPaths(repoRoot, effectId), false); }

/** Fences that live in another authority -- the Binding, the capability
 * observation and the authorization revision -- can commit between the check
 * and the durable `effect_started`. Re-reading them after the append and
 * refusing to hand out the action closes that window without reaching across
 * authorities for a lock: the action is admitted only if every fence held both
 * immediately before and immediately after the start became durable. */
function assertStartFences(input: { repo_root: string; source: TaskInboxSessionSource; env?: NodeJS.ProcessEnv }, intent: AgentRuntimeEffectIntentV2, startedAt: string): void {
  assertCapability(input.repo_root, intent.endpoint_fence, intent.capability_sha256, intent.operation);
  if (intent.operation === 'notify_inbox') assertLiveMessage(input.repo_root, intent, input.source);
  else { assertEndpoint(input.repo_root, intent.endpoint_fence, input.source); assertAuthorizationCurrent(intent.wake_ref.authorization_revision, input.env); void startedAt; }
}
function startFenceFailureClass(error: unknown): AgentRuntimeFailureClass | null {
  if (!(error instanceof AgentRuntimeEffectStoreError)) return null;
  switch (error.code) {
    case 'agent_runtime_effect_capability_unsupported': return 'capability_unsupported';
    // A digest that moved under the start is a conflict with another writer,
    // not a Host that stopped supporting the operation. Labelling it
    // `capability_unsupported` would send an operator to the wrong authority.
    case 'agent_runtime_effect_conflict': return 'fence_conflict';
    case 'agent_runtime_effect_authorization_stale': return 'authorization_stale';
    case 'agent_runtime_effect_binding_stale': return 'binding_stale';
    case 'agent_runtime_effect_claim_stale': return 'claim_stale';
    default: return null;
  }
}
export function startAgentRuntimeEffect(input: { repo_root: string; source: TaskInboxSessionSource; effect_id: string; started_at: string; env?: NodeJS.ProcessEnv; crash_hook?: AgentRuntimeEffectCrashHook }): StartAgentRuntimeEffectResult {
  const paths = effectPaths(input.repo_root, input.effect_id); return withWakeEffectLock(paths, () => lock(paths, () => {
    let status = readLocked(paths, true); if (status.current.state !== 'intent_persisted') {
      // A superseded wake is terminal and unstartable. Failing loudly keeps it
      // distinguishable from a wake that simply has no action left to hand out.
      if (status.current.state === 'superseded') fail('agent_runtime_effect_wake_superseded', 'a newer offer snapshot superseded this wake before any Host action');
      if (status.current.state === 'effect_started') status = append(paths, status, buildAgentRuntimeEffectObservation({ effect_id: status.intent.effect_id, intent_sha256: status.intent.intent_sha256, sequence: status.observation.sequence + 1, state: 'reconciliation_required', adapter: initialAdapter(status.intent.endpoint_fence.adapter_kind), receipt_kind: null, receipt_sha256: null, failure_class: 'unknown', observed_at: input.started_at, previous_observation_sha256: status.observation.observation_sha256 }), input.crash_hook); return Object.freeze({ ...status, action: null });
    }
    assertAgentRuntimeActionEnabled(input.repo_root, status.intent.endpoint_fence.adapter_kind);
    assertStartFences(input, status.intent, input.started_at);
    if (status.intent.operation === 'wake_for_offer') assertWakeStartable(input.repo_root, status.intent, input.started_at);
    status = append(paths, status, buildAgentRuntimeEffectObservation({ effect_id: status.intent.effect_id, intent_sha256: status.intent.intent_sha256, sequence: status.observation.sequence + 1, state: 'effect_started', adapter: initialAdapter(status.intent.endpoint_fence.adapter_kind), receipt_kind: null, receipt_sha256: null, failure_class: 'none', observed_at: input.started_at, previous_observation_sha256: status.observation.observation_sha256 }), input.crash_hook);
    try { assertStartFences(input, status.intent, input.started_at); }
    catch (error) {
      const failure = startFenceFailureClass(error); if (failure === null) throw error;
      status = append(paths, status, buildAgentRuntimeEffectObservation({ effect_id: status.intent.effect_id, intent_sha256: status.intent.intent_sha256, sequence: status.observation.sequence + 1, state: 'observed_failure', adapter: initialAdapter(status.intent.endpoint_fence.adapter_kind), receipt_kind: null, receipt_sha256: null, failure_class: failure, observed_at: input.started_at, previous_observation_sha256: status.observation.observation_sha256 }));
      return Object.freeze({ ...status, action: null });
    }
    return Object.freeze({ ...status, action: buildAgentRuntimeHostAction(status.intent) });
  }));
}
function receiptEvidence(repoRoot: string, intentValue: AgentRuntimeEffectIntentV2, source: TaskInboxSessionSource): { kind: AgentRuntimeReceiptKind; sha256: string } | null {
  assertEndpoint(repoRoot, intentValue.endpoint_fence, source);
  if (intentValue.operation === 'wake_for_offer') return controllerStepEvidence(repoRoot, intentValue);
  const intent = intentValue; const ref = intent.message_ref;
  // A delivered state alone proves only that the inbox saw some delivery.
  // Success additionally requires this exact effect's bounded control
  // reference on the delivery evidence; anything else stays unproven and
  // reconciles instead of succeeding.
  const controlRef = agentRuntimeControlRef(intent);
  assertEndpoint(repoRoot, intent.endpoint_fence, source);
  const entry = messageDelivery(repoRoot, source, ref.task_id, ref.message_id, ref.claim); const receipt = entry.receipt;
  if (!receipt) return null;
  if (entry.event.event_digest !== ref.message_event_digest || entry.event.admission_sha256 !== ref.admission_sha256 || receipt.recipient_admission_sha256 !== ref.admission_sha256 || !sameTaskMessageClaim(receipt.recipient_claim, ref.claim)) fail('agent_runtime_effect_conflict', 'Task receipt mismatches the frozen effect reference');
  if (receipt.delivery_state !== 'delivered' && receipt.delivery_state !== 'acknowledged') return null;
  if (receipt.delivery_channel !== 'agent_runtime_effect' || receipt.delivery_ref !== controlRef) return null;
  return { kind: 'task_message_delivery_receipt', sha256: `sha256:${createHash('sha256').update(canonicalTaskMessageDeliveryReceiptBytes(receipt)).digest('hex')}` };
}
export function observeAgentRuntimeEffect(input: { repo_root: string; source: TaskInboxSessionSource; effect_id: string; adapter: AgentRuntimeAdapterObservationV2; observed_at: string; receipt_wait_exhausted: boolean; crash_hook?: AgentRuntimeEffectCrashHook }): AgentRuntimeEffectStatus {
  const paths = effectPaths(input.repo_root, input.effect_id); return withWakeEffectLock(paths, () => lock(paths, () => {
    let status = readLocked(paths, true); if (status.current.state === 'observed_success' || status.current.state === 'observed_failure' || status.current.state === 'stopped') return status;
    if (status.current.state !== 'effect_started' && status.current.state !== 'reconciliation_required') fail('agent_runtime_effect_transition_invalid', `cannot observe from ${status.current.state}`);
    if (input.adapter.adapter_kind !== status.intent.endpoint_fence.adapter_kind) fail('agent_runtime_effect_conflict', 'adapter observation mismatches effect adapter');
    const receipt = receiptEvidence(input.repo_root, status.intent, input.source); if (receipt) assertAgentRuntimeReceiptKindForOperation(status.intent.operation, receipt.kind); let state: 'observed_success' | 'observed_failure' | 'reconciliation_required'; let failure: 'none' | 'adapter_unavailable' | 'unknown' | 'receipt_missing';
    if (receipt) { state = 'observed_success'; failure = 'none'; }
    else if (input.adapter.outcome === 'unavailable' || input.adapter.outcome === 'unsupported' || input.adapter.outcome === 'failed') { state = 'observed_failure'; failure = 'adapter_unavailable'; }
    else { state = 'reconciliation_required'; failure = input.receipt_wait_exhausted ? 'receipt_missing' : 'unknown'; }
    const observation = buildAgentRuntimeEffectObservation({ effect_id: status.intent.effect_id, intent_sha256: status.intent.intent_sha256, sequence: status.observation.sequence + 1, state, adapter: input.adapter, receipt_kind: receipt?.kind ?? null, receipt_sha256: receipt?.sha256 ?? null, failure_class: failure, observed_at: input.observed_at, previous_observation_sha256: status.observation.observation_sha256 }); status = append(paths, status, observation, input.crash_hook); return status;
  }));
}
export function listAgentRuntimeEffects(repoRoot: string, engineerId?: string): readonly AgentRuntimeEffectStatus[] {
  const store = pathsFor(repoRoot); if (!ensureDirectory(store.common, store.effects, false)) return Object.freeze([]); const result = readdirSync(store.effects).sort().map((name) => { if (!/^[0-9a-f]{64}$/u.test(name)) fail('agent_runtime_effect_unreadable', `invalid effect directory: ${name}`); return observeAgentRuntimeEffectStatus(repoRoot, `sha256:${name}`); }).filter((status) => !engineerId || status.intent.endpoint_fence.engineer_id === engineerId); return Object.freeze(result);
}
export const observeAgentRuntimeEffects = listAgentRuntimeEffects;
/** The capability observation already carries one status per operation; a
 * separate top-level status would be a second authority for the same datum
 * once the protocol admits more than one operation. */
export function agentRuntimeCapabilityStatusFor(repoRoot: string, hostId: string, adapter: AgentRuntimeAdapterKind) { return Object.freeze({ capability: readAgentRuntimeCapability(repoRoot, hostId, adapter) }); }

export interface TaskAgentRuntimeProjectionV1 {
  readonly delivery_evidence: FleetBoardDeliveryEvidenceV1;
  readonly delivery_state: RuntimeDeliveryState;
  readonly runtime_reachability: RuntimeReachability;
  readonly effect_sha256: string | null;
  readonly failure_class: import('../../core/engineers/agent-runtime-effect').AgentRuntimeFailureClass | null;
}

export function projectTaskAgentRuntimeState(input: {
  readonly repo_root: string;
  readonly task_id: string;
  readonly admission_sha256: string;
  readonly session_binding_sha256: string;
  readonly current_claim: TaskMessageClaim | null;
  readonly statuses?: readonly AgentRuntimeEffectStatus[];
}): TaskAgentRuntimeProjectionV1 {
  if (input.current_claim === null) return Object.freeze({ delivery_state: 'pending', runtime_reachability: 'unknown', effect_sha256: null, failure_class: null, delivery_evidence: Object.freeze({ candidate_count: 0, latest: null }) });
  const candidates = (input.statuses ?? listAgentRuntimeEffects(input.repo_root)).filter(({ intent }) => {
    if (intent.operation !== 'notify_inbox') return false;
    const ref = intent.message_ref;
    return ref.kind === 'task_message' && ref.task_id === input.task_id && ref.admission_sha256 === input.admission_sha256
      && sameTaskMessageClaim(ref.claim, input.current_claim) && intent.endpoint_fence.session_binding_sha256 === input.session_binding_sha256;
  });
  if (candidates.length === 0) return Object.freeze({ delivery_state: 'pending', runtime_reachability: 'unknown', effect_sha256: null, failure_class: null, delivery_evidence: Object.freeze({ candidate_count: 0, latest: null }) });
  if (candidates.length !== 1) return Object.freeze({ delivery_state: 'reconciliation_required', runtime_reachability: 'unknown', effect_sha256: null, failure_class: 'unknown', delivery_evidence: Object.freeze({ candidate_count: candidates.length, latest: null }) });
  const status = candidates[0];
  // Supplied statuses must describe one exact immutable observation/current pair.
  let observation: AgentRuntimeEffectObservationV2;
  try { observation = validateAgentRuntimeEffectObservation(status.observation); }
  catch (error) { throw mapped(error, 'agent_runtime_effect_unreadable', 'Task notification observation is malformed'); }
  if (canonicalAgentRuntimeEffectCurrentBytes(buildAgentRuntimeEffectCurrent(observation)) !== canonicalAgentRuntimeEffectCurrentBytes(status.current)
    || observation.effect_id !== status.intent.effect_id || observation.intent_sha256 !== status.intent.intent_sha256
    || observation.adapter.adapter_kind !== status.intent.endpoint_fence.adapter_kind) {
    fail('agent_runtime_effect_unreadable', 'Task notification observation does not match its current intent');
  }
  const deliveryEvidence = Object.freeze({ candidate_count: 1, latest: Object.freeze({
    adapter_kind: observation.adapter.adapter_kind,
    effect_state: observation.state,
    receipt_kind: observation.receipt_kind,
    observed_at: observation.observed_at,
    observation_sequence: observation.sequence,
    observation_sha256: observation.observation_sha256,
  }) });
  let reachability: RuntimeReachability = 'unknown';
  try {
    const capability = readAgentRuntimeCapability(input.repo_root, status.intent.endpoint_fence.transport_endpoint_sha256, status.intent.endpoint_fence.adapter_kind);
    reachability = capability.operations.notify_inbox === 'supported' ? 'reachable'
      : capability.operations.notify_inbox === 'unsupported' || capability.operations.notify_inbox === 'unavailable' ? 'unavailable' : 'unknown';
  } catch (error) {
    if (!(error instanceof AgentRuntimeEffectStoreError) || error.code !== 'agent_runtime_effect_not_found') throw error;
  }
  let delivery: RuntimeDeliveryState = status.current.state === 'observed_failure' ? 'failed'
    : status.current.state === 'reconciliation_required' ? 'reconciliation_required' : 'pending';
  if (status.current.state === 'observed_success') {
    const ref = notifyIntent(status.intent).message_ref;
    if (ref.kind !== 'task_message') fail('agent_runtime_effect_unreadable', 'Task projection selected a non-Task effect');
    const activity = readAdmittedTaskActivity({ repo_root: input.repo_root, task_id: ref.task_id,
      message_id: ref.message_id, after: null, limit: 1, budget: { max_scan: 100, max_bytes: 1024 * 1024, deadline_ms: 5000 } });
    const entry = activity.entries[0];
    const receipt = entry?.receipts.find(item => sameTaskMessageClaim(item.recipient_claim, ref.claim));
    const exact = activity.coverage.complete && entry?.event.event_digest === ref.message_event_digest
      && receipt?.recipient_admission_sha256 === ref.admission_sha256
      && receipt.delivery_channel === 'agent_runtime_effect' && receipt.delivery_ref === agentRuntimeControlRef(status.intent);
    delivery = exact && receipt?.delivery_state === 'acknowledged' ? 'acknowledged' : exact && receipt?.delivery_state === 'delivered' ? 'delivered' : 'reconciliation_required';
  }
  return Object.freeze({ delivery_evidence: deliveryEvidence, delivery_state: delivery, runtime_reachability: reachability, effect_sha256: status.current.current_sha256, failure_class: status.observation.failure_class === 'none' ? null : status.observation.failure_class });
}

export const AGENT_RUNTIME_OFFER_WAKE_MAX_DEBOUNCE_MS = 3_600_000;

export interface AgentRuntimeWakePolicyV1 {
  /** Bounded coalescing window. Repeated offer changes inside one window
   * replace the pending wake instead of opening another; the window never
   * slides, so a flapping repository still wakes once per window. */
  readonly debounce_ms: number;
  /** Scheduled polling is a controller decision, never a runtime default. */
  readonly polling_fallback_enabled: boolean;
}
export type AgentRuntimeOfferWakeCrashBoundary = 'after_intent_persisted' | 'after_superseded' | 'after_ledger_published';
export type AgentRuntimeOfferWakeCrashHook = (boundary: AgentRuntimeOfferWakeCrashBoundary) => void;
export interface RecordEngineerOfferSnapshotInput {
  readonly source: TaskInboxSessionSource;
  readonly repo_root: string;
  readonly offers: ProviderEngineerOffersV2;
  readonly observed_at: string;
  readonly expected_capability_sha256: string;
  /** The exact Binding the snapshot was collected under. An offers document
   * carries no Binding fields of its own and an empty one carries no offers to
   * fence, so the collector must state the Binding or a stale generation could
   * update the current ledger's observed snapshot. */
  readonly wake_policy: AgentRuntimeWakePolicyV1;
  readonly env?: NodeJS.ProcessEnv;
  readonly crash_hook?: AgentRuntimeOfferWakeCrashHook;
}
export type RecordEngineerOfferSnapshotOutcome = 'wake_prepared' | 'wake_coalesced' | 'unchanged' | 'no_wake' | 'polling_fallback';
export type RecordEngineerOfferSnapshotCause = 'due' | 'unchanged_snapshot' | 'no_eligible_offers' | 'wake_in_flight' | 'wake_unsupported';
export interface RecordEngineerOfferSnapshotResult {
  readonly outcome: RecordEngineerOfferSnapshotOutcome;
  readonly cause: RecordEngineerOfferSnapshotCause;
  readonly ledger: AgentRuntimeOfferWakeLedgerV2;
  readonly status: AgentRuntimeEffectStatus | null;
}
export interface AgentRuntimeOfferWakeEventV1 {
  readonly engineer_id: string;
  readonly session_binding_sha256: string;
  readonly effect_id: string;
  readonly snapshot_revision: string;
  readonly wake_reason: AgentRuntimeOfferWakeReason;
  readonly state: AgentRuntimeEffectState;
  readonly requested_at: string;
  readonly coalesce_until: string;
  readonly control_ref: string;
}
export interface AgentRuntimeOfferWakeSessionRef {
  readonly grant_sha256: string;
  readonly engineer_id: string;
  readonly session_binding_sha256: string;
}

const TERMINAL_STATES: readonly AgentRuntimeEffectState[] = Object.freeze(['observed_success', 'observed_failure', 'stopped', 'superseded']);

function wakeKey(binding: AgentRuntimeOfferWakeSessionRef): string {
  return createHash('sha256').update(`${binding.engineer_id}\0${binding.session_binding_sha256}\0${binding.grant_sha256}`).digest('hex');
}
function wakeLedgerPath(store: StorePaths, binding: AgentRuntimeOfferWakeSessionRef): string { return join(store.wakes, `${wakeKey(binding)}.json`); }
function withWakeLock<T>(store: StorePaths, binding: AgentRuntimeOfferWakeSessionRef, run: () => T): T {
  prepareStore(store);
  return withExclusiveDirectoryLock(store.common, `${AGENT_RUNTIME_EFFECT_RELATIVE_ROOT}/locks/wake-${wakeKey(binding)}.lock`, run, { reclaimStaleEmptyDirectory: true });
}
function parseWakeLedger(raw: string): AgentRuntimeOfferWakeLedgerV2 {
  try {
    const value = validateAgentRuntimeOfferWakeLedger(JSON.parse(raw));
    if (canonicalAgentRuntimeOfferWakeLedgerBytes(value) !== raw) fail('agent_runtime_effect_unreadable', 'offer wake ledger is non-canonical');
    return value;
  } catch (error) { throw mapped(error, 'agent_runtime_effect_unreadable', 'offer wake ledger is malformed'); }
}
/** The ledger is published by atomic replace, so a reader never needs the wake
 * lock. Keeping this read lock-free also keeps the lock order one-way: the
 * wake lock may take an effect lock, never the reverse. */
export function readOfferWakeLedger(repoRoot: string, binding: AgentRuntimeOfferWakeSessionRef): AgentRuntimeOfferWakeLedgerV2 | null {
  const store = pathsFor(repoRoot); const path = wakeLedgerPath(store, binding);
  if (!existsSync(path)) return null;
  return parseWakeLedger(readRaw(path, 'offer wake ledger'));
}
function publishWakeLedger(store: StorePaths, endpoint: RuntimeEndpointFenceV2, ledger: AgentRuntimeOfferWakeLedgerV2): AgentRuntimeOfferWakeLedgerV2 {
  ensureDirectory(store.common, store.wakes, true);
  replace(wakeLedgerPath(store, endpoint), canonicalAgentRuntimeOfferWakeLedgerBytes(ledger), 'offer wake ledger');
  return ledger;
}
function wakeStatusOrNull(repoRoot: string, effectId: string): AgentRuntimeEffectStatus | null {
  try { return readAgentRuntimeEffectStatus(repoRoot, effectId); }
  catch (error) {
    if (error instanceof AgentRuntimeEffectStoreError && error.code === 'agent_runtime_effect_not_found') return null;
    throw error;
  }
}
function peekWakeEndpoint(paths: EffectPaths): RuntimeEndpointFenceV2 | null {
  if (!existsSync(paths.intent)) return null;
  const intent = parseIntent(readRaw(paths.intent, 'effect intent'));
  return intent.operation === 'wake_for_offer' ? intent.endpoint_fence : null;
}
/** Every wake mutation linearizes on the per-Binding wake lock, taken before
 * the per-effect lock everywhere, so supersession and start share one order
 * and can never interleave. The intent is written once with O_EXCL and fsynced
 * before any observation exists, so this unlocked peek cannot read a torn or
 * mutable value -- it only decides which lock to take. */
function withWakeEffectLock<T>(paths: EffectPaths, run: () => T): T {
  const endpoint = peekWakeEndpoint(paths);
  return endpoint === null ? run() : withWakeLock(paths.store, endpoint, run);
}
/** The offers document is another authority's product. Before anything is
 * derived from it, it is re-proved whole and then fenced to this repository and
 * the exact current Binding, so a snapshot collected under a previous Binding
 * generation or contract revision is refused rather than re-bound to the
 * current one. */
function assertOffersBindCurrentEndpoint(input: {
  repo_root: string; offers: ProviderEngineerOffersV2; endpoint: RuntimeEndpointFenceV2; env: NodeJS.ProcessEnv | undefined;
}): void {
  const { offers, endpoint } = input;
  const registry = readRepoHarnessRegistryStrictSnapshot({ env: input.env ?? process.env });
  const repository = resolveRegisteredRepoForWorktree(input.repo_root, registry);
  if (offers.repository_id !== repository.id || offers.authorization_revision !== registry.authorizationRevision) fail('agent_runtime_effect_authorization_stale', 'offer snapshot differs from current registered repository');
  if (offers.engineer_id !== endpoint.engineer_id || offers.engineer_contract_revision !== endpoint.engineer_contract_revision
    || offers.session_binding_sha256 !== endpoint.session_binding_sha256) fail('agent_runtime_effect_binding_stale', 'offer snapshot differs from admitted session/profile');
}
/** A superseded intent is closed in its own chain rather than left dangling at
 * `intent_persisted`, so exactly one non-terminal wake exists per Binding and
 * every reader -- including the Board projection -- agrees with the ledger
 * pointer without consulting it. */
function markWakeSuperseded(repoRoot: string, effectId: string, supersededAt: string): void {
  const paths = effectPaths(repoRoot, effectId);
  lock(paths, () => {
    const status = readLocked(paths, true);
    if (status.current.state !== 'intent_persisted') return status;
    return append(paths, status, buildAgentRuntimeEffectObservation({
      effect_id: status.intent.effect_id, intent_sha256: status.intent.intent_sha256, sequence: status.observation.sequence + 1,
      state: 'superseded', adapter: initialAdapter(status.intent.endpoint_fence.adapter_kind), receipt_kind: null, receipt_sha256: null,
      failure_class: 'none', observed_at: supersededAt, previous_observation_sha256: status.observation.observation_sha256,
    }));
  });
}
function offsetTimestamp(from: string, milliseconds: number): string { return new Date(Date.parse(from) + milliseconds).toISOString(); }
function wakePolicy(value: AgentRuntimeWakePolicyV1): AgentRuntimeWakePolicyV1 {
  if (!Number.isInteger(value.debounce_ms) || value.debounce_ms < 0 || value.debounce_ms > AGENT_RUNTIME_OFFER_WAKE_MAX_DEBOUNCE_MS) {
    fail('agent_runtime_effect_invalid', `wake_policy.debounce_ms must be an integer within 0..${AGENT_RUNTIME_OFFER_WAKE_MAX_DEBOUNCE_MS}`);
  }
  if (typeof value.polling_fallback_enabled !== 'boolean') fail('agent_runtime_effect_invalid', 'wake_policy.polling_fallback_enabled must be an exact boolean');
  return value;
}
function assertAuthorizationCurrent(expected: number, env: NodeJS.ProcessEnv | undefined): void {
  const current = repoHarnessAuthorizationRevision(env ?? process.env);
  if (current !== expected) fail('agent_runtime_effect_authorization_stale', `authorization revision is ${current}, not the ${expected} this wake froze`);
}
/** Called with the per-Binding wake lock already held, so the ledger read is
 * the linearization point rather than a hint. */
function assertWakeStartable(repoRoot: string, intent: AgentRuntimeOfferWakeIntentV2, startedAt: string): void {
  const ledger = readOfferWakeLedger(repoRoot, intent.endpoint_fence);
  if (!ledger || ledger.pending === null || ledger.pending.effect_id !== intent.effect_id) {
    fail('agent_runtime_effect_wake_superseded', 'a newer offer snapshot superseded this wake before any Host action');
  }
  if (Date.parse(startedAt) < Date.parse(ledger.pending.coalesce_until)) {
    fail('agent_runtime_effect_wake_coalescing', 'the bounded wake coalescing window has not closed');
  }
}
function prepareOfferWakeEffect(input: {
  repo_root: string; endpoint: RuntimeEndpointFenceV2; repository_id: string; authorization_revision: number;
  snapshot_revision: string; wake_reason: AgentRuntimeOfferWakeReason; capability_sha256: string; created_at: string;
  predecessor_ledger_sha256: string | null;
}): AgentRuntimeEffectStatus {
  const key = deriveAgentRuntimeOfferWakeIdempotencyKey({
    engineer_id: input.endpoint.engineer_id, session_binding_sha256: input.endpoint.session_binding_sha256, grant_sha256: input.endpoint.grant_sha256,
    snapshot_revision: input.snapshot_revision, wake_reason: input.wake_reason, predecessor_ledger_sha256: input.predecessor_ledger_sha256,
  });
  const paths = effectPaths(input.repo_root, deriveAgentRuntimeEffectId(key));
  return lock(paths, () => {
    prepareEffect(paths);
    const intent = buildAgentRuntimeEffectIntent({
      idempotency_key: key, operation: 'wake_for_offer', endpoint_fence: input.endpoint, capability_sha256: input.capability_sha256,
      created_at: input.created_at,
      wake_ref: { repository_id: input.repository_id, authorization_revision: input.authorization_revision, snapshot_revision: input.snapshot_revision, wake_reason: input.wake_reason },
    });
    const bytes = canonicalAgentRuntimeEffectIntentBytes(intent);
    // `created_at` is this store's own clock, so a crash between the intent
    // write and the ledger publish would make a byte comparison reject the
    // replay of the very same snapshot forever. Identity is what must match:
    // same key, same fence, same wake subject. Anything else is a real
    // conflict and still fails closed.
    if (existsSync(paths.intent)) {
      const existing = wakeIntent(parseIntent(readRaw(paths.intent, 'effect intent')));
      if (existing.idempotency_key !== key || existing.capability_sha256 !== input.capability_sha256
        || canonicalEngineerJson(existing.endpoint_fence) !== canonicalEngineerJson(input.endpoint)
        || existing.wake_ref.repository_id !== input.repository_id
        || existing.wake_ref.authorization_revision !== input.authorization_revision
        || existing.wake_ref.snapshot_revision !== input.snapshot_revision
        || existing.wake_ref.wake_reason !== input.wake_reason) {
        fail('agent_runtime_effect_conflict', 'wake idempotency key names another wake request');
      }
      return chain(paths, existing).length ? readLocked(paths, true) : initialize(paths, existing);
    }
    if (!writeExclusive(paths.intent, bytes, 'effect intent') && readRaw(paths.intent, 'effect intent') !== bytes) fail('agent_runtime_effect_conflict', 'wake idempotency key names different intent bytes');
    return initialize(paths, intent);
  });
}

/** The only creator of wake intents. Selection stays with the offer authority
 * and acquisition stays with the scheduling seam: this records one observed
 * snapshot per Binding and, on the exact empty-to-eligible transition, arms one
 * durable hint. */
export function recordEngineerOfferSnapshot(input: RecordEngineerOfferSnapshotInput): RecordEngineerOfferSnapshotResult {
  assertAgentRuntimePrepareEnabled(input.repo_root);
  const policy = wakePolicy(input.wake_policy);
  let document: ProviderEngineerOffersV2; let observed;
  try { document = validateProviderEngineerOffers(input.offers); observed = buildAgentRuntimeOfferWakeSnapshot(document); }
  catch (error) { throw mapped(error, 'agent_runtime_effect_invalid', 'Engineer offers document is invalid'); }
  const endpoint = observeAgentRuntimeEndpoint(input.repo_root, input.source);
  assertOffersBindCurrentEndpoint({
    repo_root: input.repo_root, offers: document, endpoint, env: input.env,
  });
  const store = pathsFor(input.repo_root);
  return withWakeLock(store, endpoint, () => {
    const existing = readOfferWakeLedger(input.repo_root, endpoint);
    const pendingStatus = existing?.pending ? wakeStatusOrNull(input.repo_root, existing.pending.effect_id) : null;
    const publish = (pending: AgentRuntimeOfferWakePendingV2 | null): AgentRuntimeOfferWakeLedgerV2 => {
      assertEndpoint(input.repo_root, endpoint, input.source);
      const ledger = publishWakeLedger(store, endpoint, buildAgentRuntimeOfferWakeLedger({
        endpoint_fence: endpoint, observed, observed_at: input.observed_at, pending,
      }));
      input.crash_hook?.('after_ledger_published');
      return ledger;
    };
    if (existing && existing.observed.snapshot_revision === observed.snapshot_revision) {
      return Object.freeze({ outcome: 'unchanged' as const, cause: 'unchanged_snapshot' as const, ledger: existing, status: pendingStatus });
    }
    const decision = decideAgentRuntimeOfferWake(existing?.observed ?? null, observed);
    if (!decision.due) {
      return Object.freeze({ outcome: 'no_wake' as const, cause: decision.cause, ledger: publish(existing?.pending ?? null), status: pendingStatus });
    }
    const superseded = existing?.pending && pendingStatus?.current.state === 'intent_persisted' ? existing.pending : null;
    if (existing?.pending && !superseded && pendingStatus && !TERMINAL_STATES.includes(pendingStatus.current.state)) {
      // The started wake consumes only its own snapshot. Keep this one
      // unconsumed so a later observation of it is still due.
      return Object.freeze({ outcome: 'no_wake' as const, cause: 'wake_in_flight' as const, ledger: existing, status: pendingStatus });
    }
    const capability = readAgentRuntimeCapability(input.repo_root, endpoint.transport_endpoint_sha256, endpoint.adapter_kind);
    if (capability.capability_sha256 !== input.expected_capability_sha256) fail('agent_runtime_effect_conflict', 'capability digest changed');
    if (capability.operations.wake_for_offer !== 'supported') {
      if (!policy.polling_fallback_enabled) fail('agent_runtime_effect_capability_unsupported', `wake_for_offer capability is ${capability.operations.wake_for_offer}`);
      return Object.freeze({ outcome: 'polling_fallback' as const, cause: 'wake_unsupported' as const, ledger: publish(existing?.pending ?? null), status: null });
    }
    assertAuthorizationCurrent(decision.authorization_revision, input.env);
    const status = prepareOfferWakeEffect({
      repo_root: input.repo_root, endpoint, repository_id: decision.repository_id, authorization_revision: decision.authorization_revision,
      snapshot_revision: decision.snapshot_revision, wake_reason: decision.wake_reason, capability_sha256: input.expected_capability_sha256,
      created_at: input.observed_at, predecessor_ledger_sha256: existing?.ledger_sha256 ?? null,
    });
    input.crash_hook?.('after_intent_persisted');
    if (superseded && superseded.effect_id !== status.intent.effect_id) {
      markWakeSuperseded(input.repo_root, superseded.effect_id, input.observed_at);
      input.crash_hook?.('after_superseded');
    }
    const requestedAt = superseded ? superseded.requested_at : input.observed_at;
    const ledger = publish({
      effect_id: status.intent.effect_id, snapshot_revision: decision.snapshot_revision, wake_reason: decision.wake_reason,
      requested_at: requestedAt, coalesce_until: superseded ? superseded.coalesce_until : offsetTimestamp(requestedAt, policy.debounce_ms),
    });
    return Object.freeze({ outcome: superseded ? 'wake_coalesced' as const : 'wake_prepared' as const, cause: 'due' as const, ledger, status });
  });
}

function controllerStepEvidence(repoRoot: string, intent: AgentRuntimeOfferWakeIntentV2): { kind: AgentRuntimeReceiptKind; sha256: string } | null {
  const paths = effectPaths(repoRoot, intent.effect_id);
  if (!existsSync(paths.controller_step)) return null;
  const raw = readRaw(paths.controller_step, 'controller step receipt');
  let receipt: AgentRuntimeControllerStepReceiptV2;
  try {
    receipt = validateAgentRuntimeControllerStepReceipt(JSON.parse(raw));
    if (canonicalAgentRuntimeControllerStepReceiptBytes(receipt) !== raw) fail('agent_runtime_effect_unreadable', 'controller step receipt is non-canonical');
  } catch (error) { throw mapped(error, 'agent_runtime_effect_unreadable', 'controller step receipt is malformed'); }
  const fence = intent.endpoint_fence;
  if (receipt.effect_id !== intent.effect_id || receipt.intent_sha256 !== intent.intent_sha256 || receipt.control_ref !== agentRuntimeControlRef(intent)
    || receipt.engineer_id !== fence.engineer_id || receipt.session_binding_sha256 !== fence.session_binding_sha256) {
    fail('agent_runtime_effect_conflict', 'controller step receipt mismatches the frozen effect reference');
  }
  return { kind: 'controller_step_receipt', sha256: receipt.receipt_sha256 };
}

/** The awakened controller writes this after running one bounded step. The
 * observed snapshot may already be stale -- a stale wake is still a delivered
 * wake -- but it can never authorize acquisition. */
export function recordAgentRuntimeControllerStep(input: {
  repo_root: string; source: TaskInboxSessionSource; effect_id: string; control_ref: string; observed_snapshot_revision: string; observed_at: string;
  crash_hook?: (boundary: 'after_receipt_fsync') => void;
}): AgentRuntimeControllerStepReceiptV2 {
  const paths = effectPaths(input.repo_root, input.effect_id);
  return withWakeEffectLock(paths, () => lock(paths, () => {
    const status = readLocked(paths, true);
    const intent = wakeIntent(status.intent);
    assertEndpoint(input.repo_root, intent.endpoint_fence, input.source);
    if (status.current.state === 'intent_persisted') fail('agent_runtime_effect_transition_invalid', 'no Host action has run for this wake');
    if (input.control_ref !== agentRuntimeControlRef(intent)) fail('agent_runtime_effect_conflict', 'controller step receipt names another control reference');
    const receipt = buildAgentRuntimeControllerStepReceipt({
      effect_id: intent.effect_id, intent_sha256: intent.intent_sha256, control_ref: input.control_ref,
      control_sha256: agentRuntimeControlSha256(intent), engineer_id: intent.endpoint_fence.engineer_id,
      session_binding_sha256: intent.endpoint_fence.session_binding_sha256,
      observed_snapshot_revision: input.observed_snapshot_revision, observed_at: input.observed_at,
    });
    const bytes = canonicalAgentRuntimeControllerStepReceiptBytes(receipt);
    if (!writeExclusive(paths.controller_step, bytes, 'controller step receipt') && readRaw(paths.controller_step, 'controller step receipt') !== bytes) {
      fail('agent_runtime_effect_conflict', 'a different controller step receipt already closed this wake');
    }
    input.crash_hook?.('after_receipt_fsync');
    return receipt;
  }));
}

function wakeEvent(repoRoot: string, ledger: AgentRuntimeOfferWakeLedgerV2): AgentRuntimeOfferWakeEventV1 | null {
  if (ledger.pending === null) return null;
  const status = wakeStatusOrNull(repoRoot, ledger.pending.effect_id);
  if (!status || TERMINAL_STATES.includes(status.current.state)) return null;
  return Object.freeze({
    engineer_id: ledger.endpoint_fence.engineer_id, session_binding_sha256: ledger.endpoint_fence.session_binding_sha256,
    effect_id: ledger.pending.effect_id,
    snapshot_revision: ledger.pending.snapshot_revision, wake_reason: ledger.pending.wake_reason,
    state: status.current.state, requested_at: ledger.pending.requested_at, coalesce_until: ledger.pending.coalesce_until,
    control_ref: agentRuntimeControlRef(wakeIntent(status.intent)),
  });
}
/** The effect-level seam a non-interactive controller consumes: durable state
 * in, bounded wake events out, no CLI and no host coupling. */
export function listDueOfferWakes(repoRoot: string, input: { now: string; source: TaskInboxSessionSource; engineer_id?: string }): readonly AgentRuntimeOfferWakeEventV1[] {
  const endpoint = observeAgentRuntimeEndpoint(repoRoot, input.source);
  const store = pathsFor(repoRoot);
  if (!ensureDirectory(store.common, store.wakes, false)) return Object.freeze([]);
  const now = Date.parse(input.now);
  if (Number.isNaN(now)) fail('agent_runtime_effect_invalid', 'now is not a parsable timestamp');
  const events = readdirSync(store.wakes).sort().flatMap((name) => {
    if (!/^[0-9a-f]{64}\.json$/u.test(name)) fail('agent_runtime_effect_unreadable', `invalid wake ledger entry: ${name}`);
    const ledger = parseWakeLedger(readRaw(join(store.wakes, name), 'offer wake ledger'));
    if (canonicalEngineerJson(ledger.endpoint_fence) !== canonicalEngineerJson(endpoint)) return [];
    if (input.engineer_id && ledger.endpoint_fence.engineer_id !== input.engineer_id) return [];
    const event = wakeEvent(repoRoot, ledger);
    return event && now >= Date.parse(event.coalesce_until) ? [event] : [];
  });
  return Object.freeze(events);
}
export interface AgentRuntimeOfferWakeSubscription {
  /** Deliver every due wake state this handle has not delivered yet and return
   * how many were delivered. The controller owns the clock, so the seam stays
   * deterministic and needs no timer. */
  poll(now: string): number;
}
export function subscribeToOfferWakes(repoRoot: string, input: { source: TaskInboxSessionSource; engineer_id?: string; on_wake: (event: AgentRuntimeOfferWakeEventV1) => void }): AgentRuntimeOfferWakeSubscription {
  const delivered = new Set<string>();
  return Object.freeze({
    poll(now: string): number {
      let count = 0;
      for (const event of listDueOfferWakes(repoRoot, { now, source: input.source, engineer_id: input.engineer_id })) {
        const token = `${event.effect_id}:${event.state}`;
        if (delivered.has(token)) continue;
        delivered.add(token); input.on_wake(event); count += 1;
      }
      return count;
    },
  });
}
