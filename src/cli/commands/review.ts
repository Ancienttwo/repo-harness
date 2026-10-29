import { approveDelegatedReviewAdmission } from '../../effects/admission/control-admission';
import { readReviewAdmissionSource } from '../../effects/admission/admission-source';
import { revokeActiveReviewAdmission } from '../../effects/admission/admission-store';
import { Command } from 'commander';
import { readFileSync } from 'fs';
import { closeReview, reviewLocation, reviewStatus, runReviewRound } from '../../effects/review/generic-review';
import { recordCircuitAttempt } from '../hook/circuit-breaker';
import { isReviewRuntimeId } from '../../core/review/review-runtimes';

/** Both control operations accept only a closed JSON object from the trusted Bot. */
function readControlRequest(file: string, fields: readonly string[]): Record<string, any> {
  const request = JSON.parse(readFileSync(file, 'utf8'));
  if (!request || typeof request !== 'object' || Array.isArray(request)
    || JSON.stringify(Object.keys(request).sort()) !== JSON.stringify([...fields].sort())) {
    throw new Error('review_control_request_invalid');
  }
  return request;
}

export function buildReviewCommand(): Command {
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
      .option('--engineer-id <id>', 'Explicit canonical engineer profile metadata; requires its contract revision')
      .option('--engineer-contract-revision <sha256>', 'Exact selected engineer profile contract revision')
      .option('--herdr-endpoint <file>', 'JSON {endpoint:{session,configPath?,home?},parent_pane}; required for --launch herdr')
      .option('--launch <mode>', 'herdr, or app-terminal: the Claude app operator runs the printed host command', 'herdr')
      .option('--harness <kind>', 'Explicit claude, codex or pi; no fallback for an explicit override')
      .requiredOption('--verification <path>', 'Native verification report under .ai/harness/runs/')
      .option('--timeout-ms <ms>', 'Round deadline, at most 1800000 ms');
    child.action(async opts => {
      try {
        const authority = readReviewAdmissionSource(opts.repo, {
          'repository-id': opts.repositoryId, 'issue-id': opts.issueId, 'campaign-id': opts.campaignId,
          'grant-sha256': opts.grantSha256, 'policy-sha256': opts.policySha256, actor: opts.actor,
        });
        let result;
        if (operation === 'round') {
          if ((opts.engineerId === undefined) !== (opts.engineerContractRevision === undefined)) throw new Error('review_engineer_profile_pair_required');
          if (!['herdr', 'app-terminal'].includes(opts.launch)) throw new Error('review_launch_unsupported');
          if ((opts.launch === 'herdr') !== (opts.herdrEndpoint !== undefined)) throw new Error('review_launch_addressing_invalid; --herdr-endpoint is required for herdr and refused for app-terminal');
          const addressing = opts.herdrEndpoint ? JSON.parse(readFileSync(opts.herdrEndpoint, 'utf8')) : {};
          if (opts.harness && !isReviewRuntimeId(opts.harness)) throw new Error('review_harness_unsupported');
          result = await runReviewRound({ repoRoot: opts.repo, authority, taskClaim: { reference: opts.claimRef, revision: opts.claimRevision }, verification: opts.verification,
            engineerProfile: opts.engineerId === undefined ? undefined : { engineer_id: opts.engineerId, engineer_contract_revision: opts.engineerContractRevision },
            reviewerRepo: opts.reviewerRepo, endpoint: addressing.endpoint, parentPane: addressing.parent_pane, launch: opts.launch,
            harness: opts.harness, timeoutMs: opts.timeoutMs === undefined ? undefined : Number(opts.timeoutMs),
            admitSession: () => {
              const location = reviewLocation(opts.repo, authority);
              const decision = recordCircuitAttempt(location.root, { kind: 'semantic-review', guard: 'one-semantic-review-per-work-package',
                reason: 'persistent generic review admission', pathOrAction: 'review:session', progressToken: location.campaign,
                fingerprint: location.campaign, strongBoundary: true });
              if (!decision.allowed) throw new Error('review_session_budget_exhausted; do not start another reviewer');
            } });
          if (result.status === 'rejected') process.exitCode = 1;
        } else if (operation === 'status') result = reviewStatus(opts.repo, authority);
        else result = await closeReview(opts.repo, authority, operation === 'cancel');
        console.log(JSON.stringify(result, null, opts.json ? undefined : 2));
      } catch (error) {
        console.error(`review: ${error instanceof Error ? error.message : String(error)}`);
        process.exitCode = 1;
      }
    });
  }
  return command;
}
