import { Command } from 'commander';
import { migrateLegacyActivePlan, resolveEffectiveState } from '../hook/state-snapshot';
import type { WorkflowOperationKind, WorkflowProfile } from '../hook/workflow-profile';

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
    .action((opts: { targetPath?: string[]; operation?: string; profile?: string; field?: string }) => {
      const effective = resolveEffectiveState(process.cwd(), Date.now(), {
        targetPaths: opts.targetPath,
        operationKind: opts.operation as WorkflowOperationKind | undefined,
        explicitOverride: opts.profile as WorkflowProfile | undefined,
      });
      if (opts.field) {
        const value = (effective as unknown as Record<string, unknown>)[opts.field];
        if (value !== undefined && value !== null) {
          console.log(typeof value === 'string' ? value : JSON.stringify(value));
        }
        process.exit(effective.blockers.length > 0 ? 1 : 0);
      }
      console.log(JSON.stringify(effective, null, 2));
      process.exit(effective.blockers.length > 0 ? 1 : 0);
    });

  state
    .command('migrate-legacy-active-plan')
    .description('One-shot migration of the retired .claude/.active-plan marker')
    .requiredOption('--json', 'Output the migration result as JSON')
    .action(() => {
      try {
        console.log(JSON.stringify(migrateLegacyActivePlan(), null, 2));
        process.exit(0);
      } catch (error) {
        console.error((error as Error).message);
        process.exit(1);
      }
    });

  return state;
}
