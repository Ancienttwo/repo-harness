#!/usr/bin/env bun
import { buildStrategyCommand } from './commands/strategy';
import { buildModuleCommand } from './commands/module';
import { globalRuntimeScope, parentRuntimeTransactionContext, withRuntimeTransactionLock } from '../effects/locking/runtime-transaction-lock';
import { captureConfigurationRestores, hostConfigurationRoot } from './installer/configuration-ownership';
/**
 * repo-harness CLI entry.
 *
 * Wires commander.js to the global runtime bootstrap, repo-local update,
 * hook adapter, status, doctor, migrate, security, and tool command bodies.
 */

import { Command, CommanderError } from 'commander';
import { randomBytes } from 'crypto';
import { realpathSync } from 'fs';
import { homedir } from 'os';
import { dirname, join } from 'path';
import { createInterface } from 'readline/promises';
import { fileURLToPath } from 'url';
import { askConfirm } from './tty-prompt';
import { runInstall, runUninstall, type InstallTargetSpec } from './commands/install';
import { planPiPackage, removePiPackage } from './installer/pi-package';
import { newPiPackagesSinceTransaction, recordPiInstallOwnership, recordUnresolvedPiOwnership, type ManagedInstallSurface } from './installer/install-profile';
import { parsePluginList, PLUGIN_IDS, selectionLabel, type PluginId, type PluginSelection } from '../core/skill-surface/plugin-manifest';
import { writeAllSync } from './runtime/write-all-sync';
import { runInit } from './commands/init';
import { CLI_VERSION, formatStatus, runStatus } from './commands/status';
import { formatDoctor, runDoctor, type DoctorPorts } from './commands/doctor';
import { buildInitHookCommand, buildSetupCommand, formatInitHook, runInitHook } from './commands/init-hook';
import { formatMigratePlan, runMigrate } from './commands/migrate';
import { buildReviewCommand } from './commands/review';
import { taskReviewRunner } from '../effects/review-runner/task-review-runner';
import { buildUpgradeCommand } from './commands/upgrade';
import { buildToolsCommand } from './commands/tools';
import { registerArchitecturePorts } from '../core/architecture/contracts';
import { assertPluginCommandSelected, declareArchitectureSelection, pluginSelected, readRecordedSelection, recordedPlugins } from './installer/architecture-selection';
import { buildHerdrCommand } from './commands/herdr';
import { buildEventsCommand } from './commands/events';
import { buildBrainCommand } from './commands/brain';
import { buildCapabilityContextCommand } from './commands/capability-context';
import { buildDocsCommand } from './commands/docs';
import { buildMcpCommand } from './commands/mcp';
import { buildRunCommand } from './commands/run';
import { buildStateCommand } from './commands/state';
import { buildPublicationCommand } from './commands/publication';
import { buildBoardCommand } from './commands/board';
import { attentionWatchDoctorCheck } from '../effects/board/attention-watch';
import { readLocalRepositoryId } from '../effects/board/collect';
import { githubRemoteRepository } from '../core/board/source';
import { attentionHostPorts, boardHostPorts } from '../effects/terminal/herdr-core';
import { buildFleetCommand } from './commands/fleet';
import { buildBotsCommand } from './commands/bots';
import { buildRefactorCommand } from './commands/refactor';
import { buildOperatorCommand } from './commands/operator';
import { buildWorktreesCommand } from './commands/worktrees';
import { buildSeatsCommand } from './commands/seats';
import { buildCatchUpCommand } from './commands/catch-up';
import { buildQuotaCommand } from './commands/quota';
import { buildArchitectureDebtCommand } from './commands/architecture-debt';
import { buildArchitectureProjectionCommand } from './commands/architecture-projection';
import { buildRetentionCommand, type RetentionPorts } from './commands/retention';
import { MCP_AUDIT_LOG_RELATIVE_PATH } from '../core/public-projections/mcp-audit-log';
import { TASK_INBOX_V2_RELATIVE_PATH } from '../core/fleet/task-inbox-layout';
import { formatSecurityScan, runSecurityScan } from './commands/security';
import {
  GLOBAL_RULES_REFRESH_STEP,
  HERDR_CORE_STEP,
  MIN_BUN_VERSION,
  agentFleetVerified,
  bunVersionIsSupported,
  ownFreshWazaSharedRules,
  reconciledByCandidate,
  runGlobalRuntimeSetup,
  updateLeftoverSummary,
  updateRegisteredUpgradeSummary,
  type GlobalRuntimeOptions,
  type GlobalRuntimeResult,
} from './commands/global-runtime';
import { REPORT_LANGUAGE_FLAG_VALUES, parseReportLanguageFlag, type ReportLanguageFlag } from './installer/global-context';
import {
  assertCandidateReconciliationReceipt,
  assertInstalledAdapterProjection,
  CANDIDATE_RECONCILIATION_PROTOCOL,
  candidatePackageIdentity,
  consumeCandidateReconciliationCapability,
  parseCandidateRequest,
  publishCandidateReconciliationCapability,
  routeRegistryDigest,
  sha256,
  type CandidateReconciliationReceipt,
} from './commands/candidate-reconciliation';
import { windowsProtectedHelperConfigPath } from '../effects/runtime/protected-helper-platform';
import { removeOwnedDanglingSkillLinks } from '../effects/skill-tree-integrity';
import { providerSkillLock } from '../effects/host-skill-roots';
import {
  applyInstallSelection,
  assertArchitecturePolicySelection,
  beginInstallHostTransaction,
  commitInstallHostTransaction,
  effectiveSkillRoots,
  installProfileTransactionPaths,
  installStateStatus,
  keptPluginLine,
  commandPluginRepairLines,
  notAddedPluginLine,
  piSkillRootSnapshots,
  planInstallSelection,
  prepareInstallSelectionSwitch,
  readInstallState,
  requireInstallState,
  resolveRecordedSelection,
  rollbackInstallHostTransaction,
  rollbackInstallSelection,
  skippedPluginLine,
  type InstallState,
  type SelectionResolution,
} from './installer/install-profile';
import {
  enabledPlugins,
} from './installer/install-state';
import { runAdoptionPlan } from './commands/adoption-plan';
import { rollbackAdoptionTransaction } from '../effects/fs-transaction';
import {
  type ExclusiveDirectoryLockHandle,
} from '../effects/locking/exclusive-directory-lock';
import {
  assertTarget,
  assertLocation,
  assertAdoptionMode,
} from './commands/validators';
import type { Location } from './installer/types';

// The recorded selection, read once per process. Core reaches the architecture code only through the ports.
const recordedSelection = readRecordedSelection();
let architectureRegistered = false;

/**
 * Loads and registers the architecture providers, once. The root calls it
 * only for a selected plugin: at start for the recorded selection, and in
 * install, update and candidate reconciliation when their plugin set adds
 * it. In-process tests of a selected plugin call it too.
 */
export function registerArchitecturePlugin(): void {
  if (architectureRegistered) return;
  const { ARCHITECTURE_PROVIDERS } = require('../effects/architecture/providers') as typeof import('../effects/architecture/providers');
  const { ARCHITECTURE_SETUP_PROVIDER } = require('./commands/architecture-setup') as typeof import('./commands/architecture-setup');
  const { CODEGRAPH_PROVIDER } = require('./tools/codegraph') as typeof import('./tools/codegraph');
  registerArchitecturePorts({ ...ARCHITECTURE_PROVIDERS, setup: ARCHITECTURE_SETUP_PROVIDER, codegraph: CODEGRAPH_PROVIDER });
  architectureRegistered = true;
}

if (pluginSelected(recordedSelection, 'architecture')) registerArchitecturePlugin();
else declareArchitectureSelection(recordedSelection);

/** A plugin command stays in help; its handler checks the selection before any probe or write, then loads the plugin code. */
function pluginCommand(command: Command, id: PluginId, name: string = command.name()): Command {
  return command.hook('preAction', () => assertPluginCommandSelected(recordedSelection, id, name));
}

/** The MCP sidecar logs, for a selected plugin only: the lazy load keeps every other process free of MCP code. */
function selectedMcpLogs(): readonly string[] {
  if (!pluginSelected(recordedSelection, 'mcp')) return [];
  const { MCP_INDEX_EVENTS_RELATIVE_PATH, MCP_METRICS_RELATIVE_PATH, MCP_TRACE_RELATIVE_PATH } = require('./mcp/log-paths') as typeof import('./mcp/log-paths');
  return [MCP_INDEX_EVENTS_RELATIVE_PATH, MCP_METRICS_RELATIVE_PATH, MCP_TRACE_RELATIVE_PATH, MCP_AUDIT_LOG_RELATIVE_PATH];
}

/**
 * The plugin checks, setup steps and storage roots that core commands take as
 * parameters. This root is the only importer of their implementations. Tests
 * and the setup check child pass the same value.
 */
export const CLI_PORTS: {
  readonly doctor: DoctorPorts;
  readonly retention: RetentionPorts;
} = {
  doctor: { attentionWatchCheck: (cwd) => attentionWatchDoctorCheck(attentionHostPorts(), () => readLocalRepositoryId({ repo_root: cwd }, url => githubRemoteRepository(url) !== null)) },
  retention: {
    rotatingLogs: selectedMcpLogs(),
    commonProtocolRoots: [TASK_INBOX_V2_RELATIVE_PATH],
  },
};

export const SUBCOMMANDS = [
  'init',
  'init-hook',
  'install',
  'uninstall',
  'status',
  'doctor',
  'migrate',
  'security',
  'update',
  'run',
  'setup',
  'tools',
  'herdr',
  'brain',
  'capability-context',
  'docs',
  'mcp',
  'state',
  'publication',
  'fleet',
  'architecture-projection',
  'architecture-debt',
  'refactor',
  'seats',
] as const;
export type Subcommand = (typeof SUBCOMMANDS)[number];

const TARGET_HELP = 'codex|claude|both';
const LOCATION_HELP = 'global';

interface GlobalRuntimeCommandOptions {
  target: string;
  cli?: boolean;
  syncSkill?: boolean;
  hooks?: string | false;
  externalSkills?: boolean;
  withObsidianSkills?: boolean;
  codegraph?: boolean;
  brainRoot?: string;
  reportLanguage?: string;
  json?: boolean;
  /** `--plugins a,b` gives a string; `--no-plugins` gives false; neither gives undefined. */
  plugins?: string | false;
  dryRun?: boolean;
}

/** Minimal duck-typed slice of `Command` so tests can fake option-value sourcing without constructing a real commander `Command`. */
export interface OptionSourceLookup {
  getOptionValueSource(key: string): string | undefined;
}

export interface ResolveOptionalRuntimeDepsOptions {
  interactive: boolean;
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
}

/**
 * Resolve the two user-selectable optional dependencies (external skills,
 * CodeGraph) for the `init`/`install` global runtime bootstrap.
 *
 * Non-interactive (non-TTY, or `--json`): mutable external skills are opt-in;
 * CodeGraph follows the command's explicit/default option value.
 *
 * Interactive: for each item not explicitly passed on the CLI (i.e. its
 * option value source isn't `'cli'`), prompt; Enter/`y` keeps the command's
 * configured default, `n` skips it. Explicit flags are honored without prompting.
 */
export async function resolveOptionalRuntimeDeps(
  rawOpts: GlobalRuntimeCommandOptions,
  cmd: OptionSourceLookup | undefined,
  opts: ResolveOptionalRuntimeDepsOptions,
): Promise<{ externalSkills: boolean; codegraph: boolean }> {
  let externalSkills = rawOpts.externalSkills === true;
  let codegraph = rawOpts.codegraph === true;
  if (!opts.interactive) return { externalSkills, codegraph };

  const input = opts.input ?? process.stdin;
  const output = opts.output ?? process.stdout;
  const rl = createInterface({ input, output, terminal: false });
  try {
    if (cmd?.getOptionValueSource('externalSkills') !== 'cli') {
      const answer = (await rl.question('Install external skills (Waza, Mermaid, cross-review)? [y/N]: ')).trim().toLowerCase();
      output.write('\n');
      externalSkills = answer === 'y' || answer === 'yes';
    }
    if (cmd?.getOptionValueSource('codegraph') !== 'cli') {
      const answer = (await rl.question('Install CodeGraph CLI and configure its MCP server? [y/N]: ')).trim().toLowerCase();
      output.write('\n');
      codegraph = answer === 'y' || answer === 'yes';
    }
  } finally {
    rl.close();
  }
  return { externalSkills, codegraph };
}

/** A selection on its way into a host transaction: its kind, the setup set (`run`) and the recorded set (`record`). */
interface TransactionSelection {
  readonly selection: PluginSelection;
  readonly run: readonly PluginId[];
  readonly record: readonly PluginId[];
}

function runTransactionalSelectionProjection(
  selected: TransactionSelection,
  options: GlobalRuntimeOptions,
  commitState: (transaction: ReturnType<typeof beginInstallHostTransaction>, result: GlobalRuntimeResult) => InstallState,
): { result: GlobalRuntimeResult; state: InstallState | null } {
  const plugins = selected.run;
  const recorded = { selection: selected.selection, plugins: selected.record };
  const transactionEnv = runtimeHostTransactionEnv(options.env);
  // An invalid XDG_STATE_HOME must fail before the lock creates transaction state.
  providerSkillLock(transactionEnv.HOME!, transactionEnv);
  return withRuntimeTransactionLock(globalRuntimeScope(transactionEnv), (lock) => {
    const transaction = beginInstallHostTransaction(runtimeHostMutationPaths(transactionEnv), transactionEnv, { runtimeLock: lock });
    let result: GlobalRuntimeResult;
    let priorReceipts: readonly ManagedInstallSurface[];
    try {
      priorReceipts = readInstallState(transactionEnv)?.ownership_manifest ?? [];
      prepareInstallSelectionSwitch(selected.record, options.env);
      if (plugins.includes('architecture')) registerArchitecturePlugin();
      result = runGlobalRuntimeSetup({ ...options, plugins, runtimeLock: lock });
    } catch (error) {
      rollbackRuntimeTransaction(transaction, transactionEnv, recorded, error);
      throw error;
    }
    if (result.exitCode !== 0) {
      rollbackRuntimeTransaction(transaction, transactionEnv, recorded,
        new Error(`install failed: ${result.stderr || result.lines.join('; ') || `exit ${result.exitCode}`}`), result);
      return { result, state: null };
    }
    let owned: GlobalRuntimeResult;
    try {
      commitState(transaction, result);
      owned = ownFreshWazaSharedRules(result, options.target ?? 'both', transactionEnv, priorReceipts);
    } catch (error) {
      rollbackRuntimeTransaction(transaction, transactionEnv, recorded, error, result);
      throw error;
    }
    if (owned.exitCode !== 0) {
      rollbackRuntimeTransaction(transaction, transactionEnv, recorded,
        new Error(`install failed: ${owned.stderr || owned.lines.join('; ')}`), owned);
      return { result: owned, state: null };
    }
    try {
      const state = requireInstallState(transactionEnv);
      captureConfigurationRestores(transaction, hostConfigurationRoot(transactionEnv));
      commitInstallHostTransaction(transaction);
      return { result: owned, state };
    } catch (error) {
      rollbackRuntimeTransaction(transaction, transactionEnv, recorded, error, owned);
      throw error;
    }
  });
}

function newPiSurfaces(result?: GlobalRuntimeResult) {
  return result?.steps.flatMap(step => step.owned_surface ? [step.owned_surface] : []) ?? [];
}

function compensatePiPackages(surfaces: Iterable<ManagedInstallSurface>, env: NodeJS.ProcessEnv) {
  const unresolved: ManagedInstallSurface[] = [];
  const failures: unknown[] = [];
  for (const surface of surfaces) {
    try { removePiPackage(surface.path, env); }
    catch (error) { unresolved.push(surface); failures.push(error); }
  }
  return { unresolved, failures };
}

/** Restore the snapshot bytes only. A failed restore keeps both errors. */
function restoreTransactionBytes(transaction: ReturnType<typeof beginInstallHostTransaction>, cause: unknown): void {
  try { rollbackInstallHostTransaction(transaction); } catch (restoreError) {
    throw new AggregateError([cause, restoreError], `runtime transaction failed and its restore failed: ${[cause, restoreError].map(item => (item instanceof Error ? item.message : String(item))).join('; ')}`);
  }
}

function rollbackRuntimeTransaction(
  transaction: ReturnType<typeof beginInstallHostTransaction>, env: NodeJS.ProcessEnv,
  recorded: { readonly selection: PluginSelection; readonly plugins: readonly PluginId[] }, cause: unknown, result?: GlobalRuntimeResult,
): void {
  const failures: unknown[] = [];
  const surfaces = new Map(newPiSurfaces(result).map(surface => [surface.path, surface]));
  try {
    for (const surface of newPiPackagesSinceTransaction(transaction, env)) surfaces.set(surface.path, surface);
  } catch (error) { failures.push(error); }
  const compensation = compensatePiPackages(surfaces.values(), env);
  const unresolved = compensation.unresolved;
  failures.push(...compensation.failures);
  // The filesystem contains the ownership ledger. Restore it even when Pi
  // cleanup fails, then retain the unresolved external resources in that ledger.
  try {
    rollbackInstallHostTransaction(transaction, { unresolvedPi: unresolved.length ? { ...recorded, surfaces: unresolved, env } : undefined });
  } catch (error) { failures.push(error); }
  if (failures.length) {
    const errors = [cause, ...failures];
    throw new AggregateError(errors, `runtime transaction failed and compensation was incomplete: ${errors.map(error => error instanceof Error ? error.message : String(error)).join('; ')}`);
  }
}

function runtimeHostTransactionEnv(env: NodeJS.ProcessEnv | undefined): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...env,
    HOME: env?.HOME ?? process.env.HOME ?? homedir(),
  };
}

function runtimeHostMutationPaths(env: NodeJS.ProcessEnv): readonly string[] {
  const paths = [...installProfileTransactionPaths(env)];
  if (process.platform === 'win32') paths.push(windowsProtectedHelperConfigPath());
  return [...new Set(paths)];
}


function candidateSourceRoot(): string {
  return realpathSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..'));
}

/**
 * Internal candidate entrypoint. It intentionally never acquires the global
 * runtime lock: the predecessor process owns that lock and its transaction.
 */
export function runCandidateRuntimeReconciliation(
  encodedRequest: string,
  env: NodeJS.ProcessEnv = process.env,
): CandidateReconciliationReceipt {
  const sourceRoot = candidateSourceRoot();
  const candidate = candidatePackageIdentity(sourceRoot);
  const request = parseCandidateRequest(encodedRequest, candidate.version);
  if (
    env.REPO_HARNESS_RUNTIME_RECONCILIATION_PARENT !== '1'
    || env.REPO_HARNESS_RUNTIME_RECONCILIATION_TOKEN !== request.parent_token
  ) {
    throw new Error('candidate reconciliation requires an explicit parent transaction capability');
  }
  const capability = consumeCandidateReconciliationCapability(request, globalRuntimeScope(env));
  const runtimeLock = parentRuntimeTransactionContext(globalRuntimeScope(env), { pid: capability.parent_pid, lockPath: capability.lock_path, ownerToken: capability.lock_owner_token });
  if (
    candidate.root !== request.candidate.root
    || candidate.version !== request.candidate.version
    || candidate.package_digest !== request.candidate.package_digest
  ) {
    throw new Error('candidate reconciliation package authority mismatch');
  }
  // This package version owns the resolution: it knows the plugins that it ships.
  // The parent reads and writes no install state after this handoff: this commit owns
  // the whole state, including the Pi package and Pi skill-root receipts.
  const complete = request.sync_skill && request.host_adapters;
  const state = requireInstallState(env);
  const resolved = resolveRecordedSelection(state, request.target, env, { partial: !complete });
  const plugins = resolved.run;
  if (plugins.includes('architecture')) registerArchitecturePlugin();
  // Stdout is the receipt; the parent shows this stderr in its reconcile step.
  for (const line of [...selectionLines(resolved), ...commandPluginRepairLines(state.selection)]) console.error(line);
  const piSkillRoot = piSkillRootSnapshots(env);
  const runtime = runGlobalRuntimeSetup({
    runtimeLock,
    sourceRoot,
    cwd: request.cwd,
    env,
    target: request.target,
    plugins,
    installCli: false,
    installSpec: `repo-harness@${candidate.version}`,
    syncSkill: request.sync_skill,
    hostAdapters: request.host_adapters,
    externalSkills: request.external_skills,
    obsidianSkills: request.obsidian_skills,
    codegraph: request.codegraph,
    brainRoot: request.brain_root,
    reportLanguage: request.report_language,
    updateMode: true,
  });
  if (runtime.exitCode !== 0) {
    throw new Error(`candidate reconciliation failed: ${runtime.lines.join('; ')}`);
  }
  try {
    // Stdout is the receipt. Keep maintenance advice visible without
    // changing the receipt parsed by an already released parent.
    const daemon = runtime.steps.find(step => step.step === 'check shared ArchContext daemon');
    if (daemon?.status === 'skipped') console.error(daemon.detail);
    // The parent shows candidate stderr in its reconcile step. Files that update
    // did not sync must stay visible with their next action.
    const globalRules = runtime.steps.find(step => step.step === GLOBAL_RULES_REFRESH_STEP);
    if (globalRules) console.error(`[runtime] ${globalRules.status}: ${globalRules.step} - ${globalRules.detail}`);
    // The hc step result carries its PATH hint when the install dir is not on PATH.
    const herdrCore = runtime.steps.find(step => step.step === HERDR_CORE_STEP);
    if (herdrCore) console.error(`[runtime] ${herdrCore.status}: ${herdrCore.step} - ${herdrCore.detail}`);

    const adapterDigests = request.host_adapters
      ? assertInstalledAdapterProjection(request.target, env)
      : {};
    let ownershipManifestDigest: string | null = null;
    if (complete) {
      const applied = applyInstallSelection(state.selection, resolved.record, env, new Date(), piSkillRoot, {
        additionalSurfaces: newPiSurfaces(runtime), kept: resolved.kept.map(entry => entry.id),
      });
      ownershipManifestDigest = sha256(JSON.stringify(applied.state.ownership_manifest));
    } else if (request.target === 'both') {
      recordPiInstallOwnership(newPiSurfaces(runtime), env, piSkillRoot);
    }
    const receipt: CandidateReconciliationReceipt = {
      protocol: CANDIDATE_RECONCILIATION_PROTOCOL,
      transaction_id: request.transaction_id,
      candidate_package_root: candidate.root,
      candidate_version: candidate.version,
      candidate_package_digest: candidate.package_digest,
      route_registry_digest: routeRegistryDigest(),
      selected_target: request.target,
      adapter_projection_digests: adapterDigests,
      ownership_manifest_digest: ownershipManifestDigest,
      reconciliation_scope: complete ? 'complete' : 'partial',
      verified_at: new Date().toISOString(),
    };
    assertCandidateReconciliationReceipt(receipt, {
      transaction_id: request.transaction_id,
      candidate,
      target: request.target,
      require_complete: complete,
      require_adapter_projection: request.host_adapters,
    });
    return receipt;
  } catch (error) {
    const compensation = compensatePiPackages(newPiSurfaces(runtime), env);
    // The parent must still see ownership when candidate cleanup fails, so
    // its filesystem rollback can preserve the unresolved external effect.
    try { recordUnresolvedPiOwnership(state.selection, resolved.record, compensation.unresolved, env, request.transaction_id); }
    catch (ownershipError) { compensation.failures.push(ownershipError); }
    if (compensation.failures.length) {
      const errors = [error, ...compensation.failures];
      throw new AggregateError(errors, `candidate reconciliation failed: ${errors.map(item => item instanceof Error ? item.message : String(item)).join('; ')}`);
    }
    throw error;
  }
}

function candidateHandoffContext(
  transaction: ReturnType<typeof beginInstallHostTransaction>,
  lock: ExclusiveDirectoryLockHandle,
): NonNullable<GlobalRuntimeOptions['candidateHandoff']> {
  const context = {
    transactionId: sha256(transaction.backup_root),
    transactionBackupRoot: transaction.backup_root,
    parentToken: randomBytes(32).toString('hex'),
  };
  publishCandidateReconciliationCapability({
    transactionId: context.transactionId,
    transactionBackupRoot: context.transactionBackupRoot,
    parentToken: context.parentToken,
    parentPid: process.pid,
    lockPath: lock.lockPath,
    lockOwnerToken: lock.ownerToken,
  });
  return context;
}

export function runTransactionalRuntimeRefresh(
  options: GlobalRuntimeOptions,
  setup: (options: GlobalRuntimeOptions) => GlobalRuntimeResult = (setupOptions) => runGlobalRuntimeSetup(setupOptions),
): GlobalRuntimeResult {
  const transactionEnv = runtimeHostTransactionEnv(options.env);
  // An invalid XDG_STATE_HOME must fail before the lock creates transaction state.
  providerSkillLock(transactionEnv.HOME!, transactionEnv);
  return withRuntimeTransactionLock(globalRuntimeScope(transactionEnv), (lock) => {
    const transaction = beginInstallHostTransaction(runtimeHostMutationPaths(transactionEnv), transactionEnv, { runtimeLock: lock });
    let plugins: readonly PluginId[];
    // Null when the caller passes its own plugin set; then the recorded state does not change.
    let recordedSelection: { readonly state: InstallState; readonly resolved: SelectionResolution } | null = null;
    try {
      if (options.plugins !== undefined) plugins = options.plugins;
      else {
        const state = requireInstallState(transactionEnv);
        const resolved = resolveRecordedSelection(state, options.target ?? 'both', transactionEnv, {
          partial: options.syncSkill === false || options.hostAdapters === false,
        });
        recordedSelection = { state, resolved };
        plugins = resolved.run;
      }
      assertArchitecturePolicySelection(options.cwd ?? process.cwd(), plugins, transactionEnv);
      if (plugins.includes('architecture')) registerArchitecturePlugin();
    } catch (error) {
      // Nothing outside the snapshot ran yet, so a restore is enough.
      restoreTransactionBytes(transaction, error);
      throw error;
    }
    const recorded = recordedSelection === null
      ? { selection: plugins, plugins }
      : { selection: recordedSelection.state.selection, plugins: recordedSelection.resolved.record };
    let result: GlobalRuntimeResult;
    try {
      result = setup({ ...options, plugins, runtimeLock: lock, candidateHandoff: candidateHandoffContext(transaction, lock) });
    } catch (error) {
      rollbackRuntimeTransaction(transaction, transactionEnv, recorded, error);
      throw error;
    }
    // After a candidate handoff the parent reads and writes no install state: the candidate
    // version may record plugins that this version does not know. A failure restores bytes only.
    const byCandidate = reconciledByCandidate(result);
    if (result.exitCode !== 0) {
      const cause = new Error(`runtime refresh failed: ${result.stderr || result.lines.join('; ') || `exit ${result.exitCode}`}`);
      if (byCandidate) restoreTransactionBytes(transaction, cause);
      else rollbackRuntimeTransaction(transaction, transactionEnv, recorded, cause, result);
      return result;
    }
    try {
      if (!byCandidate) {
        if (recordedSelection !== null) {
          const { state, resolved } = recordedSelection;
          if (selectionChanged(state, resolved)) {
            applyInstallSelection(state.selection, resolved.record, transactionEnv, new Date(), transaction, {
              agentFleetVerified: agentFleetVerified(result), additionalSurfaces: newPiSurfaces(result), kept: resolved.kept.map(entry => entry.id),
            });
          }
          result = { ...result, lines: [...selectionLines(resolved), ...commandPluginRepairLines(state.selection), ...result.lines] };
        }
        if ((options.target ?? 'both') === 'both') recordPiInstallOwnership(newPiSurfaces(result), transactionEnv, transaction);
      }
      captureConfigurationRestores(transaction, hostConfigurationRoot(transactionEnv));
      commitInstallHostTransaction(transaction);
      return result;
    } catch (error) {
      if (byCandidate) restoreTransactionBytes(transaction, error);
      else rollbackRuntimeTransaction(transaction, transactionEnv, recorded, error, result);
      throw error;
    }
  });
}

/** True when the resolved record set differs from the recorded plugin ids, so the state must commit it. */
function selectionChanged(state: InstallState, resolved: SelectionResolution): boolean {
  return resolved.record.join(',') !== enabledPlugins(state).join(',');
}

function selectionLines(resolved: Pick<SelectionResolution, 'skipped' | 'kept'> & { readonly notAdded?: readonly PluginId[] }): string[] {
  return [
    ...resolved.skipped.map(skippedPluginLine),
    ...resolved.kept.map(keptPluginLine),
    ...(resolved.notAdded ?? []).map(notAddedPluginLine),
  ].map(line => `[plugins] ${line}`);
}

async function runGlobalRuntimeBootstrap(
  rawOpts: GlobalRuntimeCommandOptions,
  cmd?: OptionSourceLookup,
): Promise<never> {
  const target = assertTarget(rawOpts.target, 'install');
  const current = readInstallState();
  // `--plugins` selects exactly its ids, `--no-plugins` core only, and neither `all`.
  const selection: PluginSelection = rawOpts.plugins === false ? [] : rawOpts.plugins === undefined ? 'all' : parsePluginList(rawOpts.plugins);
  const resolved = resolveRecordedSelection({ selection, plugins: current?.plugins ?? [] }, target);
  const { run: plugins, record } = resolved;
  assertArchitecturePolicySelection(process.cwd(), plugins);
  const basePlan = planInstallSelection(selection, resolved, current, process.env);
  const plan = { ...basePlan,
    pi_package: planPiPackage(basePlan.pi_package.source, plugins.includes('pi') && target === 'both' && rawOpts.hooks !== false),
    skill_projections: rawOpts.syncSkill === false ? [] : basePlan.skill_projections.filter(projection => projection.host !== 'pi' || target === 'both'),
  };
  if (rawOpts.dryRun === true) {
    const removedDanglingSkillLinks = rawOpts.syncSkill === false ? [] : removeOwnedDanglingSkillLinks(
      join(dirname(fileURLToPath(import.meta.url)), '..', '..'),
      effectiveSkillRoots(plugins),
      true,
      current?.ownership_manifest,
    );
    if (rawOpts.json === true) console.log(JSON.stringify({ ...plan, removedDanglingSkillLinks }, null, 2));
    else {
      console.log(`[plugins] selection=${selectionLabel(selection)}`);
      console.log(`[plugins] requested=${record.join(',') || '(core only)'} current=${plan.current_plugins === null ? 'none' : plan.current_plugins.join(',') || '(core only)'}`);
      console.log(`[plugins] install=${plan.install.join(',') || '(none)'}`);
      console.log(`[plugins] keep=${plan.keep.join(',') || '(none)'}`);
      console.log(`[plugins] remove=${plan.remove.join(',') || '(none)'}`);
      for (const line of selectionLines(resolved)) console.log(line);
      for (const link of removedDanglingSkillLinks) console.log(`[sync-installed] would remove dangling skill symlink: ${link}`);
    }
    process.exit(0);
  }
  const interactive = process.stdin.isTTY === true && process.stdout.isTTY === true && rawOpts.json !== true;
  // Waza and Mermaid are core and fetched by default; CodeGraph follows the architecture plugin.
  const defaults = { externalSkills: true, codegraph: plugins.includes('architecture') };
  const selectedDefaults = {
    externalSkills: cmd?.getOptionValueSource('externalSkills') === 'cli'
      ? rawOpts.externalSkills !== false
      : defaults.externalSkills,
    codegraph: cmd?.getOptionValueSource('codegraph') === 'cli'
      ? rawOpts.codegraph !== false && defaults.codegraph
      : defaults.codegraph,
  };
  const { externalSkills, codegraph } = interactive
    ? await resolveOptionalRuntimeDeps({
        ...rawOpts,
        externalSkills: selectedDefaults.externalSkills,
        codegraph: selectedDefaults.codegraph,
      }, cmd, { interactive })
    : selectedDefaults;
  const transaction = runTransactionalSelectionProjection({ selection, run: plugins, record }, {
    target,
    installCli: rawOpts.cli !== false,
    syncSkill: rawOpts.syncSkill !== false,
    hostAdapters: rawOpts.hooks !== false,
    externalSkills,
    obsidianSkills: rawOpts.withObsidianSkills === true,
    codegraph,
    brainRoot: rawOpts.brainRoot,
    reportLanguage: rawOpts.reportLanguage === undefined ? undefined : parseReportLanguageFlag(rawOpts.reportLanguage),
  }, (transaction, result) => (
    applyInstallSelection(
      selection,
      record,
      process.env,
      new Date(),
      transaction,
      { agentFleetVerified: agentFleetVerified(result), additionalSurfaces: newPiSurfaces(result), kept: resolved.kept.map(entry => entry.id) },
    ).state
  ));
  const result = transaction.result;
  const installed = transaction.state;
  if (rawOpts.json === true) {
    console.log(JSON.stringify({ ...result, install_plan: plan, installed_state: installed }, null, 2));
  } else {
    console.log(`[plugins] ${record.join(',') || '(core only)'}`);
    for (const line of selectionLines(resolved)) console.log(line);
    for (const line of result.lines) console.log(line);
  }
  process.exit(result.exitCode);
}

export function buildProgram(): Command {
  const program = new Command();
  program
    .name('repo-harness')
    .description('Make Claude/Codex work resumable, reviewable, and repo-local')
    .addHelpText('after', '\nGlobal shortcuts:\n  -V, --version  output the version number')
    .exitOverride();

  program
    .command('install')
    .description('Install the repo-harness global runtime; with --location, install only hook adapters')
    .option('--target <target>', `Target host: ${TARGET_HELP}`, 'both')
    .option('--plugins <ids>', `Enable exactly these comma-separated plugins (${PLUGIN_IDS.join('|')}); omitted, every plugin that this host can run`)
    .option('--no-plugins', 'Enable core only')
    .option('--dry-run', 'Print the install/keep/remove plugin plan without writing')
    .option('--state', 'Print the effective install state without writing')
    .option('--rollback', 'Restore the previous install state')
    .option('--location <location>', `Adapter-only install location: ${LOCATION_HELP}`)
    .option('--no-cli', 'Skip installing the repo-harness CLI globally')
    .option('--no-sync-skill', 'Skip refreshing repo-harness skill aliases under host skill roots')
    .option('--no-hooks', 'Skip global hook adapter installation during full runtime install')
    .option('--no-external-skills', 'Skip mutable third-party Waza and Mermaid skill bootstrap')
    .option('--with-obsidian-skills', 'Explicitly install the pinned obsidian-markdown and obsidian-cli companion Skills')
    .option('--no-codegraph', 'Skip CodeGraph CLI/MCP configuration')
    .option('--brain-root <path>', 'Brain vault root to persist for repo-harness brain commands')
    .option('--report-language <language>', `Reporting language for Global Working Rules that record none: ${REPORT_LANGUAGE_FLAG_VALUES.join('|')}`)
    .option('--json', 'Output JSON instead of human-readable text')
    .action(async (rawOpts: GlobalRuntimeCommandOptions & { location?: string; state?: boolean; rollback?: boolean }, cmd: Command) => {
      const target = assertTarget(rawOpts.target, 'install');
      const location = rawOpts.location === undefined ? undefined : assertLocation(rawOpts.location, 'install');
      if (rawOpts.reportLanguage !== undefined && rawOpts.location !== undefined) {
        throw new Error('--report-language cannot be combined with --location');
      }
      if (rawOpts.plugins !== undefined && (rawOpts.state === true || rawOpts.rollback === true || rawOpts.location !== undefined)) {
        throw new Error('--plugins and --no-plugins cannot be combined with --state, --rollback, or --location');
      }
      if (rawOpts.dryRun === true && rawOpts.location !== undefined) {
        throw new Error('--dry-run cannot be combined with --location');
      }
      if (rawOpts.state === true) {
        const state = readInstallState();
        console.log(JSON.stringify(state ? installStateStatus(state) : null, null, 2));
        process.exit(state ? 0 : 1);
      }
      if (rawOpts.rollback === true) {
        const current = readInstallState();
        if (!current?.previous) throw new Error('no previous install transaction to roll back');
        const plugins = enabledPlugins(current.previous);
        const transaction = runTransactionalSelectionProjection({ selection: current.previous.selection, run: plugins, record: plugins }, {
          target,
          installCli: false,
          syncSkill: true,
          hostAdapters: true,
          externalSkills: true,
          codegraph: plugins.includes('architecture'),
        }, (transaction) => rollbackInstallSelection(process.env, transaction));
        const result = transaction.result;
        const restored = transaction.state;
        if (rawOpts.json === true) {
          console.log(JSON.stringify({ ...result, restored_state: restored }, null, 2));
        } else {
          for (const line of result.lines) console.log(line);
          if (restored) console.log(`[plugins] restored=${enabledPlugins(restored).join(',') || '(core only)'}`);
        }
        process.exit(result.exitCode);
      }
      if (location === undefined) {
        await runGlobalRuntimeBootstrap(rawOpts, cmd);
        return;
      }
      // Adapter-only installs still mutate a core-owned host surface. Validate
      // the install-state protocol before touching it so an older state
      // cannot be mixed with the current route projection.
      readInstallState();
      const installAdapters = () => runInstall({ target, location });
      const result = withRuntimeTransactionLock(globalRuntimeScope(process.env), installAdapters);
      for (const line of result.lines) console.log(line);
      process.exit(result.exitCode);
    });

  program
    .command('init')
    .description('Install or refresh the repo-local harness workflow in an existing repo')
    .argument('[action]', 'Optional action: rollback')
    .option('--repo <path>', 'Target repository path (defaults to cwd)')
    .option('--transaction <path>', 'Adoption transaction manifest to restore when action is rollback')
    .option('--dry-run', 'Plan repo harness changes without applying them')
    .option('--target <target>', `Host target for readiness checks: ${TARGET_HELP}`, 'both')
    .option('--no-verify', 'Skip repo workflow verification after apply')
    .option('--no-codegraph', 'Skip building the CodeGraph index and MCP readiness check')
    .option('--mode <mode>', 'Adoption mode: minimal|standard|self-host', 'standard')
    .option('--sync-codegraph', 'Sync the CodeGraph index after ensure')
    .option('--json', 'Output JSON instead of human-readable text')
    .action(async (action: string | undefined, rawOpts: {
      repo?: string;
      transaction?: string;
      dryRun?: boolean;
      target: string;
      verify?: boolean;
      codegraph?: boolean;
      mode?: string;
      syncCodegraph?: boolean;
      json?: boolean;
    }) => {
      if (action) {
        if (action !== 'rollback') {
          console.error(`repo-harness init: unknown action "${action}"`);
          process.exit(2);
        }
        if (rawOpts.transaction) {
          const rollback = rollbackAdoptionTransaction({ repoRoot: rawOpts.repo ?? process.cwd(), transaction: rawOpts.transaction });
          if (rawOpts.json === true) {
            console.log(JSON.stringify(rollback, null, 2));
          } else {
            console.log(`[init] ${rollback.ok ? 'ok' : 'failed'}: rollback transaction ${rollback.transactionManifestPath}`);
            for (const result of rollback.results) {
              const target = result.path ? ` ${result.path}` : '';
              const detail = result.error ? ` - ${result.error}` : '';
              console.log(`[init] ${result.status}: ${result.action}${target}${detail}`);
            }
          }
          process.exit(rollback.ok ? 0 : 1);
        }
        console.error('repo-harness init rollback: --transaction is required');
        process.exit(2);
      }
      const target = assertTarget(rawOpts.target, 'init');
      const mode = assertAdoptionMode(rawOpts.mode ?? 'standard', 'init');
      // The planner reads documentation authoring env only from its options,
      // so the public command boundary supplies the real process environment.
      const env = process.env;
      if (rawOpts.dryRun === true) {
        const plan = runAdoptionPlan({
          repo: rawOpts.repo,
          mode,
          json: rawOpts.json === true,
          explicitRepo: rawOpts.repo !== undefined,
          env,
        });
        writeAllSync(1, plan.output);
        process.exit(plan.exitCode);
      }
      const common = {
        repo: rawOpts.repo,
        apply: true,
        target,
        verify: rawOpts.verify !== false,
        codegraph: rawOpts.codegraph !== false,
        syncCodegraph: rawOpts.syncCodegraph === true,
        mode,
        env,
      };
      const result = runInit({ ...common, plugins: recordedPlugins(recordedSelection) });
      if (rawOpts.json === true) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        for (const line of result.lines) console.log(line);
      }
      process.exit(result.exitCode);
    });

  program
    .command('update')
    .description('Update the global repo-harness CLI and user-level managed runtime')
    .option('--target <target>', `Host target for adapters and runtime skills: ${TARGET_HELP}`, 'both')
    .option('--version <version>', 'Install a specific repo-harness package version')
    .option('--channel <channel>', 'Install package channel: latest|next')
    .option('--check', 'Run the read-only setup check without refreshing runtime')
    .option('--check-updates', 'Include network-backed version update advisories in setup check output')
    .option('--no-runtime-refresh', 'Skip runtime refresh and run the read-only setup check only')
    .option('--no-cli', 'Skip installing the repo-harness CLI globally')
    .option('--no-sync-skill', 'Skip refreshing repo-harness skill aliases under host skill roots')
    .option('--no-hooks', 'Skip global hook adapter installation')
    .option('--with-external-skills', 'Also refresh mutable third-party Waza and Mermaid providers')
    .option('--with-obsidian-skills', 'Explicitly install or verify the pinned obsidian-markdown and obsidian-cli companion Skills')
    .option('--no-external-skills', 'Do not refresh third-party Waza and Mermaid providers (default)')
    .option('--configure-codegraph', 'Refresh CodeGraph CLI/MCP (default during update)')
    .option('--no-codegraph', 'Skip refreshing the global CodeGraph CLI/MCP')
    .option('--brain-root <path>', 'Brain vault root for manifest sync')
    .option('--report-language <language>', `Reporting language for Global Working Rules that record none: ${REPORT_LANGUAGE_FLAG_VALUES.join('|')}`)
    .option('--json', 'Output JSON instead of human-readable text')
    .action((rawOpts: {
      target: string;
      version?: string;
      channel?: string;
      check?: boolean;
      checkUpdates?: boolean;
      runtimeRefresh?: boolean;
      cli?: boolean;
      syncSkill?: boolean;
      hooks?: string | false;
      withExternalSkills?: boolean;
      withObsidianSkills?: boolean;
      externalSkills?: boolean;
      codegraph?: boolean;
      configureCodegraph?: boolean;
      brainRoot?: string;
      reportLanguage?: string;
      json?: boolean;
    }) => {
      const target = assertTarget(rawOpts.target, 'update');
      if (rawOpts.channel !== undefined && !['latest', 'next'].includes(rawOpts.channel)) {
        console.error('repo-harness update: invalid --channel (expected: latest, next)');
        process.exit(2);
      }
      if (rawOpts.reportLanguage !== undefined && !REPORT_LANGUAGE_FLAG_VALUES.includes(rawOpts.reportLanguage as ReportLanguageFlag)) {
        console.error(`repo-harness update: invalid --report-language (expected: ${REPORT_LANGUAGE_FLAG_VALUES.join(', ')})`);
        process.exit(2);
      }
      if (rawOpts.check === true || rawOpts.runtimeRefresh === false) {
        const report = runInitHook(CLI_PORTS.doctor, {
          target,
          checkUpdates: rawOpts.checkUpdates === true,
        });
        console.log(formatInitHook(report, rawOpts.json === true));
        process.exit(report.status === 'blocked' ? 1 : 0);
      }
      const installSpec = rawOpts.version
        ? `repo-harness@${rawOpts.version}`
        : rawOpts.channel
          ? `repo-harness@${rawOpts.channel}`
          : 'repo-harness@latest';
      const result = runTransactionalRuntimeRefresh({
        target,
        installCli: rawOpts.cli !== false,
        installSpec,
        updateMode: true,
        syncSkill: rawOpts.syncSkill !== false,
        hostAdapters: rawOpts.hooks !== false,
        externalSkills: rawOpts.externalSkills === false ? false : rawOpts.withExternalSkills === true ? true : undefined,
        obsidianSkills: rawOpts.withObsidianSkills === true,
        codegraph: rawOpts.codegraph === false ? false : rawOpts.configureCodegraph === true ? true : undefined,
        brainRoot: rawOpts.brainRoot,
        reportLanguage: rawOpts.reportLanguage as ReportLanguageFlag | undefined,
      });
      if (result.exitCode === 0) {
        result.lines.push(updateLeftoverSummary(process.cwd(), rawOpts.cli !== false));
        result.lines.push(updateRegisteredUpgradeSummary(process.cwd(), rawOpts.cli !== false));
      }
      if (rawOpts.json === true) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        for (const line of result.lines) console.log(line);
      }
      process.exit(result.exitCode);
    });

  program
    .command('uninstall')
    .description('Remove owned user-level configuration; preserve user changes and static history')
    .option('--target <target>', `Target host: ${TARGET_HELP}`, 'both')
    .option('--location <location>', `Install location: ${LOCATION_HELP}`, 'global')
    .option('--dry-run', 'Preview cleanup without filesystem writes')
    .option('--recover-interrupted', 'Restore recorded fragments after interrupted setup; overwrites later edits to those fragments')
    .option('--json', 'Output the cleanup result as JSON')
    .action((rawOpts: { target: string; location: string; dryRun?: boolean; recoverInterrupted?: boolean; json?: boolean }) => {
      const target = assertTarget(rawOpts.target, 'uninstall');
      const location = assertLocation(rawOpts.location, 'uninstall');
      const uninstallAdapters = () => runUninstall({ target, location, dryRun: rawOpts.dryRun, recoverInterrupted: rawOpts.recoverInterrupted });
      const result = uninstallAdapters();
      if (rawOpts.json) console.log(JSON.stringify(result, null, 2));
      else for (const line of result.lines) console.log(line);
      process.exit(result.exitCode);
    });

  program
    .command('status')
    .description('Show CLI version, host install status, route coverage, and repo opt-in state')
    .option('--json', 'Output JSON instead of human-readable text')
    .action((rawOpts: { json?: boolean }) => {
      const report = runStatus();
      console.log(formatStatus(report, rawOpts.json === true));
      process.exit(0);
    });

  program
    .command('doctor')
    .description('Run read-only readiness diagnostics (PATH, version, hosts, trust state)')
    .option('--json', 'Output JSON instead of human-readable text')
    .action((rawOpts: { json?: boolean }) => {
      const report = runDoctor(CLI_PORTS.doctor);
      console.log(formatDoctor(report, rawOpts.json === true));
      process.exit(report.summary.fail > 0 ? 1 : 0);
    });

  program.addCommand(buildInitHookCommand(CLI_PORTS.doctor));
  program.addCommand(buildReviewCommand(taskReviewRunner));
  program.addCommand(pluginCommand(buildModuleCommand(), 'architecture'));
  program.addCommand(buildSetupCommand(CLI_PORTS.doctor));
  program.addCommand(buildUpgradeCommand());

  program
    .command('migrate')
    .description('Migrate legacy project-level hook adapters to the global CLI (dry-run by default)')
    .option('--apply', 'Commit changes (default is dry-run)')
    .option('--json', 'Output JSON plan')
    .action((rawOpts: { apply?: boolean; json?: boolean }) => {
      const plan = runMigrate({ apply: rawOpts.apply === true });
      console.log(formatMigratePlan(plan, rawOpts.json === true));
      process.exit(0);
    });

  const security = program
    .command('security')
    .description('Read-only security checks for local hook and editor task configs');
  security
    .command('scan')
    .description('Scan Claude/Codex hook configs and VS Code folder-open tasks')
    .option('--json', 'Output JSON instead of human-readable text')
    .option('--strict', 'Exit non-zero when high-risk or failed findings are present')
    .action((rawOpts: { json?: boolean; strict?: boolean }) => {
      const report = runSecurityScan();
      console.log(formatSecurityScan(report, rawOpts.json === true));
      const strictFailure = report.findings.some((finding) => finding.severity === 'high' || finding.severity === 'fail');
      process.exit(rawOpts.strict === true && strictFailure ? 1 : 0);
    });

  const tools = buildToolsCommand();
  for (const group of ['ensure', 'configure']) {
    const codegraph = tools.commands.find(command => command.name() === group)?.commands.find(command => command.name() === 'codegraph');
    if (!codegraph) throw new Error(`tools ${group} codegraph is not defined`);
    pluginCommand(codegraph, 'architecture', `tools ${group} codegraph`);
  }
  program.addCommand(tools);
  program.addCommand(buildHerdrCommand());
  program.addCommand(buildEventsCommand());
  program.addCommand(buildBrainCommand());
  program.addCommand(buildCapabilityContextCommand());
  program.addCommand(buildDocsCommand());
  const mcp = buildMcpCommand();
  for (const name of ['serve', 'doctor']) {
    const command = mcp.commands.find(candidate => candidate.name() === name);
    if (!command) throw new Error(`mcp ${name} is not defined`);
    pluginCommand(command, 'mcp', `mcp ${name}`);
  }
  program.addCommand(mcp);
  program.addCommand(buildRunCommand());
  program.addCommand(buildStateCommand());
  program.addCommand(buildPublicationCommand());
  program.addCommand(buildBoardCommand(boardHostPorts(), attentionHostPorts()));
  program.addCommand(buildFleetCommand());
  program.addCommand(buildBotsCommand());
  program.addCommand(pluginCommand(buildOperatorCommand(taskReviewRunner), 'operator'));
  program.addCommand(pluginCommand(buildWorktreesCommand(), 'operator'));
  program.addCommand(pluginCommand(buildCatchUpCommand(), 'operator'));
  program.addCommand(buildQuotaCommand());
  program.addCommand(pluginCommand(buildRefactorCommand(), 'architecture'));
  program.addCommand(pluginCommand(buildArchitectureProjectionCommand(), 'architecture'));
  program.addCommand(pluginCommand(buildArchitectureDebtCommand(), 'architecture'));
  program.addCommand(pluginCommand(buildStrategyCommand(), 'strategy-memory'));
  program.addCommand(buildRetentionCommand(CLI_PORTS.retention));
  program.addCommand(buildSeatsCommand());
  program
    .command('__reconcile-installed-runtime', { hidden: true })
    .description('Internal candidate-owned managed runtime reconciliation')
    .requiredOption('--request <base64url>', 'Parent transaction capability payload')
    .action((rawOpts: { request: string }) => {
      try {
        console.log(JSON.stringify(runCandidateRuntimeReconciliation(rawOpts.request)));
        process.exit(0);
      } catch (error) {
        console.error(`candidate reconciliation: ${(error as Error).message}`);
        process.exit(1);
      }
    });

  return program;
}

export async function runCli(argv: string[] = process.argv): Promise<void> {
  const bunVersion = process.versions.bun;
  if (!bunVersionIsSupported(bunVersion)) {
    throw new Error(
      `repo-harness requires Bun >= ${MIN_BUN_VERSION}; found ${bunVersion ?? 'unknown'}. Upgrade Bun and retry.`,
    );
  }
  const args = argv.slice(2);
  if (args.length === 1 && (args[0] === '--version' || args[0] === '-V')) {
    console.log(CLI_VERSION);
    return;
  }
  await buildProgram().parseAsync(argv);
}

if (import.meta.main) {
  try {
    await runCli(process.argv);
  } catch (err) {
    const e = err as { exitCode?: number; message?: string };
    // Commander already printed its own parse and help messages. Every other error prints here, also one with an exitCode.
    if (!(err instanceof CommanderError) && e.message) console.error(e.message);
    process.exit(typeof e.exitCode === 'number' ? e.exitCode : 1);
  }
}
