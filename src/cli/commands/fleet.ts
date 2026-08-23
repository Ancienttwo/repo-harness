import { Command } from 'commander';
import { randomUUID } from 'crypto';
import { lstatSync, realpathSync, readdirSync } from 'fs';
import { join } from 'path';

import {
  MergeReadinessError,
  resolveFleetReadiness,
} from '../../effects/publication/merge-readiness';
import {
  acquireFleetTask,
  collectFleetOffers,
  FleetOffersError,
} from '../../effects/fleet/acquire';
import {
  FeedbackError,
  intakeGitHubFeedback,
  projectPendingFeedbackOffer,
  recordCompletedFeedbackRepair,
  reopenFeedbackRepair,
  showGitHubFeedback,
  takeoverFeedbackRepair,
  transitionFeedbackDelivery,
} from '../../effects/publication/feedback';
import {
  FeedbackStoreError,
  readFeedbackDeliveryReceipt,
  readRepairDispatchProof,
} from '../../effects/publication/feedback-store';
import { publicationReceiptDigest } from '../../core/publication/publication-receipt';
import { readPublicationReceiptCache } from '../../effects/publication/publication-receipt';
import { coordinationRoot, readLease } from '../../effects/state/coordination-lease-store';

function outputError(error: unknown): void {
  const code = error instanceof MergeReadinessError
    || error instanceof FleetOffersError
    || error instanceof FeedbackError
    || error instanceof FeedbackStoreError
    ? error.code
    : 'provider_unavailable';
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${JSON.stringify({ ok: false, error: code, message })}\n`);
  process.exitCode = 1;
}

function outputFeedbackValidation(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${JSON.stringify({ ok: false, error: 'invalid_argument', message })}\n`);
  process.exitCode = 2;
}

function requireJson(json: boolean | undefined): void {
  if (json !== true) throw new Error('--json is required');
}

function requiredStringOption(value: string | undefined, name: string): string {
  const result = optionalStringOption(value, name);
  if (result === undefined) throw new Error(`--${name} is required`);
  return result;
}

function feedbackEnvironment() {
  return {
    repo_root: process.cwd(),
    gh_bin: process.env.REPO_HARNESS_GH_BIN,
    git_bin: process.env.REPO_HARNESS_GIT_BIN,
    merge_seal_path: process.env.REPO_HARNESS_PUBLICATION_SEAL_PATH,
    checks_path: process.env.REPO_HARNESS_PUBLICATION_CHECKS_PATH,
  } as const;
}

function optionalStringOption(value: string | undefined, name: string): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new Error(`--${name} must be a non-empty string`);
  return trimmed;
}

function requiredIntegerOption(value: string | undefined, name: string, minimum = 1): number {
  const result = integerOption(value, name, minimum);
  if (result === undefined) throw new Error(`--${name} is required`);
  return result;
}

interface FeedbackRepairFence {
  readonly publication_id: string;
  readonly feedback_revision: string;
  readonly task_id: string;
  readonly claim_id: string;
  readonly generation: number;
  readonly head_sha: string;
}

interface FeedbackRepairFenceOptions {
  readonly json?: boolean;
  readonly publicationId?: string;
  readonly feedbackRevision?: string;
  readonly taskId?: string;
  readonly claimId?: string;
  readonly generation?: string;
  readonly headSha?: string;
}

function parseFeedbackRepairFence(options: FeedbackRepairFenceOptions): FeedbackRepairFence {
  requireJson(options.json);
  return {
    publication_id: requiredStringOption(options.publicationId, 'publication-id'),
    feedback_revision: requiredStringOption(options.feedbackRevision, 'feedback-revision'),
    task_id: requiredStringOption(options.taskId, 'task-id'),
    claim_id: requiredStringOption(options.claimId, 'claim-id'),
    generation: requiredIntegerOption(options.generation, 'generation'),
    head_sha: requiredStringOption(options.headSha, 'head-sha'),
  };
}

function projectFeedbackRepairOffer(fence: FeedbackRepairFence) {
  const projected = projectPendingFeedbackOffer({
    repo_root: process.cwd(),
    publication_id: fence.publication_id,
    git_bin: process.env.REPO_HARNESS_GIT_BIN,
  });
  if (projected.state === 'no_progress') {
    throw new FeedbackError('no_progress', 'feedback repair is halted for user attention');
  }
  if (projected.state === 'none') {
    throw new FeedbackError('feedback_incomplete', 'no pending provider feedback repair offer exists');
  }
  const offer = projected.offer;
  if (
    offer.publication_id !== fence.publication_id
    || offer.feedback_revision !== fence.feedback_revision
    || offer.task_id !== fence.task_id
    || offer.expected_claim_id !== fence.claim_id
    || offer.expected_generation !== fence.generation
    || offer.expected_head_sha !== fence.head_sha
  ) {
    throw new FeedbackError('repair_offer_stale', 'feedback repair fences do not match the current projected offer');
  }
  return offer;
}

function resolveCurrentFeedbackPublication(): string {
  const repoRoot = process.cwd();
  const leasesRoot = join(coordinationRoot(repoRoot), 'leases');
  let leaseEntries: string[];
  try {
    const stat = lstatSync(leasesRoot);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new FeedbackError('feedback_unreadable', 'coordination lease root is not a real directory');
    }
    leaseEntries = readdirSync(leasesRoot);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return failCurrentFeedbackPublication('none');
    if (error instanceof FeedbackError) throw error;
    throw new FeedbackError('feedback_unreadable', 'coordination lease root is unreadable', error);
  }

  const candidates: string[] = [];
  for (const taskId of leaseEntries.sort()) {
    if (!/^[0-9a-f]{64}$/u.test(taskId)) {
      throw new FeedbackError('feedback_unreadable', `coordination lease entry is invalid: ${taskId}`);
    }
    const lease = readLease(repoRoot, taskId);
    if (lease.classification === 'unknown') {
      throw new FeedbackError('feedback_unreadable', `coordination lease ${taskId} is unreadable`);
    }
    const record = lease.record;
    if (record === null || record.state !== 'reviewing' || !('current_publication' in record) || record.current_publication === null) {
      continue;
    }
    const pointer = record.current_publication;
    let receipt;
    try {
      receipt = readPublicationReceiptCache(repoRoot, pointer.publication_id, process.env.REPO_HARNESS_GIT_BIN);
    } catch (error) {
      throw new FeedbackError('publication_claim_mismatch', `current publication receipt is unreadable for task ${taskId}`, error);
    }
    if (receipt === null) {
      throw new FeedbackError('publication_not_found', `current publication receipt is unavailable for task ${taskId}`);
    }
    if (
      receipt.task_id !== record.task_id
      || receipt.task_revision !== record.task_revision
      || receipt.claim_id !== record.claim_id
      || receipt.generation !== record.generation
      || pointer.publication_id !== receipt.publication_id
      || pointer.receipt_sha256 !== publicationReceiptDigest(receipt)
      || pointer.head_sha !== receipt.head_sha
    ) {
      throw new FeedbackError('publication_claim_mismatch', `current publication pointer is inconsistent for task ${taskId}`);
    }
    candidates.push(pointer.publication_id);
  }

  if (candidates.length === 1) return candidates[0];
  return failCurrentFeedbackPublication(candidates.length === 0 ? 'none' : 'multiple', candidates);
}

function failCurrentFeedbackPublication(
  state: 'none' | 'multiple',
  candidates: readonly string[] = [],
): never {
  if (state === 'none') {
    throw new FeedbackError('publication_not_found', 'no unique current reviewing publication is available');
  }
  throw new FeedbackError(
    'publication_claim_mismatch',
    `current reviewing publication is ambiguous: ${candidates.join(', ')}`,
  );
}

function outputRepairDispatchResult(result: ReturnType<typeof reopenFeedbackRepair>): void {
  const repairId = result.envelope.repair_id;
  const proof = readRepairDispatchProof(
    process.cwd(),
    result.envelope.publication_id,
    repairId,
    process.env.REPO_HARNESS_GIT_BIN,
  );
  if (proof === null) throw new FeedbackError('repair_not_dispatched', 'repair dispatch proof is unavailable after lifecycle dispatch');
  process.stdout.write(`${JSON.stringify({ ok: true, ...result, repair_id: repairId, proof })}\n`);
}

function integerOption(
  value: string | undefined,
  name: string,
  minimum: number,
  maximum: number | undefined = undefined,
): number | undefined {
  if (value === undefined) return undefined;
  if (!/^\d+$/.test(value.trim())) {
    throw new Error(`--${name} must be an integer`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || (maximum !== undefined && parsed > maximum)) {
    const bound = maximum === undefined ? `at least ${minimum}` : `between ${minimum} and ${maximum}`;
    throw new Error(`--${name} must be an integer ${bound}`);
  }
  return parsed;
}

function outputAcquireValidation(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${JSON.stringify({ ok: false, error: 'invalid_argument', message })}\n`);
  process.exitCode = 2;
}

function outputAcquireResult(result: ReturnType<typeof acquireFleetTask>): void {
  process.stdout.write(`${JSON.stringify(result)}\n`);
  // Losing the bounded task election is an expected empty result. All other
  // typed failures remain non-zero so shell callers can distinguish a race
  // from stale authorization or partial acquisition.
  process.exitCode = result.ok || result.error === 'no_eligible_task' ? 0 : 1;
}

export function buildFleetCommand(): Command {
  const fleet = new Command('fleet').description('Project fleet workflow views and task acquisition');
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

  const feedback = fleet
    .command('feedback')
    .description('Observe and acknowledge immutable provider feedback for a publication');

  feedback
    .command('intake')
    .description('Observe GitHub checks and review threads and persist immutable feedback events')
    .option('--json', 'Output JSON')
    .option('--publication-id <publicationId>', 'Publication identity to observe')
    .action((options: { readonly json?: boolean; readonly publicationId?: string }) => {
      let publicationId: string | undefined;
      try {
        requireJson(options.json);
      } catch (error) {
        outputFeedbackValidation(error);
        return;
      }
      try {
        publicationId = options.publicationId === undefined
          ? resolveCurrentFeedbackPublication()
          : requiredStringOption(options.publicationId, 'publication-id');
        const result = intakeGitHubFeedback({
          ...feedbackEnvironment(),
          publication_id: publicationId,
        });
        process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
      } catch (error) {
        outputError(error);
      }
    });

  feedback
    .command('offers')
    .description('Project the pending provider feedback repair offer')
    .option('--json', 'Output JSON')
    .option('--publication-id <publicationId>', 'Publication identity to inspect')
    .action((options: { readonly json?: boolean; readonly publicationId?: string }) => {
      let publicationId: string;
      try {
        requireJson(options.json);
        publicationId = requiredStringOption(options.publicationId, 'publication-id');
      } catch (error) {
        outputFeedbackValidation(error);
        return;
      }
      try {
        const result = projectPendingFeedbackOffer({
          repo_root: process.cwd(),
          publication_id: publicationId,
          git_bin: process.env.REPO_HARNESS_GIT_BIN,
        });
        process.stdout.write(`${JSON.stringify(result)}\n`);
      } catch (error) {
        outputError(error);
      }
    });

  feedback
    .command('ack')
    .description('Acknowledge one durable provider feedback delivery receipt')
    .option('--json', 'Output JSON')
    .option('--publication-id <publicationId>', 'Publication identity to acknowledge')
    .option('--provider-event-id <providerEventId>', 'Opaque provider event identity')
    .action((options: {
      readonly json?: boolean;
      readonly publicationId?: string;
      readonly providerEventId?: string;
    }) => {
      let publicationId: string;
      let providerEventId: string;
      try {
        requireJson(options.json);
        publicationId = requiredStringOption(options.publicationId, 'publication-id');
        providerEventId = requiredStringOption(options.providerEventId, 'provider-event-id');
      } catch (error) {
        outputFeedbackValidation(error);
        return;
      }
      try {
        const gitBin = process.env.REPO_HARNESS_GIT_BIN;
        const current = readFeedbackDeliveryReceipt(process.cwd(), publicationId, providerEventId, gitBin);
        const receipt = transitionFeedbackDelivery({
          repo_root: process.cwd(),
          publication_id: publicationId,
          provider_event_id: providerEventId,
          git_bin: gitBin,
          transition: {
            delivery_state: 'acknowledged',
            ...(current === null || current.delivery_state === 'pending' ? { delivery_channel: 'manual' as const } : {}),
            transitioned_at: new Date().toISOString(),
          },
        });
        process.stdout.write(`${JSON.stringify({ ok: true, receipt })}\n`);
      } catch (error) {
        outputError(error);
      }
    });

  feedback
    .command('show')
    .description('Display one provider feedback body as untrusted text')
    .option('--json', 'Output JSON')
    .option('--publication-id <publicationId>', 'Publication identity to inspect')
    .option('--provider-event-id <providerEventId>', 'Opaque provider event identity')
    .action((options: {
      readonly json?: boolean;
      readonly publicationId?: string;
      readonly providerEventId?: string;
    }) => {
      let publicationId: string;
      let providerEventId: string;
      try {
        requireJson(options.json);
        publicationId = requiredStringOption(options.publicationId, 'publication-id');
        providerEventId = requiredStringOption(options.providerEventId, 'provider-event-id');
      } catch (error) {
        outputFeedbackValidation(error);
        return;
      }
      try {
        const result = showGitHubFeedback({
          ...feedbackEnvironment(),
          publication_id: publicationId,
          provider_event_id: providerEventId,
        });
        process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
      } catch (error) {
        outputError(error);
      }
    });

  const repair = feedback
    .command('repair')
    .description('Re-enter an existing publication through the feedback repair lifecycle');

  repair
    .command('reopen')
    .description('Reopen the current publication for its existing owner')
    .option('--json', 'Output JSON')
    .option('--publication-id <publicationId>', 'Publication identity fence')
    .option('--feedback-revision <revision>', 'Feedback revision fence')
    .option('--task-id <taskId>', 'Task identity fence')
    .option('--claim-id <claimId>', 'Claim identity fence')
    .option('--generation <generation>', 'Lease generation fence')
    .option('--head-sha <sha>', 'Publication head fence')
    .action((options: FeedbackRepairFenceOptions) => {
      let fence: FeedbackRepairFence;
      try {
        fence = parseFeedbackRepairFence(options);
      } catch (error) {
        outputFeedbackValidation(error);
        return;
      }
      try {
        const offer = projectFeedbackRepairOffer(fence);
        const result = reopenFeedbackRepair({
          ...feedbackEnvironment(),
          offer,
          delivered_at: new Date().toISOString(),
        });
        outputRepairDispatchResult(result);
      } catch (error) {
        outputError(error);
      }
    });

  repair
    .command('takeover')
    .description('Take over the current publication through reserving')
    .option('--json', 'Output JSON')
    .option('--publication-id <publicationId>', 'Publication identity fence')
    .option('--feedback-revision <revision>', 'Feedback revision fence')
    .option('--task-id <taskId>', 'Task identity fence')
    .option('--claim-id <claimId>', 'Claim identity fence')
    .option('--generation <generation>', 'Lease generation fence')
    .option('--head-sha <sha>', 'Publication head fence')
    .option('--reason <reason>', 'Human-readable takeover reason')
    .option('--session-id <sessionId>', 'New owner session identity')
    .action((options: FeedbackRepairFenceOptions & {
      readonly reason?: string;
      readonly sessionId?: string;
    }) => {
      let fence: FeedbackRepairFence;
      let reason: string;
      let sessionId: string;
      try {
        fence = parseFeedbackRepairFence(options);
        reason = requiredStringOption(options.reason, 'reason');
        sessionId = requiredStringOption(options.sessionId, 'session-id');
      } catch (error) {
        outputFeedbackValidation(error);
        return;
      }
      try {
        const offer = projectFeedbackRepairOffer(fence);
        const result = takeoverFeedbackRepair({
          ...feedbackEnvironment(),
          offer,
          reason,
          session_id: sessionId,
          new_claim_id: randomUUID(),
          source_worktree: realpathSync(process.cwd()),
          delivered_at: new Date().toISOString(),
        });
        outputRepairDispatchResult(result);
      } catch (error) {
        outputError(error);
      }
    });

  repair
    .command('complete')
    .description('Record one shipped feedback repair completion by durable repair locator')
    .option('--json', 'Output JSON')
    .option('--publication-id <publicationId>', 'Source publication identity locator')
    .option('--repair-id <repairId>', 'Durable dispatched repair proof locator')
    .option('--recorded-at <timestamp>', 'Completion timestamp (defaults to now)')
    .action((options: {
      readonly json?: boolean;
      readonly publicationId?: string;
      readonly repairId?: string;
      readonly recordedAt?: string;
    }) => {
      let publicationId: string;
      let repairId: string;
      let recordedAt: string;
      try {
        requireJson(options.json);
        publicationId = requiredStringOption(options.publicationId, 'publication-id');
        repairId = requiredStringOption(options.repairId, 'repair-id');
        recordedAt = options.recordedAt === undefined
          ? new Date().toISOString()
          : requiredStringOption(options.recordedAt, 'recorded-at');
      } catch (error) {
        outputFeedbackValidation(error);
        return;
      }
      try {
        const receipt = recordCompletedFeedbackRepair({
          ...feedbackEnvironment(),
          publication_id: publicationId,
          repair_id: repairId,
          recorded_at: recordedAt,
        });
        process.stdout.write(`${JSON.stringify({ ok: true, receipt })}\n`);
      } catch (error) {
        outputError(error);
      }
    });

  fleet
    .command('offers')
    .description('Aggregate deterministic task offers across registered repositories')
    .requiredOption('--json', 'Output the FleetOffersV1 document as JSON')
    .option('--repo-id <repoId>', 'Restrict the read to one registered repository id')
    .action((options: { readonly repoId?: string }) => {
      try {
        const result = collectFleetOffers({
          env: process.env,
          repo_id: options.repoId,
        });
        process.stdout.write(`${JSON.stringify(result)}\n`);
      } catch (error) {
        outputError(error);
      }
    });
  fleet
    .command('acquire')
    .description('Acquire one execution-ready task and return its WorkEnvelopeV1')
    .requiredOption('--json', 'Output the FleetAcquireResult as JSON')
    .requiredOption('--authorization-revision <revision>', 'Authorization revision observed from fleet offers')
    .option('--repo-id <repoId>', 'Restrict acquisition to one registered repository id')
    .option('--task-id <taskId>', 'Assert one coordination task id from the offer document')
    .option('--offer-revision <revision>', 'Assert the exact offer revision previously observed')
    .option('--session-id <sessionId>', 'Session identifier recorded on the claim')
    .option('--max-attempts <attempts>', 'Bounded claim-race retries (1-16)', '3')
    .action((options: {
      readonly authorizationRevision: string;
      readonly repoId?: string;
      readonly taskId?: string;
      readonly offerRevision?: string;
      readonly sessionId?: string;
      readonly maxAttempts?: string;
    }) => {
      let authorizationRevision: number | undefined;
      let maxAttempts: number | undefined;
      let repoId: string | undefined;
      let taskId: string | undefined;
      let offerRevision: string | undefined;
      let sessionId: string | undefined;
      try {
        authorizationRevision = integerOption(options.authorizationRevision, 'authorization-revision', 0);
        maxAttempts = integerOption(options.maxAttempts, 'max-attempts', 1, 16);
        repoId = optionalStringOption(options.repoId, 'repo-id');
        taskId = optionalStringOption(options.taskId, 'task-id');
        offerRevision = optionalStringOption(options.offerRevision, 'offer-revision');
        sessionId = optionalStringOption(options.sessionId, 'session-id');
      } catch (error) {
        outputAcquireValidation(error);
        return;
      }

      try {
        outputAcquireResult(acquireFleetTask({
          env: process.env,
          repo_id: repoId,
          session_id: sessionId,
          max_attempts: maxAttempts,
          assertion: {
            ...(repoId === undefined ? {} : { repo_id: repoId }),
            ...(taskId === undefined ? {} : { task_id: taskId }),
            ...(offerRevision === undefined ? {} : { offer_revision: offerRevision }),
            authorization_revision: authorizationRevision!,
          },
        }));
      } catch (error) {
        outputError(error);
      }
    });
  return fleet;
}
