import { Command } from 'commander';
import {
  MergeReadinessError,
  collectPullRequestMergeReadiness,
} from '../../effects/publication/merge-readiness';
import { executePublicationMerge } from '../../effects/publication/merge-executor';

interface PullRequestSelectionOptions {
  readonly repository: string;
  readonly repositoryId: string;
  readonly pr: string;
  readonly head: string;
  readonly base: string;
}

function withSelection(command: Command, json: string): Command {
  return command
    .requiredOption('--repository <owner/name>', 'Canonical GitHub repository')
    .requiredOption('--repository-id <id>', 'Canonical GitHub REST repository id')
    .requiredOption('--pr <number>', 'Provider PR number')
    .requiredOption('--head <sha>', 'Exact expected PR head')
    .requiredOption('--base <sha>', 'Exact expected main base')
    .requiredOption('--json', json);
}

function selection(options: PullRequestSelectionOptions) {
  return { repo_root: process.cwd(), repository: options.repository, provider_repository_id: options.repositoryId,
    pr_number: Number(options.pr), expected_head_sha: options.head, expected_base_sha: options.base,
    gh_bin: process.env.REPO_HARNESS_GH_BIN };
}

/** Provider PR readiness is a read-only operator view; merge is the single policy-gated executor. */
export function buildPublicationCommand(): Command {
  const publication = new Command('publication').description('Inspect publication readiness and run the policy-gated merge executor');
  withSelection(publication.command('readiness')
    .description('Derive one read-only fenced merge-readiness verdict'), 'Output the PullRequestReadinessV2 document')
    .action((options: PullRequestSelectionOptions) => {
      try {
        const verdict = collectPullRequestMergeReadiness(selection(options));
        process.stdout.write(`${JSON.stringify(verdict)}\n`);
      } catch (error) {
        process.stderr.write(`${JSON.stringify({ ok: false,
          error: error instanceof MergeReadinessError ? error.code : 'publication_incomplete',
          message: error instanceof Error ? error.message : String(error),
        })}\n`);
        process.exitCode = 1;
      }
    });
  withSelection(publication.command('merge')
    .description('Squash-merge one same-repository PR when the base policy enables acceptance merge and every gate passes')
    .option('--batch', 'Merge an integration/<parent>-batch-<n> PR with a two-parent merge commit instead of a squash'),
  'Output the publication merge result document')
    .action((options: PullRequestSelectionOptions & { readonly batch?: true }) => {
      const result = executePublicationMerge({ ...selection(options), batch: options.batch === true });
      process.stdout.write(`${JSON.stringify(result.document)}\n`);
      process.exitCode = result.exit_code;
    });
  return publication;
}
