import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs';
import { dirname, extname, join, relative, resolve } from 'path';
import { fileURLToPath } from 'url';
import { formatJson } from '../installer/shared';
import { listHelperFiles, runHelper } from '../runtime/helper-runner';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(SCRIPT_DIR, '..', '..', '..');
const HELPER_ASSETS_DIR = join(PACKAGE_ROOT, 'assets', 'templates', 'helpers');
const HOOK_ASSETS_DIR = join(PACKAGE_ROOT, 'assets', 'hooks');

type RuntimeCategory = 'helper-runtime' | 'hook-runtime' | 'repo-local-host-adapter' | 'package-script';
type RuntimeClassification =
  | 'known-generated'
  | 'managed-entry'
  | 'managed-modified'
  | 'custom-unknown'
  | 'json-with-managed-hooks'
  | 'self-host-pinned';
type RuntimeAction =
  | 'remove-after-wrapper-and-verify'
  | 'remove-after-central-hook-check'
  | 'remove-managed-hooks-preserve-file'
  | 'rewrite-known-helper-command'
  | 'preserve'
  | 'requires-user-review';

export interface RuntimeReclaimFile {
  path: string;
  category: RuntimeCategory;
  classification: RuntimeClassification;
  action: RuntimeAction;
  replacement?: string;
  reason?: string;
}

export interface RuntimeReclaimOptions {
  repo?: string;
  apply?: boolean;
  compact?: boolean;
  verify?: boolean;
  mode?: 'minimal' | 'standard' | 'self-host';
  env?: NodeJS.ProcessEnv;
}

export interface RuntimeReclaimResult {
  version: 1;
  repo_root: string;
  mode: 'minimal' | 'standard' | 'self-host';
  apply: boolean;
  status: 'ok' | 'blocked';
  runtime_reclaim: {
    policy_pins: {
      hook_source: 'central' | 'repo';
      helper_source: 'package' | 'repo';
    };
    files: RuntimeReclaimFile[];
    blocked: string[];
    requires_user_review: RuntimeReclaimFile[];
    archive?: string;
  };
}

export interface RuntimeRollbackOptions {
  repo?: string;
  archive: string;
  env?: NodeJS.ProcessEnv;
}

export interface RuntimeRollbackResult {
  version: 1;
  repo_root: string;
  archive: string;
  status: 'ok' | 'blocked';
  restored: string[];
  missing: string[];
}

function repoRoot(cwd: string, env: NodeJS.ProcessEnv): string {
  const result = spawnSync('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], {
    encoding: 'utf-8',
    env,
  });
  return result.status === 0 && result.stdout.trim() ? result.stdout.trim() : resolve(cwd);
}

function readPolicy(repo: string): { hook_source?: unknown; helper_source?: unknown; harness?: { helper_source?: unknown } } {
  try {
    return JSON.parse(readFileSync(join(repo, '.ai', 'harness', 'policy.json'), 'utf-8'));
  } catch (_error) {
    return {};
  }
}

function hash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function rel(repo: string, path: string): string {
  return relative(repo, path).replace(/\\/g, '/');
}

function helperId(fileName: string): string {
  const ext = extname(fileName);
  return ext ? fileName.slice(0, -ext.length) : fileName;
}

function readIfFile(path: string): string | null {
  try {
    return readFileSync(path, 'utf-8');
  } catch (_error) {
    return null;
  }
}

function normalizeHelperAssetForInstalledCopy(fileName: string, content: string): string {
  if (fileName.endsWith('.sh')) {
    return content
      .replace(/([A-Z_][A-Z0-9_]*)="\$\(cd "\$SCRIPT_DIR\/\.\." && pwd\)"/g, '$1="$(cd "$SCRIPT_DIR/../../.." && pwd)"')
      .replace(/git -C "\$SCRIPT_DIR\/\.\."/g, 'git -C "$SCRIPT_DIR/../../.."')
      .replace(/\.\/scripts\//g, '.ai/harness/scripts/')
      .replace(/scripts\//g, '.ai/harness/scripts/');
  }
  if (fileName.endsWith('.ts')) {
    return content
      .replace(/join\(SCRIPT_DIR, "\.\."\)/g, 'join(SCRIPT_DIR, "..", "..", "..")')
      .replace(/join\(__dirname, "\.\."\)/g, 'join(__dirname, "..", "..", "..")')
      .replace(/\.\/scripts\//g, '.ai/harness/scripts/')
      .replace(/scripts\//g, '.ai/harness/scripts/');
  }
  return content;
}

function classifyHelperRuntime(repo: string, fileName: string, helperSourceRepo: boolean): RuntimeReclaimFile | null {
  const path = join(repo, '.ai', 'harness', 'scripts', fileName);
  if (!existsSync(path)) return null;
  if (helperSourceRepo) {
    return {
      path: rel(repo, path),
      category: 'helper-runtime',
      classification: 'self-host-pinned',
      action: 'preserve',
      reason: 'helper_source=repo',
    };
  }

  const current = readIfFile(path);
  const asset = readIfFile(join(HELPER_ASSETS_DIR, fileName));
  const normalized = asset === null ? null : normalizeHelperAssetForInstalledCopy(fileName, asset);
  if (current !== null && (current === asset || current === normalized)) {
    return {
      path: rel(repo, path),
      category: 'helper-runtime',
      classification: 'known-generated',
      action: 'remove-after-wrapper-and-verify',
      replacement: `repo-harness run ${helperId(fileName)}`,
    };
  }

  if (current?.match(/repo-harness|\.ai\/harness|Workflow Contract|Task Contract/)) {
    return {
      path: rel(repo, path),
      category: 'helper-runtime',
      classification: 'managed-modified',
      action: 'requires-user-review',
      replacement: `repo-harness run ${helperId(fileName)}`,
      reason: 'managed-looking helper differs from packaged source',
    };
  }

  return {
    path: rel(repo, path),
    category: 'helper-runtime',
    classification: 'custom-unknown',
    action: 'preserve',
  };
}

function classifyHookRuntimeDir(repo: string, hookRelDir: string, hookSourceRepo: boolean): RuntimeReclaimFile[] {
  const hooksDir = join(repo, hookRelDir);
  if (!existsSync(hooksDir)) return [];
  const files: RuntimeReclaimFile[] = [];
  for (const name of readdirSync(hooksDir)) {
    const path = join(hooksDir, name);
    if (!existsSync(path) || name === 'README.md' || name === 'lib' || name.startsWith('custom-')) continue;
    const generatedName =
      name.endsWith('.sh') ||
      name === 'AGENTS.md' ||
      name === 'CLAUDE.md' ||
      name === 'settings.template.json' ||
      name === 'codex.hooks.template.json' ||
      name === '.version';
    if (!generatedName) continue;
    if (hookSourceRepo) {
      files.push({
        path: rel(repo, path),
        category: 'hook-runtime',
        classification: 'self-host-pinned',
        action: 'preserve',
        reason: 'hook_source=repo',
      });
      continue;
    }

    files.push({
      path: rel(repo, path),
      category: 'hook-runtime',
      classification: existsSync(join(HOOK_ASSETS_DIR, name)) ? 'known-generated' : 'custom-unknown',
      action: existsSync(join(HOOK_ASSETS_DIR, name)) ? 'remove-after-central-hook-check' : 'preserve',
      replacement: existsSync(join(HOOK_ASSETS_DIR, name)) ? `package assets/hooks/${name}` : undefined,
    });
  }
  return files;
}

function classifyHookRuntime(repo: string, hookSourceRepo: boolean): RuntimeReclaimFile[] {
  return [
    ...classifyHookRuntimeDir(repo, '.ai/hooks', hookSourceRepo),
    ...classifyHookRuntimeDir(repo, '.claude/hooks', hookSourceRepo),
  ];
}

function managedCommand(command: unknown): boolean {
  return (
    typeof command === 'string' &&
    (
      command.includes('repo-harness hook') ||
      command.includes('repo-harness-hook') ||
      command.includes('.ai/hooks/run-hook.sh') ||
      command.includes('/.repo-harness/')
    )
  );
}

function stripManagedHooks(value: unknown): { next: unknown; removed: number } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { next: value, removed: 0 };
  let removed = 0;
  const nextHooks: Record<string, unknown[]> = {};

  for (const [event, blocks] of Object.entries(value as Record<string, unknown>)) {
    if (!Array.isArray(blocks)) continue;
    const keptBlocks: unknown[] = [];
    for (const block of blocks) {
      if (!block || typeof block !== 'object' || Array.isArray(block)) {
        keptBlocks.push(block);
        continue;
      }
      const record = block as Record<string, unknown>;
      const hooks = Array.isArray(record.hooks) ? record.hooks : [];
      const keptHooks = hooks.filter((hook) => {
        const command = hook && typeof hook === 'object' ? (hook as Record<string, unknown>).command : undefined;
        if (managedCommand(command)) {
          removed += 1;
          return false;
        }
        return true;
      });
      if (keptHooks.length > 0) keptBlocks.push({ ...record, hooks: keptHooks });
    }
    if (keptBlocks.length > 0) nextHooks[event] = keptBlocks;
  }

  return { next: nextHooks, removed };
}

function classifyHostAdapter(repo: string, adapterPath: string): RuntimeReclaimFile | null {
  const path = join(repo, adapterPath);
  if (!existsSync(path)) return null;
  try {
    const data = JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>;
    const { removed } = stripManagedHooks(data.hooks);
    if (removed === 0) {
      return {
        path: adapterPath,
        category: 'repo-local-host-adapter',
        classification: 'custom-unknown',
        action: 'preserve',
      };
    }
    return {
      path: adapterPath,
      category: 'repo-local-host-adapter',
      classification: 'json-with-managed-hooks',
      action: 'remove-managed-hooks-preserve-file',
    };
  } catch (_error) {
    return {
      path: adapterPath,
      category: 'repo-local-host-adapter',
      classification: 'custom-unknown',
      action: 'requires-user-review',
      reason: 'invalid JSON',
    };
  }
}

function packageScriptRewritePlan(repo: string): RuntimeReclaimFile | null {
  const packageFile = join(repo, 'package.json');
  if (!existsSync(packageFile)) return null;
  try {
    const pkg = JSON.parse(readFileSync(packageFile, 'utf-8')) as { scripts?: Record<string, string> };
    if (!pkg.scripts) return null;
    const helperFiles = new Set(listHelperFiles());
    const pattern = /^(?:bash\s+)?(?:\.\/)?(?:\.ai\/harness\/scripts|scripts)\/([^ ]+)(.*)$/;
    for (const command of Object.values(pkg.scripts)) {
      if (typeof command !== 'string') continue;
      const match = command.match(pattern);
      if (match && helperFiles.has(match[1])) {
        return {
          path: 'package.json',
          category: 'package-script',
          classification: 'managed-entry',
          action: 'rewrite-known-helper-command',
          replacement: 'repo-harness run <helper>',
          reason: 'package.json contains known helper script commands',
        };
      }
    }
  } catch (_error) {
    return {
      path: 'package.json',
      category: 'package-script',
      classification: 'custom-unknown',
      action: 'requires-user-review',
      reason: 'invalid JSON',
    };
  }
  return null;
}

function buildPlan(opts: RuntimeReclaimOptions, repo: string): RuntimeReclaimResult {
  const policy = readPolicy(repo);
  const mode = opts.mode ?? 'standard';
  const hookSourceRepo = mode === 'self-host' || policy.hook_source === 'repo';
  const helperSourceRepo = mode === 'self-host' || policy.helper_source === 'repo' || policy.harness?.helper_source === 'repo';
  const files: RuntimeReclaimFile[] = [];

  for (const helper of listHelperFiles()) {
    const entry = classifyHelperRuntime(repo, helper, helperSourceRepo);
    if (entry) files.push(entry);
  }
  files.push(...classifyHookRuntime(repo, hookSourceRepo));
  for (const adapter of ['.claude/settings.json', '.claude/settings.local.json', '.codex/hooks.json']) {
    const entry = classifyHostAdapter(repo, adapter);
    if (entry) files.push(entry);
  }
  if (opts.compact === true) {
    const packageEntry = packageScriptRewritePlan(repo);
    if (packageEntry) files.push(packageEntry);
  }

  const requiresReview = files.filter((entry) => entry.action === 'requires-user-review');
  return {
    version: 1,
    repo_root: repo,
    mode,
    apply: opts.apply === true,
    status: 'ok',
    runtime_reclaim: {
      policy_pins: {
        hook_source: hookSourceRepo ? 'repo' : 'central',
        helper_source: helperSourceRepo ? 'repo' : 'package',
      },
      files,
      blocked: [],
      requires_user_review: requiresReview,
    },
  };
}

function shellWrapper(helper: string): string {
  const id = helperId(helper);
  return `#!/bin/bash
set -euo pipefail

if [[ -n "\${REPO_HARNESS_SOURCE_ROOT:-}" && -f "\${REPO_HARNESS_SOURCE_ROOT}/src/cli/index.ts" ]]; then
  if command -v bun >/dev/null 2>&1; then
    exec bun "\${REPO_HARNESS_SOURCE_ROOT}/src/cli/index.ts" run ${id} "$@"
  fi
fi

if command -v repo-harness >/dev/null 2>&1; then
  exec repo-harness run ${id} "$@"
fi

echo "Missing repo-harness CLI for helper ${id}" >&2
exit 1
`;
}

function tsWrapper(helper: string): string {
  const id = helperId(helper);
  return `#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const sourceRoot = process.env.REPO_HARNESS_SOURCE_ROOT;
const command = sourceRoot && existsSync(join(sourceRoot, "src", "cli", "index.ts"))
  ? ["bun", join(sourceRoot, "src", "cli", "index.ts"), "run", "${id}"]
  : ["repo-harness", "run", "${id}"];
const result = spawnSync(command[0], [...command.slice(1), ...process.argv.slice(2)], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
});
if (result.error) {
  console.error(\`Missing repo-harness CLI for helper ${id}: \${result.error.message}\`);
  process.exit(1);
}
process.exit(result.status ?? 1);
`;
}

function isAppOwnedScript(path: string, packagedHelper: string): boolean {
  if (!existsSync(path)) return false;
  const current = readFileSync(path, 'utf-8');
  if (current === packagedHelper) return false;
  return !current.match(/repo-harness|\.ai\/harness|Workflow Contract|Task Contract/);
}

function writeWrappers(repo: string): Array<{ path: string; sha256: string }> {
  const generated: Array<{ path: string; sha256: string }> = [];
  mkdirSync(join(repo, 'scripts'), { recursive: true });
  for (const helper of listHelperFiles()) {
    const asset = readIfFile(join(HELPER_ASSETS_DIR, helper)) ?? '';
    const preferred = join(repo, 'scripts', helper);
    const output = isAppOwnedScript(preferred, asset)
      ? join(repo, 'scripts', 'repo-harness', helper)
      : preferred;
    mkdirSync(dirname(output), { recursive: true });
    const content = helper.endsWith('.ts') ? tsWrapper(helper) : shellWrapper(helper);
    writeFileSync(output, content, { encoding: 'utf-8', mode: 0o755 });
    generated.push({ path: rel(repo, output), sha256: hash(content) });
  }
  return generated;
}

function rewritePackageScripts(repo: string, archive?: string): RuntimeReclaimFile[] {
  const packageFile = join(repo, 'package.json');
  if (!existsSync(packageFile)) return [];
  const before = readFileSync(packageFile, 'utf-8');
  let pkg: { scripts?: Record<string, string>; [key: string]: unknown };
  try {
    pkg = JSON.parse(before) as { scripts?: Record<string, string>; [key: string]: unknown };
  } catch (_error) {
    return [];
  }
  if (!pkg.scripts) return [];
  const helperFiles = new Set(listHelperFiles());
  const helperIds = new Map([...helperFiles].map((file) => [file, helperId(file)]));
  const pattern = /^(?:bash\s+)?(?:\.\/)?(?:\.ai\/harness\/scripts|scripts)\/([^ ]+)(.*)$/;
  let rewritten = 0;
  for (const [scriptName, command] of Object.entries(pkg.scripts)) {
    if (typeof command !== 'string') continue;
    const match = command.match(pattern);
    if (!match) continue;
    const helperFile = match[1];
    if (!helperFiles.has(helperFile)) continue;
    pkg.scripts[scriptName] = `repo-harness run ${helperIds.get(helperFile)}${match[2] ?? ''}`;
    rewritten += 1;
  }
  if (rewritten === 0) return [];
  if (archive) {
    const dest = join(archive, 'files', 'package.json');
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, before);
  }
  writeFileSync(packageFile, formatJson(pkg));
  return [{
    path: 'package.json',
    category: 'package-script',
    classification: 'managed-entry',
    action: 'rewrite-known-helper-command',
    replacement: 'repo-harness run <helper>',
    reason: `rewrote ${rewritten} known helper script${rewritten === 1 ? '' : 's'}`,
  }];
}

function archivePath(repo: string): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, 'Z');
  return join(repo, '.ai', 'harness', 'archive', 'runtime-reclaim', stamp);
}

function ensureArchive(repo: string, current?: string): string {
  const archive = current ?? archivePath(repo);
  mkdirSync(join(archive, 'files'), { recursive: true });
  return archive;
}

function backupAndRemove(repo: string, archive: string, entry: RuntimeReclaimFile): void {
  const source = join(repo, entry.path);
  if (!existsSync(source)) return;
  const dest = join(archive, 'files', entry.path);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(source, dest);
  rmSync(source, { force: true });
}

function applyHostAdapter(repo: string, entry: RuntimeReclaimFile, archive: string): void {
  const file = join(repo, entry.path);
  const data = JSON.parse(readFileSync(file, 'utf-8')) as Record<string, unknown>;
  const { next, removed } = stripManagedHooks(data.hooks);
  if (removed === 0) return;
  const dest = join(archive, 'files', entry.path);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(file, dest);
  if (next && typeof next === 'object' && Object.keys(next as Record<string, unknown>).length > 0) data.hooks = next;
  else delete data.hooks;
  if (Object.keys(data).length === 0) rmSync(file, { force: true });
  else writeFileSync(file, formatJson(data));
}

function writeRuntimeManifest(
  repo: string,
  generatedWrappers: Array<{ path: string; sha256: string }>,
  reclaimed: RuntimeReclaimFile[],
): void {
  const manifestPath = join(repo, '.ai', 'harness', 'runtime-manifest.json');
  const generated: Record<string, { kind: string; sha256: string }> = {};
  for (const wrapper of generatedWrappers) {
    generated[wrapper.path] = { kind: 'compat-wrapper', sha256: wrapper.sha256 };
  }
  const reclaimedRecord: Record<string, { kind: RuntimeCategory; reclaimed_at: string; replacement?: string }> = {};
  const now = new Date().toISOString();
  for (const entry of reclaimed) {
    reclaimedRecord[entry.path] = {
      kind: entry.category,
      reclaimed_at: now,
      replacement: entry.replacement,
    };
  }
  writeFileSync(
    manifestPath,
    formatJson({
      version: 1,
      contractId: 'tasks-first-harness-v2',
      generated: { wrappers: generated },
      reclaimed: reclaimedRecord,
    }),
  );
}

function writeArchiveManifest(repo: string, archive: string, actions: RuntimeReclaimFile[]): void {
  writeFileSync(
    join(archive, 'manifest.json'),
    formatJson({
      created_at: new Date().toISOString(),
      actions: actions.map((entry) => ({
        path: entry.path,
        action: entry.action,
        backup: `files/${entry.path}`,
        replacement: entry.replacement,
      })),
      rollback: {
        command: `repo-harness adopt rollback --archive ${rel(repo, archive)}`,
      },
    }),
  );
}

export function runRuntimeReclaim(opts: RuntimeReclaimOptions = {}): RuntimeReclaimResult {
  const env = { ...process.env, ...(opts.env ?? {}) };
  const repo = repoRoot(opts.repo ?? process.cwd(), env);
  const result = buildPlan(opts, repo);
  if (opts.apply !== true) return result;
  if (result.mode === 'self-host') return result;

  const generatedWrappers = writeWrappers(repo);
  let archive: string | undefined;
  const archivedActions: RuntimeReclaimFile[] = [];
  if (opts.compact === true) {
    archive = ensureArchive(repo, archive);
    archivedActions.push(...rewritePackageScripts(repo, archive));
  }

  if (opts.verify !== false) {
    const verification = runHelper({
      helper: 'check-task-workflow',
      args: ['--strict'],
      cwd: repo,
      env: { ...env, REPO_HARNESS_HELPER_SOURCE: 'package' },
      stdio: 'pipe',
    });
    if (verification.exitCode !== 0) {
      result.status = 'blocked';
      result.runtime_reclaim.blocked.push(
        `replacement verify failed: repo-harness run check-task-workflow --strict exited ${verification.exitCode}`,
      );
      if (archive && archivedActions.length > 0) {
        writeArchiveManifest(repo, archive, archivedActions);
        result.runtime_reclaim.archive = rel(repo, archive);
      }
      return result;
    }
  }

  const removed: RuntimeReclaimFile[] = [];
  for (const entry of result.runtime_reclaim.files) {
    if (entry.action === 'remove-managed-hooks-preserve-file') {
      archive = ensureArchive(repo, archive);
      applyHostAdapter(repo, entry, archive);
      removed.push(entry);
    } else if (entry.action === 'remove-after-wrapper-and-verify' || entry.action === 'remove-after-central-hook-check') {
      archive = ensureArchive(repo, archive);
      backupAndRemove(repo, archive, entry);
      removed.push(entry);
    }
  }
  archivedActions.push(...removed);
  if (archive) {
    writeArchiveManifest(repo, archive, archivedActions);
    result.runtime_reclaim.archive = rel(repo, archive);
  }
  writeRuntimeManifest(repo, generatedWrappers, archivedActions);
  return result;
}

function walkFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const out: string[] = [];
  for (const name of readdirSync(root)) {
    const path = join(root, name);
    try {
      const stat = statSync(path);
      if (stat.isDirectory()) out.push(...walkFiles(path));
      else if (stat.isFile()) out.push(path);
    } catch (_error) {
      // Ignore files that disappear during rollback scan.
    }
  }
  return out;
}

export function runRuntimeRollback(opts: RuntimeRollbackOptions): RuntimeRollbackResult {
  const env = { ...process.env, ...(opts.env ?? {}) };
  const repo = repoRoot(opts.repo ?? process.cwd(), env);
  const archive = resolve(repo, opts.archive);
  const filesRoot = join(archive, 'files');
  const restored: string[] = [];
  const missing: string[] = [];

  if (!existsSync(filesRoot)) {
    return {
      version: 1,
      repo_root: repo,
      archive: rel(repo, archive),
      status: 'blocked',
      restored,
      missing: [rel(repo, filesRoot)],
    };
  }

  for (const backup of walkFiles(filesRoot)) {
    const relativePath = rel(filesRoot, backup);
    const target = join(repo, relativePath);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(backup, target);
    restored.push(relativePath);
  }

  return {
    version: 1,
    repo_root: repo,
    archive: rel(repo, archive),
    status: 'ok',
    restored,
    missing,
  };
}
