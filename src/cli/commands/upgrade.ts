import { execFileSync } from 'child_process';
import { randomUUID } from 'crypto';
import { cpSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync } from 'fs';
import { homedir } from 'os';
import { dirname, join, relative, resolve } from 'path';
import { fileURLToPath } from 'url';
import { Command } from 'commander';
import {
  isLegacyPathSafe,
  hashUpgradeSource,
  legacyPathSnapshot,
  planLegacyLeftovers,
  stripLegacyHookEntries,
  type LeftoverItem,
} from '../../core/upgrade/legacy-inventory';
import { withTargetLock, type FsTransactionManifest, type FsTransactionManifestOperation } from '../../effects/fs-transaction';
import {
  beginInstallHostTransaction,
  installProfileStatePath,
  recordRefreshedInstallOwnership,
  rollbackInstallHostTransaction,
  type InstallHostTransaction,
} from '../installer/install-profile';
import { withRuntimeHostTransactionLock } from '../installer/runtime-host-lock';
import { atomicWriteFileSync, formatJson } from '../installer/shared';

export interface UpgradeOptions {
  readonly cwd?: string;
  readonly home?: string;
  readonly packageRoot?: string;
  readonly scope?: 'project' | 'global' | 'all';
  readonly apply?: boolean;
  readonly includeStateArtifacts?: boolean;
  readonly env?: NodeJS.ProcessEnv;
}

export interface UpgradeDependencies {
  /** Runs after backup and before the final ownership check. */
  readonly beforeRemove?: (item: LeftoverItem) => void;
}

export interface UpgradeResult {
  readonly items: readonly LeftoverItem[];
  readonly apply: boolean;
  readonly exitCode: 0 | 1;
  readonly removedPaths: readonly string[];
  readonly refreshedPaths: readonly string[];
  readonly keptPaths: readonly string[];
  readonly transactionId?: string;
  readonly backupPath?: string;
  readonly projectBackupPath?: string;
  readonly error?: string;
}

type PlannerOptions = Parameters<typeof planLegacyLeftovers>[0];

function removable(item: LeftoverItem): boolean {
  return item.ownership === 'owned-clean' && item.action !== 'report';
}

function itemKey(item: LeftoverItem): string {
  return JSON.stringify([item.location, item.surface, item.path, item.hookEvent, item.hookCommand]);
}

function supportedItems(items: readonly LeftoverItem[]): LeftoverItem[] {
  return items.map((item) => item.location === 'project' && removable(item)
    && item.surface !== 'hook-entry' && legacyPathSnapshot(item.path)?.kind !== 'file'
    ? { ...item, action: 'report', reason: 'Project rollback supports regular files only.' }
    : item);
}

function unchanged(item: LeftoverItem, options: PlannerOptions): boolean {
  const root = item.location === 'global' ? options.home : options.cwd;
  if (!isLegacyPathSafe(root, item.path)) return false;
  const current = legacyPathSnapshot(item.path);
  if (!current) return false;
  if (item.expectedSymlinkTarget !== undefined) return current.symlinkTarget === item.expectedSymlinkTarget;
  return item.expectedContentHash !== undefined && current.contentHash === item.expectedContentHash;
}

function backupMatches(item: LeftoverItem, backup: InstallHostTransaction | undefined): boolean {
  const path = backup?.snapshots.find((snapshot) => snapshot.path === item.path)?.backup_path;
  if (!path) return false;
  const snapshot = legacyPathSnapshot(path);
  return item.expectedSymlinkTarget !== undefined
    ? snapshot?.symlinkTarget === item.expectedSymlinkTarget
    : item.expectedContentHash !== undefined && snapshot?.contentHash === item.expectedContentHash;
}

function sourceUnchanged(item: LeftoverItem, options: PlannerOptions): boolean {
  return item.sourcePath !== undefined && item.expectedSourceHash !== undefined
    && (resolve(item.sourcePath) === resolve(options.packageRoot)
      || isLegacyPathSafe(options.packageRoot, item.sourcePath, false))
    && hashUpgradeSource(item.sourcePath, options.packageRoot) === item.expectedSourceHash;
}

function refreshDirectory(
  item: LeftoverItem,
  options: PlannerOptions,
  env: NodeJS.ProcessEnv,
  onMutation: () => void,
): boolean {
  const stagingRoot = mkdtempSync(join(dirname(item.path), '.repo-harness-upgrade-'));
  const staging = join(stagingRoot, 'replacement');
  try {
    if (!sourceUnchanged(item, options)) return false;
    execFileSync('bash', [join(options.packageRoot, 'scripts', 'sync-codex-installed-copies.sh'),
      '--stage-owned-copy', item.sourcePath!, staging, item.sourceSurface!], {
      env: { ...env, AGENTIC_DEV_SOURCE_ROOT: options.packageRoot }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (legacyPathSnapshot(staging)?.contentHash !== item.expectedSourceHash
      || !sourceUnchanged(item, options) || !unchanged(item, options)
      || !planLegacyLeftovers(options).items.some((current) => itemKey(current) === itemKey(item)
        && current.action === 'refresh' && removable(current))) return false;
    if (!isLegacyPathSafe(options.home, stagingRoot, false)
      || !isLegacyPathSafe(stagingRoot, staging, false)) throw new Error(`unsafe refresh staging: ${staging}`);
    onMutation();
    renameSync(item.path, join(stagingRoot, 'previous'));
    renameSync(staging, item.path);
    return true;
  } finally {
    rmSync(stagingRoot, { recursive: true, force: true });
  }
}

function withProjectLocks<T>(paths: readonly string[], run: () => T): T {
  const [first, ...rest] = paths;
  return first === undefined ? run() : withTargetLock(first, () => withProjectLocks(rest, run));
}

interface ProjectBackup {
  readonly transaction: InstallHostTransaction;
  readonly manifestPath: string;
  readonly operations: FsTransactionManifestOperation[];
}

function backupProject(cwd: string, paths: readonly string[], id: string): ProjectBackup | undefined {
  if (paths.length === 0) return undefined;
  const backupRoot = join(cwd, '.ai', 'harness', 'backups', 'fs-transaction', `upgrade-${id}`);
  if (!isLegacyPathSafe(cwd, backupRoot, false)) throw new Error(`unsafe project backup path: ${backupRoot}`);
  mkdirSync(backupRoot, { recursive: true, mode: 0o700 });
  const snapshots = paths.map((path, index) => {
    if (!isLegacyPathSafe(cwd, path, false) || legacyPathSnapshot(path)?.kind !== 'file') {
      throw new Error(`unsafe project cleanup target: ${path}`);
    }
    const backupPath = join(backupRoot, String(index));
    cpSync(path, backupPath, { force: false, errorOnExist: true });
    return { path, existed: true, backup_path: backupPath };
  });
  return {
    transaction: { protocol: 1, backup_root: backupRoot, snapshots },
    manifestPath: join(backupRoot, 'manifest.json'),
    operations: snapshots.map((snapshot, index) => ({
      id: `upgrade:${index}`,
      kind: 'remove',
      path: relative(cwd, snapshot.path).replaceAll('\\', '/'),
      status: 'planned',
      backupPath: relative(cwd, snapshot.backup_path!).replaceAll('\\', '/'),
      rollbackStrategy: 'restore-or-delete-file',
    })),
  };
}

function writeProjectManifest(cwd: string, backup: ProjectBackup): void {
  const manifest: FsTransactionManifest = {
    protocol: 1,
    command: 'adopt',
    createdAt: new Date().toISOString(),
    repoRoot: cwd,
    mode: 'standard',
    operations: backup.operations,
    rollback: { command: `repo-harness init rollback --transaction ${backup.manifestPath}` },
  };
  atomicWriteFileSync(backup.manifestPath, formatJson(manifest), { mode: 0o600 });
}

function applyLocked(
  options: PlannerOptions,
  env: NodeJS.ProcessEnv,
  dependencies: UpgradeDependencies,
  assertHostLock: () => void,
  lockedProjectPaths: ReadonlySet<string>,
): UpgradeResult {
  const items = supportedItems(planLegacyLeftovers(options).items).map((item): LeftoverItem => (
    item.location === 'project' && removable(item) && !lockedProjectPaths.has(item.path)
      ? { ...item, action: 'report', reason: 'Target appeared after project locks were taken.' }
      : item
  ));
  const candidates = items.filter(removable);
  const removedPaths: string[] = [];
  const refreshedPaths: string[] = [];
  const keptPaths = [...new Set(items.filter((item) => !removable(item)).map((item) => item.path))];
  if (candidates.length === 0) return { items, apply: true, exitCode: 0, removedPaths, refreshedPaths, keptPaths };
  const transactionId = randomUUID();
  const globalPaths = [...new Set(candidates.filter((item) => item.location === 'global').map((item) => item.path))];
  const projectPaths = [...new Set(candidates.filter((item) => item.location === 'project').map((item) => item.path))];
  const manifestRefreshPaths = candidates.filter((item) => item.location === 'global'
    && item.action === 'refresh' && item.proof === 'manifest').map((item) => item.path);
  const statePath = installProfileStatePath(env);
  const stateBefore = manifestRefreshPaths.length > 0 && isLegacyPathSafe(options.home, statePath, false)
    ? legacyPathSnapshot(statePath)?.contentHash : undefined;
  let hostBackup: InstallHostTransaction | undefined;
  let projectBackup: ProjectBackup | undefined;
  const mutatedPaths = new Set<string>();
  const rolledBackPaths: string[] = [];
  const auditPath = join(options.home, '.repo-harness', 'upgrade-cleanup.log.jsonl');
  let error: string | undefined;
  const audit = () => {
    if (!isLegacyPathSafe(options.home, auditPath, false)) throw new Error(`unsafe audit path: ${auditPath}`);
    // The host transaction lock also serializes project-only cleanup audits.
    const prior = legacyPathSnapshot(auditPath) ? readFileSync(auditPath, 'utf-8') : '';
    const record = { transaction_id: transactionId, removed_paths: removedPaths, refreshed_paths: refreshedPaths, kept_paths: keptPaths,
      attempted_paths: [...mutatedPaths], rolled_back_paths: rolledBackPaths,
      backup_path: hostBackup?.backup_root ?? projectBackup?.transaction.backup_root,
      project_backup_path: projectBackup?.manifestPath, ...(error ? { error } : {}) };
    atomicWriteFileSync(auditPath, `${prior}${JSON.stringify(record)}\n`, { mode: 0o600 });
  };
  try {
    assertHostLock();
    for (const item of candidates) {
      const root = item.location === 'global' ? options.home : options.cwd;
      if (!isLegacyPathSafe(root, item.path)) throw new Error(`unsafe cleanup target: ${item.path}`);
    }
    if (!isLegacyPathSafe(options.home, auditPath, false)) throw new Error(`unsafe audit path: ${auditPath}`);
    const hostPaths = [...globalPaths, ...(manifestRefreshPaths.length > 0 ? [statePath] : [])];
    if (hostPaths.length > 0) hostBackup = beginInstallHostTransaction(hostPaths, env, { retainBackup: true });
    projectBackup = backupProject(options.cwd, projectPaths, transactionId);
    if (projectBackup) writeProjectManifest(options.cwd, projectBackup);
    for (const path of [...globalPaths, ...projectPaths]) {
      const targetItems = candidates.filter((item) => item.path === path);
      for (const item of targetItems) dependencies.beforeRemove?.(item);
      assertHostLock();
      const fresh = planLegacyLeftovers(options).items;
      const eligible = targetItems.filter((item) => unchanged(item, options)
        && backupMatches(item, item.location === 'global' ? hostBackup : projectBackup?.transaction)
        && fresh.some((current) => itemKey(current) === itemKey(item) && removable(current)));
      if (eligible.length !== targetItems.length) {
        if (!keptPaths.includes(path)) keptPaths.push(path);
        for (const item of targetItems) {
          const index = items.indexOf(item);
          items[index] = { ...item, action: 'report', reason: 'Target changed after backup.' };
        }
        continue;
      }
      const root = targetItems[0]!.location === 'global' ? options.home : options.cwd;
      if (!isLegacyPathSafe(root, path)) throw new Error(`unsafe cleanup target: ${path}`);
      let nextContent: string | undefined;
      const refreshing = targetItems[0]!.action === 'refresh';
      let directoryRefresh = false;
      if (refreshing) {
        if (!sourceUnchanged(targetItems[0]!, options)) {
          keptPaths.push(path);
          for (const item of targetItems) items[items.indexOf(item)] = { ...item, action: 'report', reason: 'Refresh source changed or is unsafe.' };
          continue;
        }
        directoryRefresh = legacyPathSnapshot(targetItems[0]!.sourcePath!)?.kind === 'directory';
        if (!directoryRefresh) nextContent = readFileSync(targetItems[0]!.sourcePath!, 'utf-8');
      }
      if (targetItems[0]!.surface === 'hook-entry') {
        const config = JSON.parse(readFileSync(path, 'utf-8')) as unknown;
        const location = targetItems[0]!.location;
        const stripped = stripLegacyHookEntries(config, location === 'global' ? { location, home: options.home, repoHarnessHome: options.repoHarnessHome } : { location });
        if (stripped.removed.length === 0) continue;
        nextContent = formatJson(stripped.config);
      }
      // Check the full target snapshot immediately before the destructive write.
      if (!targetItems.every((item) => unchanged(item, options))
        || (refreshing && !sourceUnchanged(targetItems[0]!, options))) {
        if (!keptPaths.includes(path)) keptPaths.push(path);
        for (const item of targetItems) {
          items[items.indexOf(item)] = { ...item, action: 'report', reason: 'Target changed before mutation.' };
        }
        continue;
      }
      if (directoryRefresh) {
        if (!targetItems[0]!.sourceSurface
          || !refreshDirectory(targetItems[0]!, options, env, () => mutatedPaths.add(path))) {
          keptPaths.push(path);
          for (const item of targetItems) items[items.indexOf(item)] = { ...item, action: 'report', reason: 'Source or target changed during staging.' };
          continue;
        }
      } else {
        mutatedPaths.add(path);
        if (nextContent === undefined) rmSync(path, { recursive: true });
        else atomicWriteFileSync(path, nextContent, { mode: lstatSync(path).mode & 0o777 });
      }
      if (refreshing) refreshedPaths.push(path);
      else removedPaths.push(path);
      if (projectBackup && projectPaths.includes(path)) {
        const index = projectPaths.indexOf(path);
        projectBackup.operations[index] = {
          ...projectBackup.operations[index]!, status: 'applied',
          ...(nextContent === undefined ? {} : { kind: 'writeFile', contentHash: legacyPathSnapshot(path)?.contentHash }),
        };
        writeProjectManifest(options.cwd, projectBackup);
      }
    }
    const receiptPaths = manifestRefreshPaths.filter((path) => refreshedPaths.includes(path));
    if (receiptPaths.length > 0) {
      assertHostLock();
      if (!isLegacyPathSafe(options.home, statePath, false) || stateBefore === undefined
        || legacyPathSnapshot(statePath)?.contentHash !== stateBefore
        || legacyPathSnapshot(hostBackup!.snapshots.find((snapshot) => snapshot.path === statePath)!.backup_path!)?.contentHash !== stateBefore) {
        throw new Error(`install ownership state changed before refresh: ${statePath}`);
      }
      for (const path of receiptPaths) {
        const item = candidates.find((candidate) => candidate.path === path && candidate.action === 'refresh')!;
        if (!isLegacyPathSafe(options.home, path, false)
          || legacyPathSnapshot(path)?.contentHash !== item.expectedSourceHash) {
          throw new Error(`refreshed surface changed before ownership write: ${path}`);
        }
      }
      mutatedPaths.add(statePath);
      recordRefreshedInstallOwnership(receiptPaths, env);
    }
    audit();
  } catch (failure) {
    error = failure instanceof Error ? failure.message : String(failure);
    for (const backup of [projectBackup?.transaction, hostBackup]) {
      if (!backup) continue;
      const root = projectBackup?.transaction === backup ? options.cwd : options.home;
      for (const snapshot of [...backup.snapshots].reverse()) {
        if (!mutatedPaths.has(snapshot.path)) continue;
        try {
          if (!isLegacyPathSafe(root, snapshot.path)
            || !isLegacyPathSafe(root, backup.backup_root, false)
            || !snapshot.backup_path || !isLegacyPathSafe(backup.backup_root, snapshot.backup_path)) {
            throw new Error(`unsafe rollback target or backup: ${snapshot.path}`);
          }
          rollbackInstallHostTransaction({ ...backup, snapshots: [snapshot] }, { retainBackup: true });
          rolledBackPaths.push(snapshot.path);
          const removedIndex = removedPaths.indexOf(snapshot.path);
          if (removedIndex >= 0) removedPaths.splice(removedIndex, 1);
          const refreshedIndex = refreshedPaths.indexOf(snapshot.path);
          if (refreshedIndex >= 0) refreshedPaths.splice(refreshedIndex, 1);
          if (projectBackup?.transaction === backup) {
            const index = projectPaths.indexOf(snapshot.path);
            projectBackup.operations[index] = { ...projectBackup.operations[index]!, status: 'skipped' };
          }
        } catch (rollbackError) {
          error += `; ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`;
        }
      }
    }
    if (projectBackup) {
      try { writeProjectManifest(options.cwd, projectBackup); }
      catch (manifestError) { error += `; rollback manifest failed: ${String(manifestError)}`; }
    }
    for (const item of candidates) {
      if (!removedPaths.includes(item.path) && !refreshedPaths.includes(item.path) && !keptPaths.includes(item.path)) keptPaths.push(item.path);
    }
    try { audit(); } catch (auditError) { error += `; audit failed: ${String(auditError)}`; }
  }
  return { items, apply: true, exitCode: error ? 1 : 0, removedPaths, refreshedPaths, keptPaths, transactionId,
    backupPath: hostBackup?.backup_root ?? projectBackup?.transaction.backup_root,
    projectBackupPath: projectBackup?.manifestPath, ...(error ? { error } : {}) };
}

export function runUpgrade(opts: UpgradeOptions = {}, dependencies: UpgradeDependencies = {}): UpgradeResult {
  const apply = opts.apply === true;
  try {
    let scope = opts.scope ?? 'all';
    if (!['project', 'global', 'all'].includes(scope)) throw new Error(`invalid upgrade scope: ${scope}`);
    let cwd = resolve(opts.cwd ?? process.cwd());
    if (scope !== 'global') {
      try { cwd = execFileSync('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
      catch { if (scope === 'project') throw new Error('project upgrade needs a git repository'); scope = 'global'; }
    }
    const home = resolve(opts.home ?? opts.env?.HOME ?? process.env.HOME ?? homedir());
    const packageRoot = resolve(opts.packageRoot ?? join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..'));
    const env: NodeJS.ProcessEnv = { ...process.env, ...opts.env, HOME: home };
    const options: PlannerOptions = { scope, cwd, home, packageRoot,
      ...(env.REPO_HARNESS_HOME ? { repoHarnessHome: resolve(env.REPO_HARNESS_HOME) } : {}),
      ...(apply && opts.includeStateArtifacts === true ? { includeStateArtifacts: true } : {}) };
    const items = supportedItems(planLegacyLeftovers(options).items);
    const emptyResult: UpgradeResult = { items, apply, exitCode: apply ? 0 : items.length > 0 ? 1 : 0,
      removedPaths: [], refreshedPaths: [], keptPaths: [...new Set(items.filter((item) => !removable(item)).map((item) => item.path))] };
    if (!apply || !items.some(removable)) return emptyResult;
    return withRuntimeHostTransactionLock(env, (lock) => {
      const underHostLock = supportedItems(planLegacyLeftovers(options).items);
      const paths = [...new Set(underHostLock.filter((item) => item.location === 'project' && removable(item)).map((item) => item.path))].sort();
      return withProjectLocks(paths, () => applyLocked(options, env, dependencies, () => lock.assertOwned(), new Set(paths)));
    });
  } catch (error) {
    return { items: [], apply, exitCode: 1, removedPaths: [], refreshedPaths: [], keptPaths: [], error: error instanceof Error ? error.message : String(error) };
  }
}

export function formatUpgradeResult(result: UpgradeResult, asJson = false): string {
  if (asJson) return formatJson(result.apply ? result : result.items);
  const lines = [result.apply ? 'Upgrade cleanup apply.' : 'Upgrade cleanup check.'];
  const groups = new Map<string, LeftoverItem[]>();
  for (const item of result.items) {
    const key = `${item.location} ${item.surface}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  for (const [group, items] of groups) {
    lines.push(`${group}:`);
    for (const item of items) lines.push(`  ${item.path}: ${item.ownership}; proof=${item.proof ?? 'none'}; ${item.action}${item.reason ? `; ${item.reason}` : ''}`);
  }
  if (result.items.length === 0) lines.push('No leftovers.');
  if (result.backupPath) lines.push(`Backup: ${result.backupPath}`);
  if (result.projectBackupPath) lines.push(`Project rollback: repo-harness init rollback --transaction ${result.projectBackupPath}`);
  if (result.error) lines.push(`Failed: ${result.error}`);
  return `${lines.join('\n')}\n`;
}

export function buildUpgradeCommand(): Command {
  return new Command('upgrade')
    .description('Check retired repo-harness surfaces and remove only verified owned copies')
    .option('--scope <scope>', 'project|global|all', 'all')
    .option('--apply', 'Back up and remove verified owned leftovers')
    .option('--include-state-artifacts', 'Include proven owned obsolete state artifacts with --apply')
    .option('--json', 'Print JSON')
    .action((opts: UpgradeOptions & { json?: boolean }) => {
      const result = runUpgrade(opts);
      process.stdout.write(formatUpgradeResult(result, opts.json));
      if (result.error && opts.json && !result.apply) process.stderr.write(`${result.error}\n`);
      process.exitCode = result.exitCode;
    });
}
