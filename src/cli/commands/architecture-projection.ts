import { Command } from 'commander';

export interface ProjectionCommandOptions {
  json?: boolean;
  changedPath?: string[];
  requestId?: string;
  adoptionPlanId?: string;
  expectedWorktreeDigest?: string;
}

const actions = () => import('./architecture-projection-actions');

export function buildArchitectureProjectionCommand(): Command {
  const command = new Command('architecture-projection').description('Run the configured deterministic architecture projection provider');
  command.command('policy').requiredOption('--json', 'Output the global execution policy without invoking the provider').action(async () => (await actions()).policy());
  command.command('status').requiredOption('--json', 'Output readiness JSON').action(async () => (await actions()).status());
  for (const name of ['check', 'plan', 'apply'] as const) {
    command.command(name)
      .requiredOption('--json', 'Output ProjectionResultV2 JSON')
      .option('--changed-path <path...>', 'Changed repository-relative paths')
      .option('--request-id <id>', 'Stable request id')
      .option('--expected-worktree-digest <digest>', 'Refuse a worktree that differs from the reviewed plan')
      .action(async (options: ProjectionCommandOptions) => (await actions()).execute(name, options));
  }
  command.command('adopt')
    .requiredOption('--json', 'Output ProjectionResultV2 JSON')
    .requiredOption('--adoption-plan-id <id>', 'Approved ArchContext adoption plan id')
    .option('--expected-worktree-digest <digest>', 'Refuse a worktree that differs from the reviewed plan')
    .option('--changed-path <path...>', 'Changed repository-relative paths')
    .option('--request-id <id>', 'Stable request id')
    .action(async (options: ProjectionCommandOptions) => (await actions()).execute('adopt', options));
  // A signal, not a gate: findings keep exit 0. Only a failed run exits 1.
  command.command('anchors').requiredOption('--json', 'Output the read-only archctx docs anchors report').action(async () => (await actions()).anchors());
  command.command('render-check').requiredOption('--json', 'Compare generated output using archctx target decisions; ignore source stamps').action(async () => (await actions()).renderCheck());
  command.command('hand-edits').requiredOption('--json', 'Report archctx generated-region hand edits')
    .option('--base <ref>', 'Limit warnings to paths changed in this PR')
    .action(async (options: { base?: string }) => (await actions()).handEdits(options));
  command.command('publish').argument('<mode>', 'status, once or follow')
    .description('Run the archctx rolling writer for this repository: remote origin, base main, branch archctx/projection, publisher gh')
    .action(async (mode: string) => (await actions()).publish(mode));
  return command;
}
