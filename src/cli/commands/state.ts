import { Command } from 'commander';
import {
  ATTEMPT_OUTCOME_VALUES,
  buildAttemptReceipt,
} from '../../core/state/attempt-ledger';
import type {
  AttemptReceiptV1,
  ContinuationEnvelopeV1,
  EffectiveState,
  EffectiveStateRiskInput,
} from '../../core/state/types';
import type { WorkflowOperationKind, WorkflowProfile } from '../../core/workflow/profile';
import { appendAttemptReceipt } from '../../effects/state/attempt-ledger-store';
import { resolveContinuationEnvelope } from '../../effects/state/resolve-continuation-envelope';
import { resolveEffectiveState } from '../../effects/state/resolve-effective-state';
import { migrateLegacyActivePlan } from '../hook/legacy-active-plan-migration';

export interface CommandOutcome {
  readonly exitCode: 0 | 1 | 2;
  readonly stdout: string;
  readonly stderr: string;
}

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
