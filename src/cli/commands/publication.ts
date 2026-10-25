import { Command } from 'commander';
import {
  MergeReadinessError,
  collectPullRequestMergeReadiness,
} from '../../effects/publication/merge-readiness';

/** Provider PR readiness is a read-only operator view. */
export function buildPublicationCommand(): Command {
  const publication = new Command('publication').description('Inspect publication readiness');
  publication.command('readiness')
    .description('Derive one read-only fenced merge-readiness verdict')
    .requiredOption('--repository <owner/name>', 'Canonical GitHub repository')
    .requiredOption('--repository-id <id>', 'Canonical GitHub REST repository id')
    .requiredOption('--pr <number>', 'Provider PR number')
    .requiredOption('--head <sha>', 'Exact expected PR head')
    .requiredOption('--base <sha>', 'Exact expected main base')
    .requiredOption('--json', 'Output the PullRequestReadinessV2 document')
    .action((options: { repository: string; repositoryId: string; pr: string; head: string; base: string }) => {
      try {
        const verdict = collectPullRequestMergeReadiness({ repo_root: process.cwd(), repository: options.repository,
          provider_repository_id: options.repositoryId, pr_number: Number(options.pr), expected_head_sha: options.head,
          expected_base_sha: options.base, gh_bin: process.env.REPO_HARNESS_GH_BIN });
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
