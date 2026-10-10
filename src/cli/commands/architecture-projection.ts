import { readGlobalArchitectureConfiguration } from '../../effects/architecture/projection-config';
import { execFileSync } from 'node:child_process';
import { Command } from 'commander';
import { PROJECTION_REQUEST_VERSION, type ProjectionMode, type ProjectionRequestV1 } from '../../core/architecture/projection';
import { captureArchitectureProjectionSnapshot, inspectArchitectureProjectionReadiness, runArchitectureProjection } from '../../effects/architecture/archctx-provider';
import {
  acceptArchitectureProjectionCandidate,
  inspectArchitectureProjectionAcceptanceState,
  reconcileArchitectureProjectionCandidate,
  retireStaleArchitectureProjectionCandidate,
  recordArchitectureProjectionAcceptanceCandidates,
} from '../../effects/architecture/projection-acceptance';

export interface ProjectionCommandOptions {
  json?: boolean;
  changedPath?: string[];
  requestId?: string;
  adoptionPlanId?: string;
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
      write({ ...inspectArchitectureProjectionReadiness(root), configuration: { scope: 'global', path, initialized }, acceptance: inspectArchitectureProjectionAcceptanceState(root) });
    }
    catch (error) { fail(error); }
  });
  for (const name of ['check', 'plan', 'apply'] as const) {
    command.command(name)
      .requiredOption('--json', 'Output ProjectionResultV1 JSON')
      .option('--changed-path <path...>', 'Changed repository-relative paths')
      .option('--request-id <id>', 'Stable request id')
      .action((options: ProjectionCommandOptions) => execute(name, options));
  }
  command.command('accept')
    .description('Apply one exact unresolved-major refresh signal after explicit approval')
    .requiredOption('--json', 'Output architecture acceptance receipt JSON')
    .requiredOption('--signal-id <sha256>', 'Exact unresolved-major refresh signal id')
    .requiredOption('--approval-reference <event-id>', 'Exact external human approval event identity')
    .option('--adoption-plan-id <id>', 'Exact approved ArchContext adoption plan id when ownership adoption is required')
    .option('--recover', 'Read back an already committed provider apply before resuming refresh; never invoke apply')
    .action((options: { signalId: string; approvalReference: string; adoptionPlanId?: string; recover?: boolean }) => {
      try {
        write(acceptArchitectureProjectionCandidate(repositoryRoot(), options.signalId, options.approvalReference, {
          adoptionPlanId: options.adoptionPlanId,
          recover: options.recover,
        }));
      } catch (error) { fail(error); }
    });
  command.command('reconcile')
    .description('Retire one proof-only candidate after a current deterministic proof check')
    .requiredOption('--json', 'Output architecture reconciliation receipt JSON')
    .requiredOption('--signal-id <sha256>', 'Exact verified-flow-proof-changed signal id')
    .action((options: { signalId: string }) => {
      try {
        write(reconcileArchitectureProjectionCandidate(repositoryRoot(), options.signalId));
      } catch (error) { fail(error); }
    });
  command.command('retire-stale')
    .description('Retire one stale semantic candidate after explicit approval and a current deterministic proof check')
    .requiredOption('--json', 'Output architecture stale retirement receipt JSON')
    .requiredOption('--signal-id <sha256>', 'Exact stale unresolved-major refresh signal id')
    .requiredOption('--approval-reference <event-id>', 'Exact external human approval event identity')
    .action((options: { signalId: string; approvalReference: string }) => {
      try {
        write(retireStaleArchitectureProjectionCandidate(repositoryRoot(), options.signalId, options.approvalReference));
      } catch (error) { fail(error); }
    });
  command.command('adopt')
    .requiredOption('--json', 'Output ProjectionResultV1 JSON')
    .requiredOption('--adoption-plan-id <id>', 'Approved ArchContext adoption plan id')
    .option('--changed-path <path...>', 'Changed repository-relative paths')
    .option('--request-id <id>', 'Stable request id')
    .action((options: ProjectionCommandOptions) => execute('adopt', options));
  return command;
}

function execute(mode: ProjectionMode, options: ProjectionCommandOptions): void {
  try {
    const root = repositoryRoot();
    const expected = captureArchitectureProjectionSnapshot(root);
    const request: ProjectionRequestV1 = {
      schemaVersion: PROJECTION_REQUEST_VERSION,
      requestId: options.requestId ?? `repo-harness.${mode}`,
      profile: 'repo-harness/v1',
      mode,
      targets: ['architecture-docs'],
      changedPaths: [...new Set(options.changedPath ?? [])].sort(),
      expected,
      ...(mode === 'adopt' ? { adoptionPlanId: options.adoptionPlanId } : {}),
    };
    const result = runArchitectureProjection(request, root);
    recordArchitectureProjectionAcceptanceCandidates(root, request, result);
    write(result);
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
