#!/usr/bin/env bun
import { buildPipelineCommand } from './commands/pipeline';
import { withRuntimeHostTransactionLock } from './installer/runtime-host-lock';
import { captureConfigurationRestores } from './installer/configuration-ownership';
/**
 * repo-harness CLI entry.
 *
 * Wires commander.js to the global runtime bootstrap, repo-local update,
 * hook adapter, status, doctor, migrate, security, and tool command bodies.
 */

import { Command } from 'commander';
import { randomBytes } from 'crypto';
import { readFileSync, realpathSync } from 'fs';
import { homedir } from 'os';
import { dirname, join } from 'path';
import { createInterface } from 'readline/promises';
import { fileURLToPath } from 'url';
import { askConfirm } from './tty-prompt';
import { runInstall, runUninstall, type InstallTargetSpec } from './commands/install';
import { writeAllSync } from './runtime/write-all-sync';
import { runInit } from './commands/init';
import { buildHookLibCommand, runHook } from './commands/hook';
import { CLI_VERSION, formatStatus, runStatus } from './commands/status';
import { formatDoctor, runDoctor } from './commands/doctor';
import { buildInitHookCommand, buildSetupCommand, formatInitHook, runInitHook } from './commands/init-hook';
import { formatMigratePlan, runMigrate } from './commands/migrate';
import { buildReviewCommand } from './commands/review';
import { buildTaskAgentCommand } from './commands/task-agent';
import { buildUpgradeCommand } from './commands/upgrade';
import { planLegacyLeftovers, formatLegacyLeftoverSummary } from '../core/upgrade/legacy-inventory';
import { buildToolsCommand } from './commands/tools';
import { buildHerdrCommand } from './commands/herdr';
import { buildBrainCommand } from './commands/brain';
import { buildCapabilityContextCommand } from './commands/capability-context';
import { buildDocsCommand } from './commands/docs';
import { buildMcpCommand } from './commands/mcp';
import { buildChatgptCommand } from './commands/chatgpt';
import { buildRunCommand } from './commands/run';
import { buildStateCommand } from './commands/state';
import { buildSprintCommand } from './commands/sprint';
import { buildPublicationCommand } from './commands/publication';
import { buildFleetCommand } from './commands/fleet';
import { buildAutomationCommand } from './commands/automation';
import { buildRefactorCommand } from './commands/refactor';
import { buildOperatorCommand } from './commands/operator';
import { buildEngineerCommand } from './commands/engineer';
import { buildArchitectureProjectionCommand } from './commands/architecture-projection';
import { buildIntegrationCommand } from './commands/integration';
import { buildDelegationCommand } from './commands/delegation';
import { buildCollaborationCommand } from './commands/collaboration';
import { buildVerifiedContextCommand } from './commands/verified-context';
import { buildInterfaceChangeCommand } from './commands/interface-change';
import { buildExternalSourceCommand } from './commands/external-source';
import { formatSecurityScan, runSecurityScan } from './commands/security';
import {
  MIN_BUN_VERSION,
  agentFleetVerified,
  bunVersionIsSupported,
  runGlobalRuntimeSetup,
  type GlobalRuntimeOptions,
  type GlobalRuntimeResult,
} from './commands/global-runtime';
import {
  assertCandidateReconciliationReceipt,
  assertInstalledAdapterProjection,
  candidatePackageIdentity,
  consumeCandidateReconciliationCapability,
  parseCandidateRequest,
  publishCandidateReconciliationCapability,
  routeRegistryDigest,
  sha256,
  type CandidateReconciliationReceipt,
} from './runtime/candidate-reconciliation';
import { windowsProtectedHelperConfigPath } from '../effects/runtime/protected-helper-platform';
import { removeOwnedDanglingSkillLinks } from '../effects/skill-tree-integrity';
import {
  applyInstallProfile,
  beginInstallHostTransaction,
  commitInstallHostTransaction,
  installProfileHostMutationPaths,
  installedProfileStatus,
  assertInstallProfile,
  planLegacyInstallProfileMigration,
  planInstallProfile,
  profileEnablesCodegraph,
  profileEnablesExternalSkills,
  prepareLegacyInstallProfileMigration,
  prepareInstallProfileSwitch,
  readInstalledProfile,
  rollbackInstallHostTransaction,
  rollbackInstallProfile,
  type InstalledProfileState,
  type InstallProfile,
  type LegacyInstalledProfileState,
} from './installer/install-profile';
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
import type { HookEvent, RouteId } from './hook/route-registry';
import type { Location } from './installer/types';

export const SUBCOMMANDS = [
  'init',
  'init-hook',
  'install',
  'uninstall',
  'hook',
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
  'chatgpt',
  'state',
  'publication',
  'fleet',
  'engineer',
  'architecture-projection',
  'integration',
  'delegation',
  'verified-context',
  'interface-change',
  'external-source',
  'refactor',
] as const;
export type Subcommand = (typeof SUBCOMMANDS)[number];

const TARGET_HELP = 'codex|claude|both';
const LOCATION_HELP = 'global|local';

interface GlobalRuntimeCommandOptions {
  target: string;
  cli?: boolean;
  syncSkill?: boolean;
  hooks?: string | false;
  externalSkills?: boolean;
  withReverseSkill?: boolean;
  withObsidianSkills?: boolean;
  codegraph?: boolean;
  brainRoot?: string;
  json?: boolean;
  profile?: string;
  dryRun?: boolean;
  migrateProfileState?: boolean;
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

function runTransactionalProfileProjection(
  profile: InstallProfile,
  options: GlobalRuntimeOptions,
  commitState: (
    transaction: ReturnType<typeof beginInstallHostTransaction>,
    migrationSource: LegacyInstalledProfileState | null,
    result: GlobalRuntimeResult,
  ) => InstalledProfileState,
  prepareProjection: () => LegacyInstalledProfileState | null = () => {
    prepareInstallProfileSwitch(profile, options.env);
    return null;
  },
): { result: GlobalRuntimeResult; state: InstalledProfileState | null } {
  const transactionEnv = runtimeHostTransactionEnv(options.env);
  return withRuntimeHostTransactionLock(transactionEnv, () => {
    const transaction = beginInstallHostTransaction(runtimeHostMutationPaths(transactionEnv), transactionEnv);
    let migrationSource: LegacyInstalledProfileState | null;
    let result: GlobalRuntimeResult;
    try {
      migrationSource = prepareProjection();
      result = runGlobalRuntimeSetup(options);
    } catch (error) {
      rollbackInstallHostTransaction(transaction);
      throw error;
    }
    if (result.exitCode !== 0) {
      rollbackInstallHostTransaction(transaction);
      return { result, state: null };
    }
    try {
      const state = commitState(transaction, migrationSource, result);
      captureConfigurationRestores(transaction, transactionEnv);
      commitInstallHostTransaction(transaction);
      return { result, state };
    } catch (error) {
      try {
        rollbackInstallHostTransaction(transaction);
      } catch (rollbackError) {
        throw new AggregateError([error, rollbackError], `install profile ${profile} failed and compensation was incomplete`);
      }
      throw error;
    }
  });
}

function runtimeHostTransactionEnv(env: NodeJS.ProcessEnv | undefined): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...env,
    HOME: env?.HOME ?? process.env.HOME ?? homedir(),
  };
}

function runtimeHostMutationPaths(env: NodeJS.ProcessEnv): readonly string[] {
  const paths = [...installProfileHostMutationPaths(env)];
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
  const request = parseCandidateRequest(encodedRequest);
  if (
    env.REPO_HARNESS_RUNTIME_RECONCILIATION_PARENT !== '1'
    || env.REPO_HARNESS_RUNTIME_RECONCILIATION_TOKEN !== request.parent_token
  ) {
    throw new Error('candidate reconciliation requires an explicit parent transaction capability');
  }
  const home = realpathSync(env.HOME ?? homedir());
  consumeCandidateReconciliationCapability(request, home);
  const sourceRoot = candidateSourceRoot();
  const candidate = candidatePackageIdentity(sourceRoot);
  if (
    candidate.root !== request.candidate.root
    || candidate.version !== request.candidate.version
    || candidate.package_digest !== request.candidate.package_digest
  ) {
    throw new Error('candidate reconciliation package authority mismatch');
  }

  const runtime = runGlobalRuntimeSetup({
    sourceRoot,
    cwd: request.cwd,
    env,
    target: request.target,
    profile: request.profile,
    installCli: false,
    syncSkill: request.sync_skill,
    hostAdapters: request.host_adapters,
    externalSkills: request.external_skills,
    reverseSkill: request.reverse_skill,
    obsidianSkills: request.obsidian_skills,
    codegraph: request.codegraph,
    brainRoot: request.brain_root,
    updateMode: true,
  });
  if (runtime.exitCode !== 0) {
    throw new Error(`candidate reconciliation failed: ${runtime.lines.join('; ')}`);
  }

  const complete = request.sync_skill && request.host_adapters;
  const adapterDigests = request.host_adapters
    ? assertInstalledAdapterProjection(request.target, request.profile, env)
    : {};
  let ownershipManifestDigest: string | null = null;
  if (complete) {
    const applied = applyInstallProfile(request.profile, env);
    const status = installedProfileStatus(applied.state, env);
    if (status.drift.status !== 'consistent') {
      throw new Error(`candidate reconciliation ownership ledger drift: ${status.drift.surface_drift.join(',') || '(unknown)'}`);
    }
    ownershipManifestDigest = sha256(JSON.stringify(applied.state.ownership_manifest));
  }
  const receipt: CandidateReconciliationReceipt = {
    protocol: 1,
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
    profile: request.profile,
    require_complete: complete,
    require_adapter_projection: request.host_adapters,
  });
  return receipt;
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
  setup: (options: GlobalRuntimeOptions) => GlobalRuntimeResult = runGlobalRuntimeSetup,
): GlobalRuntimeResult {
  const transactionEnv = runtimeHostTransactionEnv(options.env);
  return withRuntimeHostTransactionLock(transactionEnv, (lock) => {
    const transaction = beginInstallHostTransaction(runtimeHostMutationPaths(transactionEnv), transactionEnv);
    let result: GlobalRuntimeResult;
    try {
      result = setup({ ...options, candidateHandoff: candidateHandoffContext(transaction, lock) });
    } catch (error) {
      rollbackInstallHostTransaction(transaction);
      throw error;
    }
    if (result.exitCode !== 0) {
      rollbackInstallHostTransaction(transaction);
      return result;
    }
    try {
      captureConfigurationRestores(transaction, transactionEnv);
      commitInstallHostTransaction(transaction);
      return result;
    } catch (error) {
      try {
        rollbackInstallHostTransaction(transaction);
      } catch (rollbackError) {
        throw new AggregateError([error, rollbackError], 'runtime refresh failed and compensation was incomplete');
      }
      throw error;
    }
  });
}

async function runGlobalRuntimeBootstrap(
  rawOpts: GlobalRuntimeCommandOptions,
  cmd?: OptionSourceLookup,
): Promise<never> {
  const target = assertTarget(rawOpts.target, 'install');
  const profile = assertInstallProfile(rawOpts.profile ?? 'full');
  const migrationRequested = rawOpts.migrateProfileState === true;
  const currentProfile = migrationRequested ? null : readInstalledProfile();
  const profilePlan = migrationRequested
    ? planLegacyInstallProfileMigration(profile)
    : planInstallProfile(profile, currentProfile);
  if (rawOpts.dryRun === true) {
    const home = process.env.HOME ?? homedir();
    const codexRoot = process.env.CODEX_SKILLS_ROOT || join(home, '.codex', 'skills');
    const claudeRoot = process.env.CLAUDE_SKILLS_ROOT
      || (process.env.CODEX_SKILLS_ROOT ? '' : join(home, '.claude', 'skills'));
    const removedDanglingSkillLinks = rawOpts.syncSkill === false ? [] : removeOwnedDanglingSkillLinks(
      join(dirname(fileURLToPath(import.meta.url)), '..', '..'),
      [codexRoot, claudeRoot],
      true,
      currentProfile?.ownership_manifest,
    );
    if (rawOpts.json === true) console.log(JSON.stringify({ ...profilePlan, removedDanglingSkillLinks }, null, 2));
    else {
      console.log(`[profile] requested=${profile} current=${currentProfile?.profile ?? 'none'}`);
      console.log(`[profile] install=${profilePlan.install.join(',') || '(none)'}`);
      console.log(`[profile] skip=${profilePlan.skip.join(',') || '(none)'}`);
      console.log(`[profile] remove=${profilePlan.remove.join(',') || '(none)'}`);
      for (const link of removedDanglingSkillLinks) console.log(`[sync-installed] would remove dangling skill symlink: ${link}`);
    }
    process.exit(0);
  }
  const interactive = process.stdin.isTTY === true && process.stdout.isTTY === true && rawOpts.json !== true;
  const defaults = {
    externalSkills: profileEnablesExternalSkills(profile),
    codegraph: profileEnablesCodegraph(profile),
  };
  const selectedDefaults = {
    externalSkills: cmd?.getOptionValueSource('externalSkills') === 'cli'
      ? rawOpts.externalSkills !== false
      : defaults.externalSkills,
    codegraph: cmd?.getOptionValueSource('codegraph') === 'cli'
      ? rawOpts.codegraph !== false
      : defaults.codegraph,
  };
  const { externalSkills, codegraph } = interactive
    ? await resolveOptionalRuntimeDeps({
        ...rawOpts,
        externalSkills: selectedDefaults.externalSkills,
        codegraph: selectedDefaults.codegraph,
      }, cmd, { interactive })
    : selectedDefaults;
  const transaction = runTransactionalProfileProjection(profile, {
    target,
    installCli: rawOpts.cli !== false,
    syncSkill: rawOpts.syncSkill !== false,
    hostAdapters: rawOpts.hooks !== false,
    externalSkills,
    reverseSkill: rawOpts.withReverseSkill === true,
    obsidianSkills: rawOpts.withObsidianSkills === true,
    codegraph,
    brainRoot: rawOpts.brainRoot,
    profile,
  }, (transaction, migrationSource, result) => (
    applyInstallProfile(
      profile,
      process.env,
      new Date(),
      transaction,
      migrationSource ?? undefined,
      { agentFleetVerified: agentFleetVerified(result) },
    ).state
  ), migrationRequested
    ? () => prepareLegacyInstallProfileMigration(profile)
    : undefined);
  const result = transaction.result;
  const installed = transaction.state;
  if (rawOpts.json === true) {
    console.log(JSON.stringify({ ...result, profile_plan: profilePlan, installed_state: installed }, null, 2));
  } else {
    console.log(`[profile] ${profile}`);
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
    .option('--profile <profile>', 'Install profile: minimal|full', 'full')
    .option('--migrate-profile-state', 'Explicitly replace legacy protocol-1 profile state with protocol 2')
    .option('--dry-run', 'Print install/skip/remove plan without writing')
    .option('--state', 'Print effective installed profile state without writing')
    .option('--rollback', 'Restore the previous installed profile state')
    .option('--location <location>', `Adapter-only install location: ${LOCATION_HELP}`)
    .option('--no-cli', 'Skip installing the repo-harness CLI globally')
    .option('--no-sync-skill', 'Skip refreshing repo-harness skill aliases under host skill roots')
    .option('--no-hooks', 'Skip global hook adapter installation during full runtime install')
    .option('--no-external-skills', 'Skip mutable third-party Waza and Mermaid skill bootstrap')
    .option('--with-reverse-skill', 'Explicitly install the high-risk reverse-skill-router after independent authorization review')
    .option('--with-obsidian-skills', 'Explicitly install the pinned obsidian-markdown and obsidian-cli companion Skills')
    .option('--no-codegraph', 'Skip CodeGraph CLI/MCP configuration')
    .option('--brain-root <path>', 'Brain vault root to persist for repo-harness brain commands')
    .option('--json', 'Output JSON instead of human-readable text')
    .action(async (rawOpts: GlobalRuntimeCommandOptions & { location?: string; state?: boolean; rollback?: boolean }, cmd: Command) => {
      const target = assertTarget(rawOpts.target, 'install');
      if (
        rawOpts.migrateProfileState === true
        && (rawOpts.state === true || rawOpts.rollback === true || rawOpts.location !== undefined)
      ) {
        throw new Error('--migrate-profile-state cannot be combined with --state, --rollback, or --location');
      }
      if (rawOpts.state === true) {
        const state = readInstalledProfile();
        console.log(JSON.stringify(state ? installedProfileStatus(state) : null, null, 2));
        process.exit(state ? 0 : 1);
      }
      if (rawOpts.rollback === true) {
        const current = readInstalledProfile();
        if (!current?.previous) throw new Error('no previous install profile transaction to roll back');
        const profile = current.previous.profile;
        const transaction = runTransactionalProfileProjection(profile, {
          target,
          installCli: false,
          syncSkill: true,
          hostAdapters: true,
          externalSkills: profileEnablesExternalSkills(profile),
          codegraph: profileEnablesCodegraph(profile),
          profile,
        }, (transaction) => rollbackInstallProfile(process.env, transaction));
        const result = transaction.result;
        const restored = transaction.state;
        if (rawOpts.json === true) {
          console.log(JSON.stringify({ ...result, restored_state: restored }, null, 2));
        } else {
          for (const line of result.lines) console.log(line);
          if (restored) console.log(`[profile] restored=${restored.profile}`);
        }
        process.exit(result.exitCode);
      }
      if (rawOpts.location === undefined) {
        await runGlobalRuntimeBootstrap(rawOpts, cmd);
        return;
      }
      // Adapter-only installs still mutate a profile-owned host surface. Validate
      // the installed-state protocol before touching it so legacy protocol-1
      // state cannot be mixed with a new protocol-2 route projection.
      readInstalledProfile();
      const location = assertLocation(rawOpts.location!, 'install');
      const installAdapters = () => runInstall({
        target,
        location,
        profile: assertInstallProfile(rawOpts.profile ?? 'full'),
      });
      const result = location === 'global'
        ? withRuntimeHostTransactionLock(process.env, installAdapters)
        : installAdapters();
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
    .option('--target <target>', `Host target for readiness checks and optional global bootstrap: ${TARGET_HELP}`, 'both')
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
      if (rawOpts.dryRun === true) {
        const plan = runAdoptionPlan({
          repo: rawOpts.repo,
          mode,
          json: rawOpts.json === true,
          explicitRepo: rawOpts.repo !== undefined,
        });
        writeAllSync(1, plan.output);
        process.exit(plan.exitCode);
      }
      const common = {
        repo: rawOpts.repo,
        apply: true,
        target,
        syncSkill: false,
        hostAdapters: false,
        externalSkills: false,
        verify: rawOpts.verify !== false,
        codegraph: rawOpts.codegraph !== false,
        configureCodegraphMcp: false,
        syncCodegraph: rawOpts.syncCodegraph === true,
        mode,
        brainMode: 'skip' as const,
      };
      const result = runInit(common);
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
    .option('--with-reverse-skill', 'Explicitly install the high-risk reverse-skill-router after independent authorization review')
    .option('--with-obsidian-skills', 'Explicitly install or verify the pinned obsidian-markdown and obsidian-cli companion Skills')
    .option('--no-external-skills', 'Do not refresh third-party Waza and Mermaid providers (default)')
    .option('--configure-codegraph', 'Refresh CodeGraph CLI/MCP (default during update)')
    .option('--no-codegraph', 'Skip refreshing the global CodeGraph CLI/MCP')
    .option('--brain-root <path>', 'Brain vault root for manifest sync')
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
      withReverseSkill?: boolean;
      withObsidianSkills?: boolean;
      externalSkills?: boolean;
      codegraph?: boolean;
      configureCodegraph?: boolean;
      brainRoot?: string;
      json?: boolean;
    }) => {
      const target = assertTarget(rawOpts.target, 'update');
      if (rawOpts.channel !== undefined && !['latest', 'next'].includes(rawOpts.channel)) {
        console.error('repo-harness update: invalid --channel (expected: latest, next)');
        process.exit(2);
      }
      if (rawOpts.check === true || rawOpts.runtimeRefresh === false) {
        const report = runInitHook({
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
        reverseSkill: rawOpts.withReverseSkill === true,
        obsidianSkills: rawOpts.withObsidianSkills === true,
        codegraph: rawOpts.codegraph === false ? false : rawOpts.configureCodegraph === true ? true : undefined,
        brainRoot: rawOpts.brainRoot,
      });
      if (result.exitCode === 0) {
        const leftovers = planLegacyLeftovers({ scope: 'all', cwd: process.cwd(), home: process.env.HOME ?? homedir(), packageRoot: candidateSourceRoot() });
        result.lines.push(formatLegacyLeftoverSummary(leftovers.items));
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
      const result = location === 'global' && !rawOpts.dryRun
        ? withRuntimeHostTransactionLock(process.env, uninstallAdapters)
        : uninstallAdapters();
      if (rawOpts.json) console.log(JSON.stringify(result, null, 2));
      else for (const line of result.lines) console.log(line);
      process.exit(result.exitCode);
    });

  program
    .command('hook')
    .description('Dispatch a hook event to opt-in repo .ai/hooks/<script>')
    .argument('<event>', 'Hook event name')
    .requiredOption('--route <route>', 'Route id (default, edit, bash, always)')
    .action((event: string, rawOpts: { route: string }) => {
      let input: Buffer | undefined;
      try {
        input = readFileSync(0);
      } catch {
        input = undefined;
      }
      const result = runHook({
        event: event as HookEvent,
        routeId: rawOpts.route as RouteId,
        input,
      });
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
      const report = runDoctor();
      console.log(formatDoctor(report, rawOpts.json === true));
      process.exit(report.summary.fail > 0 ? 1 : 0);
    });

  program.addCommand(buildInitHookCommand());
  program.addCommand(buildReviewCommand());
  program.command('claude-review', { hidden: true }).helpOption(false).allowUnknownOption().argument('[args...]')
    .action(() => { console.error('UPGRADE_REQUIRED: claude-review is retired; use repo-harness review. Drain old sessions with the previous version and archive old receipts.'); process.exitCode = 1; });
  program.addCommand(buildTaskAgentCommand());
  program.addCommand(buildPipelineCommand());
  program.addCommand(buildSetupCommand());
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

  program.addCommand(buildToolsCommand());
  program.addCommand(buildHerdrCommand());
  program.addCommand(buildBrainCommand());
  program.addCommand(buildCapabilityContextCommand());
  program.addCommand(buildDocsCommand());
  program.addCommand(buildMcpCommand());
  program.addCommand(buildChatgptCommand());
  program.addCommand(buildHookLibCommand());
  program.addCommand(buildRunCommand());
  program.addCommand(buildStateCommand());
  program.addCommand(buildSprintCommand());
  program.addCommand(buildPublicationCommand());
  program.addCommand(buildFleetCommand());
  program.addCommand(buildOperatorCommand());
  program.addCommand(buildAutomationCommand());
  program.addCommand(buildRefactorCommand());
  program.addCommand(buildEngineerCommand());
  program.addCommand(buildArchitectureProjectionCommand());
  program.addCommand(buildIntegrationCommand());
  program.addCommand(buildDelegationCommand());
  program.addCommand(buildCollaborationCommand());
  program.addCommand(buildVerifiedContextCommand());
  program.addCommand(buildInterfaceChangeCommand());
  program.addCommand(buildExternalSourceCommand());
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
    if (typeof e.exitCode === 'number') process.exit(e.exitCode);
    if (e.message) console.error(e.message);
    process.exit(1);
  }
}
