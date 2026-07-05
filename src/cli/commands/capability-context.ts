import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import {
  findMatch,
  readRegistry as readCapabilityRegistry,
  type Capability,
  type CapabilityRegistry,
  type ContractFiles,
} from '../../../scripts/capability-resolver';

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

type RequestEntry = {
  ts: string;
  request_id: string;
  status: 'pending';
  source: 'cli' | 'architecture-event';
  path: string;
  capability_id: string;
  matched_prefix: string;
  request_file?: string;
  spawn_recommended?: boolean;
};

export type CapabilityContextStatus = {
  repo: string;
  registry_file: string;
  source_map_manifest: string;
  queue_file: string;
  capabilities: Array<{
    id: string;
    primary_prefix: string;
    target_contract_files: ContractFiles;
    current_contract_files: ContractFiles;
    normalized: boolean;
    agents_exists: boolean;
    claude_exists: boolean;
    manifest_entry: boolean;
    pending_requests: number;
  }>;
  pending_requests: RequestEntry[];
};

type SyncOptions = {
  repo?: string;
  capabilityId?: string;
  inputPath?: string;
  pending?: boolean;
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
  cleared_requests: number;
  lines: string[];
};

const REGISTRY_PATH = '.ai/context/capabilities.json';
const DEFAULT_MANIFEST_PATH = '.ai/context/capability-source-map.json';
const QUEUE_PATH = '.ai/harness/capability-context/requests.jsonl';
const ARCH_EVENTS_PATH = '.ai/harness/architecture/events.jsonl';
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

function readJsonl<T>(file: string): T[] {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf-8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as T];
      } catch {
        return [];
      }
    });
}

function writeJsonl(file: string, entries: unknown[]): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (entries.length === 0) {
    fs.writeFileSync(file, '');
    return;
  }
  fs.writeFileSync(file, `${entries.map((entry) => JSON.stringify(entry)).join('\n')}\n`);
}

function appendJsonl(file: string, entry: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(entry)}\n`);
}

function isLikelyFile(repo: string, relPath: string): boolean {
  const abs = path.join(repo, relPath);
  if (fs.existsSync(abs)) return fs.statSync(abs).isFile();
  return path.extname(path.basename(relPath)) !== '';
}

function targetContractFiles(repo: string, capability: Capability): ContractFiles {
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

// Delegates the longest-prefix decision to capability-resolver's canonical findMatch
// (see .ai/harness/policy.json capability_match_rule) instead of re-implementing the
// sort/tie-break here. The exact-textual-match-not-found fallback to a registered
// "root" capability (prefix === '.' or a file-shaped prefix) is capability-context's
// own historical behavior and is preserved unchanged below.
function findCapabilityByPath(registry: CapabilityRegistry, repo: string, inputPath: string): {
  capability: Capability;
  matchedPrefix: string;
} {
  const match = findMatch(registry, repo, inputPath);
  if (match.matched) {
    return { capability: findCapabilityById(registry, match.capability_id), matchedPrefix: match.matched_prefix };
  }

  const root = registry.capabilities.find((capability) =>
    (capability.prefixes || []).some((prefix) => {
      const normalized = normalizeRepoPath(prefix, repo, true);
      return normalized === '.' || isLikelyFile(repo, normalized);
    }),
  );
  if (!root) throw new Error(`no capability matches path: ${inputPath}`);
  return { capability: root, matchedPrefix: normalizeRepoPath(root.prefixes[0] || '.', repo, true) };
}

function findCapabilityById(registry: CapabilityRegistry, id: string): Capability {
  const capability = registry.capabilities.find((entry) => entry.id === id);
  if (!capability) throw new Error(`unknown capability: ${id}`);
  return capability;
}

function pendingRequests(repo: string): RequestEntry[] {
  return readJsonl<RequestEntry>(path.join(repo, QUEUE_PATH)).filter(
    (entry) => entry.status === 'pending' && Boolean(entry.capability_id),
  );
}

function latestArchitectureEvent(repo: string): Record<string, unknown> | null {
  const entries = readJsonl<Record<string, unknown>>(path.join(repo, ARCH_EVENTS_PATH));
  return entries.at(-1) ?? null;
}

function requestId(capabilityId: string, filePath: string, requestFile = ''): string {
  return [capabilityId, filePath, requestFile || 'manual'].join(':');
}

export function runCapabilityContextRequest(opts: {
  repo?: string;
  path?: string;
  fromLatestArchitectureEvent?: boolean;
}): { repo: string; entry: RequestEntry | null; status: 'queued' | 'existing' | 'skipped'; lines: string[] } {
  const repo = repoRoot(opts.repo);
  const registry = readRegistry(repo);
  const event = opts.fromLatestArchitectureEvent ? latestArchitectureEvent(repo) : null;
  const eventPath = typeof event?.file_path === 'string' ? event.file_path : '';
  const inputPath = opts.path || eventPath;
  const lines: string[] = [];

  if (!inputPath) {
    return { repo, entry: null, status: 'skipped', lines: ['[CapabilityContext] No changed path to queue.'] };
  }

  let capability: Capability;
  let matchedPrefix: string;
  const eventCapabilityId = typeof event?.capability_id === 'string' ? event.capability_id : '';
  if (eventCapabilityId) {
    capability = findCapabilityById(registry, eventCapabilityId);
    matchedPrefix = typeof event?.matched_prefix === 'string'
      ? event.matched_prefix
      : normalizeRepoPath(capability.prefixes[0] || '.', repo, true);
  } else {
    const match = findCapabilityByPath(registry, repo, inputPath);
    capability = match.capability;
    matchedPrefix = match.matchedPrefix;
  }

  const relPath = normalizeRepoPath(inputPath, repo);
  const entry: RequestEntry = {
    ts: new Date().toISOString(),
    request_id: requestId(
      capability.id,
      relPath,
      typeof event?.request_file === 'string' ? event.request_file : '',
    ),
    status: 'pending',
    source: event ? 'architecture-event' : 'cli',
    path: relPath,
    capability_id: capability.id,
    matched_prefix: matchedPrefix,
    request_file: typeof event?.request_file === 'string' ? event.request_file : undefined,
    spawn_recommended: typeof event?.spawn_recommended === 'boolean' ? event.spawn_recommended : undefined,
  };

  const queueFile = path.join(repo, QUEUE_PATH);
  const existing = pendingRequests(repo);
  if (existing.some((queued) => queued.request_id === entry.request_id)) {
    lines.push(`[CapabilityContext] Pending request already queued for ${capability.id}.`);
    return { repo, entry, status: 'existing', lines };
  }

  appendJsonl(queueFile, entry);
  lines.push(`[CapabilityContext] Queued ${capability.id} from ${relPath}.`);
  return { repo, entry, status: 'queued', lines };
}

export function runCapabilityContextStatus(repoInput = '.', manifestPath = DEFAULT_MANIFEST_PATH): CapabilityContextStatus {
  const repo = repoRoot(repoInput);
  const registry = readRegistry(repo);
  const manifest = readManifest(repo, manifestPath);
  const pending = pendingRequests(repo);
  return {
    repo,
    registry_file: REGISTRY_PATH,
    source_map_manifest: manifestPath,
    queue_file: QUEUE_PATH,
    pending_requests: pending,
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
        pending_requests: pending.filter((entry) => entry.capability_id === capability.id).length,
      };
    }),
  };
}

function defaultManifestEntry(capability: Capability): ManifestCapability {
  return {
    positioning: `Owns the ${capability.id} capability boundary declared in .ai/context/capabilities.json.`,
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
): { entry: ManifestCapability; changed: boolean } {
  const existing = manifest.capabilities[capability.id];
  if (existing) return { entry: existing, changed: false };
  const generated = defaultManifestEntry(capability);
  if (autoFill) {
    manifest.capabilities[capability.id] = generated;
    return { entry: generated, changed: true };
  }
  return { entry: generated, changed: false };
}

function renderCapabilityBlock(capability: Capability, entry: ManifestCapability): string {
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
    entry.positioning || `Owns the ${capability.id} capability boundary.`,
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
  if (opts.pending) {
    const ids = new Set(pendingRequests(repo).map((entry) => entry.capability_id));
    return registry.capabilities.filter((capability) => ids.has(capability.id));
  }
  if (opts.capabilityId) return [findCapabilityById(registry, opts.capabilityId)];
  if (opts.inputPath) return [findCapabilityByPath(registry, repo, opts.inputPath).capability];
  throw new Error('sync requires --capability, --path, or --pending');
}

export function runCapabilityContextSync(opts: SyncOptions): SyncResult {
  const repo = repoRoot(opts.repo);
  const apply = opts.apply === true;
  const manifestPath = opts.sourceMapManifest || DEFAULT_MANIFEST_PATH;
  const registry = readRegistry(repo);
  const manifest = readManifest(repo, manifestPath);
  const capabilities = selectCapabilities(registry, repo, opts);
  const changedManifestIds = new Set<string>();
  const processedIds = new Set<string>();
  const changes: SyncChange[] = [];
  const lines: string[] = [];

  for (const capability of capabilities) {
    const target = targetContractFiles(repo, capability);
    const registryNormalized =
      capability.contract_files?.agents === target.agents &&
      capability.contract_files?.claude === target.claude;
    const { entry, changed } = manifestEntryFor(capability, manifest, opts.autoFillPositioning === true);
    if (changed) changedManifestIds.add(capability.id);
    const block = renderCapabilityBlock(capability, entry);
    const basePath = fs.existsSync(path.join(repo, target.agents))
      ? path.join(repo, target.agents)
      : fs.existsSync(path.join(repo, target.claude))
        ? path.join(repo, target.claude)
        : '';
    const base = basePath
      ? fs.readFileSync(basePath, 'utf-8')
      : '# Functional Block Agent Context\n\nKeep this file focused on the local contract for this primary functional block.\n';
    const next = replaceBlock(base, block);

    if (apply) {
      fs.mkdirSync(path.dirname(path.join(repo, target.agents)), { recursive: true });
      fs.mkdirSync(path.dirname(path.join(repo, target.claude)), { recursive: true });
      fs.writeFileSync(path.join(repo, target.agents), next);
      fs.writeFileSync(path.join(repo, target.claude), next);
      capability.contract_files = target;
    }

    processedIds.add(capability.id);
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

  let clearedRequests = 0;
  if (apply) {
    writeRegistry(repo, registry);
    if (changedManifestIds.size > 0) writeManifest(repo, manifestPath, manifest);
    if (opts.pending) {
      const queueFile = path.join(repo, QUEUE_PATH);
      const requests = pendingRequests(repo);
      const remaining = requests.filter((entry) => !processedIds.has(entry.capability_id));
      clearedRequests = requests.length - remaining.length;
      writeJsonl(queueFile, remaining);
    }
  }

  return { repo, apply, changes, cleared_requests: clearedRequests, lines };
}

export function formatCapabilityContextStatus(status: CapabilityContextStatus, json = false): string {
  if (json) return JSON.stringify(status, null, 2);
  const lines = [
    `Capability context: ${status.repo}`,
    `Registry: ${status.registry_file}`,
    `Manifest: ${status.source_map_manifest}`,
    `Pending requests: ${status.pending_requests.length}`,
    'Capabilities:',
  ];
  for (const capability of status.capabilities) {
    lines.push(
      `- ${capability.id}: ${capability.target_contract_files.agents}, ${capability.target_contract_files.claude}` +
        ` (${capability.normalized ? 'normalized' : 'needs-normalize'}, pending=${capability.pending_requests})`,
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
    .command('request')
    .option('--repo <path>', 'Target repository path (defaults to cwd)')
    .option('--path <path>', 'Changed file path to resolve')
    .option('--from-latest-architecture-event', 'Use the latest architecture event as the request source')
    .option('--json', 'Output JSON')
    .action((opts: { repo?: string; path?: string; fromLatestArchitectureEvent?: boolean; json?: boolean }) => {
      const result = runCapabilityContextRequest({
        repo: opts.repo,
        path: opts.path,
        fromLatestArchitectureEvent: opts.fromLatestArchitectureEvent === true,
      });
      printResult(result, result.lines, opts.json);
    });

  command
    .command('sync')
    .option('--repo <path>', 'Target repository path (defaults to cwd)')
    .option('--capability <id>', 'Capability ID to sync')
    .option('--path <path>', 'Changed file path to resolve')
    .option('--pending', 'Sync all pending queued capability-context requests')
    .option('--apply', 'Write files and clear processed pending requests')
    .option('--dry-run', 'Preview without writing')
    .option('--auto-fill-positioning', 'Write a deterministic manifest fallback for missing entries')
    .option('--source-map-manifest <path>', 'Capability source-map manifest path', DEFAULT_MANIFEST_PATH)
    .option('--json', 'Output JSON')
    .action((opts: {
      repo?: string;
      capability?: string;
      path?: string;
      pending?: boolean;
      apply?: boolean;
      autoFillPositioning?: boolean;
      sourceMapManifest?: string;
      json?: boolean;
    }) => {
      const result = runCapabilityContextSync({
        repo: opts.repo,
        capabilityId: opts.capability,
        inputPath: opts.path,
        pending: opts.pending === true,
        apply: opts.apply === true,
        autoFillPositioning: opts.autoFillPositioning === true,
        sourceMapManifest: opts.sourceMapManifest,
      });
      printResult(result, result.lines, opts.json);
    });

  return command;
}
