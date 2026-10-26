import { execFileSync } from 'child_process';
import { randomUUID } from 'crypto';
import { cpSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync, symlinkSync } from 'fs';
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
} from '../../effects/upgrade/legacy-inventory';
import {
  formatWorktreeTemplateOutcome,
  runWorktreeTemplateMigration,
  type WorktreeTemplateOutcome,
} from '../../effects/upgrade/worktree-template-migration';
import {
  applyUpgradeDecisions,
  decisionSnapshot,
  isRepoRelativeDecisionPath,
  mergeUpgradeDecisions,
  readUpgradeDecisions,
  repoRelativeDecisionPath,
  upgradeDecisionRejection,
  UPGRADE_DECISIONS_PATH,
  type DecidedUpgradePlan,
  type UpgradeDecision,
  type UpgradeDecisionKind,
} from '../../effects/upgrade/operator-decisions';
import {
  formatLegacyWorktreeOutcome,
  runLegacyWorktreeCleanup,
  type LegacyWorktreeCandidate,
  type LegacyWorktreeOutcome,
} from '../../effects/upgrade/legacy-worktree-cleanup';
import { FS_TRANSACTION_BACKUP_ROOT, withTargetLock, type FsTransactionManifest, type FsTransactionManifestOperation } from '../../effects/fs-transaction';
import {
  beginInstallHostTransaction,
  installProfileStatePath,
  recordRefreshedInstallOwnership,
  rollbackInstallHostTransaction,
  type InstallHostTransaction,
} from '../installer/install-profile';
import { globalRuntimeScope, withRuntimeTransactionLock } from '../installer/runtime-host-lock';
import { atomicWriteFileSync, formatJson } from '../installer/shared';
import { gitExecFileSync } from '../../effects/git/runner';
import { formatRegisteredUpgradeResult, runRegisteredUpgrade } from './upgrade-registered';

/** The audit file is rewritten whole on each cleanup, so it keeps the newest records only. */
export const UPGRADE_AUDIT_MAX_RECORDS = 100;

export interface UpgradeOptions {
  /** Selects the repository. */
  readonly cwd?: string;
  /** The caller's checkout; legacy worktree cleanup never removes it. Defaults to the process cwd. */
  readonly callerCwd?: string;
  readonly home?: string;
  readonly packageRoot?: string;
  readonly scope?: 'project' | 'global' | 'all';
  readonly apply?: boolean;
  readonly includeStateArtifacts?: boolean;
  /** With `apply`, rewrite a legacy policy worktree template. Without it the item is reported only. */
  readonly migrateWorktreeTemplate?: boolean;
  readonly env?: NodeJS.ProcessEnv;
}

export interface UpgradeDependencies {
  /** Runs after backup and before the final ownership check. */
  readonly beforeRemove?: (item: LeftoverItem) => void;
  /** Runs after the real copy, before staging and source fences. */
  readonly afterStage?: (item: LeftoverItem, staging: string) => void;
  /** Runs after the policy template is planned and before it is written. */
  readonly beforeTemplateWrite?: () => void;
  /** Runs before each legacy worktree removal. */
  readonly beforeLegacyWorktreeRemove?: (candidate: LegacyWorktreeCandidate) => void;
}

export interface UpgradeResult {
  readonly items: readonly LeftoverItem[];
  readonly apply: boolean;
  readonly exitCode: 0 | 1;
  readonly removedPaths: readonly string[];
  readonly refreshedPaths: readonly string[];
  readonly keptPaths: readonly string[];
  /** Project report items that a current operator keep decision covers. They do not count as leftovers. */
  readonly operatorKept: readonly LeftoverItem[];
  readonly transactionId?: string;
  readonly backupPath?: string;
  readonly projectBackupPath?: string;
  readonly worktreeTemplate?: WorktreeTemplateOutcome;
  readonly legacyWorktrees?: LegacyWorktreeOutcome;
  readonly error?: string;
}

type PlannerOptions = Parameters<typeof planLegacyLeftovers>[0];

function removable(item: LeftoverItem): boolean {
  return item.action !== 'report' && (item.ownership === 'owned-clean' || item.operatorDecision?.status === 'applied');
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

export function planUpgrade(options: PlannerOptions, decisions: readonly UpgradeDecision[]): DecidedUpgradePlan {
  return applyUpgradeDecisions(supportedItems(planLegacyLeftovers(options).items), decisions, options.cwd);
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
    && hashUpgradeSource(item.sourcePath, options.packageRoot, item.sourceSurface) === item.expectedSourceHash;
}

/**
 * An owned link stays a link and points at the current source. The install
 * receipt then keeps its symlink type. Other targets become verified copies.
 */
function refreshedTargetMatches(item: LeftoverItem, path: string): boolean {
  const snapshot = legacyPathSnapshot(path);
  return item.expectedSymlinkTarget !== undefined
    ? snapshot?.symlinkTarget === item.sourcePath
    : snapshot?.contentHash === item.expectedSourceHash;
}

function refreshDirectory(
  item: LeftoverItem,
  options: PlannerOptions,
  env: NodeJS.ProcessEnv,
  onMutation: () => void,
  dependencies: UpgradeDependencies,
): boolean {
  const stagingRoot = mkdtempSync(join(dirname(item.path), '.repo-harness-upgrade-'));
  const staging = join(stagingRoot, 'replacement');
  try {
    if (!sourceUnchanged(item, options)) return false;
    if (item.expectedSymlinkTarget !== undefined) {
      symlinkSync(item.sourcePath!, staging, process.platform === 'win32' ? 'junction' : 'dir');
    } else {
      execFileSync('bash', [join(options.packageRoot, 'scripts', 'sync-codex-installed-copies.sh'),
        '--stage-owned-copy', item.sourcePath!, staging, item.sourceSurface!], {
        env: { ...env, AGENTIC_DEV_SOURCE_ROOT: options.packageRoot }, stdio: ['ignore', 'pipe', 'pipe'],
      });
    }
    dependencies.afterStage?.(item, staging);
    if (!refreshedTargetMatches(item, staging)
      || !sourceUnchanged(item, options) || !unchanged(item, options)
      || !planLegacyLeftovers(options).items.some((current) => itemKey(current) === itemKey(item)
        && current.action === 'refresh' && removable(current))) return false;
    if (!isLegacyPathSafe(options.home, stagingRoot, false)
      || !isLegacyPathSafe(stagingRoot, staging, item.expectedSymlinkTarget !== undefined)) throw new Error(`unsafe refresh staging: ${staging}`);
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
  const backupRoot = join(cwd, FS_TRANSACTION_BACKUP_ROOT, `upgrade-${id}`);
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
  decisions: readonly UpgradeDecision[],
): UpgradeResult {
  const planned = planUpgrade(options, decisions);
  const operatorKept = planned.operatorKept;
  const items = planned.items.map((item): LeftoverItem => (
    item.location === 'project' && removable(item) && !lockedProjectPaths.has(item.path)
      ? { ...item, action: 'report', reason: 'Target appeared after project locks were taken.' }
      : item
  ));
  const candidates = items.filter(removable);
  const removedPaths: string[] = [];
  const refreshedPaths: string[] = [];
  const keptPaths = [...new Set(items.filter((item) => !removable(item)).map((item) => item.path))];
  if (candidates.length === 0) return { items, apply: true, exitCode: 0, removedPaths, refreshedPaths, keptPaths, operatorKept };
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
    const prior = legacyPathSnapshot(auditPath) ? readFileSync(auditPath, 'utf-8').split('\n').filter(Boolean) : [];
    const record = { transaction_id: transactionId, removed_paths: removedPaths, refreshed_paths: refreshedPaths, kept_paths: keptPaths,
      attempted_paths: [...mutatedPaths], rolled_back_paths: rolledBackPaths,
      backup_path: hostBackup?.backup_root ?? projectBackup?.transaction.backup_root,
      project_backup_path: projectBackup?.manifestPath, ...(error ? { error } : {}) };
    const kept = [...prior, JSON.stringify(record)].slice(-UPGRADE_AUDIT_MAX_RECORDS);
    atomicWriteFileSync(auditPath, `${kept.join('\n')}\n`, { mode: 0o600 });
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
      const fresh = planUpgrade(options, decisions).items;
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
        directoryRefresh = lstatSync(targetItems[0]!.sourcePath!).isDirectory();
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
          || !refreshDirectory(targetItems[0]!, options, env, () => mutatedPaths.add(path), dependencies)) {
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
        if (!isLegacyPathSafe(options.home, path, item.expectedSymlinkTarget !== undefined) || !refreshedTargetMatches(item, path)) {
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
  return { items, apply: true, exitCode: error ? 1 : 0, removedPaths, refreshedPaths, keptPaths, operatorKept, transactionId,
    backupPath: hostBackup?.backup_root ?? projectBackup?.transaction.backup_root,
    projectBackupPath: projectBackup?.manifestPath, ...(error ? { error } : {}) };
}

function withWorktreeTemplate(result: UpgradeResult, outcome: WorktreeTemplateOutcome | undefined): UpgradeResult {
  if (!outcome?.item && !outcome?.error) return result;
  const pending = !result.apply && outcome.item?.action === 'rewrite';
  const error = result.error ?? outcome.error;
  return { ...result, worktreeTemplate: outcome, exitCode: result.exitCode === 1 || pending || outcome.error ? 1 : 0, ...(error ? { error } : {}) };
}

function withLegacyWorktrees(result: UpgradeResult, outcome: LegacyWorktreeOutcome | undefined): UpgradeResult {
  if (!outcome || (outcome.candidates.length === 0 && !outcome.error)) return result;
  const pending = !result.apply && outcome.candidates.some((candidate) => candidate.verdict === 'remove');
  const error = result.error ?? outcome.error;
  return { ...result, legacyWorktrees: outcome, exitCode: result.exitCode === 1 || pending || outcome.error ? 1 : 0, ...(error ? { error } : {}) };
}

export function runUpgrade(opts: UpgradeOptions = {}, dependencies: UpgradeDependencies = {}): UpgradeResult {
  const apply = opts.apply === true;
  try {
    let scope = opts.scope ?? 'all';
    if (!['project', 'global', 'all'].includes(scope)) throw new Error(`invalid upgrade scope: ${scope}`);
    let cwd = resolve(opts.cwd ?? process.cwd());
    if (scope !== 'global') {
      try { cwd = gitExecFileSync(['-C', cwd, 'rev-parse', '--show-toplevel'], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
      catch { if (scope === 'project') throw new Error('project upgrade needs a git repository'); scope = 'global'; }
    }
    const home = resolve(opts.home ?? opts.env?.HOME ?? process.env.HOME ?? homedir());
    const packageRoot = resolve(opts.packageRoot ?? join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..'));
    const env: NodeJS.ProcessEnv = { ...process.env, ...opts.env, HOME: home };
    const options: PlannerOptions = { scope, cwd, home, packageRoot,
      // Raw value on purpose: it matches the shim path the retired installer wrote verbatim, not a resolved home.
      ...(env.REPO_HARNESS_HOME ? { repoHarnessHome: env.REPO_HARNESS_HOME } : {}),
      ...(apply && opts.includeStateArtifacts === true ? { includeStateArtifacts: true } : {}) };
    // Read once: every later plan in this run uses the same decisions. An invalid file fails the run.
    const decisions = scope === 'global' ? [] : readUpgradeDecisions(cwd);
    const { items, operatorKept } = planUpgrade(options, decisions);
    const emptyResult: UpgradeResult = { items, apply, exitCode: apply ? 0 : items.length > 0 ? 1 : 0,
      removedPaths: [], refreshedPaths: [], keptPaths: [...new Set(items.filter((item) => !removable(item)).map((item) => item.path))], operatorKept };
    const callerCwd = resolve(opts.callerCwd ?? process.cwd());
    // A failed leftover apply leaves the policy untouched and the legacy worktrees in place; both are reported.
    const finish = (result: UpgradeResult) => withLegacyWorktrees(withWorktreeTemplate(result,
      scope === 'global' ? undefined : runWorktreeTemplateMigration(cwd, apply && opts.migrateWorktreeTemplate === true && !result.error,
        dependencies.beforeTemplateWrite)),
      scope === 'global' ? undefined : runLegacyWorktreeCleanup(cwd, callerCwd, env, apply && !result.error, { beforeRemove: dependencies.beforeLegacyWorktreeRemove }));
    if (!apply || !items.some(removable)) return finish(emptyResult);
    return finish(withRuntimeTransactionLock(globalRuntimeScope(env), (lock) => {
      const underHostLock = planUpgrade(options, decisions).items;
      const paths = [...new Set(underHostLock.filter((item) => item.location === 'project' && removable(item)).map((item) => item.path))].sort();
      return withProjectLocks(paths, () => applyLocked(options, env, dependencies, () => lock.assertOwned(), new Set(paths), decisions));
    }));
  } catch (error) {
    return { items: [], apply, exitCode: 1, removedPaths: [], refreshedPaths: [], keptPaths: [], operatorKept: [], error: error instanceof Error ? error.message : String(error) };
  }
}

export function formatUpgradeResult(result: UpgradeResult, asJson = false): string {
  if (asJson) return formatJson(result);
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
  if (result.worktreeTemplate) lines.push(...formatWorktreeTemplateOutcome(result.worktreeTemplate, result.apply));
  if (result.operatorKept.length > 0) {
    lines.push(`Operator kept (${UPGRADE_DECISIONS_PATH}):`);
    for (const item of result.operatorKept) lines.push(`  ${item.path}`);
  }
  if (result.legacyWorktrees) lines.push(...formatLegacyWorktreeOutcome(result.legacyWorktrees));
  if (result.backupPath) lines.push(`Backup: ${result.backupPath}`);
  if (result.projectBackupPath) lines.push(`Project rollback: repo-harness init rollback --transaction ${result.projectBackupPath}`);
  if (result.error) lines.push(`Failed: ${result.error}`);
  return `${lines.join('\n')}\n`;
}

export interface UpgradeDecideOptions {
  readonly cwd?: string;
  readonly home?: string;
  readonly packageRoot?: string;
  readonly decision: UpgradeDecisionKind;
  readonly paths: readonly string[];
}

export interface UpgradeDecideResult {
  readonly exitCode: 0 | 1;
  readonly decisionsPath?: string;
  readonly recorded: readonly UpgradeDecision[];
  readonly rejected: readonly { readonly path: string; readonly reason: string }[];
  readonly error?: string;
}

/**
 * Record decisions for current project report items. The decision binds the
 * current content hash. Any rejected path stops the write, and nothing is deleted here.
 */
export function runUpgradeDecide(opts: UpgradeDecideOptions): UpgradeDecideResult {
  try {
    const start = resolve(opts.cwd ?? process.cwd());
    let cwd: string;
    try { cwd = gitExecFileSync(['-C', start, 'rev-parse', '--show-toplevel'], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
    catch { throw new Error('upgrade decide needs a git repository'); }
    if (opts.paths.length === 0) throw new Error('upgrade decide needs at least one path');
    const home = resolve(opts.home ?? process.env.HOME ?? homedir());
    const packageRoot = resolve(opts.packageRoot ?? join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..'));
    const existing = readUpgradeDecisions(cwd);
    // Decide against the raw report list, so an operator can replace a stale or earlier decision.
    const reportItems = supportedItems(planLegacyLeftovers({ scope: 'project', cwd, home, packageRoot }).items)
      .filter((item) => item.location === 'project' && item.action === 'report');
    const recorded: UpgradeDecision[] = [];
    const rejected: { path: string; reason: string }[] = [];
    for (const input of opts.paths) {
      const path = repoRelativeDecisionPath(cwd, resolve(start, input));
      if (!isRepoRelativeDecisionPath(path)) { rejected.push({ path: input, reason: 'Path is outside the repository.' }); continue; }
      const item = reportItems.find((candidate) => repoRelativeDecisionPath(cwd, candidate.path) === path);
      const snapshot = item ? decisionSnapshot(cwd, item) : null;
      const reason = item ? upgradeDecisionRejection(item, opts.decision, snapshot) : 'Path is not a current project upgrade report item.';
      if (reason) rejected.push({ path, reason });
      else recorded.push({ path, decision: opts.decision, contentHash: snapshot!.contentHash! });
    }
    if (rejected.length > 0) return { exitCode: 1, recorded: [], rejected };
    const target = join(cwd, UPGRADE_DECISIONS_PATH);
    if (!isLegacyPathSafe(cwd, target, false)) throw new Error(`unsafe upgrade decision path: ${target}`);
    mkdirSync(dirname(target), { recursive: true });
    if (!isLegacyPathSafe(cwd, target, false)) throw new Error(`unsafe upgrade decision path: ${target}`);
    atomicWriteFileSync(target, formatJson({ version: 1, decisions: mergeUpgradeDecisions(existing, recorded) }));
    return { exitCode: 0, decisionsPath: target, recorded, rejected };
  } catch (error) {
    return { exitCode: 1, recorded: [], rejected: [], error: error instanceof Error ? error.message : String(error) };
  }
}

export function formatUpgradeDecideResult(result: UpgradeDecideResult, asJson = false): string {
  if (asJson) return formatJson(result);
  const lines = result.recorded.map((decision) => `Recorded ${decision.decision}: ${decision.path}`);
  if (result.decisionsPath) lines.push(`Decisions: ${result.decisionsPath}`);
  for (const rejection of result.rejected) lines.push(`Rejected ${rejection.path}: ${rejection.reason}`);
  if (result.rejected.length > 0) lines.push('No decisions were written.');
  if (result.error) lines.push(`Failed: ${result.error}`);
  return `${lines.join('\n')}\n`;
}

function buildUpgradeDecideCommand(): Command {
  return new Command('decide')
    .description(`Record keep or remove for project upgrade report items in ${UPGRADE_DECISIONS_PATH}`)
    .argument('<paths...>', 'Paths that upgrade --scope project reports')
    .option('--keep', 'Keep the items; upgrade stops reporting them while their bytes stay the same')
    .option('--remove', 'Remove the regular files on the next upgrade --scope project --apply')
    .action((paths: string[], opts: { keep?: boolean; remove?: boolean }, command: Command) => {
      // The parent upgrade command owns --json, and commander gives it options after the subcommand too.
      const json = command.optsWithGlobals<{ json?: boolean }>().json === true;
      if (opts.keep === opts.remove) {
        process.stderr.write('repo-harness upgrade decide: choose exactly one of --keep or --remove\n');
        process.exitCode = 2;
        return;
      }
      const result = runUpgradeDecide({ decision: opts.keep ? 'keep' : 'remove', paths });
      process.stdout.write(formatUpgradeDecideResult(result, json));
      process.exitCode = result.exitCode;
    });
}

type UpgradeCommandOptions = UpgradeOptions & { json?: boolean; registered?: boolean; expectedRevision?: string };

function runRegisteredUpgradeCommand(opts: UpgradeCommandOptions, command: Command): void {
  // Each registered repo always runs at project scope; the global surfaces belong to plain `upgrade`.
  const conflict = command.getOptionValueSource('scope') === 'cli' ? '--scope'
    : opts.includeStateArtifacts === true ? '--include-state-artifacts' : undefined;
  if (conflict) {
    process.stderr.write(`repo-harness upgrade --registered: ${conflict} is not supported; each registered repo runs at project scope\n`);
    process.exitCode = 2;
    return;
  }
  const result = runRegisteredUpgrade({ apply: opts.apply, expectedRevision: opts.expectedRevision,
    migrateWorktreeTemplate: opts.migrateWorktreeTemplate, callerCwd: process.cwd() });
  process.stdout.write(formatRegisteredUpgradeResult(result, opts.json));
  if (result.error && opts.json) process.stderr.write(`${result.error}\n`);
  process.exitCode = result.exitCode;
}

export function buildUpgradeCommand(): Command {
  return new Command('upgrade')
    .description('Check retired repo-harness surfaces and remove only verified owned copies')
    .option('--scope <scope>', 'project|global|all', 'all')
    .option('--apply', 'Back up and remove verified owned leftovers')
    .option('--include-state-artifacts', 'Include proven owned obsolete state artifacts with --apply')
    .option('--migrate-worktree-template', 'With --apply, rewrite a legacy policy worktree template to {{system_tmp}}')
    .option('--registered', 'Preview init refresh and project upgrade for every registered repo; never commits')
    .option('--expected-revision <digest>', 'With --registered --apply: exact registry revision from the preview')
    .option('--json', 'Print JSON')
    .action((opts: UpgradeCommandOptions, command: Command) => {
      if (opts.registered === true) {
        runRegisteredUpgradeCommand(opts, command);
        return;
      }
      if (opts.expectedRevision !== undefined) {
        process.stderr.write('repo-harness upgrade: --expected-revision needs --registered\n');
        process.exitCode = 2;
        return;
      }
      const result = runUpgrade(opts, {
        beforeLegacyWorktreeRemove: (candidate) => process.stderr.write(`Removing legacy worktree ${candidate.path}; rebuild: ${candidate.rebuild}\n`),
      });
      process.stdout.write(formatUpgradeResult(result, opts.json));
      if (result.error && opts.json && !result.apply) process.stderr.write(`${result.error}\n`);
      process.exitCode = result.exitCode;
    })
    .addCommand(buildUpgradeDecideCommand());
}
