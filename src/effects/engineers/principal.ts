import { realpathSync } from 'fs';

import {
  ENGINEER_PRINCIPAL_KIND,
  ENGINEER_PRINCIPAL_PROTOCOL,
  EngineerPrincipalError,
  validateEngineerPrincipal,
  type EngineerObservedProvider,
  type EngineerPrincipalV1,
} from '../../core/engineers/principal-claim';
import { repoHarnessRepoIdFor } from '../repo-registry';
import { readEngineerBindingStatus } from './binding-store';
import { readEngineerPrincipalMapping } from './principal-store';
import { loadEngineerProfile } from './profile-store';

const PROVIDERS = new Set<EngineerObservedProvider>(['codex', 'claude', 'worker_host', 'unknown', 'codex-app-thread', 'tmux-cli-agent']);

export interface EngineerPrincipalFences {
  readonly engineer_id?: string;
  readonly binding_id?: string;
  readonly binding_generation?: number;
  readonly engineer_contract_revision?: string;
}

export interface ResolveEngineerPrincipalInput {
  readonly repo_root: string;
  readonly authorization_id: string;
  readonly fences?: EngineerPrincipalFences;
  readonly env?: NodeJS.ProcessEnv;
}

function mismatch(condition: boolean, message: string): void {
  if (condition) throw new EngineerPrincipalError('engineer_principal_mismatch', message);
}

export function resolveEngineerPrincipal(input: ResolveEngineerPrincipalInput): EngineerPrincipalV1 {
  const repoRoot = realpathSync(input.repo_root);
  const repositoryId = repoHarnessRepoIdFor(repoRoot);
  const mapping = readEngineerPrincipalMapping(repositoryId, input.authorization_id, input.env);
  if (!mapping) throw new EngineerPrincipalError('engineer_principal_unmapped', 'authorization is not mapped to an Engineer Binding');
  if (mapping.state !== 'active') throw new EngineerPrincipalError('engineer_principal_revoked', 'authorization principal mapping is revoked');

  const profile = loadEngineerProfile(repoRoot, mapping.engineer_id);
  const status = readEngineerBindingStatus(repoRoot, mapping.engineer_id, profile.engineer_contract_revision);
  const binding = status.binding;
  if (!binding || status.current.state !== 'active' || binding.state !== 'active') {
    throw new EngineerPrincipalError('engineer_principal_stale', 'mapped Engineer Binding is not active');
  }
  if (binding.binding_id !== mapping.binding_id
    || binding.binding_generation !== mapping.binding_generation
    || binding.engineer_contract_revision !== mapping.engineer_contract_revision
    || profile.engineer_contract_revision !== mapping.engineer_contract_revision) {
    throw new EngineerPrincipalError('engineer_principal_stale', 'principal mapping no longer matches the current Engineer Binding');
  }
  const fences = input.fences ?? {};
  mismatch(fences.engineer_id !== undefined && fences.engineer_id !== mapping.engineer_id, 'engineer_id fence does not match authenticated principal');
  mismatch(fences.binding_id !== undefined && fences.binding_id !== mapping.binding_id, 'binding_id fence does not match authenticated principal');
  mismatch(fences.binding_generation !== undefined && fences.binding_generation !== mapping.binding_generation, 'binding_generation fence does not match authenticated principal');
  mismatch(fences.engineer_contract_revision !== undefined && fences.engineer_contract_revision !== mapping.engineer_contract_revision, 'engineer_contract_revision fence does not match authenticated principal');
  if (!PROVIDERS.has(binding.provider as EngineerObservedProvider)) {
    throw new EngineerPrincipalError('engineer_principal_invalid', 'Binding provider is not supported by EngineerPrincipalV1');
  }
  return validateEngineerPrincipal({
    protocol: ENGINEER_PRINCIPAL_PROTOCOL,
    kind: ENGINEER_PRINCIPAL_KIND,
    repository_id: repositoryId,
    engineer_id: mapping.engineer_id,
    binding_id: mapping.binding_id,
    binding_generation: mapping.binding_generation,
    engineer_contract_revision: mapping.engineer_contract_revision,
    carrier: 'mcp_oauth',
    auth_subject: input.authorization_id,
    provider: binding.provider,
    provider_thread_id: binding.provider_thread_id,
  });
}
