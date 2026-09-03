import { Command } from 'commander';
import { realpathSync } from 'fs';

import { EngineerProfileBindingError } from '../../core/engineers/profile-binding';
import { EngineeringOverlayError } from '../../core/engineers/engineering-overlay';
import { EngineerPrincipalError } from '../../core/engineers/principal-claim';
import { EngineerSchedulingError, type EngineerOffersV1 } from '../../core/engineers/scheduling';
import { TaskFreezeError } from '../../core/engineers/task-freeze';
import {
  ModuleMessageError,
  buildModuleMessageEvent,
  type ModuleMessageResourceRefV1,
  type ModuleMessageScope,
  type ModuleMessageSubjectRefV1,
  type ModuleMessageType,
} from '../../core/engineers/module-message';
import {
  AgentRuntimeEffectError,
  type AgentRuntimeAdapterKind,
  type AgentRuntimeAdapterObservationV2,
  type AgentRuntimeCapabilityStatus,
  type AgentRuntimeOperation,
} from '../../core/engineers/agent-runtime-effect';
import {
  bindEngineer,
  readEngineerBindingStatus,
  retireEngineer,
} from '../../effects/engineers/binding-store';
import {
  buildEngineerBootstrapPrompt,
  listEngineerProfiles,
  loadEngineerProfile,
} from '../../effects/engineers/profile-store';
import {
  enrollEngineerPrincipal,
  listEngineerPrincipalMappings,
  readEngineerPrincipalMapping,
  revokeEngineerPrincipal,
} from '../../effects/engineers/principal-store';
import { repoHarnessRepoIdFor } from '../../effects/repo-registry';
import { resolveEngineerPrincipal } from '../../effects/engineers/principal';
import { collectEngineerOffers } from '../../effects/engineers/scheduling';
import { FleetOffersError } from '../../effects/fleet/acquire';
import {
  EngineeringOverlayProjectionError,
  collectEngineeringBoard,
} from '../../effects/engineers/engineering-overlay';
import {
  ModuleInboxError,
  acknowledgeModuleMessage,
  receiveModuleInbox,
  sendModuleMessage,
} from '../../effects/engineers/module-inbox';
import {
  AgentRuntimeEffectStoreError,
  listAgentRuntimeEffects,
  listDueOfferWakes,
  migrateProviderThreadEffectsV1,
  observeAgentRuntimeEffect,
  prepareAgentRuntimeEffect,
  readAgentRuntimeEffectStatus,
  readOfferWakeLedger,
  recordAgentRuntimeCapability,
  recordAgentRuntimeControllerStep,
  recordEngineerOfferSnapshot,
  startAgentRuntimeEffect,
} from '../../effects/engineers/agent-runtime-effect-store';
import {
  createTaskFreeze,
  inspectBoundTask,
  verifyTaskFreeze,
} from '../../effects/engineers/task-freeze-store';
import { mcpOAuthTokenStorePath } from '../mcp/auth';
import { McpOAuthTokenStore } from '../mcp/oauth';

function emit(value: unknown, json: boolean | undefined, human: string): void {
  process.stdout.write(json === true ? `${JSON.stringify(value, null, 2)}\n` : `${human}\n`);
}

class CliArgumentError extends Error {}

function emitError(error: unknown): void {
  const code = error instanceof EngineerProfileBindingError || error instanceof EngineerPrincipalError
    || error instanceof EngineerSchedulingError || error instanceof FleetOffersError
    || error instanceof ModuleMessageError || error instanceof ModuleInboxError
    || error instanceof AgentRuntimeEffectError || error instanceof AgentRuntimeEffectStoreError
    || error instanceof TaskFreezeError
    || error instanceof EngineeringOverlayError || error instanceof EngineeringOverlayProjectionError
    ? error.code
    : error instanceof CliArgumentError
      ? 'invalid_argument'
      : 'internal_error';
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${JSON.stringify({ ok: false, error: code, message })}\n`);
  process.exitCode = 1;
}

function run(action: () => void): void {
  try {
    action();
  } catch (error) {
    emitError(error);
  }
}

function integerOption(value: string, field: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new CliArgumentError(`--${field} must be a non-negative integer`);
  return parsed;
}

function nullableOption(value: string, field: string): string | null {
  if (value === 'null') return null;
  if (value.length === 0) throw new CliArgumentError(`--${field} must be a non-empty value or null`);
  return value;
}

function nullableIntegerOption(value: string, field: string): number | null {
  if (value === 'null') return null;
  const parsed = integerOption(value, field);
  if (parsed < 1) throw new CliArgumentError(`--${field} must be a positive integer or null`);
  return parsed;
}

function jsonOption<T>(value: string, field: string): T {
  try {
    return JSON.parse(value) as T;
  } catch (error) {
    throw new CliArgumentError(`--${field} must be valid JSON`, { cause: error });
  }
}

interface CommonExpectedOptions {
  readonly engineerId: string;
  readonly idempotencyKey: string;
  readonly expectedCurrentDigest: string;
  readonly expectedBindingGeneration: string;
  readonly expectedBindingId: string;
  readonly expectedEngineerContractRevision: string;
  readonly json?: boolean;
}

export function buildEngineerCommand(): Command {
  const engineer = new Command('engineer').description('Manage repository-backed Module Engineer Profiles and operator bindings');

  engineer
    .command('board')
    .description('Project the read-only Engineering Overlay and Organization Attention views')
    .requiredOption('--format <format>', 'Output format (json or text)')
    .action((options: { format: string }) => run(() => {
      if (options.format !== 'json' && options.format !== 'text') throw new EngineeringOverlayError('engineering_overlay_invalid', '--format must be json or text');
      const board = collectEngineeringBoard({ repo_root: process.cwd(), env: process.env });
      if (options.format === 'json') {
        process.stdout.write(`${JSON.stringify(board)}\n`);
        return;
      }
      const lines = [
        `repository: ${board.overlay.repository_id}`,
        `consistency: ${board.overlay.snapshot_consistency}`,
        ...board.overlay.engineers.map((item) => [
          item.engineer_id,
          `binding=${item.binding.support === 'available' ? item.binding.state : 'unreadable'}`,
          `claim=${item.active_claim.support === 'available' && item.active_claim.value ? item.active_claim.value.claim_id : item.active_claim.support === 'available' ? 'none' : 'unreadable'}`,
          `pending=${item.messages.support === 'available' ? item.messages.pending : 'unreadable'}`,
          `reconcile=${item.runtime_effects.support === 'available' ? item.runtime_effects.reconciliation_required : 'unreadable'}`,
        ].join(' ')),
        ...board.organization_attention.attention.map((item) => `attention ${item.engineer_id} ${item.reason} owner=${item.owner}`),
      ];
      process.stdout.write(`${lines.join('\n')}\n`);
    }));

  const profile = new Command('profile').description('Inspect tracked Module Engineer Profiles');
  profile
    .command('list')
    .option('--json', 'Output JSON')
    .action((options: { json?: boolean }) => run(() => {
      const profiles = listEngineerProfiles(process.cwd()).map((item) => ({
        engineer_id: item.profile.engineer_id,
        capability_id: item.profile.capability_id,
        profile_path: item.profile_path,
        sop_ref: item.profile.sop_ref,
        capability_revision: item.capability_revision,
        engineer_contract_revision: item.engineer_contract_revision,
      }));
      emit(profiles, options.json, profiles.map((item) => `${item.engineer_id} ${item.engineer_contract_revision}`).join('\n'));
    }));
  profile
    .command('show')
    .requiredOption('--engineer-id <id>', 'Exact engineer_id')
    .option('--json', 'Output JSON')
    .action((options: { engineerId: string; json?: boolean }) => run(() => {
      const resolved = loadEngineerProfile(process.cwd(), options.engineerId);
      emit(resolved, options.json, [
        `engineer_id: ${resolved.profile.engineer_id}`,
        `capability_id: ${resolved.profile.capability_id}`,
        `engineer_contract_revision: ${resolved.engineer_contract_revision}`,
        `sop_ref: ${resolved.profile.sop_ref}`,
        `architecture_module: ${resolved.capability.architecture_module}`,
      ].join('\n'));
    }));
  engineer.addCommand(profile);

  const binding = new Command('binding').description('Perform local Human-operator binding transitions');
  binding
    .command('status')
    .requiredOption('--engineer-id <id>', 'Exact engineer_id')
    .option('--json', 'Output JSON')
    .action((options: { engineerId: string; json?: boolean }) => run(() => {
      const resolved = loadEngineerProfile(process.cwd(), options.engineerId);
      const status = readEngineerBindingStatus(process.cwd(), options.engineerId, resolved.engineer_contract_revision);
      const result = { profile_revision: resolved.engineer_contract_revision, ...status };
      emit(result, options.json, [
        `engineer_id: ${options.engineerId}`,
        `state: ${status.current.state}`,
        `binding_generation: ${status.current.binding_generation}`,
        `binding_id: ${status.current.current_binding_id ?? 'none'}`,
        `current_digest: ${status.genesis ? 'null' : status.current.current_digest}`,
        `engineer_contract_revision: ${status.current.engineer_contract_revision}`,
      ].join('\n'));
    }));
  binding
    .command('bind')
    .requiredOption('--engineer-id <id>', 'Exact engineer_id')
    .requiredOption('--idempotency-key <key>', 'Stable retry key')
    .requiredOption('--provider <provider>', 'Provider name')
    .requiredOption('--provider-thread-id <id>', 'Opaque runtime endpoint ID carried by the historical Binding field')
    .requiredOption('--host-id <id>', 'Host ID')
    .requiredOption('--expected-current-digest <digest>', 'Expected current digest or literal null')
    .requiredOption('--expected-binding-generation <n>', 'Expected binding generation')
    .requiredOption('--expected-binding-id <id>', 'Expected binding UUID or literal null')
    .requiredOption('--expected-engineer-contract-revision <digest>', 'Expected current Engineer contract revision')
    .option('--json', 'Output JSON')
    .action((options: CommonExpectedOptions & {
      provider: string;
      providerThreadId: string;
      hostId: string;
    }) => run(() => {
      const resolved = loadEngineerProfile(process.cwd(), options.engineerId);
      const current = bindEngineer(process.cwd(), {
        engineer_id: options.engineerId,
        idempotency_key: options.idempotencyKey,
        provider: options.provider,
        provider_thread_id: options.providerThreadId,
        host_id: options.hostId,
        engineer_contract_revision: resolved.engineer_contract_revision,
        expected_current_digest: nullableOption(options.expectedCurrentDigest, 'expected-current-digest'),
        expected_binding_generation: integerOption(options.expectedBindingGeneration, 'expected-binding-generation'),
        expected_binding_id: nullableOption(options.expectedBindingId, 'expected-binding-id'),
        expected_engineer_contract_revision: options.expectedEngineerContractRevision,
      });
      emit(current, options.json, `${current.state} ${current.current_binding_id} generation=${current.binding_generation}`);
    }));
  binding
    .command('retire')
    .requiredOption('--engineer-id <id>', 'Exact engineer_id')
    .requiredOption('--idempotency-key <key>', 'Stable retry key')
    .requiredOption('--expected-current-digest <digest>', 'Expected current digest')
    .requiredOption('--expected-binding-generation <n>', 'Expected binding generation')
    .requiredOption('--expected-binding-id <id>', 'Expected binding UUID')
    .requiredOption('--expected-engineer-contract-revision <digest>', 'Expected current Engineer contract revision')
    .option('--json', 'Output JSON')
    .action((options: CommonExpectedOptions) => run(() => {
      loadEngineerProfile(process.cwd(), options.engineerId);
      const currentDigest = nullableOption(options.expectedCurrentDigest, 'expected-current-digest');
      const bindingId = nullableOption(options.expectedBindingId, 'expected-binding-id');
      if (currentDigest === null || bindingId === null) throw new CliArgumentError('retire requires non-null expected current and binding IDs');
      const current = retireEngineer(process.cwd(), {
        engineer_id: options.engineerId,
        idempotency_key: options.idempotencyKey,
        expected_current_digest: currentDigest,
        expected_binding_generation: integerOption(options.expectedBindingGeneration, 'expected-binding-generation'),
        expected_binding_id: bindingId,
        expected_engineer_contract_revision: options.expectedEngineerContractRevision,
      });
      emit(current, options.json, `${current.state} ${current.current_binding_id} generation=${current.binding_generation}`);
    }));
  engineer.addCommand(binding);

  const taskFreeze = new Command('task-freeze').description('Inspect and freeze a bound task without transferring execution');
  taskFreeze
    .command('inspect')
    .requiredOption('--engineer-id <id>', 'Exact engineer_id')
    .option('--json', 'Output JSON')
    .action((options: { engineerId: string; json?: boolean }) => run(() => {
      const result = inspectBoundTask(process.cwd(), options.engineerId);
      emit(result, options.json, `${result.disposition} ${result.receipt.receipt_sha256} reasons=${result.reasons.join(',') || 'none'}`);
    }));
  taskFreeze
    .command('create')
    .requiredOption('--engineer-id <id>', 'Exact engineer_id')
    .option('--json', 'Output JSON')
    .action((options: { engineerId: string; json?: boolean }) => run(() => {
      const result = createTaskFreeze(process.cwd(), options.engineerId);
      emit(result, options.json, `frozen ${result.receipt.receipt_sha256} disposition=${result.disposition}`);
    }));
  taskFreeze
    .command('verify')
    .requiredOption('--task-id <id>', 'Exact canonical task_id')
    .requiredOption('--receipt-sha256 <digest>', 'Exact freeze receipt digest')
    .option('--json', 'Output JSON')
    .action((options: { taskId: string; receiptSha256: string; json?: boolean }) => run(() => {
      const result = verifyTaskFreeze(process.cwd(), options.taskId, options.receiptSha256);
      emit(result, options.json, `current ${result.receipt.receipt_sha256}`);
    }));
  engineer.addCommand(taskFreeze);

  engineer
    .command('offers')
    .description('Inspect deterministic Work Package offers for one enrolled Engineer authorization')
    .requiredOption('--authorization-id <id>', 'Server-minted Engineer OAuth authorization ID')
    .option('--json', 'Output JSON')
    .action((options: { authorizationId: string; json?: boolean }) => run(() => {
      const repoRoot = realpathSync(process.cwd());
      const principal = resolveEngineerPrincipal({
        repo_root: repoRoot,
        authorization_id: options.authorizationId,
      });
      const offers = collectEngineerOffers({ repo_root: repoRoot, principal });
      emit(offers, options.json, offers.offers.length === 0
        ? `${offers.lane}: no eligible Work Packages`
        : offers.offers.map((offer) => `${offer.work_package_id} ${offer.offer_revision}`).join('\n'));
    }));

  const message = new Command('message').description('Persist and consume closed Module Engineer coordination messages');
  message
    .command('send')
    .requiredOption('--message-id <id>', 'Stable message UUID')
    .requiredOption('--capability-id <id>', 'Exact target capability_id')
    .requiredOption('--target-engineer-id <id>', 'Exact target engineer_id')
    .requiredOption('--scope <scope>', 'module or assignment')
    .requiredOption('--target-binding-id <id>', 'Exact target Binding UUID or null')
    .requiredOption('--target-binding-generation <n>', 'Exact target Binding generation or null')
    .requiredOption('--target-engineer-contract-revision <digest>', 'Exact target Engineer contract revision or null')
    .requiredOption('--message-type <type>', 'Closed ModuleMessage type')
    .requiredOption('--subject-ref-json <json>', 'Closed subject_ref object or null')
    .requiredOption('--resource-refs-json <json>', 'Bounded typed resource_refs array')
    .requiredOption('--sender-kind <kind>', 'program_orchestrator or human')
    .requiredOption('--sender-principal <ref>', 'Authenticated local sender principal reference')
    .requiredOption('--body <summary>', 'Bounded untrusted summary')
    .requiredOption('--created-at <timestamp>', 'Stable RFC3339 creation time')
    .option('--json', 'Output JSON')
    .action((options: {
      messageId: string;
      capabilityId: string;
      targetEngineerId: string;
      scope: string;
      targetBindingId: string;
      targetBindingGeneration: string;
      targetEngineerContractRevision: string;
      messageType: string;
      subjectRefJson: string;
      resourceRefsJson: string;
      senderKind: string;
      senderPrincipal: string;
      body: string;
      createdAt: string;
      json?: boolean;
    }) => run(() => {
      if (options.senderKind !== 'program_orchestrator' && options.senderKind !== 'human') {
        throw new CliArgumentError('--sender-kind must be program_orchestrator or human');
      }
      const event = buildModuleMessageEvent({
        message_id: options.messageId,
        capability_id: options.capabilityId,
        target_engineer_id: options.targetEngineerId,
        scope: options.scope as ModuleMessageScope,
        target_binding_id: nullableOption(options.targetBindingId, 'target-binding-id'),
        target_binding_generation: nullableIntegerOption(options.targetBindingGeneration, 'target-binding-generation'),
        target_engineer_contract_revision: nullableOption(options.targetEngineerContractRevision, 'target-engineer-contract-revision'),
        message_type: options.messageType as ModuleMessageType,
        subject_ref: jsonOption<ModuleMessageSubjectRefV1 | null>(options.subjectRefJson, 'subject-ref-json'),
        resource_refs: jsonOption<readonly ModuleMessageResourceRefV1[]>(options.resourceRefsJson, 'resource-refs-json'),
        sender: { kind: options.senderKind, principal_ref: options.senderPrincipal, binding_generation: null },
        body: options.body,
        created_at: options.createdAt,
      });
      const result = sendModuleMessage({ repo_root: realpathSync(process.cwd()), event });
      emit(result, options.json, `${result.receipt.delivery_state} ${result.event.message_id} ${result.event.event_digest}`);
    }));
  message
    .command('receive')
    .requiredOption('--authorization-id <id>', 'Server-minted Engineer OAuth authorization ID')
    .option('--json', 'Output JSON')
    .action((options: { authorizationId: string; json?: boolean }) => run(() => {
      const repoRoot = realpathSync(process.cwd());
      const principal = resolveEngineerPrincipal({ repo_root: repoRoot, authorization_id: options.authorizationId });
      const result = receiveModuleInbox({ repo_root: repoRoot, principal });
      emit(result, options.json, result.entries.map((entry) =>
        `${entry.receipt.delivery_state} ${entry.event.message_id} ${entry.event.message_type}`).join('\n'));
    }));
  message
    .command('ack')
    .requiredOption('--authorization-id <id>', 'Server-minted Engineer OAuth authorization ID')
    .requiredOption('--message-id <id>', 'Exact message UUID')
    .option('--json', 'Output JSON')
    .action((options: { authorizationId: string; messageId: string; json?: boolean }) => run(() => {
      const repoRoot = realpathSync(process.cwd());
      const principal = resolveEngineerPrincipal({ repo_root: repoRoot, authorization_id: options.authorizationId });
      const result = acknowledgeModuleMessage({ repo_root: repoRoot, principal, message_id: options.messageId });
      emit(result, options.json, `${result.receipt.delivery_state} ${result.event.message_id}`);
    }));
  engineer.addCommand(message);

  const runtimeEffect = new Command('runtime-effect')
    .description('Journal provider-neutral Agent Runtime effects; Host actions remain closed and receipt-proven');
  runtimeEffect
    .command('capability')
    .requiredOption('--adapter-kind <kind>', 'codex-app-thread or tmux-cli-agent')
    .requiredOption('--host-id <id>', 'Exact host ID')
    .requiredOption('--operations-json <json>', 'Exact capability status per runtime operation')
    .requiredOption('--evidence-refs-json <json>', 'Bounded capability evidence references')
    .requiredOption('--observed-at <timestamp>', 'Stable RFC3339 observation time')
    .option('--json', 'Output JSON')
    .action((options: {
      adapterKind: AgentRuntimeAdapterKind;
      hostId: string;
      operationsJson: string;
      evidenceRefsJson: string;
      observedAt: string;
      json?: boolean;
    }) => run(() => {
      const observation = recordAgentRuntimeCapability(realpathSync(process.cwd()), {
        adapter_kind: options.adapterKind,
        host_id: options.hostId,
        operations: jsonOption<Readonly<Record<AgentRuntimeOperation, AgentRuntimeCapabilityStatus>>>(
          options.operationsJson,
          'operations-json',
        ),
        evidence_refs: jsonOption<readonly { readonly ref: string; readonly sha256: string }[]>(
          options.evidenceRefsJson,
          'evidence-refs-json',
        ),
        observed_at: options.observedAt,
      });
      emit(observation, options.json, `${observation.host_id} ${observation.capability_sha256}`);
    }));
  runtimeEffect
    .command('prepare-module')
    .requiredOption('--engineer-id <id>', 'Exact engineer_id')
    .requiredOption('--message-id <id>', 'Exact persisted ME-1C message UUID')
    .requiredOption('--idempotency-key <key>', 'Stable effect retry key')
    .requiredOption('--expected-binding-id <id>', 'Exact current Binding UUID')
    .requiredOption('--expected-binding-generation <n>', 'Exact current Binding generation')
    .requiredOption('--expected-engineer-contract-revision <digest>', 'Exact Engineer contract revision')
    .requiredOption('--expected-capability-sha256 <digest>', 'Exact capability observation digest')
    .requiredOption('--created-at <timestamp>', 'Stable RFC3339 intent creation time')
    .option('--json', 'Output JSON')
    .action((options: {
      engineerId: string;
      messageId: string;
      idempotencyKey: string;
      expectedBindingId: string;
      expectedBindingGeneration: string;
      expectedEngineerContractRevision: string;
      expectedCapabilitySha256: string;
      createdAt: string;
      json?: boolean;
    }) => run(() => {
      const status = prepareAgentRuntimeEffect({
        repo_root: realpathSync(process.cwd()),
        message_kind: 'module_message',
        engineer_id: options.engineerId,
        message_id: options.messageId,
        idempotency_key: options.idempotencyKey,
        expected_binding_id: options.expectedBindingId,
        expected_binding_generation: integerOption(options.expectedBindingGeneration, 'expected-binding-generation'),
        expected_engineer_contract_revision: options.expectedEngineerContractRevision,
        expected_capability_sha256: options.expectedCapabilitySha256,
        created_at: options.createdAt,
      });
      emit(status, options.json, `${status.current.state} ${status.intent.effect_id}`);
    }));
  runtimeEffect
    .command('prepare-task')
    .requiredOption('--task-id <digest>', 'Exact Task ID')
    .requiredOption('--message-id <id>', 'Exact persisted Task message UUID')
    .requiredOption('--idempotency-key <key>', 'Stable effect retry key')
    .requiredOption('--expected-task-revision <digest>', 'Exact Task revision')
    .requiredOption('--expected-claim-id <id>', 'Exact bound Claim UUID')
    .requiredOption('--expected-lease-generation <n>', 'Exact bound Lease generation')
    .requiredOption('--expected-capability-sha256 <digest>', 'Exact capability observation digest')
    .requiredOption('--created-at <timestamp>', 'Stable RFC3339 intent creation time')
    .option('--json', 'Output JSON')
    .action((options: {
      taskId: string; messageId: string; idempotencyKey: string; expectedTaskRevision: string;
      expectedClaimId: string; expectedLeaseGeneration: string; expectedCapabilitySha256: string;
      createdAt: string; json?: boolean;
    }) => run(() => {
      const status = prepareAgentRuntimeEffect({
        repo_root: realpathSync(process.cwd()), message_kind: 'task_message', task_id: options.taskId,
        message_id: options.messageId, idempotency_key: options.idempotencyKey,
        expected_task_revision: options.expectedTaskRevision, expected_claim_id: options.expectedClaimId,
        expected_lease_generation: integerOption(options.expectedLeaseGeneration, 'expected-lease-generation'),
        expected_capability_sha256: options.expectedCapabilitySha256, created_at: options.createdAt,
      });
      emit(status, options.json, `${status.current.state} ${status.intent.effect_id}`);
    }));
  runtimeEffect
    .command('start')
    .requiredOption('--effect-id <digest>', 'Exact prepared effect ID')
    .requiredOption('--started-at <timestamp>', 'Stable RFC3339 admission time')
    .option('--json', 'Output JSON')
    .action((options: { effectId: string; startedAt: string; json?: boolean }) => run(() => {
      const result = startAgentRuntimeEffect({
        repo_root: realpathSync(process.cwd()),
        effect_id: options.effectId,
        started_at: options.startedAt,
      });
      emit(result, options.json, result.action
        ? `host-action ${result.action.action_sha256}`
        : `${result.current.state} no-action`);
    }));
  runtimeEffect
    .command('observe')
    .requiredOption('--effect-id <digest>', 'Exact started effect ID')
    .requiredOption('--adapter-observation-json <json>', 'Closed adapter observation; never Provider prose or pane output')
    .option('--receipt-wait-exhausted', 'The bounded receipt observation window ended')
    .requiredOption('--observed-at <timestamp>', 'Stable RFC3339 observation time')
    .option('--json', 'Output JSON')
    .action((options: {
      effectId: string;
      adapterObservationJson: string;
      receiptWaitExhausted?: boolean;
      observedAt: string;
      json?: boolean;
    }) => run(() => {
      const status = observeAgentRuntimeEffect({
        repo_root: realpathSync(process.cwd()),
        effect_id: options.effectId,
        adapter: jsonOption<AgentRuntimeAdapterObservationV2>(options.adapterObservationJson, 'adapter-observation-json'),
        receipt_wait_exhausted: options.receiptWaitExhausted === true,
        observed_at: options.observedAt,
      });
      emit(status, options.json, `${status.current.state} ${status.intent.effect_id}`);
    }));
  runtimeEffect
    .command('wake-record-offers')
    .description('Record one Engineer offer snapshot and arm at most one durable task-offer wake')
    .requiredOption('--offers-json <json>', 'Exact EngineerOffersV1 document from the offer authority')
    .requiredOption('--observed-at <timestamp>', 'Stable RFC3339 observation time')
    .requiredOption('--expected-capability-sha256 <digest>', 'Exact capability observation digest')
    .requiredOption('--debounce-ms <n>', 'Bounded wake coalescing window in milliseconds')
    .option('--polling-fallback', 'Permit scheduled polling when the adapter cannot wake')
    .option('--json', 'Output JSON')
    .action((options: {
      offersJson: string; observedAt: string; expectedCapabilitySha256: string; debounceMs: string;
      pollingFallback?: boolean; json?: boolean;
    }) => run(() => {
      const result = recordEngineerOfferSnapshot({
        repo_root: realpathSync(process.cwd()),
        offers: jsonOption<EngineerOffersV1>(options.offersJson, 'offers-json'),
        observed_at: options.observedAt,
        expected_capability_sha256: options.expectedCapabilitySha256,
        wake_policy: {
          debounce_ms: integerOption(options.debounceMs, 'debounce-ms'),
          polling_fallback_enabled: options.pollingFallback === true,
        },
      });
      emit(result, options.json, `${result.outcome} ${result.cause} ${result.status?.intent.effect_id ?? 'no-effect'}`);
    }));
  runtimeEffect
    .command('wake-status')
    .description('Read due task-offer wakes and one Binding wake ledger without host authority')
    .requiredOption('--now <timestamp>', 'Stable RFC3339 evaluation time')
    .option('--engineer-id <id>', 'Filter wakes by exact Engineer ID')
    .option('--binding-id <id>', 'Read the exact Binding wake ledger')
    .option('--binding-generation <n>', 'Exact Binding generation of the ledger to read')
    .option('--json', 'Output JSON')
    .action((options: { now: string; engineerId?: string; bindingId?: string; bindingGeneration?: string; json?: boolean }) => run(() => {
      const repoRoot = realpathSync(process.cwd());
      if (options.bindingId !== undefined || options.bindingGeneration !== undefined) {
        if (options.engineerId === undefined || options.bindingId === undefined || options.bindingGeneration === undefined) {
          throw new CliArgumentError('--engineer-id, --binding-id and --binding-generation must be given together');
        }
        const ledger = readOfferWakeLedger(repoRoot, {
          engineer_id: options.engineerId,
          binding_id: options.bindingId,
          binding_generation: integerOption(options.bindingGeneration, 'binding-generation'),
        });
        emit(ledger, options.json, ledger ? `${ledger.observed.snapshot_revision} ${ledger.pending?.effect_id ?? 'no-pending-wake'}` : 'no-ledger');
        return;
      }
      const due = listDueOfferWakes(repoRoot, { now: options.now, engineer_id: options.engineerId });
      emit(due, options.json, due.length === 0 ? 'no-due-wake' : due.map((item) => `${item.state} ${item.wake_reason} ${item.effect_id}`).join('\n'));
    }));
  runtimeEffect
    .command('wake-receipt')
    .description('Record the controller-step receipt that proves one bounded step ran for this wake')
    .requiredOption('--effect-id <digest>', 'Exact started wake effect ID')
    .requiredOption('--control-ref <ref>', 'Exact bounded wake control reference from the Host action')
    .requiredOption('--observed-snapshot-revision <digest>', 'Offer snapshot revision the controller re-read')
    .requiredOption('--observed-at <timestamp>', 'Stable RFC3339 observation time')
    .option('--json', 'Output JSON')
    .action((options: { effectId: string; controlRef: string; observedSnapshotRevision: string; observedAt: string; json?: boolean }) => run(() => {
      const receipt = recordAgentRuntimeControllerStep({
        repo_root: realpathSync(process.cwd()),
        effect_id: options.effectId,
        control_ref: options.controlRef,
        observed_snapshot_revision: options.observedSnapshotRevision,
        observed_at: options.observedAt,
      });
      emit(receipt, options.json, `${receipt.effect_id} ${receipt.receipt_sha256}`);
    }));
  runtimeEffect
    .command('migrate-v1')
    .requiredOption('--migrated-at <timestamp>', 'Stable RFC3339 migration time')
    .option('--json', 'Output JSON')
    .action((options: { migratedAt: string; json?: boolean }) => run(() => {
      const result = migrateProviderThreadEffectsV1(realpathSync(process.cwd()), options.migratedAt);
      emit(result, options.json, result ? `${result.source_tree_sha256} ${result.archive_relative_path}` : 'no-v1-store');
    }));
  runtimeEffect
    .command('status')
    .option('--effect-id <digest>', 'Exact effect ID')
    .option('--engineer-id <id>', 'Filter effects by exact Engineer ID')
    .option('--json', 'Output JSON')
    .action((options: { effectId?: string; engineerId?: string; json?: boolean }) => run(() => {
      const repoRoot = realpathSync(process.cwd());
      if (options.effectId) {
        const result = readAgentRuntimeEffectStatus(repoRoot, options.effectId);
        emit(result, options.json, `${result.current.state} ${result.intent.effect_id}`);
        return;
      }
      const result = listAgentRuntimeEffects(repoRoot, options.engineerId);
      emit(result, options.json, result.map((item) =>
        `${item.current.state} ${item.intent.effect_id}`).join('\n'));
    }));
  engineer.addCommand(runtimeEffect);

  const principal = new Command('principal').description('Manage OAuth authorization mappings to current Module Engineer Bindings');
  principal
    .command('list')
    .option('--json', 'Output JSON')
    .action((options: { json?: boolean }) => run(() => {
      const repoRoot = realpathSync(process.cwd());
      const repositoryId = repoHarnessRepoIdFor(repoRoot);
      const tokenStore = new McpOAuthTokenStore(mcpOAuthTokenStorePath());
      tokenStore.load();
      const mappings = new Map(listEngineerPrincipalMappings()
        .filter((mapping) => mapping.repository_id === repositoryId)
        .map((mapping) => [mapping.authorization_id, mapping]));
      const result = tokenStore.listAuthorizations('engineer').map((authorization) => ({
        authorization_id: authorization.authorizationId,
        client_id: authorization.clientId,
        scopes: authorization.scopes,
        expires_at: authorization.expiresAt,
        mapping: mappings.get(authorization.authorizationId) ?? null,
      }));
      emit(result, options.json, result.map((entry) => `${entry.authorization_id} ${entry.mapping?.state ?? 'unmapped'}`).join('\n'));
    }));
  principal
    .command('status')
    .requiredOption('--authorization-id <id>', 'Server-minted Engineer OAuth authorization ID')
    .option('--json', 'Output JSON')
    .action((options: { authorizationId: string; json?: boolean }) => run(() => {
      const repositoryId = repoHarnessRepoIdFor(realpathSync(process.cwd()));
      const mapping = readEngineerPrincipalMapping(repositoryId, options.authorizationId);
      const result = { repository_id: repositoryId, authorization_id: options.authorizationId, mapping };
      emit(result, options.json, mapping ? `${mapping.state} ${mapping.engineer_id} generation=${mapping.binding_generation}` : 'unmapped');
    }));
  principal
    .command('enroll')
    .requiredOption('--authorization-id <id>', 'Server-minted Engineer OAuth authorization ID')
    .requiredOption('--engineer-id <id>', 'Exact engineer_id')
    .requiredOption('--expected-binding-id <id>', 'Exact current Binding UUID')
    .requiredOption('--expected-binding-generation <n>', 'Exact current Binding generation')
    .requiredOption('--expected-engineer-contract-revision <digest>', 'Exact current Engineer contract revision')
    .option('--json', 'Output JSON')
    .action((options: {
      authorizationId: string;
      engineerId: string;
      expectedBindingId: string;
      expectedBindingGeneration: string;
      expectedEngineerContractRevision: string;
      json?: boolean;
    }) => run(() => {
      const repoRoot = realpathSync(process.cwd());
      const repositoryId = repoHarnessRepoIdFor(repoRoot);
      const tokenStore = new McpOAuthTokenStore(mcpOAuthTokenStorePath());
      tokenStore.load();
      if (!tokenStore.listAuthorizations('engineer').some((authorization) => authorization.authorizationId === options.authorizationId)) {
        throw new EngineerPrincipalError('engineer_principal_unmapped', 'authorization ID is not an issued Engineer OAuth authorization');
      }
      const resolved = loadEngineerProfile(repoRoot, options.engineerId);
      const status = readEngineerBindingStatus(repoRoot, options.engineerId, resolved.engineer_contract_revision);
      const binding = status.binding;
      const expectedGeneration = integerOption(options.expectedBindingGeneration, 'expected-binding-generation');
      if (!binding || binding.state !== 'active' || status.current.state !== 'active') {
        throw new EngineerPrincipalError('engineer_principal_stale', 'current Engineer Binding is not active');
      }
      if (binding.binding_id !== options.expectedBindingId
        || binding.binding_generation !== expectedGeneration
        || binding.engineer_contract_revision !== options.expectedEngineerContractRevision
        || resolved.engineer_contract_revision !== options.expectedEngineerContractRevision) {
        throw new EngineerPrincipalError('engineer_principal_mismatch', 'enrollment fences do not match the exact current Engineer Binding');
      }
      const mapping = enrollEngineerPrincipal({
        repository_id: repositoryId,
        authorization_id: options.authorizationId,
        binding,
      });
      emit(mapping, options.json, `${mapping.state} ${mapping.engineer_id} generation=${mapping.binding_generation}`);
    }));
  principal
    .command('revoke')
    .requiredOption('--authorization-id <id>', 'Server-minted Engineer OAuth authorization ID')
    .option('--json', 'Output JSON')
    .action((options: { authorizationId: string; json?: boolean }) => run(() => {
      const repositoryId = repoHarnessRepoIdFor(realpathSync(process.cwd()));
      const mapping = revokeEngineerPrincipal(repositoryId, options.authorizationId);
      emit(mapping, options.json, `${mapping.state} ${mapping.engineer_id} generation=${mapping.binding_generation}`);
    }));
  engineer.addCommand(principal);

  engineer
    .command('bootstrap-prompt')
    .requiredOption('--engineer-id <id>', 'Exact engineer_id')
    .option('--json', 'Output JSON')
    .action((options: { engineerId: string; json?: boolean }) => run(() => {
      const resolved = loadEngineerProfile(process.cwd(), options.engineerId);
      const status = readEngineerBindingStatus(process.cwd(), options.engineerId, resolved.engineer_contract_revision);
      const capsule = buildEngineerBootstrapPrompt(resolved, status.current);
      emit(capsule, options.json, capsule.prompt);
    }));

  return engineer;
}
