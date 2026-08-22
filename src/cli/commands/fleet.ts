import { Command } from 'commander';

import {
  MergeReadinessError,
  resolveFleetReadiness,
} from '../../effects/publication/merge-readiness';

function outputError(error: unknown): void {
  const code = error instanceof MergeReadinessError ? error.code : 'provider_unavailable';
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${JSON.stringify({ ok: false, error: code, message })}\n`);
  process.exitCode = 1;
}

export function buildFleetCommand(): Command {
  const fleet = new Command('fleet').description('Project read-only fleet workflow views');
  fleet
    .command('ready')
    .description('Aggregate current reviewing publications in canonical sprint row order')
    .requiredOption('--json', 'Output the FleetReadinessV1 document as JSON')
    .action(() => {
      try {
        const result = resolveFleetReadiness({
          repo_root: process.cwd(),
          gh_bin: process.env.REPO_HARNESS_GH_BIN,
          git_bin: process.env.REPO_HARNESS_GIT_BIN,
          merge_seal_path: process.env.REPO_HARNESS_PUBLICATION_SEAL_PATH,
          checks_path: process.env.REPO_HARNESS_PUBLICATION_CHECKS_PATH,
        });
        process.stdout.write(`${JSON.stringify(result)}\n`);
      } catch (error) {
        outputError(error);
      }
    });
  return fleet;
}
