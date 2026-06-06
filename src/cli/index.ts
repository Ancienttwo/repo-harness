#!/usr/bin/env bun
/**
 * repo-harness CLI entry.
 *
 * Wires commander.js to the global runtime bootstrap, repo-local update,
 * hook adapter, status, doctor, migrate, security, and tool command bodies.
 */

import { Command } from 'commander';
import { runInstall, type InstallTargetSpec } from './commands/install';
import { runInit, runInteractiveInit, type InitBrainMode } from './commands/init';
import { runHook } from './commands/hook';
import { CLI_VERSION, formatStatus, runStatus } from './commands/status';
import { formatDoctor, runDoctor } from './commands/doctor';
import { formatMigratePlan, runMigrate } from './commands/migrate';
import { buildToolsCommand } from './commands/tools';
import { buildBrainCommand } from './commands/brain';
import { buildCapabilityContextCommand } from './commands/capability-context';
import { formatSecurityScan, runSecurityScan } from './commands/security';
import { runGlobalRuntimeSetup } from './commands/global-runtime';
import { runPromptGuardDecisionFromEnv } from './commands/prompt-guard-decision';
import type { Location } from './installer/types';
import type { HookEvent, RouteId } from './hook/route-registry';

export const SUBCOMMANDS = [
  'init',
  'install',
  'hook',
  'status',
  'doctor',
  'migrate',
  'security',
  'update',
  'tools',
  'brain',
  'capability-context',
] as const;
export type Subcommand = (typeof SUBCOMMANDS)[number];

const VALID_TARGETS: readonly InstallTargetSpec[] = ['codex', 'claude', 'both'];
const VALID_LOCATIONS: readonly Location[] = ['global', 'local'];

export function buildProgram(): Command {
  const program = new Command();
  program
    .name('repo-harness')
    .description('Repo-local agentic development harness CLI')
    .version(CLI_VERSION)
    .exitOverride();

  program
    .command('init')
    .description('Install the repo-harness CLI, global hook adapters, and required runtime dependencies')
    .option('--target <target>', `Host target for adapters and runtime skills: ${VALID_TARGETS.join('|')}`, 'both')
    .option('--no-cli', 'Skip installing the repo-harness CLI globally')
    .option('--no-sync-skill', 'Skip refreshing repo-harness skill aliases under host skill roots')
    .option('--no-hooks', 'Skip global hook adapter installation')
    .option('--no-external-skills', 'Skip Waza and Mermaid skill bootstrap')
    .option('--no-codegraph', 'Skip CodeGraph CLI/MCP configuration')
    .option('--brain-root <path>', 'Brain vault root to persist for repo-harness brain commands')
    .option('--json', 'Output JSON instead of human-readable text')
    .action((rawOpts: {
      target: string;
      cli?: boolean;
      syncSkill?: boolean;
      hooks?: string | false;
      externalSkills?: boolean;
      codegraph?: boolean;
      brainRoot?: string;
      json?: boolean;
    }) => {
      if (!VALID_TARGETS.includes(rawOpts.target as InstallTargetSpec)) {
        console.error(
          `repo-harness init: invalid --target "${rawOpts.target}" (expected: ${VALID_TARGETS.join(', ')})`,
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
    });

  program
    .command('update')
    .description('Install or refresh the repo-local harness workflow in an existing repo')
    .option('--repo <path>', 'Target repository path (defaults to cwd)')
    .option('--dry-run', 'Plan repo harness changes without applying them')
    .option('--target <target>', `Host target for adapters and external skills: ${VALID_TARGETS.join('|')}`, 'both')
    .option('--no-sync-skill', 'Skip refreshing repo-harness skill aliases under host skill roots')
    .option('--no-host-adapters', 'Skip writing global Codex/Claude hook adapters')
    .option('--no-external-skills', 'Skip Waza, Mermaid, and cross-review (codex-review/claude-review) skill bootstrap')
    .option('--no-verify', 'Skip repo workflow verification after apply')
    .option('--no-codegraph', 'Skip building the CodeGraph index and MCP readiness check')
    .option('--configure-codegraph', 'Auto-register the CodeGraph MCP server for Codex and Claude (global)')
    .option('--sync-codegraph', 'Sync the CodeGraph index after ensure')
    .option('--brain-root <path>', 'Brain vault root for manifest sync')
    .option('--brain-mode <mode>', 'Brain sync mode: skip|manifest-only|install-gbrain-cli', 'skip')
    .option('--interactive', 'Run the numbered interactive install planner')
    .option('--json', 'Output JSON instead of human-readable text')
    .action(async (rawOpts: {
      repo?: string;
      dryRun?: boolean;
      target: string;
      syncSkill?: boolean;
      hostAdapters?: boolean;
      externalSkills?: boolean;
      verify?: boolean;
      codegraph?: boolean;
      configureCodegraph?: boolean;
      syncCodegraph?: boolean;
      brainRoot?: string;
      brainMode?: string;
      interactive?: boolean;
      json?: boolean;
    }) => {
      if (!VALID_TARGETS.includes(rawOpts.target as InstallTargetSpec)) {
        console.error(
          `repo-harness update: invalid --target "${rawOpts.target}" (expected: ${VALID_TARGETS.join(', ')})`,
        );
        process.exit(2);
      }
      if (!['skip', 'manifest-only', 'install-gbrain-cli'].includes(rawOpts.brainMode ?? 'skip')) {
        console.error('repo-harness update: invalid --brain-mode (expected: skip, manifest-only, install-gbrain-cli)');
        process.exit(2);
      }
      const common = {
        repo: rawOpts.repo,
        apply: rawOpts.dryRun !== true,
        target: rawOpts.target as InstallTargetSpec,
        syncSkill: rawOpts.syncSkill !== false,
        hostAdapters: rawOpts.hostAdapters !== false,
        externalSkills: rawOpts.externalSkills !== false,
        verify: rawOpts.verify !== false,
        codegraph: rawOpts.codegraph !== false,
        configureCodegraphMcp: rawOpts.configureCodegraph === true,
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
      if (rawOpts.json === true) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        for (const line of result.lines) console.log(line);
      }
      process.exit(result.exitCode);
    });

  program
    .command('install')
    .description('Install hook adapters into Codex and/or Claude host config')
    .requiredOption('--target <target>', `Target host: ${VALID_TARGETS.join('|')}`)
    .requiredOption('--location <location>', `Install location: ${VALID_LOCATIONS.join('|')}`)
    .action((rawOpts: { target: string; location: string }) => {
      if (!VALID_TARGETS.includes(rawOpts.target as InstallTargetSpec)) {
        console.error(
          `repo-harness install: invalid --target "${rawOpts.target}" (expected: ${VALID_TARGETS.join(', ')})`,
        );
        process.exit(2);
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
  for (const name of ['prompt-guard-decide', 'prompt-guard-decision']) {
    program
      .command(name, { hidden: true })
      .description('Internal prompt-guard intent/state decision engine')
      .action(() => {
        console.log(runPromptGuardDecisionFromEnv());
        process.exit(0);
      });
  }

  return program;
}

if (import.meta.main) {
  try {
    await buildProgram().parseAsync(process.argv);
  } catch (err) {
    const e = err as { exitCode?: number; message?: string };
    if (typeof e.exitCode === 'number') process.exit(e.exitCode);
    if (e.message) console.error(e.message);
    process.exit(1);
  }
}
