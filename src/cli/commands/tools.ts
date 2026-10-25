import { globalRuntimeScope, withRuntimeTransactionLock } from '../installer/runtime-host-lock';
/**
 * `repo-harness tools` — explicit tool lifecycle commands.
 *
 * Host adapter installation remains under `install --target`; tool readiness
 * mutation lives here so detector, installer, and MCP lifecycles stay separate.
 */

import { Command } from 'commander';
import {
  configureCodegraph,
  ensureCodegraph,
  type CodegraphConfigureLocation,
  type CodegraphConfigureResult,
  type CodegraphHostTarget,
  type CodegraphEnsureResult,
} from '../tools/codegraph';

interface CodegraphEnsureCliOptions {
  json?: boolean;
  check?: boolean;
  init?: boolean;
  sync?: boolean;
  installDeps?: boolean;
  repo?: string;
}

interface CodegraphConfigureCliOptions {
  json?: boolean;
  target: string;
  location: string;
  repo?: string;
}

export function formatCodegraphEnsure(result: CodegraphEnsureResult, asJson = false, repoRoot?: string): string {
  if (asJson) {
    return JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        repo_root: repoRoot,
        changed: result.changed,
        read_only: result.readOnly,
        codegraph: result.raw,
        actions: result.actions,
      },
      null,
      2,
    );
  }

  const lines: string[] = [];
  lines.push(`CodeGraph: ${result.status} (${result.reason})`);
  lines.push(`Source: ${result.resolution.source}`);
  if (result.resolution.version) lines.push(`Version: ${result.resolution.version}`);
  if (result.resolution.globalFallbackUsed) lines.push('Fallback: global binary used');
  if (result.actions.length > 0) {
    lines.push('');
    lines.push('Actions:');
    for (const action of result.actions) {
      lines.push(`  ${action.action}: ${action.status}`);
    }
  }
  return lines.join('\n');
}

export function formatCodegraphConfigure(result: CodegraphConfigureResult, asJson = false, repoRoot?: string): string {
  if (asJson) {
    return JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        repo_root: repoRoot,
        target: result.target,
        location: result.location,
        changed: result.changed,
        read_only: result.readOnly,
        codegraph: result.raw,
        actions: result.actions,
      },
      null,
      2,
    );
  }

  const lines: string[] = [];
  lines.push(`CodeGraph configure: target=${result.target} location=${result.location}`);
  lines.push(`Source: ${result.resolution.source}`);
  if (result.resolution.version) lines.push(`Version: ${result.resolution.version}`);
  if (result.actions.length > 0) {
    lines.push('');
    lines.push('Actions:');
    for (const action of result.actions) {
      lines.push(`  ${action.action}: ${action.status}`);
    }
  }
  return lines.join('\n');
}

function parseTarget(value: string): CodegraphHostTarget {
  if (value === 'codex' || value === 'claude' || value === 'both') return value;
  throw new Error(`invalid --target "${value}" (expected: codex, claude, both)`);
}

function parseLocation(value: string): CodegraphConfigureLocation {
  if (value === 'global' || value === 'local') return value;
  throw new Error(`invalid --location "${value}" (expected: global, local)`);
}

export function buildToolsCommand(): Command {
  const tools = new Command('tools').description('Manage explicit external tool readiness');
  const ensure = new Command('ensure').description('Ensure a named tool is ready');
  const configure = new Command('configure').description('Configure a named tool for a host agent');

  ensure
    .command('codegraph')
    .description('Check or ensure CodeGraph readiness for the current repo')
    .option('--json', 'Output JSON instead of human-readable text')
    .option('--check', 'Read-only readiness check; do not install, init, or sync')
    .option('--init', 'Initialize the repo index when missing')
    .option('--sync', 'Sync the repo index')
    .option('--no-install-deps', 'Do not run bun install when the local binary is missing')
    .option('--repo <path>', 'Repository root to check or ensure')
    .action((rawOpts: CodegraphEnsureCliOptions) => {
      const repoRoot = rawOpts.repo ?? process.cwd();
      const result = ensureCodegraph({
        repoRoot,
        checkOnly: rawOpts.check === true,
        init: rawOpts.init === true,
        sync: rawOpts.sync === true,
        installDeps: rawOpts.installDeps !== false,
      });
      console.log(formatCodegraphEnsure(result, rawOpts.json === true, repoRoot));
      const failed = result.actions.some((entry) => entry.status === 'failed');
      process.exit(failed ? 1 : 0);
    });

  configure
    .command('codegraph')
    .description('Configure CodeGraph MCP for Codex and/or Claude')
    .requiredOption('--target <target>', 'Target host: codex|claude|both')
    .requiredOption('--location <location>', 'Install location: global|local')
    .option('--json', 'Output JSON instead of human-readable text')
    .option('--repo <path>', 'Repository root used for local installs and readiness probes')
    .action((rawOpts: CodegraphConfigureCliOptions) => {
      let target: CodegraphHostTarget;
      let location: CodegraphConfigureLocation;
      try {
        target = parseTarget(rawOpts.target);
        location = parseLocation(rawOpts.location);
      } catch (err) {
        console.error((err as Error).message);
        process.exit(2);
      }

      const repoRoot = rawOpts.repo ?? process.cwd();
      const configureHost = () => configureCodegraph({ repoRoot, target, location });
      const result = location === 'global'
        ? withRuntimeTransactionLock(globalRuntimeScope(process.env), configureHost)
        : configureHost();
      console.log(formatCodegraphConfigure(result, rawOpts.json === true, repoRoot));
      const failed = result.actions.some((entry) => entry.status === 'failed');
      process.exit(failed ? 1 : 0);
    });

  tools.addCommand(ensure);
  tools.addCommand(configure);
  return tools;
}
