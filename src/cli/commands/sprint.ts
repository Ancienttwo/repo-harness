/** Contract closeout and lease cleanup commands. */
import { Command } from 'commander';
import type { CommandOutcome } from '../../core/state/command-outcome';
import {
  abortCompletionSprintCommand, beginCompletionSprintCommand, completeRowSprintCommand,
  processSprintDependencies, reconcileSprintCommand, releaseSprintCommand,
  type AbortCompletionCommandOptions, type BeginCompletionCommandOptions,
  type CompleteRowCommandOptions, type ReconcileCommandOptions, type ReleaseCommandOptions,
} from '../../effects/state/coordination-sprint';

function writeOutcome(outcome: CommandOutcome): void {
  if (outcome.stdout) process.stdout.write(outcome.stdout);
  if (outcome.stderr) process.stderr.write(outcome.stderr);
  process.exitCode = outcome.exitCode;
}

export function buildSprintCommand(): Command {
  const sprint = new Command('sprint').description('Complete retained contract work and clean up its leases');

  sprint
    .command('complete-row')
    .description('Complete one backlog row and release its lease inside one locked transaction')
    .requiredOption('--sprint <path>', 'Repo-relative sprint path whose row is completed')
    .requiredOption('--task <ref>', 'Backlog index or exact Task cell')
    .requiredOption('--target-ref <ref>', 'Canonical ref the lease was claimed against')
    .option('--plan-cell <cell>', 'Replacement Plan cell for the completed row')
    .option('--defer-lease-release', 'Leave the lease held; the caller owns its release')
    .action((opts: {
      sprint: string;
      task: string;
      targetRef: string;
      planCell?: string;
      deferLeaseRelease?: boolean;
    }) => {
      const options: CompleteRowCommandOptions = {
        sprint: opts.sprint,
        task: opts.task,
        targetRef: opts.targetRef,
        ...(opts.planCell === undefined ? {} : { planCell: opts.planCell }),
        ...(opts.deferLeaseRelease === true ? { deferLeaseRelease: true } : {}),
      };
      writeOutcome(completeRowSprintCommand(options, processSprintDependencies(process.cwd())));
    });

  sprint
    .command('begin-completion')
    .description('Gate a completion: claim id, worktree binding, and task revision, then mark completing')
    .requiredOption('--claim-id <id>', 'Fencing token returned by claim')
    .requiredOption('--worktree <path>', 'Worktree the completion runs in')
    .requiredOption('--target-ref <ref>', 'Canonical ref the task revision is re-checked against')
    .option('--finish-transaction-key <key>', 'Closeout journal key this publication window runs under')
    .action((opts: BeginCompletionCommandOptions) => {
      writeOutcome(beginCompletionSprintCommand(opts, processSprintDependencies(process.cwd())));
    });

  sprint
    .command('abort-completion')
    .description('Restore an unpublished completion to bound after checking its fencing token and canonical row')
    .requiredOption('--claim-id <id>', 'Fencing token returned by claim')
    .requiredOption('--worktree <path>', 'Worktree whose completion was aborted')
    .requiredOption('--target-ref <ref>', 'Canonical ref whose task row must still be pending')
    .action((opts: AbortCompletionCommandOptions) => {
      writeOutcome(abortCompletionSprintCommand(opts, processSprintDependencies(process.cwd())));
    });

  sprint
    .command('release')
    .description('Release a lease this fencing token owns')
    .requiredOption('--claim-id <id>', 'Fencing token returned by claim')
    .action((opts: ReleaseCommandOptions) => {
      writeOutcome(releaseSprintCommand(opts, processSprintDependencies(process.cwd())));
    });

  sprint
    .command('reconcile')
    .description('Report one lease and clear it only where released state or a completed canonical row proves it is finished')
    .requiredOption('--task-id <id>', 'Coordination task id')
    .requiredOption('--target-ref <ref>', 'Canonical ref the backlog row status is read from')
    .option('--expected-claim-id <id>', 'Act only if the lease is still held by this claim')
    .action((opts: ReconcileCommandOptions) => {
      writeOutcome(reconcileSprintCommand(opts, processSprintDependencies(process.cwd())));
    });

  return sprint;
}
