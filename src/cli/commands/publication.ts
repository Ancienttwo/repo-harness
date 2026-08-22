import { Command } from 'commander';
import { spawnSync } from 'child_process';
import { randomUUID } from 'crypto';
import { realpathSync } from 'fs';
import { join } from 'path';

import {
  canonicalPublicationJournalEvidenceBytes,
  canonicalPublicationPrepareEnvelopeBytes,
  validatePublicationJournalEvidence,
  validatePublicationPrepareEnvelope,
  type PublicationCreateIntentV1,
} from '../../core/publication/publication-receipt';
import {
  PublicationReceiptError,
  canonicalPublicationJournalEvidence,
  ensurePublicationReceipt,
  preparePublicationReceipt,
  rebuildPublicationReceipt,
} from '../../effects/publication/publication-receipt';
import {
  abandonPublication,
  enterPublicationReviewing,
  inspectLegacyPublication,
  migrateLegacyPublication,
  reopenPublication,
  reconcilePublication,
  takeoverPublication,
} from '../../effects/publication/publication-lifecycle';
import { PublicationLifecycleError } from '../../core/publication/publication-lifecycle';
import {
  MergeReadinessError,
  resolvePublicationReadiness,
} from '../../effects/publication/merge-readiness';

type EnsureOptions = {
  taskId: string;
  claimId: string;
  branch: string;
  target: string;
  createIntent?: string;
  createIntentJournal?: string;
};

type PrepareOptions = Omit<EnsureOptions, 'createIntent' | 'createIntentJournal'>;

type RebuildOptions = {
  pr: string;
};

type ValidateEnvelopeOptions = {
  kind: 'prepare' | 'evidence';
  json: string;
};

type MarkReviewingOptions = {
  taskId: string;
  claimId: string;
  shipTransactionKey: string;
  shipJournal: string;
};

type ReopenOptions = {
  taskId: string;
  claimId: string;
  expectedGeneration: string;
  publicationId: string;
  expectedHeadSha: string;
};
type TakeoverOptions = {
  taskId: string;
  expectedClaimId: string;
  expectedGeneration: string;
  publicationId: string;
  expectedHeadSha: string;
  reason: string;
  sessionId: string;
};
type AbandonOptions = {
  taskId: string;
  expectedClaimId: string;
  expectedGeneration: string;
  publicationId: string;
  expectedHeadSha: string;
  reason: string;
};
type LegacyOptions = {
  taskId: string;
  expectedClaimId: string;
  shipTransactionKey: string;
  shipJournal: string;
  confirmLegacyMigration?: boolean;
};
type ReconcileOptions = {
  taskId: string;
  expectedClaimId: string;
  expectedGeneration: string;
  publicationId: string;
  expectedHeadSha: string;
  remote: string;
};
type RecoveryOptions = { key?: string; confirmAbort?: boolean };
type ReadinessOptions = { publicationId?: string; pr?: string; json: boolean };

function parseCreateIntent(raw: string | undefined): PublicationCreateIntentV1 | undefined {
  if (raw === undefined) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    throw new PublicationReceiptError('publication_incomplete', 'publication create intent is invalid JSON', error);
  }
  try {
    const envelope = validatePublicationPrepareEnvelope(value);
    if (envelope.action !== 'create' || envelope.create_intent === null) {
      throw new Error('publication create intent must authorize creation');
    }
    return envelope.create_intent;
  } catch (error) {
    throw new PublicationReceiptError('publication_incomplete', 'publication create intent is invalid', error);
  }
}

function outputError(error: unknown): void {
  if (error instanceof MergeReadinessError) {
    process.stderr.write(`${JSON.stringify({ ok: false, error: error.code, message: error.message })}\n`);
    process.exitCode = 1;
    return;
  }
  if (error instanceof PublicationReceiptError) {
    process.stderr.write(`${JSON.stringify({ ok: false, error: error.code, message: error.message })}\n`);
    process.exitCode = 1;
    return;
  }
  if (error instanceof PublicationLifecycleError) {
    process.stderr.write(`${JSON.stringify({ ok: false, error: error.code, message: error.message, ...(error.details === undefined ? {} : { details: error.details }) })}\n`);
    process.exitCode = 1;
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${JSON.stringify({ ok: false, error: 'publication_incomplete', message })}\n`);
  process.exitCode = 1;
}

function runShipRecovery(action: 'inspect' | 'abort' | 'reconcile', options: RecoveryOptions): void {
  if (action === 'abort' && options.confirmAbort !== true) {
    throw new PublicationLifecycleError('recovery_confirmation_required', 'publication recover abort requires --confirm-abort');
  }
  if (action !== 'inspect' && !options.key) {
    throw new PublicationLifecycleError('publication_incomplete', `publication recover ${action} requires --key`);
  }
  const args = [join(process.cwd(), 'scripts/ship-worktrees.sh'), '--recover', action];
  if (options.key) args.push('--key', options.key);
  const result = spawnSync('/bin/bash', args, { cwd: process.cwd(), encoding: 'utf-8' });
  if (result.error || result.status !== 0) {
    throw new PublicationLifecycleError(
      'publication_incomplete',
      (result.stderr || result.error?.message || `ship recovery exited ${result.status ?? 'without status'}`).trim(),
      result.error,
    );
  }
  process.stdout.write(`${JSON.stringify({ ok: true, action, message: result.stdout.trim() })}\n`);
}

function numberOption(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new PublicationLifecycleError('publication_incomplete', `${flag} must be a positive integer`);
  }
  return parsed;
}

function lifecycleEnvironment() {
  return {
    repo_root: process.cwd(),
    gh_bin: process.env.REPO_HARNESS_GH_BIN,
    git_bin: process.env.REPO_HARNESS_GIT_BIN,
    merge_seal_path: process.env.REPO_HARNESS_PUBLICATION_SEAL_PATH,
    checks_path: process.env.REPO_HARNESS_PUBLICATION_CHECKS_PATH,
  } as const;
}

export function buildPublicationCommand(): Command {
  const publication = new Command('publication')
    .description('Manage immutable publication receipts');
  const receipt = publication
    .command('receipt')
    .description('Create or rebuild the immutable PR publication receipt');

  receipt
    .command('ensure')
    .description('Persist and mark the PR receipt after provider and lease revalidation')
    .requiredOption('--task-id <id>', 'Task id carried by the local claim token')
    .requiredOption('--claim-id <id>', 'Claim id carried by the local claim token')
    .requiredOption('--branch <branch>', 'Published branch')
    .requiredOption('--target <branch>', 'PR target branch')
    .option('--create-intent <json>', 'Canonical pre-create journal envelope')
    .option('--create-intent-journal <path>', 'Durable closeout status.json that carries the create intent')
    .action((options: EnsureOptions) => {
      try {
        const result = ensurePublicationReceipt({
          repo_root: process.cwd(),
          task_id: options.taskId,
          claim_id: options.claimId,
          branch: options.branch,
          target_branch: options.target,
          create_intent: parseCreateIntent(options.createIntent),
          create_intent_journal_path: options.createIntentJournal,
          merge_seal_path: process.env.REPO_HARNESS_PUBLICATION_SEAL_PATH,
          checks_path: process.env.REPO_HARNESS_PUBLICATION_CHECKS_PATH,
        });
        process.stdout.write(`${canonicalPublicationJournalEvidence(result.receipt)}\n`);
      } catch (error) {
        outputError(error);
      }
    });

  receipt
    .command('prepare')
    .description('Record a durable create intent before a markerless PR can be created')
    .requiredOption('--task-id <id>', 'Task id carried by the local claim token')
    .requiredOption('--claim-id <id>', 'Claim id carried by the local claim token')
    .requiredOption('--branch <branch>', 'Published branch')
    .requiredOption('--target <branch>', 'PR target branch')
    .action((options: PrepareOptions) => {
      try {
        const result = preparePublicationReceipt({
          repo_root: process.cwd(),
          task_id: options.taskId,
          claim_id: options.claimId,
          branch: options.branch,
          target_branch: options.target,
          merge_seal_path: process.env.REPO_HARNESS_PUBLICATION_SEAL_PATH,
          checks_path: process.env.REPO_HARNESS_PUBLICATION_CHECKS_PATH,
        });
        process.stdout.write(`${canonicalPublicationPrepareEnvelopeBytes(result)}\n`);
      } catch (error) {
        outputError(error);
      }
    });

  receipt
    .command('validate-journal-envelope')
    .description('Validate one canonical publication shell-to-journal envelope')
    .requiredOption('--kind <kind>', 'prepare or evidence')
    .requiredOption('--json <json>', 'Exact CLI output to validate')
    .action((options: ValidateEnvelopeOptions) => {
      try {
        let value: unknown;
        try {
          value = JSON.parse(options.json);
        } catch (error) {
          throw new PublicationReceiptError('publication_incomplete', 'publication journal envelope is invalid JSON', error);
        }
        if (options.kind === 'prepare') {
          process.stdout.write(`${canonicalPublicationPrepareEnvelopeBytes(validatePublicationPrepareEnvelope(value))}\n`);
          return;
        }
        if (options.kind === 'evidence') {
          process.stdout.write(`${canonicalPublicationJournalEvidenceBytes(validatePublicationJournalEvidence(value))}\n`);
          return;
        }
        throw new PublicationReceiptError('publication_incomplete', `unknown publication journal envelope kind: ${options.kind}`);
      } catch (error) {
        outputError(error);
      }
    });

  receipt
    .command('rebuild')
    .description('Rebuild the local receipt cache from a fully revalidated PR marker')
    .requiredOption('--pr <number>', 'Provider PR number')
    .action((options: RebuildOptions) => {
      const pr = Number(options.pr);
      if (!Number.isInteger(pr) || pr < 1) {
        process.stderr.write(`${JSON.stringify({ ok: false, error: 'publication_incomplete', message: '--pr must be a positive integer' })}\n`);
        process.exitCode = 2;
        return;
      }
      try {
        const result = rebuildPublicationReceipt({
          repo_root: process.cwd(),
          pr_number: pr,
          merge_seal_path: process.env.REPO_HARNESS_PUBLICATION_SEAL_PATH,
          checks_path: process.env.REPO_HARNESS_PUBLICATION_CHECKS_PATH,
        });
        process.stdout.write(`${JSON.stringify({ ok: true, receipt: result.receipt, cache_path: result.cache_path })}\n`);
      } catch (error) {
        outputError(error);
      }
    });

  publication
    .command('mark-reviewing')
    .description('Internal ship hook: enter reviewing after durable receipt and pr_observed')
    .requiredOption('--task-id <id>', 'Task id')
    .requiredOption('--claim-id <id>', 'Claim id')
    .requiredOption('--ship-transaction-key <key>', 'Independent ship journal key')
    .requiredOption('--ship-journal <path>', 'Ship journal status.json containing pr_observed')
    .action((options: MarkReviewingOptions) => {
      try {
        const pointer = enterPublicationReviewing({
          ...lifecycleEnvironment(),
          task_id: options.taskId,
          claim_id: options.claimId,
          ship_transaction_key: options.shipTransactionKey,
          ship_journal_path: options.shipJournal,
        });
        process.stdout.write(`${JSON.stringify({ ok: true, current_publication: pointer })}\n`);
      } catch (error) { outputError(error); }
    });

  publication
    .command('reopen')
    .description('Return the current reviewing publication to its same-owner bound worktree')
    .requiredOption('--task-id <id>', 'Task id')
    .requiredOption('--claim-id <id>', 'Current claim id')
    .requiredOption('--expected-generation <generation>', 'Current reviewing generation')
    .requiredOption('--publication-id <id>', 'Current publication id')
    .requiredOption('--expected-head-sha <sha>', 'Current publication head SHA')
    .action((options: ReopenOptions) => {
      try {
        const record = reopenPublication({ ...lifecycleEnvironment(), task_id: options.taskId, claim_id: options.claimId,
          expected_generation: numberOption(options.expectedGeneration, '--expected-generation'),
          publication_id: options.publicationId, expected_head_sha: options.expectedHeadSha });
        process.stdout.write(`${JSON.stringify({ ok: true, lease: record })}\n`);
      } catch (error) { outputError(error); }
    });

  publication
    .command('takeover')
    .description('Create a new reserving repair claim from a reviewing publication')
    .requiredOption('--task-id <id>', 'Task id')
    .requiredOption('--expected-claim-id <id>', 'Current reviewing claim id')
    .requiredOption('--expected-generation <generation>', 'Current reviewing generation')
    .requiredOption('--publication-id <id>', 'Current publication id')
    .requiredOption('--expected-head-sha <sha>', 'Current publication head SHA')
    .requiredOption('--reason <reason>', 'Required takeover provenance')
    .requiredOption('--session-id <id>', 'New owner session id')
    .action((options: TakeoverOptions) => {
      try {
        const record = takeoverPublication({
          ...lifecycleEnvironment(),
          task_id: options.taskId,
          expected_claim_id: options.expectedClaimId,
          expected_generation: numberOption(options.expectedGeneration, '--expected-generation'),
          publication_id: options.publicationId, expected_head_sha: options.expectedHeadSha,
          reason: options.reason,
          session_id: options.sessionId,
          new_claim_id: randomUUID(),
          source_worktree: realpathSync(process.cwd()),
        });
        process.stdout.write(`${JSON.stringify({ ok: true, lease: record })}\n`);
      } catch (error) { outputError(error); }
    });

  publication
    .command('abandon')
    .description('Record immutable lineage and release one closed or superseded reviewing publication')
    .requiredOption('--task-id <id>', 'Task id')
    .requiredOption('--expected-claim-id <id>', 'Current reviewing claim id')
    .requiredOption('--expected-generation <generation>', 'Current reviewing generation')
    .requiredOption('--publication-id <id>', 'Current publication id')
    .requiredOption('--expected-head-sha <sha>', 'Current publication head SHA')
    .requiredOption('--reason <reason>', 'Closed-unmerged or supersession reason')
    .action((options: AbandonOptions) => {
      try {
        const lineage = abandonPublication({
          ...lifecycleEnvironment(), task_id: options.taskId, expected_claim_id: options.expectedClaimId,
          expected_generation: numberOption(options.expectedGeneration, '--expected-generation'),
          publication_id: options.publicationId, expected_head_sha: options.expectedHeadSha, reason: options.reason,
        });
        process.stdout.write(`${JSON.stringify({ ok: true, lineage })}\n`);
      } catch (error) { outputError(error); }
    });

  publication
    .command('reconcile')
    .description('Close one reviewing publication against a freshly fetched provider target')
    .requiredOption('--task-id <id>', 'Task id')
    .requiredOption('--expected-claim-id <id>', 'Current reviewing claim id')
    .requiredOption('--expected-generation <generation>', 'Current reviewing generation')
    .requiredOption('--publication-id <id>', 'Current publication id')
    .requiredOption('--expected-head-sha <sha>', 'Current publication head SHA')
    .requiredOption('--remote <remote>', 'Provider target Git remote')
    .action((options: ReconcileOptions) => {
      try {
        const result = reconcilePublication({
          ...lifecycleEnvironment(),
          task_id: options.taskId,
          expected_claim_id: options.expectedClaimId,
          expected_generation: numberOption(options.expectedGeneration, '--expected-generation'),
          publication_id: options.publicationId,
          expected_head_sha: options.expectedHeadSha,
          remote: options.remote,
        });
        process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
      } catch (error) { outputError(error); }
    });

  publication
    .command('readiness')
    .description('Derive one read-only fenced merge-readiness verdict')
    .option('--publication-id <id>', 'Current publication id')
    .option('--pr <number>', 'Legacy/adoption read path using the live full-payload marker')
    .requiredOption('--json', 'Output the MergeReadinessV1 document as JSON')
    .action((options: ReadinessOptions) => {
      try {
        const prNumber = options.pr === undefined ? undefined : numberOption(options.pr, '--pr');
        const verdict = resolvePublicationReadiness({
          repo_root: process.cwd(),
          publication_id: options.publicationId,
          pr_number: prNumber,
          gh_bin: process.env.REPO_HARNESS_GH_BIN,
          git_bin: process.env.REPO_HARNESS_GIT_BIN,
          merge_seal_path: process.env.REPO_HARNESS_PUBLICATION_SEAL_PATH,
          checks_path: process.env.REPO_HARNESS_PUBLICATION_CHECKS_PATH,
        });
        process.stdout.write(`${JSON.stringify(verdict)}\n`);
      } catch (error) { outputError(error); }
    });

  const recover = publication.command('recover').description('Inspect or explicitly resolve an incomplete ship transaction');
  recover.command('inspect')
    .option('--key <key>', 'Exact ship transaction key')
    .action((options: RecoveryOptions) => {
      try { runShipRecovery('inspect', options); } catch (error) { outputError(error); }
    });
  recover.command('reconcile')
    .requiredOption('--key <key>', 'Exact ship transaction key')
    .action((options: RecoveryOptions) => {
      try { runShipRecovery('reconcile', options); } catch (error) { outputError(error); }
    });
  recover.command('abort')
    .requiredOption('--key <key>', 'Exact ship transaction key')
    .requiredOption('--confirm-abort', 'Confirm rollback before any landed external effect')
    .action((options: RecoveryOptions) => {
      try { runShipRecovery('abort', options); } catch (error) { outputError(error); }
    });

  const legacy = publication.command('legacy').description('Inspect and explicitly migrate fully attributable legacy completing publications');
  for (const command of [
    legacy.command('inspect').description('Classify a legacy completing publication without mutation'),
    legacy.command('migrate').description('Migrate a fully verified legacy completing publication to reviewing'),
  ]) {
    command
      .requiredOption('--task-id <id>', 'Task id')
      .requiredOption('--expected-claim-id <id>', 'Exact legacy claim id')
      .requiredOption('--ship-transaction-key <key>', 'Independent ship journal key')
      .requiredOption('--ship-journal <path>', 'Ship journal status.json containing pr_observed');
  }
  legacy.commands.find((command) => command.name() === 'migrate')!
    .requiredOption('--confirm-legacy-migration', 'Explicit confirmation; no automatic legacy migration');
  legacy.commands.find((command) => command.name() === 'inspect')!.action((options: LegacyOptions) => {
    try {
      const inspection = inspectLegacyPublication({ ...lifecycleEnvironment(), task_id: options.taskId, expected_claim_id: options.expectedClaimId, ship_transaction_key: options.shipTransactionKey, ship_journal_path: options.shipJournal });
      process.stdout.write(`${JSON.stringify(inspection)}\n`);
    } catch (error) { outputError(error); }
  });
  legacy.commands.find((command) => command.name() === 'migrate')!.action((options: LegacyOptions) => {
    try {
      if (!options.confirmLegacyMigration) throw new PublicationLifecycleError('legacy_confirmation_required', 'legacy migration requires --confirm-legacy-migration');
      const inspection = inspectLegacyPublication({ ...lifecycleEnvironment(), task_id: options.taskId, expected_claim_id: options.expectedClaimId, ship_transaction_key: options.shipTransactionKey, ship_journal_path: options.shipJournal });
      if (inspection.classification !== 'migratable') throw new PublicationLifecycleError('legacy_unattributable', inspection.reason);
      const pointer = migrateLegacyPublication({
        ...lifecycleEnvironment(), task_id: options.taskId, claim_id: options.expectedClaimId,
        ship_transaction_key: options.shipTransactionKey, ship_journal_path: options.shipJournal,
      });
      process.stdout.write(`${JSON.stringify({ ok: true, current_publication: pointer, legacy: 'migrated' })}\n`);
    } catch (error) { outputError(error); }
  });

  return publication;
}
