/**
 * `agentic-dev brain` / `repo-harness brain` — explicit external knowledge
 * sync and archive promotion surface.
 *
 * Hooks only emit [BrainPromote] advisories. This command owns the deliberate
 * write boundary from repo files into ~/brain/<project>/*.
 */

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { configuredBrainRoot } from './brain-root';

export type BrainLifecycle = 'always-sync' | 'archive-only' | 'never-sync';
export type BrainCategory = 'decisions' | 'runbooks' | 'patterns' | 'references';

export interface BrainGroup {
  id: string;
  scope?: string;
  lifecycle?: BrainLifecycle;
  source_paths?: string[];
  source_glob?: string | string[];
  brain_subdir?: string;
}

export interface BrainEntry {
  id?: string;
  repo_path?: string;
  source_path?: string;
  brain_path?: string;
  sync?: { direction?: string; enabled?: boolean; source_path?: string; brain_path?: string };
  sync_enabled?: boolean;
}

export interface BrainManifest {
  version?: number;
  project?: string;
  mode?: string;
  default_brain_path?: string;
  brain_root_env?: string;
  rules?: string[];
  exclusions?: string[];
  groups?: BrainGroup[];
  entries?: BrainEntry[];
}

export interface BrainIssue {
  level: 'error' | 'warning';
  message: string;
}

export interface BrainItem {
  id: string;
  sourcePath: string;
  sourceFile: string;
  brainPath: string;
  targetPath: string;
  lifecycle: BrainLifecycle;
  groupId?: string;
}

export interface BrainCommandOptions {
  repo?: string;
  manifest?: string;
  scope?: string;
  changed?: string[];
  dryRun?: boolean;
  requireRoot?: boolean;
  json?: boolean;
}

export interface BrainSyncResult {
  repoRoot: string;
  manifestPath: string;
  brainRoot: string;
  project: string;
  mode: 'status' | 'check' | 'sync';
  scope: string;
  selected: BrainItem[];
  synced: BrainItem[];
  skipped: BrainItem[];
  issues: BrainIssue[];
  dryRun: boolean;
}

export interface BrainPromoteOptions {
  repo?: string;
  slug: string;
  category: BrainCategory;
  dryRun?: boolean;
  json?: boolean;
}

export interface BrainPromoteResult {
  repoRoot: string;
  brainRoot: string;
  project: string;
  slug: string;
  category: BrainCategory;
  targetPath: string;
  brainPath: string;
  sources: string[];
  issues: BrainIssue[];
  dryRun: boolean;
  written: boolean;
}

const VALID_SCOPES = new Set(['reference-configs', 'architecture', 'project-docs', 'knowledge', 'workstreams', 'all']);
const VALID_CATEGORIES = new Set<BrainCategory>(['decisions', 'runbooks', 'patterns', 'references']);
const DEFAULT_MANIFEST = '.ai/harness/brain-manifest.json';

function normalizeSlashes(value: string): string {
  return value.replaceAll(path.sep, '/');
}

function stripWildcard(value: string): string {
  return value.replace(/\/\*$/, '/');
}

function resolveRepoRoot(input?: string): string {
  const cwd = path.resolve(input ?? process.cwd());
  try {
    const out = execFileSync('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return out || cwd;
  } catch {
    return cwd;
  }
}

function readManifest(repoRoot: string, manifest?: string): { manifest: BrainManifest; manifestPath: string } {
  const manifestPath = path.resolve(repoRoot, manifest ?? DEFAULT_MANIFEST);
  const raw = fs.readFileSync(manifestPath, 'utf-8');
  return { manifest: JSON.parse(raw) as BrainManifest, manifestPath };
}

function brainRoot(): string {
  return configuredBrainRoot();
}

function issue(issues: BrainIssue[], level: BrainIssue['level'], message: string): void {
  issues.push({ level, message });
}

function isUnsafePath(value: string): boolean {
  return value === '' || value.includes('\n') || value.includes('\r') || path.isAbsolute(value);
}

function safeRepoPath(repoRoot: string, value: string, issues: BrainIssue[], label: string): string | null {
  const raw = String(value || '');
  if (isUnsafePath(raw)) {
    issue(issues, 'error', `${label} is invalid: ${raw || '(empty)'}`);
    return null;
  }
  const normalized = path.normalize(raw);
  if (normalized === '..' || normalized.startsWith(`..${path.sep}`)) {
    issue(issues, 'error', `${label} escapes repo: ${raw}`);
    return null;
  }
  const absolute = path.resolve(repoRoot, normalized);
  const repoReal = fs.realpathSync(repoRoot);
  const existingReal = fs.existsSync(absolute) ? fs.realpathSync(absolute) : path.resolve(repoRoot, normalized);
  if (existingReal !== repoReal && !existingReal.startsWith(`${repoReal}${path.sep}`)) {
    issue(issues, 'error', `${label} resolves outside repo: ${raw}`);
    return null;
  }
  return normalizeSlashes(normalized);
}

function safeBrainPath(root: string, logicalPath: string, id: string, issues: BrainIssue[]): string | null {
  const value = String(logicalPath || '');
  if (!value.startsWith('brain/')) {
    issue(issues, 'error', `Entry ${id} brain_path must start with brain/: ${value || '(empty)'}`);
    return null;
  }
  const rel = value.slice('brain/'.length);
  if (isUnsafePath(rel) || rel === '..' || rel.startsWith('../')) {
    issue(issues, 'error', `Entry ${id} has invalid brain_path: ${value || '(empty)'}`);
    return null;
  }
  const local = path.resolve(root, rel);
  const resolvedRoot = path.resolve(root);
  if (local !== resolvedRoot && !local.startsWith(`${resolvedRoot}${path.sep}`)) {
    issue(issues, 'error', `Entry ${id} brain_path escapes brain root: ${value}`);
    return null;
  }
  if (symlinkEscapesRoot(resolvedRoot, local)) {
    issue(issues, 'error', `Entry ${id} brain file symlink escapes brain root: ${value}`);
    return null;
  }
  return local;
}

// A write follows symlinks, so the nearest existing path must resolve inside the root.
function symlinkEscapesRoot(root: string, target: string): boolean {
  if (!fs.existsSync(root)) return false;
  const rootReal = fs.realpathSync(root);
  let probe = target;
  while (!fs.lstatSync(probe, { throwIfNoEntry: false })) {
    const parent = path.dirname(probe);
    if (parent === probe) return false;
    probe = parent;
  }
  let real: string;
  try {
    real = fs.realpathSync(probe);
  } catch {
    return true;
  }
  return real !== rootReal && !real.startsWith(`${rootReal}${path.sep}`);
}

function logicalBrainPath(project: string, subdir: string, fileName: string): string {
  return `brain/${project}/${subdir}/${fileName}`;
}

function sourceDerivedFileName(sourcePath: string): string {
  const parsed = path.posix.parse(sourcePath);
  if (sourcePath.startsWith('docs/reference-configs/')) return `${parsed.name}.md`;
  const stem = sourcePath.replace(/\.md$/i, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return `${stem || parsed.name || 'document'}.md`;
}

function globSegmentToRegExp(segment: string): RegExp {
  const escaped = segment
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]');
  return new RegExp(`^${escaped}$`);
}

function globMatches(pattern: string, relPath: string): boolean {
  const patternParts = normalizeSlashes(pattern).split('/').filter(Boolean);
  const pathParts = normalizeSlashes(relPath).split('/').filter(Boolean);
  const memo = new Map<string, boolean>();
  const match = (pi: number, si: number): boolean => {
    const key = `${pi}:${si}`;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    let result: boolean;
    if (pi === patternParts.length) {
      result = si === pathParts.length;
    } else if (patternParts[pi] === '**') {
      result = match(pi + 1, si) || (si < pathParts.length && match(pi, si + 1));
    } else {
      result = si < pathParts.length && globSegmentToRegExp(patternParts[pi]).test(pathParts[si]) && match(pi + 1, si + 1);
    }
    memo.set(key, result);
    return result;
  };
  return match(0, 0);
}

function globBase(pattern: string): string {
  const parts = normalizeSlashes(pattern).split('/');
  const clean: string[] = [];
  for (const part of parts) {
    if (part.includes('*') || part.includes('?')) break;
    clean.push(part);
  }
  return clean.join('/') || '.';
}

function walkFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      out.push(...walkFiles(full));
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

function expandGlob(repoRoot: string, pattern: string, issues: BrainIssue[], label: string): string[] {
  const safeBase = safeRepoPath(repoRoot, globBase(pattern), issues, `${label} base`);
  if (!safeBase) return [];
  return walkFiles(path.resolve(repoRoot, safeBase))
    .map((file) => normalizeSlashes(path.relative(repoRoot, file)))
    .filter((rel) => globMatches(pattern, rel))
    .sort();
}

function isExcluded(relPath: string, exclusions: string[] = []): boolean {
  return exclusions.some((pattern) => globMatches(pattern, relPath));
}

function syncConfig(entry: BrainEntry): { sourcePath?: string; brainPath?: string } | null {
  const sync = entry.sync && typeof entry.sync === 'object' ? entry.sync : {};
  const direction = sync.direction || '';
  if (direction !== 'repo-to-brain') return null;
  if (sync.enabled === false || entry.sync_enabled === false) return null;
  return {
    sourcePath: sync.source_path || entry.source_path || entry.repo_path,
    brainPath: sync.brain_path || entry.brain_path,
  };
}

function collectItems(
  repoRoot: string,
  manifest: BrainManifest,
  root: string,
  opts: { scope?: string; includeArchive?: boolean; changed?: string[] },
  issues: BrainIssue[],
): BrainItem[] {
  const project = manifest.project || path.basename(repoRoot);
  const defaultPrefix = stripWildcard(manifest.default_brain_path || `brain/${project}/*`);
  const changed = new Set((opts.changed ?? []).map((value) => safeRepoPath(repoRoot, value, issues, 'changed path')).filter(Boolean) as string[]);
  const groups = Array.isArray(manifest.groups) ? manifest.groups : [];
  const entries = Array.isArray(manifest.entries) ? manifest.entries : [];
  const selected: BrainItem[] = [];

  for (const group of groups) {
    const lifecycle = group.lifecycle ?? 'always-sync';
    if (lifecycle === 'never-sync') continue;
    if (lifecycle === 'archive-only' && !opts.includeArchive) continue;
    const scope = group.scope ?? group.id;
    if (opts.scope && opts.scope !== 'all' && opts.scope !== scope && opts.scope !== group.id) continue;

    const sources = new Set<string>();
    for (const sourcePath of group.source_paths ?? []) {
      const safe = safeRepoPath(repoRoot, sourcePath, issues, `Group ${group.id} source_path`);
      if (safe) sources.add(safe);
    }
    const globs = Array.isArray(group.source_glob) ? group.source_glob : group.source_glob ? [group.source_glob] : [];
    for (const pattern of globs) {
      for (const rel of expandGlob(repoRoot, pattern, issues, `Group ${group.id} source_glob`)) sources.add(rel);
    }

    for (const sourcePath of Array.from(sources).sort()) {
      if (changed.size > 0 && !changed.has(sourcePath)) continue;
      if (isExcluded(sourcePath, manifest.exclusions)) continue;
      const brainPath = logicalBrainPath(project, group.brain_subdir || scope || 'references', sourceDerivedFileName(sourcePath));
      if (defaultPrefix && !brainPath.startsWith(defaultPrefix)) {
        issue(issues, 'error', `Group ${group.id} target is outside default_brain_path: ${brainPath}`);
        continue;
      }
      const targetPath = safeBrainPath(root, brainPath, `${group.id}:${sourcePath}`, issues);
      if (!targetPath) continue;
      selected.push({
        id: `${group.id}:${sourcePath}`,
        sourcePath,
        sourceFile: path.resolve(repoRoot, sourcePath),
        brainPath,
        targetPath,
        lifecycle,
        groupId: group.id,
      });
    }
  }

  for (const entry of entries) {
    const config = syncConfig(entry);
    if (!config) continue;
    if (opts.scope && opts.scope !== 'all' && opts.scope !== 'entries' && opts.scope !== entry.id) continue;
    const id = entry.id || '(missing id)';
    const sourcePath = safeRepoPath(repoRoot, config.sourcePath || '', issues, `Entry ${id} source_path`);
    const brainPath = String(config.brainPath || '');
    if (brainPath && defaultPrefix && !brainPath.startsWith(defaultPrefix)) {
      issue(issues, 'error', `Entry ${id} brain_path is outside default_brain_path: ${brainPath}`);
    }
    const targetPath = safeBrainPath(root, brainPath, id, issues);
    if (!sourcePath || !targetPath) continue;
    if (changed.size > 0 && !changed.has(sourcePath)) continue;
    if (isExcluded(sourcePath, manifest.exclusions)) continue;
    selected.push({
      id,
      sourcePath,
      sourceFile: path.resolve(repoRoot, sourcePath),
      brainPath,
      targetPath,
      lifecycle: 'always-sync',
    });
  }

  return selected;
}

function assertScope(scope?: string): string {
  if (!scope) return 'all';
  if (!VALID_SCOPES.has(scope)) {
    throw new Error(`unknown brain scope "${scope}" (expected: ${Array.from(VALID_SCOPES).join(', ')})`);
  }
  return scope;
}

export function runBrain(mode: 'status' | 'check' | 'sync', opts: BrainCommandOptions = {}): BrainSyncResult {
  const repoRoot = resolveRepoRoot(opts.repo);
  const { manifest, manifestPath } = readManifest(repoRoot, opts.manifest);
  const root = brainRoot();
  const scope = assertScope(opts.scope);
  const issues: BrainIssue[] = [];
  const items = collectItems(
    repoRoot,
    manifest,
    root,
    { scope, changed: opts.changed, includeArchive: false },
    issues,
  );
  const synced: BrainItem[] = [];
  const skipped: BrainItem[] = [];

  if (mode === 'status') {
    return { repoRoot, manifestPath, brainRoot: root, project: manifest.project || path.basename(repoRoot), mode, scope, selected: items, synced, skipped, issues, dryRun: false };
  }

  if (items.length > 0 && mode === 'check' && !fs.existsSync(root)) {
    issue(issues, opts.requireRoot ? 'error' : 'warning', `brain root unavailable; skipped drift checks: ${root}`);
  }
  if (items.length > 0 && mode === 'sync' && !opts.dryRun) fs.mkdirSync(root, { recursive: true });

  for (const item of items) {
    if (!fs.existsSync(item.sourceFile)) {
      issue(issues, 'error', `Source file is missing for ${item.id}: ${item.sourcePath}`);
      continue;
    }
    if (mode === 'check' && !fs.existsSync(root)) {
      skipped.push(item);
      continue;
    }
    const sourceContent = fs.readFileSync(item.sourceFile, 'utf-8');
    const targetExists = fs.existsSync(item.targetPath);
    const targetContent = targetExists ? fs.readFileSync(item.targetPath, 'utf-8') : null;
    if (mode === 'check') {
      if (!targetExists) issue(issues, 'error', `Brain file is missing for ${item.id}: ${item.brainPath}`);
      else if (targetContent !== sourceContent) issue(issues, 'error', `Brain file differs for ${item.id}: ${item.sourcePath} -> ${item.brainPath}`);
      else skipped.push(item);
      continue;
    }
    if (targetExists && targetContent === sourceContent) {
      skipped.push(item);
      continue;
    }
    if (!opts.dryRun) {
      fs.mkdirSync(path.dirname(item.targetPath), { recursive: true });
      fs.writeFileSync(item.targetPath, sourceContent, 'utf-8');
    }
    synced.push(item);
  }

  return { repoRoot, manifestPath, brainRoot: root, project: manifest.project || path.basename(repoRoot), mode, scope, selected: items, synced, skipped, issues, dryRun: opts.dryRun === true };
}

function findArchiveSources(repoRoot: string, slug: string): string[] {
  const safeSlug = slug.replace(/[^A-Za-z0-9._-]+/g, '-');
  const sources: string[] = [];
  for (const dir of ['plans/archive', 'tasks/archive']) {
    const fullDir = path.resolve(repoRoot, dir);
    if (!fs.existsSync(fullDir)) continue;
    for (const file of fs.readdirSync(fullDir).sort()) {
      if (!file.endsWith('.md')) continue;
      if (dir === 'plans/archive' && !file.startsWith('plan-')) continue;
      if (dir === 'tasks/archive' && !file.startsWith('notes-')) continue;
      if (file.includes(safeSlug)) sources.push(`${dir}/${file}`);
    }
  }
  return sources;
}

function frontmatterValue(content: string, label: string): string {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = content.match(new RegExp(`^> \\*\\*${escaped}\\*\\*:\\s*(.+)$`, 'm'));
  return match?.[1]?.trim() ?? '';
}

function yamlQuote(value: string): string {
  return JSON.stringify(value);
}

export function runBrainPromote(opts: BrainPromoteOptions): BrainPromoteResult {
  if (!VALID_CATEGORIES.has(opts.category)) {
    throw new Error(`invalid category "${opts.category}" (expected: ${Array.from(VALID_CATEGORIES).join(', ')})`);
  }
  const repoRoot = resolveRepoRoot(opts.repo);
  const { manifest } = readManifest(repoRoot);
  const project = manifest.project || path.basename(repoRoot);
  const root = brainRoot();
  const issues: BrainIssue[] = [];
  const sources = findArchiveSources(repoRoot, opts.slug);
  const brainPath = logicalBrainPath(project, opts.category, `${opts.slug}.md`);
  const targetPath = safeBrainPath(root, brainPath, `promote:${opts.slug}`, issues) || path.resolve(root, project, opts.category, `${opts.slug}.md`);

  if (sources.length === 0) {
    issue(issues, 'error', `No archived plan or notes found for slug: ${opts.slug}`);
  }

  const sections = sources.map((sourcePath) => {
    const content = fs.readFileSync(path.resolve(repoRoot, sourcePath), 'utf-8');
    const title = sourcePath;
    return `## Source: ${title}\n\n${content.trim()}\n`;
  });
  const firstContent = sources.length > 0 ? fs.readFileSync(path.resolve(repoRoot, sources[0]), 'utf-8') : '';
  const relatedPlan = sources.find((source) => source.startsWith('plans/archive/')) || frontmatterValue(firstContent, 'Related Plan');
  const archivedAt = frontmatterValue(firstContent, 'Archived') || new Date().toISOString();
  const outcome = frontmatterValue(firstContent, 'Outcome') || 'Promoted';
  const body = [
    '---',
    `slug: ${yamlQuote(opts.slug)}`,
    `category: ${yamlQuote(opts.category)}`,
    `source_plan: ${yamlQuote(relatedPlan || '')}`,
    `archived_at: ${yamlQuote(archivedAt)}`,
    `outcome: ${yamlQuote(outcome)}`,
    `repo: ${yamlQuote(repoRoot)}`,
    '---',
    '',
    `# ${opts.slug}`,
    '',
    ...sections,
  ].join('\n');

  const hasErrors = issues.some((entry) => entry.level === 'error');
  if (!hasErrors && !opts.dryRun) {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, body, 'utf-8');
  }

  return {
    repoRoot,
    brainRoot: root,
    project,
    slug: opts.slug,
    category: opts.category,
    targetPath,
    brainPath,
    sources,
    issues,
    dryRun: opts.dryRun === true,
    written: !hasErrors && !opts.dryRun,
  };
}

function formatIssues(issues: BrainIssue[]): string[] {
  return issues.map((entry) => `[brain] ${entry.level}: ${entry.message}`);
}

export function formatBrainResult(result: BrainSyncResult, asJson = false): string {
  if (asJson) return JSON.stringify(result, null, 2);
  const lines: string[] = [];
  lines.push(`Brain ${result.mode}: ${result.project}`);
  lines.push(`Repo: ${result.repoRoot}`);
  lines.push(`Manifest: ${path.relative(result.repoRoot, result.manifestPath)}`);
  lines.push(`Root: ${result.brainRoot}`);
  lines.push(`Scope: ${result.scope}`);
  lines.push(`Selected: ${result.selected.length}`);
  if (result.mode === 'sync') lines.push(`${result.dryRun ? 'Would sync' : 'Synced'}: ${result.synced.length}`);
  if (result.skipped.length > 0) lines.push(`Skipped/up-to-date: ${result.skipped.length}`);
  lines.push(...formatIssues(result.issues));
  return lines.join('\n');
}

export function formatBrainPromote(result: BrainPromoteResult, asJson = false): string {
  if (asJson) return JSON.stringify(result, null, 2);
  const lines: string[] = [];
  lines.push(`Brain promote: ${result.slug}`);
  lines.push(`Repo: ${result.repoRoot}`);
  lines.push(`Root: ${result.brainRoot}`);
  lines.push(`Target: ${result.brainPath}`);
  lines.push(`Sources: ${result.sources.length}`);
  lines.push(result.dryRun ? 'Dry run: no file written' : result.written ? 'Written: yes' : 'Written: no');
  lines.push(...formatIssues(result.issues));
  return lines.join('\n');
}

function exitCodeFor(issues: BrainIssue[]): number {
  return issues.some((entry) => entry.level === 'error') ? 1 : 0;
}

export function buildBrainCommand(): Command {
  const brain = new Command('brain').description('Manage explicit repo-to-brain sync and archive promotion');

  brain
    .command('status')
    .description('Show brain manifest, root, and syncable item summary')
    .option('--repo <path>', 'Repository root to inspect')
    .option('--json', 'Output JSON instead of human-readable text')
    .action((rawOpts: BrainCommandOptions) => {
      const result = runBrain('status', rawOpts);
      console.log(formatBrainResult(result, rawOpts.json === true));
      process.exit(exitCodeFor(result.issues));
    });

  brain
    .command('check')
    .description('Check manifest-controlled brain drift without writing files')
    .option('--repo <path>', 'Repository root to inspect')
    .option('--scope <scope>', 'Scope to check')
    .option('--require-root', 'Fail if the brain root is unavailable')
    .option('--json', 'Output JSON instead of human-readable text')
    .action((rawOpts: BrainCommandOptions) => {
      const result = runBrain('check', rawOpts);
      console.log(formatBrainResult(result, rawOpts.json === true));
      process.exit(exitCodeFor(result.issues));
    });

  brain
    .command('sync')
    .description('Mirror stable manifest groups into ~/brain/<project>/*')
    .option('--repo <path>', 'Repository root to inspect')
    .option('--scope <scope>', 'Scope to sync')
    .option('--changed <path>', 'Limit sync to one changed repo path', (value, previous: string[] = []) => [...previous, value], [])
    .option('--dry-run', 'Show planned writes without writing files')
    .option('--json', 'Output JSON instead of human-readable text')
    .action((rawOpts: BrainCommandOptions) => {
      const result = runBrain('sync', rawOpts);
      console.log(formatBrainResult(result, rawOpts.json === true));
      process.exit(exitCodeFor(result.issues));
    });

  brain
    .command('promote')
    .description('Promote archived plan/notes by slug into ~/brain/<project>/<category>/')
    .requiredOption('--slug <slug>', 'Archived workflow slug')
    .requiredOption('--category <category>', 'Target category: decisions|runbooks|patterns|references')
    .option('--repo <path>', 'Repository root to inspect')
    .option('--dry-run', 'Show planned promotion without writing files')
    .option('--json', 'Output JSON instead of human-readable text')
    .action((rawOpts: BrainPromoteOptions) => {
      const result = runBrainPromote(rawOpts);
      console.log(formatBrainPromote(result, rawOpts.json === true));
      process.exit(exitCodeFor(result.issues));
    });

  return brain;
}
