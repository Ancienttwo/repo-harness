import { Command } from 'commander';

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
  if (error instanceof PublicationReceiptError) {
    process.stderr.write(`${JSON.stringify({ ok: false, error: error.code, message: error.message })}\n`);
    process.exitCode = 1;
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${JSON.stringify({ ok: false, error: 'publication_incomplete', message })}\n`);
  process.exitCode = 1;
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

  return publication;
}
