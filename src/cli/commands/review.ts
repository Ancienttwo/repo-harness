import { Command } from 'commander';
import { readFileSync } from 'fs';
import { closeReview, reviewLocation, reviewStatus, runReviewRound } from '../../effects/review/generic-review';
import { recordCircuitAttempt } from '../hook/circuit-breaker';

export function buildReviewCommand(): Command {
  const command = new Command('review').description('Generic domain acceptance review by a persistent fleet deep-reasoner task-agent');
  for (const operation of ['round', 'status', 'close', 'cancel'] as const) {
    const child = command.command(operation).requiredOption('--contract <path>', 'Task contract')
      .option('--repo <path>', 'Owner repository worktree', process.cwd()).option('--json', 'Print JSON');
    if (operation === 'round') child.requiredOption('--reviewer-repo <path>', 'Dedicated linked reviewer checkout')
      .requiredOption('--herdr-endpoint <file>', 'JSON {endpoint:{session,configPath?,home?},parent_pane}')
      .option('--harness <kind>', 'Explicit claude or codex; no fallback for an explicit override')
      .option('--verification <path>', 'Prepared verification report', '.ai/harness/checks/latest.json')
      .option('--timeout-ms <ms>', 'Round deadline, at most 1800000 ms');
    child.action(async opts => {
      try {
        let result;
        if (operation === 'round') {
          const addressing = JSON.parse(readFileSync(opts.herdrEndpoint, 'utf8'));
          if (opts.harness && !['claude', 'codex'].includes(opts.harness)) throw new Error('review_harness_unsupported');
          result = await runReviewRound({ repoRoot: opts.repo, contract: opts.contract, verification: opts.verification,
            reviewerRepo: opts.reviewerRepo, endpoint: addressing.endpoint, parentPane: addressing.parent_pane,
            harness: opts.harness, timeoutMs: opts.timeoutMs === undefined ? undefined : Number(opts.timeoutMs),
            admitSession: () => {
              const location = reviewLocation(opts.repo, opts.contract);
              const decision = recordCircuitAttempt(location.root, { kind: 'semantic-review', guard: 'one-semantic-review-per-work-package',
                reason: 'persistent generic review admission', pathOrAction: 'review:session', progressToken: location.contract,
                fingerprint: location.contract, profile: 'standard', strongBoundary: true });
              if (!decision.allowed) throw new Error('review_session_budget_exhausted; do not start another reviewer');
            } });
          if (result.status === 'rejected') process.exitCode = 1;
        } else if (operation === 'status') result = reviewStatus(opts.repo, opts.contract);
        else result = await closeReview(opts.repo, opts.contract, operation === 'cancel');
        console.log(JSON.stringify(result, null, opts.json ? undefined : 2));
      } catch (error) {
        console.error(`review: ${error instanceof Error ? error.message : String(error)}`);
        process.exitCode = 1;
      }
    });
  }
  return command;
}
