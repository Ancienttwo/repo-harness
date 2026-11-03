import { Command } from 'commander';

interface ArchitectureDebtCommandOptions { json?: boolean; base?: string }

export function buildArchitectureDebtCommand(): Command {
  // A signal, not a gate: measured debt keeps exit 0. Only an operational failure exits 1.
  return new Command('architecture-debt')
    .description('Report ArchContext architecture debt at HEAD, and the debt that is new since a base ref')
    .option('--json', 'Output the debt report JSON')
    .option('--base <ref>', 'Compare with the debt of this commit, measured in a temporary checkout')
    .action(async (options: ArchitectureDebtCommandOptions) => {
      const { runArchitectureDebtCommand } = await import('./architecture-debt-report');
      runArchitectureDebtCommand(options);
    });
}
