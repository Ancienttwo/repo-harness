import { Command } from 'commander';
import {
  ATTEMPT_OUTCOME_VALUES,
  buildAttemptReceipt,
} from '../../core/state/attempt-ledger';
import type {
  AttemptReceiptV1,
  BoardDocumentV1,
  ContinuationEnvelopeV1,
  EffectiveState,
  EffectiveStateRiskInput,
} from '../../core/state/types';
import type { CommandOutcome } from '../../core/state/command-outcome';
import type { WorkflowOperationKind, WorkflowProfile } from '../../core/workflow/profile';
import { appendAttemptReceipt } from '../../effects/state/attempt-ledger-store';
import {
  readActiveSprintPath,
  readCanonicalTargetRef,
  type CollectBoardOptions,
} from '../../effects/state/collect-board-inputs';
import { resolveBoard } from '../../effects/state/resolve-board';
import { resolveContinuationEnvelope } from '../../effects/state/resolve-continuation-envelope';
import { resolveEffectiveState } from '../../effects/state/resolve-effective-state';
import { migrateLegacyActivePlan } from '../hook/legacy-active-plan-migration';

export interface StateCommandOptions {
  readonly targetPath?: readonly string[];
  readonly operation?: string;
  readonly profile?: string;
  readonly field?: string;
}

export type ResolveEffectiveState = (
  repoRoot: string,
  nowMs: number,
  risk?: EffectiveStateRiskInput,
) => EffectiveState;

export interface StateCommandDependencies {
  readonly repoRoot: string;
  readonly nowMs: number;
  readonly resolve: ResolveEffectiveState;
}

function operationalFailure(error: unknown): CommandOutcome {
  const message = error instanceof Error ? error.message : String(error);
  return { exitCode: 1, stdout: '', stderr: `${message}\n` };
}

/** Pure command projection. Commander owns only option parsing and process I/O. */
export function resolveStateCommand(
  options: StateCommandOptions,
  deps: StateCommandDependencies,
): CommandOutcome {
  let effective: EffectiveState;
  try {
    effective = deps.resolve(deps.repoRoot, deps.nowMs, {
      targetPaths: options.targetPath,
      operationKind: options.operation as WorkflowOperationKind | undefined,
      explicitOverride: options.profile as WorkflowProfile | undefined,
    });
  } catch (error) {
    return operationalFailure(error);
  }

  const blocked = effective.blockers.length > 0;
  if (options.field) {
    const record = effective as unknown as Record<string, unknown>;
    if (!Object.prototype.hasOwnProperty.call(record, options.field)) {
      return {
        exitCode: 2,
        stdout: '',
        stderr: `unknown --field '${options.field}'; expected one of: ${Object.keys(record).sort().join(', ')}\n`,
      };
    }

    // A blocked resolution's field value is not trustworthy: callers must
    // key off the exit code, not a possibly-still-populated value.
    const value = record[options.field];
    const stdout = !blocked && value !== undefined && value !== null
      ? `${typeof value === 'string' ? value : JSON.stringify(value)}\n`
      : '';
    return { exitCode: blocked ? 1 : 0, stdout, stderr: '' };
  }

  return {
    exitCode: blocked ? 1 : 0,
    stdout: `${JSON.stringify(effective, null, 2)}\n`,
    stderr: '',
  };
}

export type ResolveContinuationEnvelope = (
  repoRoot: string,
  nowMs: number,
) => ContinuationEnvelopeV1;

export interface ContinuationCommandDependencies {
  readonly repoRoot: string;
  readonly nowMs: number;
  readonly resolveEnvelope: ResolveContinuationEnvelope;
}

/**
 * Pure command projection for `state next`. A well-formed envelope always
 * exits 0 -- `halt` is an answer, not a command failure -- so only an
 * operational resolution error produces a non-zero exit.
 */
export function nextStateCommand(deps: ContinuationCommandDependencies): CommandOutcome {
  let envelope: ContinuationEnvelopeV1;
  try {
    envelope = deps.resolveEnvelope(deps.repoRoot, deps.nowMs);
  } catch (error) {
    return operationalFailure(error);
  }
  return { exitCode: 0, stdout: `${JSON.stringify(envelope, null, 2)}\n`, stderr: '' };
}

export interface AttemptCommandOptions {
  readonly unitRef?: string;
  readonly outcome?: string;
  readonly beforeProgressToken?: string;
  readonly afterProgressToken?: string;
}

export type AppendAttemptReceipt = (repoRoot: string, receipt: AttemptReceiptV1) => void;

export interface AttemptCommandDependencies {
  readonly repoRoot: string;
  readonly nowMs: number;
  readonly append: AppendAttemptReceipt;
}

/**
 * Pure command projection for `state attempt`. The recorder is dumb on
 * purpose: it validates the caller's claim, stamps `recorded_at`, and appends
 * one line. It resolves no state, derives no token, and writes no tracked file,
 * so a receipt can never become an authority for the state it describes.
 */
export function attemptStateCommand(
  options: AttemptCommandOptions,
  deps: AttemptCommandDependencies,
): CommandOutcome {
  const built = buildAttemptReceipt({
    unitRef: options.unitRef ?? '',
    outcome: options.outcome ?? '',
    beforeProgressToken: options.beforeProgressToken,
    afterProgressToken: options.afterProgressToken,
    recordedAt: new Date(deps.nowMs).toISOString(),
  });
  if (!built.ok) return { exitCode: 2, stdout: '', stderr: `${built.error}\n` };

  try {
    deps.append(deps.repoRoot, built.receipt);
  } catch (error) {
    return operationalFailure(error);
  }
  return { exitCode: 0, stdout: `${JSON.stringify(built.receipt, null, 2)}\n`, stderr: '' };
}

export interface BoardCommandOptions {
  readonly sprint?: string;
  readonly targetRef?: string;
}

export interface BoardCommandDependencies {
  readonly repoRoot: string;
  readonly nowMs: number;
  readonly activeSprintPath: () => string | null;
  readonly canonicalTargetRef: () => string;
  readonly resolveBoard: (repoRoot: string, options: CollectBoardOptions) => BoardDocumentV1;
}

/**
 * Pure command projection for `state board`.
 *
 * `--sprint` falls back to the active sprint marker and nothing else. There is
 * deliberately no `plans/sprints/` directory scan: picking a sprint by scanning
 * would make the board's scope depend on directory contents rather than on the
 * marker that every other verb already treats as the answer to "which sprint",
 * and a repository with two sprint files would silently get a different board
 * than a claim taken in the same repository.
 *
 * Exit codes match the rest of `state`: 2 is a malformed invocation (including
 * no sprint to project), 1 is an operational failure, 0 is a document -- and a
 * `changed_during_read` document is still a document, not a failure.
 */
export function boardStateCommand(
  options: BoardCommandOptions,
  deps: BoardCommandDependencies,
): CommandOutcome {
  let sprintPath = options.sprint ?? null;
  let targetRef = options.targetRef ?? null;
  try {
    if (sprintPath === null) sprintPath = deps.activeSprintPath();
    if (targetRef === null) targetRef = deps.canonicalTargetRef();
  } catch (error) {
    return operationalFailure(error);
  }
  if (sprintPath === null) {
    return {
      exitCode: 2,
      stdout: '',
      stderr: 'no active sprint is selected; pass --sprint <path>\n',
    };
  }

  try {
    const document = deps.resolveBoard(deps.repoRoot, {
      sprintPath,
      targetRef,
      nowMs: deps.nowMs,
    });
    return { exitCode: 0, stdout: `${JSON.stringify(document, null, 2)}\n`, stderr: '' };
  } catch (error) {
    return operationalFailure(error);
  }
}

function writeOutcome(outcome: CommandOutcome): void {
  if (outcome.stdout) process.stdout.write(outcome.stdout);
  if (outcome.stderr) process.stderr.write(outcome.stderr);
  process.exitCode = outcome.exitCode;
}

export function buildStateCommand(): Command {
  const state = new Command('state').description('Resolve authoritative repo workflow state');

  state
    .command('resolve')
    .description('Resolve the versioned effective state read model')
    .requiredOption('--json', 'Output the effective state as JSON')
    .option('--target-path <path...>', 'Concrete target path(s) for deterministic risk resolution')
    .option('--operation <kind>', 'Deterministic operation kind')
    .option('--profile <profile>', 'Explicit workflow profile override; may only raise the risk floor')
    .option(
      '--field <name>',
      'Print only this top-level field of the resolved state (e.g. workflow_profile) instead of the full JSON document; a pure output projection, the resolver is unchanged',
    )
    .action((opts: StateCommandOptions) => {
      writeOutcome(resolveStateCommand(opts, {
        repoRoot: process.cwd(),
        nowMs: Date.now(),
        resolve: resolveEffectiveState,
      }));
    });

  state
    .command('next')
    .description('Project the read-only continuation envelope for the next unit of work')
    .requiredOption('--json', 'Output the continuation envelope as JSON')
    .action(() => {
      writeOutcome(nextStateCommand({
        repoRoot: process.cwd(),
        nowMs: Date.now(),
        resolveEnvelope: resolveContinuationEnvelope,
      }));
    });

  state
    .command('attempt')
    .description('Append one continuation attempt receipt to the ignored runtime ledger')
    .requiredOption('--json', 'Output the appended receipt as JSON')
    .requiredOption('--unit-ref <path>', 'Repo-relative plan or sprint path the attempt ran against')
    .requiredOption('--outcome <outcome>', `One of: ${ATTEMPT_OUTCOME_VALUES.join(', ')}`)
    .option(
      '--before-progress-token <token>',
      'Envelope progress_token observed before the attempt; required unless --outcome resumed',
    )
    .option(
      '--after-progress-token <token>',
      'Envelope progress_token observed after the attempt; required unless --outcome resumed',
    )
    .action((opts: AttemptCommandOptions) => {
      writeOutcome(attemptStateCommand(opts, {
        repoRoot: process.cwd(),
        nowMs: Date.now(),
        append: appendAttemptReceipt,
      }));
    });

  state
    .command('board')
    .description('Project the read-only kanban board for one canonical sprint')
    .requiredOption('--json', 'Output the board document as JSON')
    .option('--sprint <path>', 'Repo-relative sprint path; defaults to the active sprint marker')
    .option(
      '--target-ref <ref>',
      'Canonical ref the sprint is read from; defaults to the policy merge-back target',
    )
    .action((opts: BoardCommandOptions) => {
      const repoRoot = process.cwd();
      writeOutcome(boardStateCommand(opts, {
        repoRoot,
        nowMs: Date.now(),
        activeSprintPath: () => readActiveSprintPath(repoRoot),
        canonicalTargetRef: () => readCanonicalTargetRef(repoRoot),
        resolveBoard,
      }));
    });

  state
    .command('migrate-legacy-active-plan')
    .description('One-shot migration of the retired .claude/.active-plan marker')
    .requiredOption('--json', 'Output the migration result as JSON')
    .action(() => {
      try {
        process.stdout.write(`${JSON.stringify(migrateLegacyActivePlan(), null, 2)}\n`);
        process.exitCode = 0;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        process.stderr.write(`${message}\n`);
        process.exitCode = 1;
      }
    });

  return state;
}
