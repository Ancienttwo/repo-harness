#!/usr/bin/env bun
/**
 * repo-harness CLI entry.
 *
 * Wires commander.js to the global runtime bootstrap, repo-local update,
 * hook adapter, status, doctor, migrate, security, and tool command bodies.
 */

import { Command } from 'commander';
import { runInstall, runUninstall, type InstallTargetSpec } from './commands/install';
import { runInit, runInteractiveInit, type InitBrainMode } from './commands/init';
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
import { buildRunCommand } from './commands/run';
import { formatSecurityScan, runSecurityScan } from './commands/security';
import { runGlobalRuntimeSetup } from './commands/global-runtime';
import { runPromptGuardDecideCli } from './commands/prompt-guard-decision';
import { runAdoptionPlan, runExperimentalTsApply } from './commands/adopt-plan';
import { runRuntimeReclaim, runRuntimeRollback } from './repo-adoption/reclaim-runtime';
import { rollbackAdoptionTransaction } from '../effects/fs-transaction';
import type { Location } from './installer/types';
import type { HookEvent, RouteId } from './hook/route-registry';
import type { AdoptionMode } from '../core/adoption/modes';

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
] as const;
export type Subcommand = (typeof SUBCOMMANDS)[number];

const VALID_TARGETS: readonly InstallTargetSpec[] = ['codex', 'claude', 'both'];
const VALID_LOCATIONS: readonly Location[] = ['global', 'local'];

interface GlobalRuntimeCommandOptions {
  target: string;
  cli?: boolean;
  syncSkill?: boolean;
  hooks?: string | false;
  externalSkills?: boolean;
  codegraph?: boolean;
  brainRoot?: string;
  json?: boolean;
}

function runGlobalRuntimeBootstrap(commandName: 'init' | 'install', rawOpts: GlobalRuntimeCommandOptions): never {
  if (!VALID_TARGETS.includes(rawOpts.target as InstallTargetSpec)) {
    console.error(
      `repo-harness ${commandName}: invalid --target "${rawOpts.target}" (expected: ${VALID_TARGETS.join(', ')})`,
    );
    process.exit(2);
  }
  const result = runGlobalRuntimeSetup({
    target: rawOpts.target as InstallTargetSpec,
    installCli: rawOpts.cli !== false,
    syncSkill: rawOpts.syncSkill !== false,
    hostAdapters: rawOpts.hooks !== false,
    externalSkills: rawOpts.externalSkills !== false,
    codegraph: rawOpts.codegraph !== false,
    brainRoot: rawOpts.brainRoot,
  });
  if (rawOpts.json === true) {
    console.log(JSON.stringify(result, null, 2));
  } else {
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
    .option('--target <target>', `Host target for adapters and runtime skills: ${VALID_TARGETS.join('|')}`, 'both')
    .option('--no-cli', 'Skip installing the repo-harness CLI globally')
    .option('--no-sync-skill', 'Skip refreshing repo-harness skill aliases under host skill roots')
    .option('--no-hooks', 'Skip global hook adapter installation')
    .option('--no-external-skills', 'Skip Waza, Mermaid, and cross-review (codex-review/claude-review) skill bootstrap')
    .option('--no-codegraph', 'Skip CodeGraph CLI/MCP configuration')
    .option('--brain-root <path>', 'Brain vault root to persist for repo-harness brain commands')
    .option('--refresh', 'Compatibility no-op; init already refreshes the idempotent user-level runtime')
    .option('--json', 'Output JSON instead of human-readable text')
    .action((rawOpts: GlobalRuntimeCommandOptions & { refresh?: boolean }) => {
      runGlobalRuntimeBootstrap('init', rawOpts);
    });

  program
    .command('update')
    .description('Update the global repo-harness CLI and user-level managed runtime')
    .option('--target <target>', `Host target for adapters and runtime skills: ${VALID_TARGETS.join('|')}`, 'both')
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
      if (!VALID_TARGETS.includes(rawOpts.target as InstallTargetSpec)) {
        console.error(
          `repo-harness update: invalid --target "${rawOpts.target}" (expected: ${VALID_TARGETS.join(', ')})`,
        );
        process.exit(2);
      }
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
          target: rawOpts.target as InstallTargetSpec,
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
        target: rawOpts.target as InstallTargetSpec,
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
    .option('--archive <path>', 'Runtime reclaim archive to restore when action is rollback')
    .option('--transaction <path>', 'Adoption transaction manifest to restore when action is rollback')
    .option('--dry-run', 'Plan repo harness changes without applying them')
    .option('--target <target>', `Host target for readiness checks and optional global bootstrap: ${VALID_TARGETS.join('|')}`, 'both')
    .option('--no-sync-skill', 'Compatibility no-op; adopt never refreshes user-level skill aliases')
    .option('--no-host-adapters', 'Compatibility no-op; adopt never writes global Codex/Claude hook adapters')
    .option('--no-external-skills', 'Compatibility no-op; adopt never bootstraps user-level external skills')
    .option('--no-verify', 'Skip repo workflow verification after apply')
    .option('--no-codegraph', 'Skip building the CodeGraph index and MCP readiness check')
    .option('--reclaim-runtime', 'Reclaim generated repo-local hook/helper runtime copies after replacement paths verify')
    .option('--compact', 'Compact repo surface; includes --reclaim-runtime plus package script rewrite')
    .option('--mode <mode>', 'Adoption mode: minimal|standard|self-host', 'standard')
    .option('--configure-codegraph', 'Deprecated: user-level MCP config belongs to repo-harness update/setup')
    .option('--sync-codegraph', 'Sync the CodeGraph index after ensure')
    .option('--brain-root <path>', 'Deprecated: user-level brain config belongs to repo-harness update/setup')
    .option('--brain-mode <mode>', 'Deprecated: adopt does not perform user-level brain sync', 'skip')
    .option('--interactive', 'Run the numbered interactive install planner')
    .option('--experimental-ts-apply', 'Apply the current TypeScript safe-subset adoption plan instead of the shell migrator')
    .option('--json', 'Output JSON instead of human-readable text')
    .action(async (action: string | undefined, rawOpts: {
      repo?: string;
      archive?: string;
      transaction?: string;
      dryRun?: boolean;
      target: string;
      syncSkill?: boolean;
      hostAdapters?: boolean;
      externalSkills?: boolean;
      verify?: boolean;
      codegraph?: boolean;
      reclaimRuntime?: boolean;
      compact?: boolean;
      mode?: string;
      configureCodegraph?: boolean;
      syncCodegraph?: boolean;
      brainRoot?: string;
      brainMode?: string;
      interactive?: boolean;
      experimentalTsApply?: boolean;
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
        if (!rawOpts.archive) {
          console.error('repo-harness adopt rollback: --archive or --transaction is required');
          process.exit(2);
        }
        const rollback = runRuntimeRollback({ repo: rawOpts.repo, archive: rawOpts.archive });
        if (rawOpts.json === true) {
          console.log(JSON.stringify(rollback, null, 2));
        } else {
          console.log(`[adopt] ${rollback.status}: rollback runtime archive ${rollback.archive}`);
          for (const restored of rollback.restored) console.log(`[adopt] restored: ${restored}`);
          for (const missing of rollback.missing) console.log(`[adopt] missing: ${missing}`);
        }
        process.exit(rollback.status === 'ok' ? 0 : 1);
      }
      if (!VALID_TARGETS.includes(rawOpts.target as InstallTargetSpec)) {
        console.error(
          `repo-harness adopt: invalid --target "${rawOpts.target}" (expected: ${VALID_TARGETS.join(', ')})`,
        );
        process.exit(2);
      }
      if (!['skip', 'manifest-only', 'install-gbrain-cli'].includes(rawOpts.brainMode ?? 'skip')) {
        console.error('repo-harness adopt: invalid --brain-mode (expected: skip, manifest-only, install-gbrain-cli)');
        process.exit(2);
      }
      if (!['minimal', 'standard', 'self-host'].includes(rawOpts.mode ?? 'standard')) {
        console.error('repo-harness adopt: invalid --mode (expected: minimal, standard, self-host)');
        process.exit(2);
      }
      if (rawOpts.configureCodegraph === true) {
        console.error('repo-harness adopt: --configure-codegraph writes user-level MCP config; run repo-harness update instead');
        process.exit(2);
      }
      if (rawOpts.brainRoot || rawOpts.brainMode !== 'skip') {
        console.error('repo-harness adopt: brain configuration writes user-level state; run repo-harness update instead');
        process.exit(2);
      }
      const mode = (rawOpts.mode ?? 'standard') as AdoptionMode;
      const routesToTsDryRunPlan =
        rawOpts.dryRun === true &&
        (rawOpts.json === true ||
          (rawOpts.interactive !== true && rawOpts.reclaimRuntime !== true && rawOpts.compact !== true));
      if (
        mode !== 'standard' &&
        routesToTsDryRunPlan !== true &&
        rawOpts.experimentalTsApply !== true
      ) {
        console.error(
          `repo-harness adopt: --mode ${mode} is only supported with ordinary --dry-run or --experimental-ts-apply; default apply still uses the shell migrator`,
        );
        process.exit(2);
      }
      if (routesToTsDryRunPlan) {
        const plan = runAdoptionPlan({
          repo: rawOpts.repo,
          mode,
          json: rawOpts.json === true,
          explicitRepo: rawOpts.repo !== undefined,
        });
        process.stdout.write(plan.output);
        process.exit(plan.exitCode);
      }
      if (rawOpts.experimentalTsApply === true) {
        if (rawOpts.interactive === true || rawOpts.reclaimRuntime === true || rawOpts.compact === true) {
          console.error(
            'repo-harness adopt: --experimental-ts-apply cannot be combined with --interactive, --reclaim-runtime, or --compact',
          );
          process.exit(2);
        }
        const apply = runExperimentalTsApply({
          repo: rawOpts.repo,
          mode,
          json: rawOpts.json === true,
          explicitRepo: rawOpts.repo !== undefined,
        });
        process.stdout.write(apply.output);
        process.exit(apply.exitCode);
      }
      const common = {
        repo: rawOpts.repo,
        apply: rawOpts.dryRun !== true,
        target: rawOpts.target as InstallTargetSpec,
        syncSkill: false,
        hostAdapters: false,
        externalSkills: false,
        verify: rawOpts.verify !== false,
        codegraph: rawOpts.codegraph !== false,
        configureCodegraphMcp: false,
        syncCodegraph: rawOpts.syncCodegraph === true,
        brainRoot: rawOpts.brainRoot,
        brainMode: rawOpts.brainMode as InitBrainMode,
      };
      const result = rawOpts.interactive === true
        ? await runInteractiveInit({
            ...common,
            output: rawOpts.json === true ? process.stderr : process.stdout,
          })
        : runInit(common);
      const shouldReclaim = rawOpts.reclaimRuntime === true || rawOpts.compact === true;
      const reclaim = shouldReclaim && (result.exitCode === 0 || rawOpts.dryRun === true)
        ? runRuntimeReclaim({
            repo: result.repoRoot,
            apply: rawOpts.dryRun !== true,
            compact: rawOpts.compact === true,
            verify: rawOpts.verify !== false,
            mode: rawOpts.mode as 'minimal' | 'standard' | 'self-host',
          })
        : null;
      if (rawOpts.json === true) {
        console.log(JSON.stringify(reclaim ? { adopt: result, runtime_reclaim: reclaim } : result, null, 2));
      } else {
        for (const line of result.lines) console.log(line);
        if (reclaim) {
          console.log(`[adopt] ${reclaim.status}: reclaim runtime - files=${reclaim.runtime_reclaim.files.length}`);
          if (reclaim.runtime_reclaim.archive) console.log(`[adopt] archive: ${reclaim.runtime_reclaim.archive}`);
          for (const blocked of reclaim.runtime_reclaim.blocked) console.log(`[adopt] blocked: ${blocked}`);
        }
      }
      process.exit(result.exitCode || (reclaim?.status === 'blocked' ? 1 : 0));
    });

  program
    .command('install')
    .description('Install the repo-harness global runtime; with --location, install only hook adapters')
    .option('--target <target>', `Target host: ${VALID_TARGETS.join('|')}`, 'both')
    .option('--location <location>', `Adapter-only install location: ${VALID_LOCATIONS.join('|')}`)
    .option('--no-cli', 'Skip installing the repo-harness CLI globally')
    .option('--no-sync-skill', 'Skip refreshing repo-harness skill aliases under host skill roots')
    .option('--no-hooks', 'Skip global hook adapter installation during full runtime install')
    .option('--no-external-skills', 'Skip Waza, Mermaid, and cross-review (codex-review/claude-review) skill bootstrap')
    .option('--no-codegraph', 'Skip CodeGraph CLI/MCP configuration')
    .option('--brain-root <path>', 'Brain vault root to persist for repo-harness brain commands')
    .option('--json', 'Output JSON instead of human-readable text')
    .action((rawOpts: GlobalRuntimeCommandOptions & { location?: string }) => {
      if (!VALID_TARGETS.includes(rawOpts.target as InstallTargetSpec)) {
        console.error(
          `repo-harness install: invalid --target "${rawOpts.target}" (expected: ${VALID_TARGETS.join(', ')})`,
        );
        process.exit(2);
      }
      if (rawOpts.location === undefined) {
        runGlobalRuntimeBootstrap('install', rawOpts);
      }
      if (!VALID_LOCATIONS.includes(rawOpts.location as Location)) {
        console.error(
          `repo-harness install: invalid --location "${rawOpts.location}" (expected: ${VALID_LOCATIONS.join(', ')})`,
        );
        process.exit(2);
      }
      const result = runInstall({
        target: rawOpts.target as InstallTargetSpec,
        location: rawOpts.location as Location,
      });
      for (const line of result.lines) console.log(line);
      process.exit(result.exitCode);
    });

  program
    .command('uninstall')
    .description('Remove repo-harness managed hook adapters from Codex and/or Claude host config')
    .option('--target <target>', `Target host: ${VALID_TARGETS.join('|')}`, 'both')
    .option('--location <location>', `Install location: ${VALID_LOCATIONS.join('|')}`, 'global')
    .action((rawOpts: { target: string; location: string }) => {
      if (!VALID_TARGETS.includes(rawOpts.target as InstallTargetSpec)) {
        console.error(
          `repo-harness uninstall: invalid --target "${rawOpts.target}" (expected: ${VALID_TARGETS.join(', ')})`,
        );
        process.exit(2);
      }
      if (!VALID_LOCATIONS.includes(rawOpts.location as Location)) {
        console.error(
          `repo-harness uninstall: invalid --location "${rawOpts.location}" (expected: ${VALID_LOCATIONS.join(', ')})`,
        );
        process.exit(2);
      }
      const result = runUninstall({
        target: rawOpts.target as InstallTargetSpec,
        location: rawOpts.location as Location,
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
  program.addCommand(buildRunCommand());
  program
    .command('prompt-guard-decide', { hidden: true })
    .description('Internal prompt-guard intent/state decision engine')
    .action(() => {
      console.log(runPromptGuardDecideCli());
      process.exit(0);
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
