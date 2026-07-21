#!/usr/bin/env bun
/**
 * repo-harness CLI entry.
 *
 * Wires commander.js to the global runtime bootstrap, repo-local update,
 * hook adapter, status, doctor, migrate, security, and tool command bodies.
 */

import { Command } from 'commander';
import { readFileSync } from 'fs';
import { createInterface } from 'readline/promises';
import { askConfirm } from './tty-prompt';
import { runInstall, runUninstall, type InstallTargetSpec } from './commands/install';
import { writeAllSync } from './runtime/write-all-sync';
import { configuredDelegationMode, type DelegationMode } from './commands/delegation-mode';
import { runInit, type InitBrainMode } from './commands/init';
import { runHook } from './commands/hook';
import { CLI_VERSION, formatStatus, runStatus } from './commands/status';
import { formatDoctor, runDoctor } from './commands/doctor';
import { buildInitHookCommand, buildSetupCommand, formatInitHook, runInitHook } from './commands/init-hook';
import { formatMigratePlan, runMigrate } from './commands/migrate';
import { buildToolsCommand } from './commands/tools';
import { buildBrainCommand } from './commands/brain';
import { buildCapabilityContextCommand } from './commands/capability-context';
import { buildDocsCommand } from './commands/docs';
import { buildMcpCommand } from './commands/mcp';
import { buildChatgptCommand } from './commands/chatgpt';
import { buildRunCommand } from './commands/run';
import { buildStateCommand } from './commands/state';
import { formatSecurityScan, runSecurityScan } from './commands/security';
import { runGlobalRuntimeSetup, type GlobalRuntimeOptions, type GlobalRuntimeResult } from './commands/global-runtime';
import {
  applyInstallProfile,
  beginInstallHostTransaction,
  commitInstallHostTransaction,
  installProfileHostMutationPaths,
  installedProfileStatus,
  assertInstallProfile,
  planInstallProfile,
  profileEnablesCodegraph,
  profileEnablesExternalSkills,
  prepareInstallProfileSwitch,
  readInstalledProfile,
  rollbackInstallHostTransaction,
  rollbackInstallProfile,
  type InstalledProfileState,
  type InstallProfile,
} from './installer/install-profile';
import { runPromptGuardDecideCli } from './commands/prompt-guard-decision';
import { routePromptExplicitFirst } from './hook/prompt-router';
import { recordCircuitAttempt, type CircuitAttempt } from './hook/circuit-breaker';
import { runMinimalChangeCli } from './hook/minimal-change-cli';
import { runReviewRubricCli } from './hook/review-rubric';
import { runReviewSubjectCli } from './hook/review-subject';
import { runAdoptionPlan } from './commands/adopt-plan';
import { rollbackAdoptionTransaction } from '../effects/fs-transaction';
import {
  assertTarget,
  assertLocation,
  assertAdoptionMode,
  assertBrainMode,
  assertDelegationMode,
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
  'adopt',
  'run',
  'setup',
  'tools',
  'brain',
  'capability-context',
  'docs',
  'mcp',
  'chatgpt',
  'state',
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
  codegraph?: boolean;
  brainRoot?: string;
  json?: boolean;
  profile?: string;
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
 * Non-interactive (non-TTY, or `--json`): unchanged from today — default on,
 * `--no-external-skills`/`--no-codegraph` opt out.
 *
 * Interactive: for each item not explicitly passed on the CLI (i.e. its
 * option value source isn't `'cli'`), prompt; Enter/`y` keeps today's
 * default-on outcome, `n` skips it. An explicitly passed `--no-*` flag is
 * honored without prompting.
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

export interface ResolveDelegationModeOptions {
  interactive: boolean;
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
}

/**
 * Resolve the Codex delegation-mode choice for `install --location global`.
 * Only applies to the codex/both targets at the global location — every
 * other combination (notably --target claude) resolves to `undefined`
 * without prompting or touching `~/.repo-harness/config.json`.
 *
 * Non-interactive: an explicit `--delegation-mode <mode>` always wins
 * (validated; exits 2 on an unknown value). With no flag and no TTY, this
 * returns `undefined` so the caller skips the config write entirely — no
 * silent default is ever persisted.
 *
 * Interactive: reuses the shared Y/n `askConfirm` helper, framed as keeping
 * vs. switching away from the resolved default (the value already persisted
 * in `~/.repo-harness/config.json`, else "explicit").
 */
export async function resolveDelegationMode(
  rawOpts: { target: InstallTargetSpec; delegationMode?: string },
  location: Location,
  cmd: OptionSourceLookup | undefined,
  opts: ResolveDelegationModeOptions,
): Promise<DelegationMode | undefined> {
  const applies = location === 'global' && rawOpts.target !== 'claude';

  if (rawOpts.delegationMode !== undefined) {
    const validated = assertDelegationMode(rawOpts.delegationMode, 'install');
    return applies ? validated : undefined;
  }
  if (!applies || !opts.interactive || cmd?.getOptionValueSource('delegationMode') === 'cli') {
    return undefined;
  }

  const input = opts.input ?? process.stdin;
  const output = opts.output ?? process.stdout;
  const rl = createInterface({ input, output, terminal: false });
  try {
    const current = configuredDelegationMode() ?? 'explicit';
    const other: DelegationMode = current === 'auto' ? 'explicit' : 'auto';
    const detail = (mode: DelegationMode): string =>
      mode === 'auto'
        ? 'hook injects bounded-delegation context on substantive prompts; policy standing authorization'
        : 'only on /parallel, /delegate, explicit delegation wording';
    const keepCurrent = await askConfirm(
      rl,
      output,
      `Codex delegation mode: keep "${current}" (${detail(current)}) instead of "${other}" (${detail(other)})?`,
    );
    return keepCurrent ? current : other;
  } finally {
    rl.close();
  }
}

function runTransactionalProfileProjection(
  profile: InstallProfile,
  options: GlobalRuntimeOptions,
  commitState: (transaction: ReturnType<typeof beginInstallHostTransaction>) => InstalledProfileState,
): { result: GlobalRuntimeResult; state: InstalledProfileState | null } {
  const transaction = beginInstallHostTransaction(installProfileHostMutationPaths(options.env), options.env);
  let result: GlobalRuntimeResult;
  try {
    prepareInstallProfileSwitch(profile, options.env);
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
    const state = commitState(transaction);
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
}

async function runGlobalRuntimeBootstrap(
  commandName: 'init' | 'install',
  rawOpts: GlobalRuntimeCommandOptions,
  cmd?: OptionSourceLookup,
): Promise<never> {
  const target = assertTarget(rawOpts.target, commandName);
  const profile = assertInstallProfile(rawOpts.profile ?? 'minimal');
  const currentProfile = readInstalledProfile();
  const profilePlan = planInstallProfile(profile, currentProfile);
  if (rawOpts.dryRun === true) {
    if (rawOpts.json === true) console.log(JSON.stringify(profilePlan, null, 2));
    else {
      console.log(`[profile] requested=${profile} current=${currentProfile?.profile ?? 'none'}`);
      console.log(`[profile] install=${profilePlan.install.join(',') || '(none)'}`);
      console.log(`[profile] skip=${profilePlan.skip.join(',') || '(none)'}`);
      console.log(`[profile] remove=${profilePlan.remove.join(',') || '(none)'}`);
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
    codegraph,
    brainRoot: rawOpts.brainRoot,
    profile,
  }, (transaction) => applyInstallProfile(profile, process.env, new Date(), transaction).state);
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
    .command('init')
    .description('Install the repo-harness CLI, global hook adapters, and required runtime dependencies')
    .option('--target <target>', `Host target for adapters and runtime skills: ${TARGET_HELP}`, 'both')
    .option('--no-cli', 'Skip installing the repo-harness CLI globally')
    .option('--no-sync-skill', 'Skip refreshing repo-harness skill aliases under host skill roots')
    .option('--no-hooks', 'Skip global hook adapter installation')
    .option('--no-external-skills', 'Skip Waza, Mermaid, and cross-review (codex-review/claude-review) skill bootstrap')
    .option('--no-codegraph', 'Skip CodeGraph CLI/MCP configuration')
    .option('--brain-root <path>', 'Brain vault root to persist for repo-harness brain commands')
    .option('--refresh', 'Compatibility no-op; init already refreshes the idempotent user-level runtime')
    .option('--json', 'Output JSON instead of human-readable text')
    .action(async (rawOpts: GlobalRuntimeCommandOptions & { refresh?: boolean }, cmd: Command) => {
      await runGlobalRuntimeBootstrap('init', rawOpts, cmd);
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
    .option('--with-external-skills', 'Also bootstrap third-party Waza, Mermaid, and cross-review skills')
    .option('--no-external-skills', 'Compatibility no-op; update no longer bootstraps third-party skills by default')
    .option('--configure-codegraph', 'Also configure CodeGraph CLI/MCP during runtime refresh')
    .option('--no-codegraph', 'Compatibility no-op; update no longer configures CodeGraph by default')
    .option('--brain-root <path>', 'Brain vault root for manifest sync')
    .option('--repo <path>', 'Deprecated: use repo-harness adopt --repo <path>')
    .option('--dry-run', 'Deprecated: use repo-harness adopt --dry-run for repo-level planning')
    .option('--interactive', 'Deprecated: use repo-harness adopt --interactive for repo-level planning')
    .option('--json', 'Output JSON instead of human-readable text')
    .action((rawOpts: {
      repo?: string;
      dryRun?: boolean;
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
      externalSkills?: boolean;
      codegraph?: boolean;
      configureCodegraph?: boolean;
      brainRoot?: string;
      interactive?: boolean;
      json?: boolean;
    }) => {
      const target = assertTarget(rawOpts.target, 'update');
      if (rawOpts.channel !== undefined && !['latest', 'next'].includes(rawOpts.channel)) {
        console.error('repo-harness update: invalid --channel (expected: latest, next)');
        process.exit(2);
      }
      if (rawOpts.repo || rawOpts.dryRun || rawOpts.interactive) {
        console.error(
          'repo-harness update no longer refreshes repositories. For repo-level refresh, run: repo-harness adopt --repo <path>',
        );
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
      const result = runGlobalRuntimeSetup({
        target,
        installCli: rawOpts.cli !== false,
        installSpec,
        syncSkill: rawOpts.syncSkill !== false,
        hostAdapters: rawOpts.hooks !== false,
        externalSkills: rawOpts.withExternalSkills === true,
        codegraph: rawOpts.configureCodegraph === true,
        brainRoot: rawOpts.brainRoot,
      });
      if (rawOpts.json === true) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        for (const line of result.lines) console.log(line);
      }
      process.exit(result.exitCode);
    });

  program
    .command('adopt')
    .description('Install or refresh the repo-local harness workflow in an existing repo')
    .argument('[action]', 'Optional action: rollback')
    .option('--repo <path>', 'Target repository path (defaults to cwd)')
    .option('--transaction <path>', 'Adoption transaction manifest to restore when action is rollback')
    .option('--dry-run', 'Plan repo harness changes without applying them')
    .option('--target <target>', `Host target for readiness checks and optional global bootstrap: ${TARGET_HELP}`, 'both')
    .option('--no-verify', 'Skip repo workflow verification after apply')
    .option('--no-codegraph', 'Skip building the CodeGraph index and MCP readiness check')
    .option('--mode <mode>', 'Adoption mode: minimal|standard|self-host', 'standard')
    .option('--configure-codegraph', 'Deprecated: user-level MCP config belongs to repo-harness update/setup')
    .option('--sync-codegraph', 'Sync the CodeGraph index after ensure')
    .option('--brain-root <path>', 'Deprecated: user-level brain config belongs to repo-harness update/setup')
    .option('--brain-mode <mode>', 'Deprecated: adopt does not perform user-level brain sync', 'skip')
    .option('--interactive', 'Rejected: public adopt is repo-local and does not configure user-level runtime state')
    .option('--json', 'Output JSON instead of human-readable text')
    .action(async (action: string | undefined, rawOpts: {
      repo?: string;
      transaction?: string;
      dryRun?: boolean;
      target: string;
      verify?: boolean;
      codegraph?: boolean;
      mode?: string;
      configureCodegraph?: boolean;
      syncCodegraph?: boolean;
      brainRoot?: string;
      brainMode?: string;
      interactive?: boolean;
      json?: boolean;
    }) => {
      if (action) {
        if (action !== 'rollback') {
          console.error(`repo-harness adopt: unknown action "${action}"`);
          process.exit(2);
        }
        if (rawOpts.transaction) {
          const rollback = rollbackAdoptionTransaction({ repoRoot: rawOpts.repo ?? process.cwd(), transaction: rawOpts.transaction });
          if (rawOpts.json === true) {
            console.log(JSON.stringify(rollback, null, 2));
          } else {
            console.log(`[adopt] ${rollback.ok ? 'ok' : 'failed'}: rollback transaction ${rollback.transactionManifestPath}`);
            for (const result of rollback.results) {
              const target = result.path ? ` ${result.path}` : '';
              const detail = result.error ? ` - ${result.error}` : '';
              console.log(`[adopt] ${result.status}: ${result.action}${target}${detail}`);
            }
          }
          process.exit(rollback.ok ? 0 : 1);
        }
        console.error('repo-harness adopt rollback: --transaction is required');
        process.exit(2);
      }
      const target = assertTarget(rawOpts.target, 'adopt');
      assertBrainMode(rawOpts.brainMode ?? 'skip', 'adopt');
      const mode = assertAdoptionMode(rawOpts.mode ?? 'standard', 'adopt');
      if (rawOpts.configureCodegraph === true) {
        console.error('repo-harness adopt: --configure-codegraph writes user-level MCP config; run repo-harness update instead');
        process.exit(2);
      }
      if (rawOpts.brainRoot || rawOpts.brainMode !== 'skip') {
        console.error('repo-harness adopt: brain configuration writes user-level state; run repo-harness update instead');
        process.exit(2);
      }
      if (rawOpts.interactive === true) {
        console.error('repo-harness adopt: --interactive can configure user-level runtime state; use repo-harness install or setup instead');
        process.exit(2);
      }
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
        brainRoot: rawOpts.brainRoot,
        brainMode: rawOpts.brainMode as InitBrainMode,
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
    .command('install')
    .description('Install the repo-harness global runtime; with --location, install only hook adapters')
    .option('--target <target>', `Target host: ${TARGET_HELP}`, 'both')
    .option('--profile <profile>', 'Install profile: minimal|standard|product-planning|strict', 'minimal')
    .option('--dry-run', 'Print install/skip/remove plan without writing')
    .option('--state', 'Print effective installed profile state without writing')
    .option('--rollback', 'Restore the previous installed profile state')
    .option('--location <location>', `Adapter-only install location: ${LOCATION_HELP}`)
    .option(
      '--delegation-mode <mode>',
      'Codex delegation mode for --location global installs (codex/both targets only): auto|explicit',
    )
    .option('--no-cli', 'Skip installing the repo-harness CLI globally')
    .option('--no-sync-skill', 'Skip refreshing repo-harness skill aliases under host skill roots')
    .option('--no-hooks', 'Skip global hook adapter installation during full runtime install')
    .option('--no-external-skills', 'Skip Waza, Mermaid, and cross-review (codex-review/claude-review) skill bootstrap')
    .option('--no-codegraph', 'Skip CodeGraph CLI/MCP configuration')
    .option('--brain-root <path>', 'Brain vault root to persist for repo-harness brain commands')
    .option('--json', 'Output JSON instead of human-readable text')
    .action(async (rawOpts: GlobalRuntimeCommandOptions & { location?: string; delegationMode?: string; state?: boolean; rollback?: boolean }, cmd: Command) => {
      const target = assertTarget(rawOpts.target, 'install');
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
        await runGlobalRuntimeBootstrap('install', rawOpts, cmd);
        return;
      }
      const location = assertLocation(rawOpts.location!, 'install');
      const interactive = process.stdin.isTTY === true && process.stdout.isTTY === true && rawOpts.json !== true;
      const delegationMode = await resolveDelegationMode(
        { target, delegationMode: rawOpts.delegationMode },
        location,
        cmd,
        { interactive },
      );
      const result = runInstall({
        target,
        location,
        delegationMode,
        profile: assertInstallProfile(rawOpts.profile ?? 'minimal'),
      });
      for (const line of result.lines) console.log(line);
      process.exit(result.exitCode);
    });

  program
    .command('uninstall')
    .description('Remove repo-harness managed hook adapters from Codex and/or Claude host config')
    .option('--target <target>', `Target host: ${TARGET_HELP}`, 'both')
    .option('--location <location>', `Install location: ${LOCATION_HELP}`, 'global')
    .action((rawOpts: { target: string; location: string }) => {
      const target = assertTarget(rawOpts.target, 'uninstall');
      const location = assertLocation(rawOpts.location, 'uninstall');
      const result = runUninstall({
        target,
        location,
      });
      for (const line of result.lines) console.log(line);
      process.exit(result.exitCode);
    });

  program
    .command('hook')
    .description('Dispatch a hook event to opt-in repo .ai/hooks/<script>')
    .argument('<event>', 'Hook event name')
    .requiredOption('--route <route>', 'Route id (default, edit, bash, always)')
    .action((event: string, rawOpts: { route: string }) => {
      const result = runHook({
        event: event as HookEvent,
        routeId: rawOpts.route as RouteId,
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
  program.addCommand(buildSetupCommand());

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
  program.addCommand(buildBrainCommand());
  program.addCommand(buildCapabilityContextCommand());
  program.addCommand(buildDocsCommand());
  program.addCommand(buildMcpCommand());
  program.addCommand(buildChatgptCommand());
  program.addCommand(buildRunCommand());
  program.addCommand(buildStateCommand());
  program
    .command('circuit-breaker-record', { hidden: true })
    .description('Internal persistent workflow circuit breaker')
    .action(() => {
      try {
        const attempt = JSON.parse(readFileSync(0, 'utf-8')) as CircuitAttempt;
        console.log(JSON.stringify(recordCircuitAttempt(process.cwd(), attempt)));
        process.exit(0);
      } catch (error) {
        console.error(`circuit-breaker-record: ${(error as Error).message}`);
        process.exit(2);
      }
    });
  program
    .command('prompt-route', { hidden: true })
    .description('Internal explicit-first prompt router')
    .action(() => {
      let prompt = '';
      try {
        const input = readFileSync(0, 'utf-8').trim();
        const parsed = JSON.parse(input) as { prompt?: unknown };
        if (typeof parsed.prompt === 'string') prompt = parsed.prompt;
      } catch { /* malformed prompt bypasses advisory routing */ }
      console.log(JSON.stringify(routePromptExplicitFirst(prompt, {
        hasActiveTask: process.env.PROMPT_ROUTE_ACTIVE_TASK === '1',
      })));
      process.exit(0);
    });
  program
    .command('prompt-guard-decide', { hidden: true })
    .description('Internal prompt-guard intent/state decision engine')
    .action(() => {
      console.log(runPromptGuardDecideCli());
      process.exit(0);
    });
  program
    .command('minimal-change', { hidden: true })
    .argument('[args...]')
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .description('Internal minimal-change hook context renderer')
    .action((args: string[]) => {
      // Hidden hook commands exit immediately; commit protocol bytes first.
      const result = runMinimalChangeCli(args);
      if (result.stdout) writeAllSync(1, result.stdout);
      if (result.stderr) writeAllSync(2, result.stderr);
      process.exit(result.exitCode);
    });
  program
    .command('review-rubric', { hidden: true })
    .argument('[args...]')
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .description('Internal review rubric renderer')
    .action((args: string[]) => {
      const result = runReviewRubricCli(args);
      if (result.stdout) writeAllSync(1, result.stdout);
      if (result.stderr) writeAllSync(2, result.stderr);
      process.exit(result.exitCode);
    });
  program
    .command('review-subject', { hidden: true })
    .argument('[args...]')
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .description('Internal normalized review subject renderer')
    .action((args: string[]) => {
      const result = runReviewSubjectCli(args);
      if (result.stdout) writeAllSync(1, result.stdout);
      if (result.stderr) writeAllSync(2, result.stderr);
      process.exit(result.exitCode);
    });

  return program;
}

export async function runCli(argv: string[] = process.argv): Promise<void> {
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
