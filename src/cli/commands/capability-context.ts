import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import {
  CapabilitySourceError,
  capabilitySourceMode,
  findMatch,
  readArchcontextNodeFiles,
  readArchcontextOwners,
  readRegistry as readCapabilityRegistry,
  type Capability,
  type CapabilityRegistry,
  type ContractFiles,
} from '../../../scripts/capability-resolver';
import { resolveArchcontextCapabilityPaths } from '../../effects/capabilities/archcontext-owners';

export type { Capability, ContractFiles };

type SourceMapEntry = {
  label: string;
  path: string;
  role: string;
};

type ManifestCapability = {
  positioning?: string;
  source_map?: SourceMapEntry[];
  refresh_hints?: string[];
};

type SourceMapManifest = {
  version: number;
  capabilities: Record<string, ManifestCapability>;
};

export type CapabilityContextStatus = {
  repo: string;
  registry_file: string;
  source_map_manifest: string;
  capabilities: Array<{
    id: string;
    primary_prefix: string;
    target_contract_files: ContractFiles;
    current_contract_files: ContractFiles;
    normalized: boolean;
    agents_exists: boolean;
    claude_exists: boolean;
    manifest_entry: boolean;
  }>;
};

type SyncOptions = {
  repo?: string;
  capabilityId?: string;
  inputPath?: string;
  apply?: boolean;
  sourceMapManifest?: string;
  autoFillPositioning?: boolean;
};

type SyncChange = {
  capability_id: string;
  target_contract_files: ContractFiles;
  registry_normalized: boolean;
  wrote_contracts: boolean;
  manifest_entry: boolean;
};

export type SyncResult = {
  repo: string;
  apply: boolean;
  changes: SyncChange[];
  lines: string[];
};

const REGISTRY_PATH = '.ai/context/capabilities.json';
const NODES_DIR = '.archcontext/model/nodes';
const DEFAULT_MANIFEST_PATH = '.ai/context/capability-source-map.json';
const BEGIN = '<!-- BEGIN CAPABILITY CONTEXT -->';
const END = '<!-- END CAPABILITY CONTEXT -->';

function repoRoot(input = '.'): string {
  const cwd = path.resolve(input);
  try {
    const out = execFileSync('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return out ? path.resolve(out) : cwd;
  } catch {
    return cwd;
  }
}

function normalizeRepoPath(value: string, repo: string, allowRoot = false): string {
  let next = value.trim().replace(/^file:\/\//, '').replaceAll('\\', '/');
  const normalizedRepo = repo.replaceAll('\\', '/');

  if (next.startsWith(`${normalizedRepo}/`)) {
    next = next.slice(normalizedRepo.length + 1);
  } else if (next === normalizedRepo && allowRoot) {
    next = '.';
  } else if (next.startsWith('/')) {
    throw new Error(`absolute path is outside repo: ${value}`);
  }

  next = next.replace(/^\.\//, '').replace(/\/+$/, '');
  if (next === '') next = '.';
  if (next === '.' && allowRoot) return '.';
  const parts = next.split('/').filter(Boolean);
  if (parts.length === 0) throw new Error('path must not be empty');
  if (parts.some((part) => part === '.' || part === '..')) {
    throw new Error(`path must not contain traversal: ${value}`);
  }
  return parts.join('/');
}

function readJsonFile<T>(file: string, fallback: T): T {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as T;
  } catch {
    return fallback;
  }
}

function writeJsonFile(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function readRegistry(repo: string): CapabilityRegistry {
  return readCapabilityRegistry(repo);
}

/** The file or directory that owns capabilities under the active source mode. */
function capabilityAuthorityPath(repo: string): string {
  return capabilitySourceMode(repo) === 'archcontext' ? NODES_DIR : REGISTRY_PATH;
}

function writeRegistry(repo: string, registry: CapabilityRegistry): void {
  writeJsonFile(path.join(repo, REGISTRY_PATH), registry);
}

function readManifest(repo: string, manifestPath = DEFAULT_MANIFEST_PATH): SourceMapManifest {
  const file = path.resolve(repo, manifestPath);
  const parsed = readJsonFile<Partial<SourceMapManifest>>(file, {});
  return {
    version: parsed.version ?? 1,
    capabilities:
      parsed.capabilities && typeof parsed.capabilities === 'object'
        ? parsed.capabilities
        : {},
  };
}

function writeManifest(repo: string, manifestPath: string, manifest: SourceMapManifest): void {
  writeJsonFile(path.resolve(repo, manifestPath), manifest);
}

function isLikelyFile(repo: string, relPath: string): boolean {
  const abs = path.join(repo, relPath);
  if (fs.existsSync(abs)) return fs.statSync(abs).isFile();
  return path.extname(path.basename(relPath)) !== '';
}

function derivedContractFiles(repo: string, capability: Capability): ContractFiles {
  const primary = normalizeRepoPath(capability.prefixes[0] || '.', repo, true);
  const dir = primary === '.'
    ? '.'
    : isLikelyFile(repo, primary)
      ? path.dirname(primary).replaceAll('\\', '/')
      : primary;
  if (dir === '.' || dir === '') {
    return { agents: 'AGENTS.md', claude: 'CLAUDE.md' };
  }
  return {
    agents: `${dir}/AGENTS.md`,
    claude: `${dir}/CLAUDE.md`,
  };
}

/**
 * Under `archcontext` the node declares its contract files in
 * `extensions.contractFiles`; that declaration is the target. Under `registry`
 * the target is derived from the primary prefix and sync normalizes the registry.
 */
function targetContractFiles(repo: string, capability: Capability): ContractFiles {
  return capabilitySourceMode(repo) === 'archcontext' ? { ...capability.contract_files } : derivedContractFiles(repo, capability);
}

/** Node summaries by registry id. Under `archcontext` the block positioning comes from the node. */
function archcontextSummaries(repo: string): Map<string, string> {
  const summaries = new Map<string, string>();
  for (const { value } of readArchcontextNodeFiles(repo)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const node = value as Record<string, unknown>;
    const parts = typeof node.id === 'string' ? node.id.split('.') : [];
    if (node.kind === 'capability' && parts.length === 3 && typeof node.summary === 'string') summaries.set(`${parts[1]}-${parts[2]}`, node.summary);
  }
  return summaries;
}

// Delegates ownership to the selected authority: capability-resolver's findMatch
// under `registry` (see .ai/harness/policy.json capability_match_rule), and
// `archctx resolve` under `archcontext`. Nothing here re-implements either rule.
function findCapabilityByPath(registry: CapabilityRegistry, repo: string, inputPath: string): Capability {
  if (capabilitySourceMode(repo) === 'archcontext') {
    const resolution = resolveArchcontextCapabilityPaths(repo, readArchcontextOwners(repo), [inputPath]);
    if (resolution.status !== 'valid') throw new Error(resolution.diagnostics.map((item) => item.message).join('; '));
    if (resolution.matches.length === 1) return resolution.matches[0].capability;
  } else {
    const match = findMatch(registry, repo, inputPath);
    if (match.matched) return findCapabilityById(registry, match.capability_id);
  }
  throw new Error(`no capability matches path: ${inputPath}`);
}

function findCapabilityById(registry: CapabilityRegistry, id: string): Capability {
  const capability = registry.capabilities.find((entry) => entry.id === id);
  if (!capability) throw new Error(`unknown capability: ${id}`);
  return capability;
}

export function runCapabilityContextStatus(repoInput = '.', manifestPath = DEFAULT_MANIFEST_PATH): CapabilityContextStatus {
  const repo = repoRoot(repoInput);
  const registry = readRegistry(repo);
  const manifest = readManifest(repo, manifestPath);
  return {
    repo,
    registry_file: capabilityAuthorityPath(repo),
    source_map_manifest: manifestPath,
    capabilities: registry.capabilities.map((capability) => {
      const target = targetContractFiles(repo, capability);
      const current = capability.contract_files || { agents: '', claude: '' };
      return {
        id: capability.id,
        primary_prefix: capability.prefixes[0] || '',
        target_contract_files: target,
        current_contract_files: current,
        normalized: current.agents === target.agents && current.claude === target.claude,
        agents_exists: fs.existsSync(path.join(repo, target.agents)),
        claude_exists: fs.existsSync(path.join(repo, target.claude)),
        manifest_entry: Boolean(manifest.capabilities[capability.id]),
      };
    }),
  };
}

function defaultManifestEntry(capability: Capability, authorityPath: string): ManifestCapability {
  return {
    positioning: `Owns the ${capability.id} capability boundary declared in ${authorityPath}.`,
    source_map: [
      { label: 'Primary prefix', path: capability.prefixes[0] || '.', role: 'entrypoint' },
      { label: 'Architecture module', path: capability.architecture_module, role: 'design-source' },
      { label: 'Workstream', path: capability.workstream_dir, role: 'durable-progress' },
    ],
    refresh_hints: capability.verification_hints?.length
      ? capability.verification_hints
      : ['record local commands before implementation'],
  };
}

function manifestEntryFor(
  capability: Capability,
  manifest: SourceMapManifest,
  autoFill: boolean,
  authorityPath: string,
): { entry: ManifestCapability; changed: boolean } {
  const existing = manifest.capabilities[capability.id];
  if (existing) return { entry: existing, changed: false };
  const generated = defaultManifestEntry(capability, authorityPath);
  if (autoFill) {
    manifest.capabilities[capability.id] = generated;
    return { entry: generated, changed: true };
  }
  return { entry: generated, changed: false };
}

function renderCapabilityBlock(capability: Capability, entry: ManifestCapability, positioning: string | undefined): string {
  const sourceMap = (entry.source_map || [])
    .map((item) => `- ${item.label}: \`${item.path}\` (${item.role})`)
    .join('\n') || '- (none recorded)';
  const hints = (entry.refresh_hints || capability.verification_hints || [])
    .map((hint) => `- \`${hint}\``)
    .join('\n') || '- `record local commands before implementation`';

  return [
    BEGIN,
    '## Capability Context',
    '',
    `- Capability ID: \`${capability.id}\``,
    `- Domain: \`${capability.domain}\``,
    `- Name: \`${capability.name}\``,
    `- Primary prefix: \`${capability.prefixes[0] || '.'}\``,
    `- Architecture module: \`${capability.architecture_module}\``,
    `- Workstream: \`${capability.workstream_dir}\``,
    '',
    '## Positioning',
    '',
    positioning || entry.positioning || `Owns the ${capability.id} capability boundary.`,
    '',
    '## Source Map',
    '',
    sourceMap,
    '',
    '## Refresh Hints',
    '',
    hints,
    END,
    '',
  ].join('\n');
}

function replaceBlock(source: string, block: string): string {
  const pattern = /^<!-- BEGIN CAPABILITY CONTEXT -->\n[\s\S]*?^<!-- END CAPABILITY CONTEXT -->\n?/m;
  if (pattern.test(source)) return source.replace(pattern, block);
  if (!source.trim()) {
    return ['# Functional Block Agent Context', '', block].join('\n');
  }
  return `${source.endsWith('\n') ? source : `${source}\n`}\n${block}`;
}

function selectCapabilities(registry: CapabilityRegistry, repo: string, opts: SyncOptions): Capability[] {
  if (opts.capabilityId) return [findCapabilityById(registry, opts.capabilityId)];
  if (opts.inputPath) return [findCapabilityByPath(registry, repo, opts.inputPath)];
  throw new Error('sync requires --capability or --path');
}

export function runCapabilityContextSync(opts: SyncOptions): SyncResult {
  const repo = repoRoot(opts.repo);
  const apply = opts.apply === true;
  const manifestPath = opts.sourceMapManifest || DEFAULT_MANIFEST_PATH;
  const authorityPath = capabilityAuthorityPath(repo);
  const archcontext = authorityPath === NODES_DIR;
  const registry = readRegistry(repo);
  const manifest = readManifest(repo, manifestPath);
  const capabilities = selectCapabilities(registry, repo, opts);
  // Under archcontext the target is the declared extensions.contractFiles, never an
  // anchor, so an anchorless capability still has a target. readRegistry already
  // refused a node that declares no contract files, before any write.
  const summaries = archcontext ? archcontextSummaries(repo) : new Map<string, string>();
  const changedManifestIds = new Set<string>();
  const changes: SyncChange[] = [];
  const lines: string[] = [];
  const writes: { target: ContractFiles; next: string }[] = [];

  for (const capability of capabilities) {
    const target = targetContractFiles(repo, capability);
    // Under archcontext a declared file that another capability also declares is a
    // shared contract (for example the root AGENTS.md). One block cannot describe
    // several capabilities, so sync refuses before it writes anything.
    if (archcontext) {
      const sharing = registry.capabilities.filter((other) => other.id !== capability.id
        && (other.contract_files.agents === target.agents || other.contract_files.claude === target.claude));
      if (sharing.length > 0) {
        throw new CapabilitySourceError(
          `capability ${capability.id} declares shared contract files ${target.agents}, ${target.claude} `
            + `(also declared by ${sharing.length} other capabilities). `
            + `Declare capability-local files in extensions.contractFiles in ${NODES_DIR} before sync. No file was written.`,
        );
      }
    }
    const registryNormalized =
      capability.contract_files?.agents === target.agents &&
      capability.contract_files?.claude === target.claude;
    const { entry, changed } = manifestEntryFor(capability, manifest, opts.autoFillPositioning === true, authorityPath);
    if (changed) changedManifestIds.add(capability.id);
    const block = renderCapabilityBlock(capability, entry, summaries.get(capability.id));
    const basePath = fs.existsSync(path.join(repo, target.agents))
      ? path.join(repo, target.agents)
      : fs.existsSync(path.join(repo, target.claude))
        ? path.join(repo, target.claude)
        : '';
    const base = basePath
      ? fs.readFileSync(basePath, 'utf-8')
      : '# Functional Block Agent Context\n\nKeep this file focused on the local contract for this primary functional block.\n';
    writes.push({ target, next: replaceBlock(base, block) });

    changes.push({
      capability_id: capability.id,
      target_contract_files: target,
      registry_normalized: registryNormalized,
      wrote_contracts: apply,
      manifest_entry: Boolean(manifest.capabilities[capability.id]),
    });
    lines.push(
      `[CapabilityContext] ${apply ? 'Synced' : 'Would sync'} ${capability.id} -> ${target.agents}, ${target.claude}`,
    );
  }

  if (apply) {
    for (const [index, { target, next }] of writes.entries()) {
      fs.mkdirSync(path.dirname(path.join(repo, target.agents)), { recursive: true });
      fs.mkdirSync(path.dirname(path.join(repo, target.claude)), { recursive: true });
      fs.writeFileSync(path.join(repo, target.agents), next);
      fs.writeFileSync(path.join(repo, target.claude), next);
      capabilities[index].contract_files = target;
    }
    // Under archcontext the JSON registry is retired; the node already declares the target.
    if (!archcontext) writeRegistry(repo, registry);
    if (changedManifestIds.size > 0) writeManifest(repo, manifestPath, manifest);
  }

  return { repo, apply, changes, lines };
}

export function formatCapabilityContextStatus(status: CapabilityContextStatus, json = false): string {
  if (json) return JSON.stringify(status, null, 2);
  const lines = [
    `Capability context: ${status.repo}`,
    `Registry: ${status.registry_file}`,
    `Manifest: ${status.source_map_manifest}`,
    'Capabilities:',
  ];
  for (const capability of status.capabilities) {
    lines.push(
      `- ${capability.id}: ${capability.target_contract_files.agents}, ${capability.target_contract_files.claude}` +
        ` (${capability.normalized ? 'normalized' : 'needs-normalize'})`,
    );
  }
  return lines.join('\n');
}

function printResult(value: unknown, lines: string[], json?: boolean): void {
  if (json) console.log(JSON.stringify(value, null, 2));
  else for (const line of lines) console.log(line);
}

export function buildCapabilityContextCommand(): Command {
  const command = new Command('capability-context')
    .description('Manage capability-local CLAUDE.md and AGENTS.md context files');

  command
    .command('status')
    .option('--repo <path>', 'Target repository path (defaults to cwd)')
    .option('--source-map-manifest <path>', 'Capability source-map manifest path', DEFAULT_MANIFEST_PATH)
    .option('--json', 'Output JSON')
    .action((opts: { repo?: string; sourceMapManifest?: string; json?: boolean }) => {
      const status = runCapabilityContextStatus(opts.repo, opts.sourceMapManifest);
      console.log(formatCapabilityContextStatus(status, opts.json === true));
    });

  command
    .command('sync')
    .option('--repo <path>', 'Target repository path (defaults to cwd)')
    .option('--capability <id>', 'Capability ID to sync')
    .option('--path <path>', 'Changed file path to resolve')
    .option('--apply', 'Write files')
    .option('--dry-run', 'Preview without writing')
    .option('--auto-fill-positioning', 'Write a deterministic manifest fallback for missing entries')
    .option('--source-map-manifest <path>', 'Capability source-map manifest path', DEFAULT_MANIFEST_PATH)
    .option('--json', 'Output JSON')
    .action((opts: {
      repo?: string;
      capability?: string;
      path?: string;
      apply?: boolean;
      autoFillPositioning?: boolean;
      sourceMapManifest?: string;
      json?: boolean;
    }) => {
      const result = runCapabilityContextSync({
        repo: opts.repo,
        capabilityId: opts.capability,
        inputPath: opts.path,
        apply: opts.apply === true,
        autoFillPositioning: opts.autoFillPositioning === true,
        sourceMapManifest: opts.sourceMapManifest,
      });
      printResult(result, result.lines, opts.json);
    });

  return command;
}
