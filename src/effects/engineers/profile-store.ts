import { execFileSync } from 'child_process';
import { lstatSync, readFileSync, readdirSync, realpathSync, statSync } from 'fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'path';
import { validateJsonSchema, type Json } from 'archctx-contracts';
import architectureNodeSchema from 'archctx-contracts/schemas/repo/architecture-node.schema.json';

import {
  capabilityRegistryFromArchcontextNodes,
  type ArchcontextNodeFile,
  type Capability,
  type CapabilityRegistry,
} from '../../core/capabilities/registry';
import {
  EngineerProfileBindingError,
  canonicalEngineerJson,
  canonicalModuleEngineerProfileBytes,
  engineerContractRevision,
  engineerSha256,
  validateModuleEngineerProfile,
  type EngineerBindingCurrentV1,
  type ModuleEngineerProfileV1,
} from '../../core/engineers/profile-binding';

const PROFILE_ROOT = 'agents/engineers/profiles';
const SOP_ROOT = 'agents/engineers/sops';
const ARCHCONTEXT_NODE_ROOT = '.archcontext/model/nodes';

export interface ResolvedEngineerProfile {
  readonly profile_path: string;
  readonly profile: ModuleEngineerProfileV1;
  readonly profile_canonical_bytes: string;
  readonly sop_bytes: string;
  readonly capability: Capability;
  readonly capability_revision: string;
  readonly engineer_contract_revision: string;
}

export interface EngineerBootstrapPrompt {
  readonly engineer_id: string;
  readonly engineer_contract_revision: string;
  readonly estimated_tokens: number;
  readonly prompt: string;
}

function invalid(message: string, cause?: unknown): never {
  throw new EngineerProfileBindingError('engineer_profile_invalid', message, cause);
}

export function resolveEngineerRepoRoot(cwd: string): string {
  try {
    return realpathSync(execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim());
  } catch (error) {
    return invalid(`cannot resolve repository root from ${cwd}`, error);
  }
}

function loadTrackedEngineerPaths(repoRoot: string): ReadonlySet<string> {
  try {
    const output = execFileSync('git', ['ls-files', '-z', '--', PROFILE_ROOT, SOP_ROOT], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return new Set(output.split('\0').filter(Boolean));
  } catch (error) {
    return invalid('cannot read tracked Engineer paths from the Git index', error);
  }
}

function resolveTrackedFile(repoRoot: string, repoPath: string, trackedPaths: ReadonlySet<string>): string {
  if (isAbsolute(repoPath) || repoPath.includes('\0')) invalid(`unsafe tracked path: ${repoPath}`);
  const absolute = resolve(repoRoot, repoPath);
  const scoped = relative(repoRoot, absolute);
  if (!scoped || scoped === '..' || scoped.startsWith(`..${sep}`) || isAbsolute(scoped)) {
    invalid(`tracked path escapes repository: ${repoPath}`);
  }
  let current = repoRoot;
  for (const part of scoped.split(sep)) {
    current = join(current, part);
    let stat;
    try {
      stat = lstatSync(current);
    } catch (error) {
      return invalid(`tracked file is missing: ${repoPath}`, error);
    }
    if (stat.isSymbolicLink()) invalid(`tracked path must not contain a symlink: ${repoPath}`);
  }
  if (!lstatSync(absolute).isFile()) invalid(`tracked path is not a file: ${repoPath}`);
  if (!trackedPaths.has(scoped.split(sep).join('/'))) invalid(`tracked file is not present in the Git index: ${repoPath}`);
  return absolute;
}

function readArchcontextNodes(repoRoot: string): readonly ArchcontextNodeFile[] {
  const nodeRoot = resolve(repoRoot, ARCHCONTEXT_NODE_ROOT);
  let entries;
  try {
    entries = readdirSync(nodeRoot, { withFileTypes: true });
  } catch (error) {
    return invalid(`cannot read ${ARCHCONTEXT_NODE_ROOT}`, error);
  }
  return entries
    .filter((entry) => entry.isFile() && (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml')))
    .sort((left, right) => Buffer.compare(Buffer.from(left.name), Buffer.from(right.name)))
    .map((entry) => {
      const path = `${ARCHCONTEXT_NODE_ROOT}/${entry.name}`;
      try {
        return { path, value: Bun.YAML.parse(readFileSync(join(nodeRoot, entry.name), 'utf8')) };
      } catch (error) {
        return invalid(`cannot parse ${path}`, error);
      }
    });
}

interface EngineerCapabilityAuthority {
  readonly nodes: readonly ArchcontextNodeFile[];
  readonly registry: CapabilityRegistry;
}

function loadCapabilityAuthority(repoRoot: string): EngineerCapabilityAuthority {
  const nodes = readArchcontextNodes(repoRoot);
  const resolution = capabilityRegistryFromArchcontextNodes(nodes, {
    repoRoot,
    isExistingDirectory: (path) => {
      try {
        return statSync(resolve(repoRoot, path)).isDirectory();
      } catch {
        return false;
      }
    },
  });
  if (resolution.status !== 'valid') {
    invalid(`ArchContext capability registry is invalid: ${resolution.diagnostics.map((item) => item.message).join('; ')}`);
  }
  return Object.freeze({ nodes, registry: resolution.registry });
}

function resolveCapabilityFromAuthority(authority: EngineerCapabilityAuthority, capabilityId: string): {
  readonly capability: Capability;
  readonly capability_revision: string;
} {
  const match = capabilityId.match(/^capability\.([a-z0-9][a-z0-9-]*)\.([a-z0-9][a-z0-9-]*)$/u);
  if (!match) invalid(`capability_id is invalid: ${capabilityId}`);
  const registryId = `${match[1]}-${match[2]}`;
  const capability = authority.registry.capabilities.find((candidate) => candidate.id === registryId);
  if (!capability) invalid(`capability is not active or does not exist: ${capabilityId}`);
  const matchingNodes = authority.nodes.filter(({ value }) => Boolean(
    value
    && typeof value === 'object'
    && !Array.isArray(value)
    && (value as Record<string, unknown>).id === capabilityId
    && (value as Record<string, unknown>).kind === 'capability'
    && (value as Record<string, unknown>).status === 'active',
  ));
  if (matchingNodes.length !== 1) invalid(`expected exactly one canonical ArchContext node for ${capabilityId}`);
  const validation = validateJsonSchema(architectureNodeSchema, matchingNodes[0].value as Json);
  if (!validation.valid) {
    invalid(`canonical ArchContext node is invalid: ${validation.issues.map((issue) => `${issue.path} ${issue.message}`).join('; ')}`);
  }
  const canonical = canonicalEngineerJson(matchingNodes[0].value);
  return Object.freeze({ capability: Object.freeze({ ...capability }), capability_revision: engineerSha256(canonical) });
}

export function resolveCapabilityForEngineer(repoRoot: string, capabilityId: string): {
  readonly capability: Capability;
  readonly capability_revision: string;
} {
  return resolveCapabilityFromAuthority(loadCapabilityAuthority(repoRoot), capabilityId);
}

function readProfileFile(
  repoRoot: string,
  profilePath: string,
  capabilityAuthority: EngineerCapabilityAuthority,
  trackedPaths: ReadonlySet<string>,
): ResolvedEngineerProfile {
  const profileAbsolute = resolveTrackedFile(repoRoot, profilePath, trackedPaths);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(profileAbsolute, 'utf8'));
  } catch (error) {
    return invalid(`cannot parse ${profilePath}`, error);
  }
  const profile = validateModuleEngineerProfile(parsed);
  const sopAbsolute = resolveTrackedFile(repoRoot, profile.sop_ref, trackedPaths);
  if (dirname(sopAbsolute) !== resolve(repoRoot, SOP_ROOT)) {
    invalid(`SOP is outside the tracked Engineer SOP root: ${profile.sop_ref}`);
  }
  let sopBytes: string;
  try {
    sopBytes = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(readFileSync(sopAbsolute));
  } catch (error) {
    return invalid(`SOP is not valid UTF-8: ${profile.sop_ref}`, error);
  }
  const resolvedCapability = resolveCapabilityFromAuthority(capabilityAuthority, profile.capability_id);
  return Object.freeze({
    profile_path: profilePath,
    profile,
    profile_canonical_bytes: canonicalModuleEngineerProfileBytes(profile),
    sop_bytes: sopBytes,
    capability: resolvedCapability.capability,
    capability_revision: resolvedCapability.capability_revision,
    engineer_contract_revision: engineerContractRevision(
      profile,
      sopBytes,
      resolvedCapability.capability_revision,
    ),
  });
}

export function listEngineerProfiles(cwd: string): readonly ResolvedEngineerProfile[] {
  const repoRoot = resolveEngineerRepoRoot(cwd);
  const capabilityAuthority = loadCapabilityAuthority(repoRoot);
  const trackedPaths = loadTrackedEngineerPaths(repoRoot);
  const root = resolve(repoRoot, PROFILE_ROOT);
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch (error) {
    return invalid(`cannot read ${PROFILE_ROOT}`, error);
  }
  const profiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .sort((left, right) => Buffer.compare(Buffer.from(left.name), Buffer.from(right.name)))
    .map((entry) => readProfileFile(repoRoot, `${PROFILE_ROOT}/${entry.name}`, capabilityAuthority, trackedPaths));
  const ids = new Set<string>();
  for (const profile of profiles) {
    if (ids.has(profile.profile.engineer_id)) invalid(`duplicate engineer_id: ${profile.profile.engineer_id}`);
    ids.add(profile.profile.engineer_id);
  }
  return Object.freeze(profiles);
}

export function loadEngineerProfile(cwd: string, engineerId: string): ResolvedEngineerProfile {
  const matches = listEngineerProfiles(cwd).filter((candidate) => candidate.profile.engineer_id === engineerId);
  if (matches.length !== 1) invalid(`expected exactly one Profile for ${engineerId}; found ${matches.length}`);
  return matches[0];
}

export function buildEngineerBootstrapPrompt(
  resolved: ResolvedEngineerProfile,
  current: EngineerBindingCurrentV1,
): EngineerBootstrapPrompt {
  if (current.engineer_id !== resolved.profile.engineer_id) invalid('binding current engineer_id does not match Profile');
  if (current.engineer_contract_revision !== resolved.engineer_contract_revision) {
    invalid('binding current Engineer contract revision is stale');
  }
  const prompt = [
    '[RepoHarnessModuleEngineerV1]',
    `engineer_id=${resolved.profile.engineer_id}`,
    `capability_id=${resolved.profile.capability_id}`,
    `engineer_contract_revision=${resolved.engineer_contract_revision}`,
    `sop_ref=${resolved.profile.sop_ref}`,
    `architecture_module=${resolved.capability.architecture_module}`,
    `workstream_dir=${resolved.capability.workstream_dir}`,
    `binding_state=${current.state}`,
    `binding_generation=${current.binding_generation}`,
    `binding_id=${current.current_binding_id ?? 'none'}`,
    'authority=read-only bootstrap; no credential, Claim, Lease, Publication, Acceptance, or task mutation authority',
    '[/RepoHarnessModuleEngineerV1]',
  ].join('\n');
  return Object.freeze({
    engineer_id: resolved.profile.engineer_id,
    engineer_contract_revision: resolved.engineer_contract_revision,
    estimated_tokens: Math.ceil(Buffer.byteLength(prompt, 'utf8') / 4),
    prompt,
  });
}
