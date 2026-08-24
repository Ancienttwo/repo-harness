import { Command } from 'commander';
import { realpathSync } from 'fs';

import { EngineerProfileBindingError } from '../../core/engineers/profile-binding';
import { EngineerPrincipalError } from '../../core/engineers/principal-claim';
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
import { mcpOAuthTokenStorePath } from '../mcp/auth';
import { McpOAuthTokenStore } from '../mcp/oauth';

function emit(value: unknown, json: boolean | undefined, human: string): void {
  process.stdout.write(json === true ? `${JSON.stringify(value, null, 2)}\n` : `${human}\n`);
}

function emitError(error: unknown): void {
  const code = error instanceof EngineerProfileBindingError || error instanceof EngineerPrincipalError
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
