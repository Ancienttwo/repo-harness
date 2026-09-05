import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { Command } from 'commander';
import { PROJECTION_REQUEST_VERSION, type ProjectionMode, type ProjectionRequestV1 } from '../../core/architecture/projection';
import { captureArchitectureProjectionSnapshot, inspectArchitectureProjectionReadiness, loadArchitectureProjectionPolicy, runArchitectureProjection } from '../../effects/architecture/archctx-provider';
import { drainArchitectureProjectionJobs } from '../../effects/architecture/projection-orchestrator';
import { architectureProjectionQueueState, retryArchitectureProjectionDeadLetter } from '../../effects/architecture/projection-jobs';
import { publishLatestArchitectureProjectionRestamp } from '../../effects/architecture/restamp-publication';
import { consumeArchitectureRefreshSignals } from '../../effects/architecture/refresh-consumer';
import {
  acceptArchitectureProjectionCandidate,
  inspectArchitectureProjectionAcceptanceState,
  reconcileArchitectureProjectionCandidate,
  retireStaleArchitectureProjectionCandidate,
  recordArchitectureProjectionAcceptanceCandidates,
} from '../../effects/architecture/projection-acceptance';
import { processArchitectureCascade, readPendingPostEditEvents } from '../hook/mutation-observed';
import {
  acknowledgeArchitectureProjectionPublication,
  advanceArchitectureDriftCursor,
  architectureDriftSourceEvent,
  computeArchitectureDriftChangedSet,
} from '../hook/architecture-drift';

export interface ProjectionCommandOptions {
  json?: boolean;
  changedPath?: string[];
  requestId?: string;
  adoptionPlanId?: string;
}

export function buildArchitectureProjectionCommand(): Command {
  const command = new Command('architecture-projection').description('Run the configured deterministic architecture projection provider');
  command.command('status').requiredOption('--json', 'Output readiness JSON').action(() => {
    try {
      const root = repositoryRoot();
      write({ ...inspectArchitectureProjectionReadiness(root), acceptance: inspectArchitectureProjectionAcceptanceState(root) });
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
  command.command('drain').requiredOption('--json', 'Output durable drain JSON').action(() => {
    try {
      const root = repositoryRoot();
      const changedSet = computeArchitectureDriftChangedSet(root);
      for (const warning of changedSet.warnings) process.stderr.write(`${warning}\n`);
      const driftEvent = architectureDriftSourceEvent(changedSet);
      const deadlineMs = Date.now() + loadArchitectureProjectionPolicy(root).timeoutMs;
      const result = drainArchitectureProjectionJobs(root, { sourceEvents: driftEvent ? [driftEvent] : [] });
      if (result.status === 'disabled') {
        for (const changedPath of changedSet.paths) {
          const cascade = processArchitectureCascade(root, process.env, changedPath, { deadlineMs, nowMs: Date.now });
          if (!cascade.ok) throw new Error(cascade.error);
        }
      }
      if (result.acknowledgeSourceEvents && changedSet.headSha !== null) {
        advanceArchitectureDriftCursor(root, changedSet.headSha);
      }
      write({ ...result, sourceJournalPending: readPendingPostEditEvents(root).length });
      if (result.status === 'reconcile-pending' || result.status === 'retry-pending' || result.status === 'dead-letter') process.exitCode = 1;
    } catch (error) { fail(error); }
  });
  // Manual recovery entry for the Stop-time auto-publication: same classifier,
  // same gate, same synthesis. Exit 1 unless a commit was actually published,
  // so an operator never reads a refused gate as a successful publication.
  command.command('publish-restamp')
    .requiredOption('--json', 'Output restamp publication JSON')
    .action(() => {
      try {
        const outcome = publishLatestArchitectureProjectionRestamp(realpathSync(repositoryRoot()));
        write(outcome);
        if (outcome.status !== 'published') process.exitCode = 1;
      } catch (error) { fail(error); }
    });
  command.command('acknowledge-publication')
    .requiredOption('--json', 'Output publication acknowledgement JSON')
    .requiredOption('--publication-sha <sha>', 'Exact synthesized publication SHA')
    .action((options: { publicationSha: string }) => {
      try {
        const root = repositoryRoot();
        write(acknowledgeArchitectureProjectionPublication(root, options.publicationSha));
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
  command.command('accept')
    .description('Apply one exact unresolved-major refresh signal after explicit approval')
    .requiredOption('--json', 'Output architecture acceptance receipt JSON')
    .requiredOption('--signal-id <sha256>', 'Exact unresolved-major refresh signal id')
    .requiredOption('--approval-reference <event-id>', 'Exact external human approval event identity')
    .option('--adoption-plan-id <id>', 'Exact approved ArchContext adoption plan id when ownership adoption is required')
    .action((options: { signalId: string; approvalReference: string; adoptionPlanId?: string }) => {
      try {
        write(acceptArchitectureProjectionCandidate(repositoryRoot(), options.signalId, options.approvalReference, {
          adoptionPlanId: options.adoptionPlanId,
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
    if ((mode === 'apply' || mode === 'adopt') && (result.status === 'applied' || result.status === 'noop')) {
      const unresolved = result.refreshSignals.find((signal) => signal.mode === 'human-action-required');
      if (!unresolved) consumeArchitectureRefreshSignals(root, result.refreshSignals, request.changedPaths);
    }
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
