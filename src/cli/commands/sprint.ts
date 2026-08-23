/** CLI adapter for the effect-owned sprint coordination verbs. */
import { Command } from 'commander';
import type { CommandOutcome } from '../../core/state/command-outcome';
import {
  abortCompletionSprintCommand,
  beginCompletionSprintCommand,
  bindSprintCommand,
  claimSprintCommand,
  identifySprintCommand,
  processSprintDependencies,
  reconcileSprintCommand,
  releaseSprintCommand,
  stealSprintCommand,
  writeClaimTokenSprintCommand,
  type AbortCompletionCommandOptions,
  type BeginCompletionCommandOptions,
  type BindCommandOptions,
  type ClaimCommandOptions,
  type IdentifyCommandOptions,
  type ReconcileCommandOptions,
  type ReleaseCommandOptions,
  type StealCommandOptions,
  type WriteClaimTokenCommandOptions,
} from '../../effects/state/coordination-sprint';

function writeOutcome(outcome: CommandOutcome): void {
  if (outcome.stdout) process.stdout.write(outcome.stdout);
  if (outcome.stderr) process.stderr.write(outcome.stderr);
  process.exitCode = outcome.exitCode;
}

export function buildSprintCommand(): Command {
  const sprint = new Command('sprint')
    .description('Own sprint execution on the shared coordination plane');

  sprint
    .command('identify')
    .description('Derive one backlog row\'s task id and task revision from the canonical ref')
    .requiredOption('--task <ref>', 'Backlog index or exact Task cell')
    .requiredOption('--target-ref <ref>', 'Canonical ref the row is read from')
    .requiredOption('--sprint-path <path>', 'Repo-relative sprint path on that ref')
    .action((opts: IdentifyCommandOptions) => {
      writeOutcome(identifySprintCommand(opts, processSprintDependencies(process.cwd())));
    });

  sprint
    .command('claim')
    .description('Claim one sprint backlog row against the canonical target ref')
    .requiredOption('--task-id <id>', 'Coordination task id (never a row index or slug)')
    .requiredOption('--expected-task-revision <rev>', 'Task revision observed by the caller')
    .requiredOption('--target-ref <ref>', 'Canonical ref the sprint row is validated against')
    .requiredOption('--sprint-path <path>', 'Repo-relative sprint path on that ref')
    .requiredOption('--session-id <id>', 'Session recorded as the claim holder')
    .action((opts: ClaimCommandOptions) => {
      writeOutcome(claimSprintCommand(opts, processSprintDependencies(process.cwd())));
    });

  sprint
    .command('bind')
    .description('Move a reserving claim to bound once its execution worktree exists')
    .requiredOption('--claim-id <id>', 'Fencing token returned by claim')
    .requiredOption('--worktree <path>', 'Execution worktree path')
    .requiredOption('--branch <branch>', 'Execution branch')
    .requiredOption('--unit-ref <ref>', 'Plan or sprint ref the worktree executes')
    .action((opts: BindCommandOptions) => {
      writeOutcome(bindSprintCommand(opts, processSprintDependencies(process.cwd())));
    });

  sprint
    .command('write-claim-token')
    .description('Write a worktree claim token only for the exact current bound lease')
    .requiredOption('--task-id <id>', 'Coordination task id')
    .requiredOption('--claim-id <id>', 'Fencing token returned by claim')
    .requiredOption('--worktree <path>', 'Bound execution worktree')
    .requiredOption('--sprint-path <path>', 'Canonical sprint path')
    .requiredOption('--task <task>', 'Exact canonical Task cell')
    .requiredOption('--unit-ref <ref>', 'Bound plan or inline unit ref')
    .action((opts: WriteClaimTokenCommandOptions) => {
      writeOutcome(writeClaimTokenSprintCommand(opts, processSprintDependencies(process.cwd())));
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
    .command('steal')
    .description('Preempt a lease, recording which claim it was taken from and why')
    .requiredOption('--expected-claim-id <id>', 'Fencing token the lease must currently hold')
    .requiredOption('--reason <reason>', 'Why the lease is being taken')
    .requiredOption('--session-id <id>', 'Session recorded as the new claim holder')
    .action((opts: StealCommandOptions) => {
      writeOutcome(stealSprintCommand(opts, processSprintDependencies(process.cwd())));
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
