#!/usr/bin/env bun
/**
 * repo-harness CLI entry — Phase 1B.
 *
 * Wires commander.js to install, hook, status, doctor, migrate, and tools
 * command bodies. Keeps the Phase 1A `SUBCOMMANDS` / `Subcommand` exports
 * importable by Phase 1A tests so the scaffold contract survives the rewrite.
 */

import { Command } from 'commander';
import { runInstall, type InstallTargetSpec } from './commands/install';
import { runInit } from './commands/init';
import { runHook } from './commands/hook';
import { formatStatus, runStatus } from './commands/status';
import { formatDoctor, runDoctor } from './commands/doctor';
import { formatMigratePlan, runMigrate } from './commands/migrate';
import { buildToolsCommand } from './commands/tools';
import { buildBrainCommand } from './commands/brain';
import { buildCapabilityContextCommand } from './commands/capability-context';
import type { Location } from './installer/types';
import type { HookEvent, RouteId } from './hook/route-registry';

export const SUBCOMMANDS = [
  'init',
  'install',
  'hook',
  'status',
  'doctor',
  'migrate',
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
    .version('0.1.1')
    .exitOverride();

  program
    .command('init')
    .description('Install or refresh the repo-harness workflow in an existing repo')
    .option('--repo <path>', 'Target repository path (defaults to cwd)')
    .option('--dry-run', 'Plan repo harness changes without applying them')
    .option('--target <target>', `Host target for adapters and external skills: ${VALID_TARGETS.join('|')}`, 'both')
    .option('--no-sync-skill', 'Skip refreshing repo-harness skill aliases under host skill roots')
    .option('--no-host-adapters', 'Skip writing global Codex/Claude hook adapters')
    .option('--no-external-skills', 'Skip Waza, diagram-design, and cross-review (codex-review/claude-review) skill bootstrap')
    .option('--no-verify', 'Skip repo workflow verification after apply')
    .option('--no-codegraph', 'Skip building the CodeGraph index and MCP readiness check')
    .option('--configure-codegraph', 'Auto-register the CodeGraph MCP server for Codex and Claude (global)')
    .option('--json', 'Output JSON instead of human-readable text')
    .action((rawOpts: {
      repo?: string;
      dryRun?: boolean;
      target: string;
      syncSkill?: boolean;
      hostAdapters?: boolean;
      externalSkills?: boolean;
      verify?: boolean;
      codegraph?: boolean;
      configureCodegraph?: boolean;
      json?: boolean;
    }) => {
      if (!VALID_TARGETS.includes(rawOpts.target as InstallTargetSpec)) {
        console.error(
          `repo-harness init: invalid --target "${rawOpts.target}" (expected: ${VALID_TARGETS.join(', ')})`,
        );
        process.exit(2);
      }
      const result = runInit({
        repo: rawOpts.repo,
        apply: rawOpts.dryRun !== true,
        target: rawOpts.target as InstallTargetSpec,
        syncSkill: rawOpts.syncSkill !== false,
        hostAdapters: rawOpts.hostAdapters !== false,
        externalSkills: rawOpts.externalSkills !== false,
        verify: rawOpts.verify !== false,
        codegraph: rawOpts.codegraph !== false,
        configureCodegraphMcp: rawOpts.configureCodegraph === true,
      });
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

  program.addCommand(buildToolsCommand());
  program.addCommand(buildBrainCommand());
  program.addCommand(buildCapabilityContextCommand());

  return program;
}

if (import.meta.main) {
  try {
    buildProgram().parse(process.argv);
  } catch (err) {
    const e = err as { exitCode?: number; message?: string };
    if (typeof e.exitCode === 'number') process.exit(e.exitCode);
    if (e.message) console.error(e.message);
    process.exit(1);
  }
}
