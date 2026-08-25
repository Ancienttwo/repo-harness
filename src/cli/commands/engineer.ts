import { Command } from 'commander';
import { realpathSync } from 'fs';

import { EngineerProfileBindingError } from '../../core/engineers/profile-binding';
import { EngineerPrincipalError } from '../../core/engineers/principal-claim';
import { EngineerSchedulingError } from '../../core/engineers/scheduling';
import {
  ModuleMessageError,
  buildModuleMessageEvent,
  type ModuleMessageResourceRefV1,
  type ModuleMessageScope,
  type ModuleMessageSubjectRefV1,
  type ModuleMessageType,
} from '../../core/engineers/module-message';
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
import {
  ModuleInboxError,
  acknowledgeModuleMessage,
  receiveModuleInbox,
  sendModuleMessage,
} from '../../effects/engineers/module-inbox';
import { mcpOAuthTokenStorePath } from '../mcp/auth';
import { McpOAuthTokenStore } from '../mcp/oauth';

function emit(value: unknown, json: boolean | undefined, human: string): void {
  process.stdout.write(json === true ? `${JSON.stringify(value, null, 2)}\n` : `${human}\n`);
}

function emitError(error: unknown): void {
  const code = error instanceof EngineerProfileBindingError || error instanceof EngineerPrincipalError
    || error instanceof EngineerSchedulingError || error instanceof ModuleMessageError || error instanceof ModuleInboxError
    ? error.code
    : 'engineer_binding_invalid';
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
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`--${field} must be a non-negative integer`);
  return parsed;
}

function nullableOption(value: string, field: string): string | null {
  if (value === 'null') return null;
  if (value.length === 0) throw new Error(`--${field} must be a non-empty value or null`);
  return value;
}

function nullableIntegerOption(value: string, field: string): number | null {
  if (value === 'null') return null;
  const parsed = integerOption(value, field);
  if (parsed < 1) throw new Error(`--${field} must be a positive integer or null`);
  return parsed;
}

function jsonOption<T>(value: string, field: string): T {
  try {
    return JSON.parse(value) as T;
  } catch (error) {
    throw new Error(`--${field} must be valid JSON`, { cause: error });
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
    .requiredOption('--provider-thread-id <id>', 'Opaque Provider Thread ID')
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
      if (currentDigest === null || bindingId === null) throw new Error('retire requires non-null expected current and binding IDs');
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
        throw new Error('--sender-kind must be program_orchestrator or human');
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
