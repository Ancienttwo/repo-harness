import { Command } from 'commander';
import {
  MergeReadinessError,
  resolvePublicationReadiness,
} from '../../effects/publication/merge-readiness';

/** Historical publication readiness is a read-only operator view. */
export function buildPublicationCommand(): Command {
  const publication = new Command('publication').description('Inspect publication readiness');
  publication.command('readiness')
    .description('Derive one read-only fenced merge-readiness verdict')
    .option('--publication-id <id>', 'Historical publication id')
    .option('--pr <number>', 'Provider PR number')
    .requiredOption('--json', 'Output the MergeReadinessV1 document as JSON')
    .action((options: { publicationId?: string; pr?: string }) => {
      try {
        const prNumber = options.pr === undefined ? undefined : Number(options.pr);
        if (prNumber !== undefined && (!Number.isInteger(prNumber) || prNumber < 1)) {
          throw new Error('--pr must be a positive integer');
        }
        const verdict = resolvePublicationReadiness({
          repo_root: process.cwd(), publication_id: options.publicationId, pr_number: prNumber,
          gh_bin: process.env.REPO_HARNESS_GH_BIN, git_bin: process.env.REPO_HARNESS_GIT_BIN,
        });
        process.stdout.write(`${JSON.stringify(verdict)}\n`);
      } catch (error) {
        process.stderr.write(`${JSON.stringify({ ok: false,
          error: error instanceof MergeReadinessError ? error.code : 'publication_incomplete',
          message: error instanceof Error ? error.message : String(error),
        })}\n`);
        process.exitCode = 1;
      }
    });
  return publication;
}
