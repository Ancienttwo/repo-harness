import { Command } from 'commander';
import type { EffectiveState, EffectiveStateRiskInput } from '../../core/state/types';
import type { WorkflowOperationKind, WorkflowProfile } from '../../core/workflow/profile';
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
