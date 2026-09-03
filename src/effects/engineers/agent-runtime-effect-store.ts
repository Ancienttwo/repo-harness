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
import { validateEngineerOffersDocument, type EngineerOffersV1 } from '../../core/engineers/scheduling';
import { canonicalModuleMessageDeliveryReceiptBytes } from '../../core/engineers/module-message';
import { canonicalTaskMessageDeliveryReceiptBytes } from '../../core/fleet/task-message';
import { readRepoHarnessRegistryStrictSnapshot, repoHarnessAuthorizationRevision } from '../repo-registry';
import { resolveGitCommonDirectory } from '../git/common-directory';
import { withExclusiveDirectoryLock } from '../locking/exclusive-directory-lock';
import { readLease } from '../state/coordination-lease-store';
import { readEngineerBindingStatus } from './binding-store';
import { readClaimActorReceipt } from './claim-actor-store';
import { assertAgentRuntimeActionEnabled, assertAgentRuntimePrepareEnabled } from './agent-runtime-feature';
import { readModuleMessageDelivery, readModuleMessageDeliveryObservations } from './module-inbox';
import { loadEngineerProfile } from './profile-store';
import { resolveRegisteredRepoForWorktree } from './scheduling';
import { readTaskMessageDelivery } from '../fleet/task-inbox';
import type { RuntimeDeliveryState, RuntimeReachability } from '../../core/fleet/board';

export const AGENT_RUNTIME_EFFECT_RELATIVE_ROOT = 'repo-harness/agent-runtime-effects/v2';
export const PROVIDER_THREAD_EFFECT_V1_RELATIVE_ROOT = 'repo-harness/provider-thread-effects/v1';
const V1_ARCHIVE_PARENT = 'repo-harness/provider-thread-effects/archive';

export type AgentRuntimeEffectStoreErrorCode =
  | 'agent_runtime_effect_invalid' | 'agent_runtime_effect_unreadable' | 'agent_runtime_effect_persistence_failed'
  | 'agent_runtime_effect_not_found' | 'agent_runtime_effect_conflict' | 'agent_runtime_effect_binding_stale'
  | 'agent_runtime_effect_claim_stale' | 'agent_runtime_effect_capability_unsupported'
  | 'agent_runtime_effect_transition_invalid' | 'agent_runtime_effect_migration_required'
  | 'agent_runtime_effect_migration_blocked' | 'agent_runtime_effect_authorization_stale'
  | 'agent_runtime_effect_wake_superseded' | 'agent_runtime_effect_wake_coalescing';

export class AgentRuntimeEffectStoreError extends Error {
  constructor(readonly code: AgentRuntimeEffectStoreErrorCode, message: string, readonly cause?: unknown) {
    super(message); this.name = 'AgentRuntimeEffectStoreError';
  }
}

export type PrepareAgentRuntimeEffectInput = Readonly<{
  repo_root: string; idempotency_key: string; expected_capability_sha256: string; created_at: string;
} & ({
  message_kind: 'module_message'; engineer_id: string; message_id: string;
  expected_binding_id: string; expected_binding_generation: number; expected_engineer_contract_revision: string;
} | {
  message_kind: 'task_message'; task_id: string; message_id: string; expected_task_revision: string;
  expected_claim_id: string; expected_lease_generation: number;
})>;

export interface AgentRuntimeEffectStatus {
  readonly intent: AgentRuntimeEffectIntentV2;
  readonly current: AgentRuntimeEffectCurrentV2;
  readonly observation: AgentRuntimeEffectObservationV2;
}
export interface StartAgentRuntimeEffectResult extends AgentRuntimeEffectStatus { readonly action: AgentRuntimeHostActionV2 | null }
export type AgentRuntimeEffectCrashBoundary = 'after_observation_fsync' | 'after_current_fsync';
export type AgentRuntimeEffectCrashHook = (boundary: AgentRuntimeEffectCrashBoundary) => void;

export interface AgentRuntimeV1MigrationReceiptV1 {
  readonly protocol: 1;
  readonly kind: 'repo-harness-agent-runtime-v1-migration-receipt';
  readonly source_tree_sha256: string;
  readonly archive_relative_path: string;
  readonly migrated_at: string;
  readonly receipt_sha256: string;
}
export type AgentRuntimeV1MigrationCrashHook = (boundary: 'after_archive_rename') => void;

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
function adapterForProvider(provider: string): AgentRuntimeAdapterKind {
  if (provider !== 'codex-app-thread' && provider !== 'tmux-cli-agent') fail('agent_runtime_effect_binding_stale', 'Binding provider is not an R1 adapter'); return provider;
}
function endpointForBinding(binding: NonNullable<ReturnType<typeof readEngineerBindingStatus>['binding']>): RuntimeEndpointFenceV2 {
  return Object.freeze({ engineer_id: binding.engineer_id, binding_id: binding.binding_id, binding_generation: binding.binding_generation, engineer_contract_revision: binding.engineer_contract_revision, adapter_kind: adapterForProvider(binding.provider), host_id: binding.host_id, endpoint_id: binding.provider_thread_id });
}
function currentBinding(repoRoot: string, engineerId: string): RuntimeEndpointFenceV2 {
  const profile = loadEngineerProfile(repoRoot, engineerId); const status = readEngineerBindingStatus(repoRoot, engineerId, profile.engineer_contract_revision); const binding = status.binding;
  if (!binding || binding.state !== 'active' || status.current.state !== 'active') fail('agent_runtime_effect_binding_stale', 'Engineer has no active Binding'); return endpointForBinding(binding);
}
function assertBinding(repoRoot: string, expected: RuntimeEndpointFenceV2): void {
  const actual = currentBinding(repoRoot, expected.engineer_id); if (JSON.stringify(actual) !== JSON.stringify(expected)) fail('agent_runtime_effect_binding_stale', 'effect endpoint fence does not match the exact current Binding');
}
function capabilityPath(paths: StorePaths, hostId: string, adapter: AgentRuntimeAdapterKind): string {
  const key = createHash('sha256').update(`${adapter}\0${hostId}`).digest('hex'); return join(paths.capabilities, `${key}.json`);
}
function assertMigrationReady(repoRoot: string): void {
  const common = resolve(resolveGitCommonDirectory(repoRoot)); const v1 = join(common, PROVIDER_THREAD_EFFECT_V1_RELATIVE_ROOT); const receipt = join(common, AGENT_RUNTIME_EFFECT_RELATIVE_ROOT, 'migrations', 'v1.json');
  if (existsSync(v1) && !existsSync(receipt)) fail('agent_runtime_effect_migration_required', 'Provider Thread V1 store exists without an exact migration receipt');
}

export function recordAgentRuntimeCapability(repoRoot: string, input: Omit<AgentRuntimeCapabilityObservationV2, 'protocol' | 'kind' | 'capability_sha256'>): AgentRuntimeCapabilityObservationV2 {
  assertMigrationReady(repoRoot); const observation = buildAgentRuntimeCapabilityObservation(input); const paths = pathsFor(repoRoot); prepareStore(paths);
  const lockPath = `${AGENT_RUNTIME_EFFECT_RELATIVE_ROOT}/locks/capability-${createHash('sha256').update(`${observation.adapter_kind}\0${observation.host_id}`).digest('hex')}.lock`;
  return withExclusiveDirectoryLock(paths.common, lockPath, () => { const target = capabilityPath(paths, observation.host_id, observation.adapter_kind); const bytes = canonicalAgentRuntimeCapabilityBytes(observation); if (existsSync(target) && readRaw(target, 'capability observation') === bytes) return observation; replace(target, bytes, 'capability observation'); return observation; }, { reclaimStaleEmptyDirectory: true });
}
export function readAgentRuntimeCapability(repoRoot: string, hostId: string, adapter: AgentRuntimeAdapterKind): AgentRuntimeCapabilityObservationV2 {
  const raw = readRaw(capabilityPath(pathsFor(repoRoot), hostId, adapter), 'capability observation'); try { const value = validateAgentRuntimeCapabilityObservation(JSON.parse(raw)); if (canonicalAgentRuntimeCapabilityBytes(value) !== raw) fail('agent_runtime_effect_unreadable', 'capability observation is non-canonical'); return value; } catch (error) { throw new AgentRuntimeEffectStoreError('agent_runtime_effect_unreadable', 'capability observation is malformed', error); }
}
function assertCapability(repoRoot: string, endpoint: RuntimeEndpointFenceV2, expected: string, operation: AgentRuntimeOperation): void {
  const capability = readAgentRuntimeCapability(repoRoot, endpoint.host_id, endpoint.adapter_kind); if (capability.capability_sha256 !== expected) fail('agent_runtime_effect_conflict', 'capability digest changed'); if (capability.operations[operation] !== 'supported') fail('agent_runtime_effect_capability_unsupported', `${operation} capability is ${capability.operations[operation]}`);
}
function notifyIntent(intent: AgentRuntimeEffectIntentV2): AgentRuntimeNotifyInboxIntentV2 {
  if (intent.operation !== 'notify_inbox') fail('agent_runtime_effect_invalid', 'effect does not notify a message inbox'); return intent;
}
function wakeIntent(intent: AgentRuntimeEffectIntentV2): AgentRuntimeOfferWakeIntentV2 {
  if (intent.operation !== 'wake_for_offer') fail('agent_runtime_effect_invalid', 'effect is not a task-offer wake'); return intent;
}
function moduleReference(input: Extract<PrepareAgentRuntimeEffectInput, { message_kind: 'module_message' }>, endpoint: RuntimeEndpointFenceV2): RuntimeMessageRefV2 {
  if (endpoint.engineer_id !== input.engineer_id || endpoint.binding_id !== input.expected_binding_id || endpoint.binding_generation !== input.expected_binding_generation || endpoint.engineer_contract_revision !== input.expected_engineer_contract_revision) fail('agent_runtime_effect_binding_stale', 'prepare fences do not match current Binding');
  const message = readModuleMessageDelivery({ repo_root: input.repo_root, engineer_id: input.engineer_id, message_id: input.message_id }); if (message.event.scope !== 'assignment') fail('agent_runtime_effect_binding_stale', 'module-scope messages carry no Binding fence for a runtime effect'); if (message.receipt.delivery_state !== 'pending') fail('agent_runtime_effect_transition_invalid', `Module receipt is already ${message.receipt.delivery_state}`);
  return Object.freeze({ kind: 'module_message', message_id: message.event.message_id, message_event_digest: message.event.event_digest, engineer_id: endpoint.engineer_id, binding_id: endpoint.binding_id, binding_generation: endpoint.binding_generation, engineer_contract_revision: endpoint.engineer_contract_revision, delivery_attempt: message.receipt.attempt + 1 });
}
function taskEndpointAndReference(input: Extract<PrepareAgentRuntimeEffectInput, { message_kind: 'task_message' }>): { endpoint: RuntimeEndpointFenceV2; message: RuntimeMessageRefV2 } {
  const lease = readLease(input.repo_root, input.task_id).record;
  if (!lease || lease.state !== 'bound' || lease.task_revision !== input.expected_task_revision || lease.claim_id !== input.expected_claim_id || lease.generation !== input.expected_lease_generation) fail('agent_runtime_effect_claim_stale', 'prepare fences do not match the exact bound Lease');
  const actor = readClaimActorReceipt(input.repo_root, input.task_id, input.expected_claim_id);
  if (!actor || actor.task_revision !== input.expected_task_revision || actor.lease_generation !== input.expected_lease_generation) fail('agent_runtime_effect_claim_stale', 'ClaimActorReceipt does not match the exact Lease');
  const endpoint = currentBinding(input.repo_root, actor.engineer_id);
  if (endpoint.binding_id !== actor.binding_id || endpoint.binding_generation !== actor.binding_generation || endpoint.engineer_contract_revision !== actor.engineer_contract_revision) fail('agent_runtime_effect_binding_stale', 'ClaimActorReceipt does not derive the current Binding');
  const entry = readTaskMessageDelivery({ repo_root: input.repo_root, task_id: input.task_id, message_id: input.message_id, recipient: { kind: 'claim', claim_id: input.expected_claim_id, generation: input.expected_lease_generation } });
  if ((entry.receipt !== null && entry.receipt.delivery_state !== 'pending') || entry.event.task_revision !== input.expected_task_revision || entry.event.target_claim_id !== input.expected_claim_id || entry.event.target_generation !== input.expected_lease_generation) fail('agent_runtime_effect_transition_invalid', 'Task message does not match the exact pending Claim delivery');
  return { endpoint, message: Object.freeze({ kind: 'task_message', message_id: entry.event.message_id, message_event_digest: entry.event.event_digest, task_id: entry.event.task_id, task_revision: entry.event.task_revision, claim_id: input.expected_claim_id, lease_generation: input.expected_lease_generation, delivery_attempt: 1 }) };
}
function assertLiveMessage(repoRoot: string, intent: AgentRuntimeNotifyInboxIntentV2): void {
  assertBinding(repoRoot, intent.endpoint_fence); const ref = intent.message_ref;
  if (ref.kind === 'module_message') {
    const entry = readModuleMessageDelivery({ repo_root: repoRoot, engineer_id: ref.engineer_id, message_id: ref.message_id }); if (entry.event.scope !== 'assignment') fail('agent_runtime_effect_binding_stale', 'module-scope messages carry no Binding fence for a runtime effect'); if (entry.event.event_digest !== ref.message_event_digest || entry.receipt.delivery_state !== 'pending' || entry.receipt.attempt + 1 !== ref.delivery_attempt) fail('agent_runtime_effect_transition_invalid', 'Module message fence is stale'); return;
  }
  const lease = readLease(repoRoot, ref.task_id).record; const actor = readClaimActorReceipt(repoRoot, ref.task_id, ref.claim_id);
  if (!lease || lease.state !== 'bound' || lease.task_revision !== ref.task_revision || lease.claim_id !== ref.claim_id || lease.generation !== ref.lease_generation || !actor || actor.engineer_id !== intent.endpoint_fence.engineer_id || actor.binding_id !== intent.endpoint_fence.binding_id || actor.binding_generation !== intent.endpoint_fence.binding_generation) fail('agent_runtime_effect_claim_stale', 'Task Claim/Lease/Binding fence rotated before Host action');
  const entry = readTaskMessageDelivery({ repo_root: repoRoot, task_id: ref.task_id, message_id: ref.message_id, recipient: { kind: 'claim', claim_id: ref.claim_id, generation: ref.lease_generation } }); if ((entry.receipt !== null && entry.receipt.delivery_state !== 'pending') || entry.event.event_digest !== ref.message_event_digest) fail('agent_runtime_effect_transition_invalid', 'Task message fence is stale');
}

/** A replay must name the same target the first request named. Message ids
 * are caller-generated UUIDs, so key, capability, timestamp and message id
 * alone do not identify a request: the full Engineer/Binding or Task/Claim
 * fence is compared against the persisted intent before a replay is served. */
function replayRequestIdentityMatches(input: PrepareAgentRuntimeEffectInput, existing: AgentRuntimeEffectIntentV2): boolean {
  if (existing.operation !== 'notify_inbox') return false;
  const ref = existing.message_ref;
  if (input.message_kind === 'module_message') {
    return ref.kind === 'module_message' && ref.engineer_id === input.engineer_id && ref.binding_id === input.expected_binding_id && ref.binding_generation === input.expected_binding_generation && ref.engineer_contract_revision === input.expected_engineer_contract_revision;
  }
  return ref.kind === 'task_message' && ref.task_id === input.task_id && ref.task_revision === input.expected_task_revision && ref.claim_id === input.expected_claim_id && ref.lease_generation === input.expected_lease_generation;
}

export function prepareAgentRuntimeEffect(input: PrepareAgentRuntimeEffectInput): AgentRuntimeEffectStatus {
  assertAgentRuntimePrepareEnabled(input.repo_root); assertMigrationReady(input.repo_root); const paths = effectPaths(input.repo_root, deriveAgentRuntimeEffectId(input.idempotency_key));
  return lock(paths, () => {
    prepareEffect(paths); if (existsSync(paths.intent)) { const existing = parseIntent(readRaw(paths.intent, 'effect intent')); if (existing.idempotency_key !== input.idempotency_key || existing.capability_sha256 !== input.expected_capability_sha256 || existing.created_at !== input.created_at || !replayRequestIdentityMatches(input, existing) || notifyIntent(existing).message_ref.kind !== input.message_kind || notifyIntent(existing).message_ref.message_id !== input.message_id) fail('agent_runtime_effect_conflict', 'idempotency key names another prepare request'); return chain(paths, existing).length ? readLocked(paths, true) : initialize(paths, existing); }
    let endpoint: RuntimeEndpointFenceV2; let message: RuntimeMessageRefV2;
    if (input.message_kind === 'module_message') { endpoint = currentBinding(input.repo_root, input.engineer_id); message = moduleReference(input, endpoint); }
    else ({ endpoint, message } = taskEndpointAndReference(input));
    assertCapability(input.repo_root, endpoint, input.expected_capability_sha256, 'notify_inbox');
    const intent = buildAgentRuntimeEffectIntent({ idempotency_key: input.idempotency_key, message_ref: message, endpoint_fence: endpoint, operation: 'notify_inbox', capability_sha256: input.expected_capability_sha256, created_at: input.created_at });
    const bytes = canonicalAgentRuntimeEffectIntentBytes(intent); if (!writeExclusive(paths.intent, bytes, 'effect intent') && readRaw(paths.intent, 'effect intent') !== bytes) fail('agent_runtime_effect_conflict', 'idempotency key names different intent bytes'); assertLiveMessage(input.repo_root, notifyIntent(intent)); return initialize(paths, intent);
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
function assertStartFences(input: { repo_root: string; env?: NodeJS.ProcessEnv }, intent: AgentRuntimeEffectIntentV2, startedAt: string): void {
  assertCapability(input.repo_root, intent.endpoint_fence, intent.capability_sha256, intent.operation);
  if (intent.operation === 'notify_inbox') assertLiveMessage(input.repo_root, intent);
  else { assertBinding(input.repo_root, intent.endpoint_fence); assertAuthorizationCurrent(intent.wake_ref.authorization_revision, input.env); void startedAt; }
}
function startFenceFailureClass(error: unknown): AgentRuntimeFailureClass | null {
  if (!(error instanceof AgentRuntimeEffectStoreError)) return null;
  switch (error.code) {
    case 'agent_runtime_effect_capability_unsupported': case 'agent_runtime_effect_conflict': return 'capability_unsupported';
    case 'agent_runtime_effect_authorization_stale': return 'authorization_stale';
    case 'agent_runtime_effect_binding_stale': return 'binding_stale';
    case 'agent_runtime_effect_claim_stale': return 'claim_stale';
    default: return null;
  }
}
export function startAgentRuntimeEffect(input: { repo_root: string; effect_id: string; started_at: string; env?: NodeJS.ProcessEnv; crash_hook?: AgentRuntimeEffectCrashHook }): StartAgentRuntimeEffectResult {
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
function receiptEvidence(repoRoot: string, intentValue: AgentRuntimeEffectIntentV2): { kind: AgentRuntimeReceiptKind; sha256: string } | null {
  if (intentValue.operation === 'wake_for_offer') return controllerStepEvidence(repoRoot, intentValue);
  const intent = intentValue; const ref = intent.message_ref;
  // A delivered state alone proves only that the inbox saw some delivery.
  // Success additionally requires this exact effect's bounded control
  // reference on the delivery evidence; anything else stays unproven and
  // reconciles instead of succeeding.
  const controlRef = agentRuntimeControlRef(intent);
  if (ref.kind === 'module_message') {
    const entry = readModuleMessageDelivery({ repo_root: repoRoot, engineer_id: ref.engineer_id, message_id: ref.message_id }); const receipt = entry.receipt;
    if (entry.event.event_digest !== ref.message_event_digest || receipt.message_event_digest !== ref.message_event_digest || receipt.recipient_engineer_id !== ref.engineer_id || receipt.target_binding_generation !== ref.binding_generation || receipt.attempt > ref.delivery_attempt) fail('agent_runtime_effect_conflict', 'Module receipt mismatches the frozen effect reference');
    // A receipt attempt below the frozen delivery attempt means this
    // attempt's observation has not landed yet: that is unproven, not a
    // conflict, so observation reconciles instead of throwing.
    if (receipt.delivery_state !== 'delivered' && receipt.delivery_state !== 'acknowledged') return null;
    const bound = readModuleMessageDeliveryObservations(repoRoot, ref.engineer_id, ref.message_id)
      .some((observation) => observation.attempt === ref.delivery_attempt && observation.outcome === 'delivered' && observation.provider_delivery_ref === controlRef);
    return bound ? { kind: 'module_message_delivery_receipt', sha256: receipt.receipt_digest } : null;
  }
  const entry = readTaskMessageDelivery({ repo_root: repoRoot, task_id: ref.task_id, message_id: ref.message_id, recipient: { kind: 'claim', claim_id: ref.claim_id, generation: ref.lease_generation } }); const receipt = entry.receipt;
  if (!receipt) return null;
  if (entry.event.event_digest !== ref.message_event_digest || entry.event.task_revision !== ref.task_revision || receipt.recipient_task_revision !== ref.task_revision || receipt.recipient_claim_id !== ref.claim_id || receipt.recipient_generation !== ref.lease_generation) fail('agent_runtime_effect_conflict', 'Task receipt mismatches the frozen effect reference');
  if (receipt.delivery_state !== 'delivered' && receipt.delivery_state !== 'acknowledged') return null;
  if (receipt.delivery_channel !== 'agent_runtime_effect' || receipt.delivery_ref !== controlRef) return null;
  return { kind: 'task_message_delivery_receipt', sha256: `sha256:${createHash('sha256').update(canonicalTaskMessageDeliveryReceiptBytes(receipt)).digest('hex')}` };
}
export function observeAgentRuntimeEffect(input: { repo_root: string; effect_id: string; adapter: AgentRuntimeAdapterObservationV2; observed_at: string; receipt_wait_exhausted: boolean; crash_hook?: AgentRuntimeEffectCrashHook }): AgentRuntimeEffectStatus {
  const paths = effectPaths(input.repo_root, input.effect_id); return withWakeEffectLock(paths, () => lock(paths, () => {
    let status = readLocked(paths, true); if (status.current.state === 'observed_success' || status.current.state === 'observed_failure' || status.current.state === 'stopped') return status;
    if (status.current.state !== 'effect_started' && status.current.state !== 'reconciliation_required') fail('agent_runtime_effect_transition_invalid', `cannot observe from ${status.current.state}`);
    if (input.adapter.adapter_kind !== status.intent.endpoint_fence.adapter_kind) fail('agent_runtime_effect_conflict', 'adapter observation mismatches effect adapter');
    const receipt = receiptEvidence(input.repo_root, status.intent); if (receipt) assertAgentRuntimeReceiptKindForOperation(status.intent.operation, receipt.kind); let state: 'observed_success' | 'observed_failure' | 'reconciliation_required'; let failure: 'none' | 'adapter_unavailable' | 'unknown' | 'receipt_missing';
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
  readonly delivery_state: RuntimeDeliveryState;
  readonly runtime_reachability: RuntimeReachability;
  readonly effect_sha256: string | null;
  readonly failure_class: import('../../core/engineers/agent-runtime-effect').AgentRuntimeFailureClass | null;
}

export function projectTaskAgentRuntimeState(input: {
  readonly repo_root: string;
  readonly task_id: string;
  readonly task_revision: string;
  readonly current_claim: { readonly claim_id: string; readonly generation: number } | null;
  readonly statuses?: readonly AgentRuntimeEffectStatus[];
}): TaskAgentRuntimeProjectionV1 {
  if (input.current_claim === null) return Object.freeze({ delivery_state: 'pending', runtime_reachability: 'unknown', effect_sha256: null, failure_class: null });
  const candidates = (input.statuses ?? listAgentRuntimeEffects(input.repo_root)).filter(({ intent }) => {
    if (intent.operation !== 'notify_inbox') return false;
    const ref = intent.message_ref;
    return ref.kind === 'task_message' && ref.task_id === input.task_id && ref.task_revision === input.task_revision
      && ref.claim_id === input.current_claim!.claim_id && ref.lease_generation === input.current_claim!.generation;
  });
  if (candidates.length === 0) return Object.freeze({ delivery_state: 'pending', runtime_reachability: 'unknown', effect_sha256: null, failure_class: null });
  if (candidates.length !== 1) return Object.freeze({ delivery_state: 'reconciliation_required', runtime_reachability: 'unknown', effect_sha256: null, failure_class: 'unknown' });
  const status = candidates[0];
  let reachability: RuntimeReachability = 'unknown';
  try {
    const capability = readAgentRuntimeCapability(input.repo_root, status.intent.endpoint_fence.host_id, status.intent.endpoint_fence.adapter_kind);
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
    const entry = readTaskMessageDelivery({ repo_root: input.repo_root, task_id: ref.task_id, message_id: ref.message_id, recipient: { kind: 'claim', claim_id: ref.claim_id, generation: ref.lease_generation } });
    delivery = entry.receipt?.delivery_state === 'acknowledged' ? 'acknowledged' : entry.receipt?.delivery_state === 'delivered' ? 'delivered' : 'reconciliation_required';
  }
  return Object.freeze({ delivery_state: delivery, runtime_reachability: reachability, effect_sha256: status.current.current_sha256, failure_class: status.observation.failure_class === 'none' ? null : status.observation.failure_class });
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
  readonly repo_root: string;
  readonly offers: EngineerOffersV1;
  readonly observed_at: string;
  readonly expected_capability_sha256: string;
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
  readonly binding_id: string;
  readonly binding_generation: number;
  readonly effect_id: string;
  readonly snapshot_revision: string;
  readonly wake_reason: AgentRuntimeOfferWakeReason;
  readonly state: AgentRuntimeEffectState;
  readonly requested_at: string;
  readonly coalesce_until: string;
  readonly control_ref: string;
}
export interface AgentRuntimeOfferWakeBindingRef {
  readonly engineer_id: string;
  readonly binding_id: string;
  readonly binding_generation: number;
}

const TERMINAL_STATES: readonly AgentRuntimeEffectState[] = Object.freeze(['observed_success', 'observed_failure', 'stopped', 'superseded']);

function wakeKey(binding: AgentRuntimeOfferWakeBindingRef): string {
  return createHash('sha256').update(`${binding.engineer_id}\0${binding.binding_id}\0${String(binding.binding_generation)}`).digest('hex');
}
function wakeLedgerPath(store: StorePaths, binding: AgentRuntimeOfferWakeBindingRef): string { return join(store.wakes, `${wakeKey(binding)}.json`); }
function withWakeLock<T>(store: StorePaths, binding: AgentRuntimeOfferWakeBindingRef, run: () => T): T {
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
export function readOfferWakeLedger(repoRoot: string, binding: AgentRuntimeOfferWakeBindingRef): AgentRuntimeOfferWakeLedgerV2 | null {
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
function assertOffersBindCurrentEndpoint(repoRoot: string, offers: EngineerOffersV1, endpoint: RuntimeEndpointFenceV2, env: NodeJS.ProcessEnv | undefined): void {
  let repository;
  try { repository = resolveRegisteredRepoForWorktree(repoRoot, readRepoHarnessRegistryStrictSnapshot({ env: env ?? process.env })); }
  catch (error) { throw mapped(error, 'agent_runtime_effect_invalid', 'current worktree is not an exact registered repository'); }
  if (offers.repository_id !== repository.id) fail('agent_runtime_effect_invalid', 'offers document describes another repository');
  if (offers.engineer_id !== endpoint.engineer_id) fail('agent_runtime_effect_binding_stale', 'offers document describes another Engineer');
  for (const offer of offers.offers) {
    if (offer.binding_id !== endpoint.binding_id || offer.binding_generation !== endpoint.binding_generation
      || offer.engineer_contract_revision !== endpoint.engineer_contract_revision) {
      fail('agent_runtime_effect_binding_stale', 'offers document was collected under another Binding generation or Engineer contract revision');
    }
  }
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
}): AgentRuntimeEffectStatus {
  const key = deriveAgentRuntimeOfferWakeIdempotencyKey({
    engineer_id: input.endpoint.engineer_id, binding_id: input.endpoint.binding_id, binding_generation: input.endpoint.binding_generation,
    snapshot_revision: input.snapshot_revision, wake_reason: input.wake_reason,
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
        || JSON.stringify(existing.endpoint_fence) !== JSON.stringify(input.endpoint)
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
  assertAgentRuntimePrepareEnabled(input.repo_root); assertMigrationReady(input.repo_root);
  const policy = wakePolicy(input.wake_policy);
  let document: EngineerOffersV1; let observed;
  try { document = validateEngineerOffersDocument(input.offers); observed = buildAgentRuntimeOfferWakeSnapshot(document); }
  catch (error) { throw mapped(error, 'agent_runtime_effect_invalid', 'Engineer offers document is invalid'); }
  const endpoint = currentBinding(input.repo_root, observed.engineer_id);
  assertOffersBindCurrentEndpoint(input.repo_root, document, endpoint, input.env);
  const store = pathsFor(input.repo_root);
  return withWakeLock(store, endpoint, () => {
    const existing = readOfferWakeLedger(input.repo_root, endpoint);
    const pendingStatus = existing?.pending ? wakeStatusOrNull(input.repo_root, existing.pending.effect_id) : null;
    const publish = (pending: AgentRuntimeOfferWakePendingV2 | null): AgentRuntimeOfferWakeLedgerV2 => {
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
      return Object.freeze({ outcome: 'no_wake' as const, cause: 'wake_in_flight' as const, ledger: publish(existing.pending), status: pendingStatus });
    }
    const capability = readAgentRuntimeCapability(input.repo_root, endpoint.host_id, endpoint.adapter_kind);
    if (capability.capability_sha256 !== input.expected_capability_sha256) fail('agent_runtime_effect_conflict', 'capability digest changed');
    if (capability.operations.wake_for_offer !== 'supported') {
      if (!policy.polling_fallback_enabled) fail('agent_runtime_effect_capability_unsupported', `wake_for_offer capability is ${capability.operations.wake_for_offer}`);
      return Object.freeze({ outcome: 'polling_fallback' as const, cause: 'wake_unsupported' as const, ledger: publish(existing?.pending ?? null), status: null });
    }
    assertAuthorizationCurrent(decision.authorization_revision, input.env);
    const status = prepareOfferWakeEffect({
      repo_root: input.repo_root, endpoint, repository_id: decision.repository_id, authorization_revision: decision.authorization_revision,
      snapshot_revision: decision.snapshot_revision, wake_reason: decision.wake_reason, capability_sha256: input.expected_capability_sha256,
      created_at: input.observed_at,
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
    || receipt.engineer_id !== fence.engineer_id || receipt.binding_id !== fence.binding_id || receipt.binding_generation !== fence.binding_generation) {
    fail('agent_runtime_effect_conflict', 'controller step receipt mismatches the frozen effect reference');
  }
  return { kind: 'controller_step_receipt', sha256: receipt.receipt_sha256 };
}

/** The awakened controller writes this after running one bounded step. The
 * observed snapshot may already be stale -- a stale wake is still a delivered
 * wake -- but it can never authorize acquisition. */
export function recordAgentRuntimeControllerStep(input: {
  repo_root: string; effect_id: string; control_ref: string; observed_snapshot_revision: string; observed_at: string;
  crash_hook?: (boundary: 'after_receipt_fsync') => void;
}): AgentRuntimeControllerStepReceiptV2 {
  const paths = effectPaths(input.repo_root, input.effect_id);
  return withWakeEffectLock(paths, () => lock(paths, () => {
    const status = readLocked(paths, true);
    const intent = wakeIntent(status.intent);
    if (status.current.state === 'intent_persisted') fail('agent_runtime_effect_transition_invalid', 'no Host action has run for this wake');
    if (input.control_ref !== agentRuntimeControlRef(intent)) fail('agent_runtime_effect_conflict', 'controller step receipt names another control reference');
    const receipt = buildAgentRuntimeControllerStepReceipt({
      effect_id: intent.effect_id, intent_sha256: intent.intent_sha256, control_ref: input.control_ref,
      control_sha256: agentRuntimeControlSha256(intent), engineer_id: intent.endpoint_fence.engineer_id,
      binding_id: intent.endpoint_fence.binding_id, binding_generation: intent.endpoint_fence.binding_generation,
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
    engineer_id: ledger.endpoint_fence.engineer_id, binding_id: ledger.endpoint_fence.binding_id,
    binding_generation: ledger.endpoint_fence.binding_generation, effect_id: ledger.pending.effect_id,
    snapshot_revision: ledger.pending.snapshot_revision, wake_reason: ledger.pending.wake_reason,
    state: status.current.state, requested_at: ledger.pending.requested_at, coalesce_until: ledger.pending.coalesce_until,
    control_ref: agentRuntimeControlRef(wakeIntent(status.intent)),
  });
}
/** The effect-level seam a non-interactive controller consumes: durable state
 * in, bounded wake events out, no CLI and no host coupling. */
export function listDueOfferWakes(repoRoot: string, input: { now: string; engineer_id?: string }): readonly AgentRuntimeOfferWakeEventV1[] {
  const store = pathsFor(repoRoot);
  if (!ensureDirectory(store.common, store.wakes, false)) return Object.freeze([]);
  const now = Date.parse(input.now);
  if (Number.isNaN(now)) fail('agent_runtime_effect_invalid', 'now is not a parsable timestamp');
  const events = readdirSync(store.wakes).sort().flatMap((name) => {
    if (!/^[0-9a-f]{64}\.json$/u.test(name)) fail('agent_runtime_effect_unreadable', `invalid wake ledger entry: ${name}`);
    const ledger = parseWakeLedger(readRaw(join(store.wakes, name), 'offer wake ledger'));
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
export function subscribeToOfferWakes(repoRoot: string, input: { engineer_id?: string; on_wake: (event: AgentRuntimeOfferWakeEventV1) => void }): AgentRuntimeOfferWakeSubscription {
  const delivered = new Set<string>();
  return Object.freeze({
    poll(now: string): number {
      let count = 0;
      for (const event of listDueOfferWakes(repoRoot, { now, engineer_id: input.engineer_id })) {
        const token = `${event.effect_id}:${event.state}`;
        if (delivered.has(token)) continue;
        delivered.add(token); input.on_wake(event); count += 1;
      }
      return count;
    },
  });
}

function treeDigest(root: string): string {
  const hash = createHash('sha256'); const walk = (directory: string): void => { for (const name of readdirSync(directory).sort()) { const path = join(directory, name); const stat = lstatSync(path); if (stat.isSymbolicLink()) fail('agent_runtime_effect_migration_blocked', 'V1 store contains a symbolic link'); const scoped = relative(root, path); if (stat.isDirectory()) { hash.update(`d\0${scoped}\0`); walk(path); } else if (stat.isFile()) { hash.update(`f\0${scoped}\0`); hash.update(readFileSync(path)); hash.update('\0'); } else fail('agent_runtime_effect_migration_blocked', 'V1 store contains an unsupported entry'); } }; walk(root); return `sha256:${hash.digest('hex')}`;
}
function migrationReceiptDigest(value: Omit<AgentRuntimeV1MigrationReceiptV1, 'receipt_sha256'>): string { return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`; }
function migrationTimestamp(value: string): string {
  try { if (new Date(value).toISOString() !== value) throw new Error('non-canonical'); }
  catch (error) { fail('agent_runtime_effect_migration_blocked', 'migrated_at must be a canonical RFC3339 timestamp', error); }
  return value;
}
function buildMigrationReceipt(sourceTreeSha256: string, migratedAt: string): AgentRuntimeV1MigrationReceiptV1 {
  const basis = Object.freeze({ protocol: 1 as const, kind: 'repo-harness-agent-runtime-v1-migration-receipt' as const, source_tree_sha256: sourceTreeSha256, archive_relative_path: `${V1_ARCHIVE_PARENT}/v1-${sourceTreeSha256.slice(7)}`, migrated_at: migrationTimestamp(migratedAt) });
  return Object.freeze({ ...basis, receipt_sha256: migrationReceiptDigest(basis) });
}
function parseMigrationReceipt(raw: string): AgentRuntimeV1MigrationReceiptV1 {
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    const keys = Object.keys(value).sort();
    const expectedKeys = ['archive_relative_path', 'kind', 'migrated_at', 'protocol', 'receipt_sha256', 'source_tree_sha256'].sort();
    if (JSON.stringify(keys) !== JSON.stringify(expectedKeys)
      || value.protocol !== 1
      || value.kind !== 'repo-harness-agent-runtime-v1-migration-receipt'
      || typeof value.source_tree_sha256 !== 'string'
      || !/^sha256:[0-9a-f]{64}$/u.test(value.source_tree_sha256)
      || value.archive_relative_path !== `${V1_ARCHIVE_PARENT}/v1-${value.source_tree_sha256.slice(7)}`
      || typeof value.migrated_at !== 'string'
      || new Date(value.migrated_at).toISOString() !== value.migrated_at
      || typeof value.receipt_sha256 !== 'string'
      || !/^sha256:[0-9a-f]{64}$/u.test(value.receipt_sha256)) fail('agent_runtime_effect_migration_blocked', 'V1 migration receipt is malformed');
    const receipt = value as unknown as AgentRuntimeV1MigrationReceiptV1;
    const basis = { protocol: receipt.protocol, kind: receipt.kind, source_tree_sha256: receipt.source_tree_sha256, archive_relative_path: receipt.archive_relative_path, migrated_at: receipt.migrated_at };
    if (migrationReceiptDigest(basis) !== receipt.receipt_sha256 || `${JSON.stringify(receipt)}\n` !== raw) fail('agent_runtime_effect_migration_blocked', 'V1 migration receipt digest or canonical bytes are invalid');
    return Object.freeze(receipt);
  } catch (error) {
    if (error instanceof AgentRuntimeEffectStoreError) throw error;
    fail('agent_runtime_effect_migration_blocked', 'V1 migration receipt is unreadable', error);
  }
}
function readCompletedMigration(store: StorePaths, targetReceipt: string): AgentRuntimeV1MigrationReceiptV1 {
  const receipt = parseMigrationReceipt(readRaw(targetReceipt, 'V1 migration receipt'));
  const archive = join(store.common, receipt.archive_relative_path);
  if (!existsSync(archive) || treeDigest(archive) !== receipt.source_tree_sha256) fail('agent_runtime_effect_migration_blocked', 'V1 migration archive does not match its receipt');
  return receipt;
}
function publishMigrationReceipt(targetReceipt: string, receipt: AgentRuntimeV1MigrationReceiptV1): AgentRuntimeV1MigrationReceiptV1 {
  const bytes = `${JSON.stringify(receipt)}\n`;
  if (!writeExclusive(targetReceipt, bytes, 'V1 migration receipt') && readRaw(targetReceipt, 'V1 migration receipt') !== bytes) fail('agent_runtime_effect_migration_blocked', 'V1 migration receipt conflicts');
  return receipt;
}
function recoverArchivedMigration(store: StorePaths, targetReceipt: string, migratedAt: string): AgentRuntimeV1MigrationReceiptV1 | null {
  const parent = join(store.common, V1_ARCHIVE_PARENT);
  if (!existsSync(parent)) return null;
  const names = readdirSync(parent).sort();
  if (names.length === 0) return null;
  if (names.length !== 1 || !/^v1-[0-9a-f]{64}$/u.test(names[0]!)) fail('agent_runtime_effect_migration_blocked', 'V1 archive recovery is ambiguous');
  const archive = join(parent, names[0]!); const stat = lstatSync(archive);
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail('agent_runtime_effect_migration_blocked', 'V1 archive recovery target is unsafe');
  const digestValue = treeDigest(archive);
  if (names[0] !== `v1-${digestValue.slice(7)}`) fail('agent_runtime_effect_migration_blocked', 'V1 archive recovery digest is mismatched');
  return publishMigrationReceipt(targetReceipt, buildMigrationReceipt(digestValue, migratedAt));
}
export function migrateProviderThreadEffectsV1(repoRoot: string, migratedAt: string, crashHook?: AgentRuntimeV1MigrationCrashHook): AgentRuntimeV1MigrationReceiptV1 | null {
  migrationTimestamp(migratedAt);
  const store = pathsFor(repoRoot); prepareStore(store); const source = join(store.common, PROVIDER_THREAD_EFFECT_V1_RELATIVE_ROOT); const targetReceipt = join(store.migrations, 'v1.json');
  if (!existsSync(source)) return existsSync(targetReceipt) ? readCompletedMigration(store, targetReceipt) : recoverArchivedMigration(store, targetReceipt, migratedAt);
  return withExclusiveDirectoryLock(store.common, `${AGENT_RUNTIME_EFFECT_RELATIVE_ROOT}/locks/migrate-v1.lock`, () => {
    const digestValue = treeDigest(source); const archiveRelative = `${V1_ARCHIVE_PARENT}/v1-${digestValue.slice(7)}`; const archive = join(store.common, archiveRelative);
    if (existsSync(targetReceipt)) { const existing = readCompletedMigration(store, targetReceipt); if (existing.source_tree_sha256 === digestValue && existing.archive_relative_path === archiveRelative) return existing; fail('agent_runtime_effect_migration_blocked', 'existing migration receipt does not match the V1 tree'); }
    const effects = join(source, 'effects'); if (existsSync(effects)) for (const effect of readdirSync(effects).sort()) { const current = JSON.parse(readRaw(join(effects, effect, 'current.json'), 'V1 effect current')) as { state?: unknown }; if (current.state !== 'observed_success' && current.state !== 'observed_failure' && current.state !== 'stopped') fail('agent_runtime_effect_migration_blocked', `V1 effect ${effect} is non-terminal: ${String(current.state)}`); }
    ensureDirectory(store.common, join(store.common, V1_ARCHIVE_PARENT), true); if (existsSync(archive)) fail('agent_runtime_effect_migration_blocked', 'V1 archive target already exists without a receipt'); renameSync(source, archive); syncDirectory(dirname(archive)); crashHook?.('after_archive_rename');
    return publishMigrationReceipt(targetReceipt, buildMigrationReceipt(digestValue, migratedAt));
  }, { reclaimStaleEmptyDirectory: true });
}
