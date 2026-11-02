import { approveDelegatedReviewAdmission } from '../../effects/admission/control-admission';
import { readReviewAdmissionSource } from '../../effects/admission/admission-source';
import { revokeActiveReviewAdmission } from '../../effects/admission/admission-store';
import { Command } from 'commander';
import { readFileSync } from 'fs';
import { closeReview, reviewLocation, reviewStatus, runReviewRound, type ReviewEffects } from '../../effects/review/generic-review';
import { osAccountHome } from '../../effects/runtime/os-account-home';
import { recordCircuitAttempt } from '../hook/circuit-breaker';
import { isReviewRuntimeId } from '../../core/review/review-runtimes';
import { publishReview, ReviewPublishError } from '../../effects/review/review-publish';

/** Both control operations accept only a closed JSON object from the trusted Bot. */
function readControlRequest(file: string, fields: readonly string[]): Record<string, any> {
  const request = JSON.parse(readFileSync(file, 'utf8'));
  if (!request || typeof request !== 'object' || Array.isArray(request)
    || JSON.stringify(Object.keys(request).sort()) !== JSON.stringify([...fields].sort())) {
    throw new Error('review_control_request_invalid');
  }
  return request;
}

/**
 * The optional PR selection for the coverage read. `--repository-id` is the
 * admission identity and is always required; the other three flags are the
 * optional selection and are all-or-none. Admission identity alone is not a
 * partial selection.
 */
export function pullRequestSelectionFromOptions(opts: Record<string, string | undefined>) {
  const given = [opts.repository, opts.pr, opts.base].filter((value) => value !== undefined).length;
  if (given === 0) return undefined;
  if (given !== 3) throw new Error('--repository, --pr and --base must be given together');
  return { repository: opts.repository!, provider_repository_id: opts.repositoryId!, pr_number: Number(opts.pr), expected_base_sha: opts.base! };
}

/** The composition root passes the one reviewer runner implementation. */
export function buildReviewCommand<Session, Endpoint>(runner: ReviewEffects<Session, Endpoint>): Command {
  const command = new Command('review').description('Generic domain acceptance review by a persistent fleet deep-reasoner task-agent');
  command.command('admit').description('Apply an already-authorized upstream Bot request (trusted integration only)')
    .requiredOption('--request <file>', 'JSON {admission, approval, expectedRevision}; approval requires upstream authorization_ref and bound scope')
    .option('--repo <path>', 'Execution repository', process.cwd())
    .action(opts => {
      try {
        const request = readControlRequest(opts.request, ['admission', 'approval', 'expectedRevision']);
        console.log(JSON.stringify(approveDelegatedReviewAdmission({ repoRoot: opts.repo,
          admission: request.admission, approval: request.approval, expectedRevision: request.expectedRevision })));
      } catch (error) {
        console.error(`review admit: ${error instanceof Error ? error.message : String(error)}`);
        process.exitCode = 1;
      }
    });
  command.command('revoke').description('Apply an upstream Bot revocation to the exact active grant (trusted integration only)')
    .requiredOption('--request <file>', 'JSON {repository_id, issue_id, campaign_id, expectedGrantSha256, expectedRevision}')
    .option('--repo <path>', 'Execution repository', process.cwd())
    .action(opts => {
      try {
        const request = readControlRequest(opts.request, ['repository_id', 'issue_id', 'campaign_id', 'expectedGrantSha256', 'expectedRevision']);
        console.log(JSON.stringify(revokeActiveReviewAdmission({ repoRoot: opts.repo, repository_id: request.repository_id,
          issue_id: request.issue_id, campaign_id: request.campaign_id,
          expectedGrantSha256: request.expectedGrantSha256, expectedRevision: request.expectedRevision })));
      } catch (error) {
        console.error(`review revoke: ${error instanceof Error ? error.message : String(error)}`);
        process.exitCode = 1;
      }
    });
  command.command('publish').description('Publish one gatekeeper receipt as an acceptance claim, one COMMENT PR review, and an acceptance record')
    .requiredOption('--pr <number>', 'Pull request number')
    .requiredOption('--receipt <path>', 'Review publish receipt JSON; the gatekeeper owns its content')
    .option('--repo <path>', 'Owner repository worktree', process.cwd()).option('--json', 'Print compact JSON')
    .action(opts => {
      try {
        const result = publishReview({ repoRoot: opts.repo, prNumber: Number(opts.pr), receiptPath: opts.receipt });
        console.log(JSON.stringify(result, null, opts.json ? undefined : 2));
      } catch (error) {
        if (error instanceof ReviewPublishError) {
          const failure = { ok: false, error: error.code, exit_code: error.exitCode,
            message: error.message, posted: error.posted,
            ...(error.code === 'review_publish_unknown' ? { inspect_required: true, confirmed_urls: error.posted } : {}) };
          console.log(JSON.stringify(failure, null, opts.json ? undefined : 2));
          process.exitCode = error.exitCode;
          return;
        }
        console.error(`review publish: ${error instanceof Error ? error.message : String(error)}`);
        process.exitCode = 1;
      }
    });
  for (const operation of ['round', 'status', 'close', 'cancel'] as const) {
    const child = command.command(operation).requiredOption('--repository-id <id>', 'Approved provider repository identity')
      .requiredOption('--issue-id <id>', 'Approved provider issue identity')
      .requiredOption('--campaign-id <id>', 'Stable review campaign')
      .requiredOption('--grant-sha256 <sha256>', 'Protected active approval')
      .requiredOption('--policy-sha256 <sha256>', 'Approved policy digest')
      .requiredOption('--actor <id>', 'Approved actor identity')
      .option('--repo <path>', 'Owner repository worktree', process.cwd()).option('--json', 'Print JSON');
    if (operation === 'round') child.requiredOption('--reviewer-repo <path>', 'Dedicated linked reviewer checkout')
      .requiredOption('--claim-ref <reference>', 'Upstream immutable GitHub claim reference; coordination provenance, not authorization')
      .requiredOption('--claim-revision <sha256>', 'Upstream claim content revision')
      .option('--herdr-endpoint <file>', 'JSON {endpoint:{session,configPath?,home?},parent_pane}; required for --launch herdr')
      .option('--launch <mode>', 'herdr, or app-terminal: the Claude app operator runs the printed host command', 'herdr')
      .option('--harness <kind>', 'Explicit claude, codex or pi; no fallback for an explicit override')
      .requiredOption('--verification <path>', 'Native verification report under .ai/harness/runs/')
      .option('--timeout-ms <ms>', 'Round deadline, at most 1800000 ms')
      .option('--repository <owner/name>', 'Explicit PR repository for the required-check coverage read')
      .option('--pr <number>', 'Explicit PR number for the coverage read')
      .option('--base <sha>', 'Explicit expected PR base for the coverage read');
    child.action(async opts => {
      try {
        const authority = readReviewAdmissionSource(opts.repo, {
          'repository-id': opts.repositoryId, 'issue-id': opts.issueId, 'campaign-id': opts.campaignId,
          'grant-sha256': opts.grantSha256, 'policy-sha256': opts.policySha256, actor: opts.actor,
        });
        let result;
        if (operation === 'round') {
          if (!['herdr', 'app-terminal'].includes(opts.launch)) throw new Error('review_launch_unsupported');
          if ((opts.launch === 'herdr') !== (opts.herdrEndpoint !== undefined)) throw new Error('review_launch_addressing_invalid; --herdr-endpoint is required for herdr and refused for app-terminal');
          const addressing = opts.herdrEndpoint ? JSON.parse(readFileSync(opts.herdrEndpoint, 'utf8')) : {};
          if (opts.harness && !isReviewRuntimeId(opts.harness)) throw new Error('review_harness_unsupported');
          const pullRequest = pullRequestSelectionFromOptions(opts);
          result = await runReviewRound({ repoRoot: opts.repo, authority, taskClaim: { reference: opts.claimRef, revision: opts.claimRevision }, verification: opts.verification,
            ...(pullRequest === undefined ? {} : { pullRequest }),
            reviewerRepo: opts.reviewerRepo, endpoint: addressing.endpoint, parentPane: addressing.parent_pane, launch: opts.launch,
            harness: opts.harness, timeoutMs: opts.timeoutMs === undefined ? undefined : Number(opts.timeoutMs),
            admitSession: () => {
              const location = reviewLocation(opts.repo, authority);
              const decision = recordCircuitAttempt(location.root, { kind: 'semantic-review', guard: 'one-semantic-review-per-work-package',
                reason: 'persistent generic review admission', pathOrAction: 'review:session', progressToken: location.campaign,
                fingerprint: location.campaign, strongBoundary: true });
              if (!decision.allowed) throw new Error('review_session_budget_exhausted; do not start another reviewer');
            } }, runner);
          if (result.status === 'rejected') process.exitCode = 1;
        } else if (operation === 'status') result = reviewStatus(opts.repo, authority, runner);
        else result = await closeReview(opts.repo, authority, operation === 'cancel', osAccountHome(), runner);
        console.log(JSON.stringify(result, null, opts.json ? undefined : 2));
      } catch (error) {
        console.error(`review: ${error instanceof Error ? error.message : String(error)}`);
        process.exitCode = 1;
      }
    });
  }
  return command;
}
