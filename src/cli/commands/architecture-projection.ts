import { readGlobalArchitectureConfiguration } from '../../effects/architecture/projection-config';
import { execFileSync } from 'node:child_process';
import { Command } from 'commander';
import type { ProjectionMode } from 'archctx-contracts';
import { architectureProjectionRequest, inspectArchitectureProjectionReadiness, readArchitectureDocsAnchors, runArchitectureProjection } from '../../effects/architecture/archctx-provider';
import { applyArchitectureProjection } from '../../effects/architecture/projection-apply';

export interface ProjectionCommandOptions {
  json?: boolean;
  changedPath?: string[];
  requestId?: string;
  adoptionPlanId?: string;
  expectedWorktreeDigest?: string;
}

export function buildArchitectureProjectionCommand(): Command {
  const command = new Command('architecture-projection').description('Run the configured deterministic architecture projection provider');
  command.command('policy').requiredOption('--json', 'Output the global execution policy without invoking the provider').action(() => {
    try {
      const { path, initialized, policy } = readGlobalArchitectureConfiguration();
      write({ ...policy, configuration: { scope: 'global', path, initialized } });
    } catch (error) { fail(error); }
  });
  command.command('status').requiredOption('--json', 'Output readiness JSON').action(() => {
    try {
      const root = repositoryRoot();
      const { path, initialized } = readGlobalArchitectureConfiguration();
      write({ ...inspectArchitectureProjectionReadiness(root), configuration: { scope: 'global', path, initialized } });
    }
    catch (error) { fail(error); }
  });
  for (const name of ['check', 'plan', 'apply'] as const) {
    command.command(name)
      .requiredOption('--json', 'Output ProjectionResultV2 JSON')
      .option('--changed-path <path...>', 'Changed repository-relative paths')
      .option('--request-id <id>', 'Stable request id')
      .option('--expected-worktree-digest <digest>', 'Refuse a worktree that differs from the reviewed plan')
      .action((options: ProjectionCommandOptions) => execute(name, options));
  }
  command.command('adopt')
    .requiredOption('--json', 'Output ProjectionResultV2 JSON')
    .requiredOption('--adoption-plan-id <id>', 'Approved ArchContext adoption plan id')
    .option('--expected-worktree-digest <digest>', 'Refuse a worktree that differs from the reviewed plan')
    .option('--changed-path <path...>', 'Changed repository-relative paths')
    .option('--request-id <id>', 'Stable request id')
    .action((options: ProjectionCommandOptions) => execute('adopt', options));
  // A signal, not a gate: findings keep exit 0. Only a failed run exits 1.
  command.command('anchors').requiredOption('--json', 'Output the read-only archctx docs anchors report').action(() => {
    try { write(readArchitectureDocsAnchors(repositoryRoot())); }
    catch (error) { fail(error); }
  });
  return command;
}

function execute(mode: ProjectionMode, options: ProjectionCommandOptions): void {
  try {
    const root = repositoryRoot();
    const requestOptions = { adoptionPlanId: options.adoptionPlanId, changedPaths: options.changedPath, requestId: options.requestId, expectedWorktreeDigest: options.expectedWorktreeDigest };
    const result = mode === 'apply' || mode === 'adopt'
      ? applyArchitectureProjection(root, { mode, ...requestOptions })
      : runArchitectureProjection(architectureProjectionRequest(mode, root, requestOptions), root);

    write(result);
    if (result.majorChangeAcceptance === 'declined-unprovable-proof') process.stderr.write('archctx declined an unprovable major change; next: archctx flows check --json\n');
    if (architectureProjectionExitCode(mode, result.status) !== 0) process.exitCode = 1;
  } catch (error) {
    fail(error);
  }
}

export function architectureProjectionExitCode(mode: ProjectionMode, status: string): 0 | 1 {
  if (status === 'noop') return 0;
  if (status === 'applied') return mode === 'apply' || mode === 'adopt' ? 0 : 1;
  return mode === 'plan' && status === 'planned' ? 0 : 1;
}

function fail(error: unknown): void {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

function repositoryRoot(): string { return git(process.cwd(), ['rev-parse', '--show-toplevel']); }
function git(cwd: string, args: string[]): string { return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
function write(value: unknown): void { process.stdout.write(`${JSON.stringify(value, null, 2)}\n`); }
