import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { Command } from 'commander';
import { PROJECTION_REQUEST_VERSION, type ProjectionMode, type ProjectionRequestV1 } from '../../core/architecture/projection';
import { captureArchitectureProjectionSnapshot, inspectArchitectureProjectionReadiness, runArchitectureProjection } from '../../effects/architecture/archctx-provider';
import { drainArchitectureProjectionJobs } from '../../effects/architecture/projection-orchestrator';
import { architectureProjectionQueueState, retryArchitectureProjectionDeadLetter } from '../../effects/architecture/projection-jobs';
import { consumePendingPostEditEvents, migratePendingPostEditJournalV1, readPendingPostEditEvents } from '../hook/mutation-observed';

interface ProjectionCommandOptions {
  json?: boolean;
  changedPath?: string[];
  requestId?: string;
  adoptionPlanId?: string;
}

export function buildArchitectureProjectionCommand(): Command {
  const command = new Command('architecture-projection').description('Run the configured deterministic architecture projection provider');
  command.command('status').requiredOption('--json', 'Output readiness JSON').action(() => {
    try { write(inspectArchitectureProjectionReadiness(repositoryRoot())); }
    catch (error) { fail(error); }
  });
  for (const name of ['check', 'plan', 'apply'] as const) {
    command.command(name)
      .requiredOption('--json', 'Output ProjectionResultV1 JSON')
      .option('--changed-path <path...>', 'Changed repository-relative paths')
      .option('--request-id <id>', 'Stable request id')
      .action((options: ProjectionCommandOptions) => execute(name, options));
  }
  command.command('drain').requiredOption('--json', 'Output durable drain JSON').action(() => {
    try {
      const root = repositoryRoot();
      migratePendingPostEditJournalV1(root, 100);
      const sourceEvents = readPendingPostEditEvents(root);
      const result = drainArchitectureProjectionJobs(root, { sourceEvents });
      consumePendingPostEditEvents(root, process.env, result.acknowledgeSourceEvents
        ? {
            skipArchitectureCascade: result.status !== 'disabled',
            ...(result.status === 'disabled' ? {} : { eventIds: result.sourceEventIds }),
          }
        : {
            skipArchitectureCascade: true,
            eventIds: sourceEvents.map((event) => event.event_id),
            retainEventFiles: true,
          });
      write({ ...result, sourceJournalPending: readPendingPostEditEvents(root).length });
      if (result.status === 'retry-pending' || result.status === 'dead-letter') process.exitCode = 1;
    } catch (error) { fail(error); }
  });
  command.command('retry-dead-letter')
    .requiredOption('--json', 'Output retried job and queue state JSON')
    .requiredOption('--job-id <id>', 'Exact dead-letter job id')
    .action((options: { jobId: string }) => {
      try {
        const root = realpathSync(repositoryRoot());
        const job = retryArchitectureProjectionDeadLetter(root, options.jobId);
        write({ schemaVersion: 'repo-harness.architecture-projection-retry/v1', job, queue: architectureProjectionQueueState(root) });
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
