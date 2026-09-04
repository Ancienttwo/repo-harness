import { Command } from 'commander';

import { readFileSync } from 'fs';

import { validateProgramAuthorization, type ProgramAuthorizationV1 } from '../../core/automation/budget';
import {
  AutomationBudgetStoreError,
  listAutomationBudgetRuns,
  readAutomationBudgetBoardSlice,
} from '../../effects/automation/budget-store';
import {
  AutomationGrantStoreError,
  automationGrantStoreDirectory,
  listStoredProgramAuthorizations,
  mintProgramAuthorization,
} from '../../effects/automation/grant-store';
import { AutomationControllerError } from '../../core/automation/controller';
import { AutomationControllerStoreError, listAutomationControllerRuns, readAutomationControllerStatus } from '../../effects/automation/controller-store';
import { reconcileAutomationController, startBoundedAutomationController, stepAutomationController, stopAutomationController } from '../../effects/automation/controller-run';

export interface AutomationBudgetRawOptions {
  readonly repo?: string;
  readonly run?: string;
}

export interface AutomationGrantRawOptions {
  readonly repo?: string;
  readonly from?: string;
}

export class AutomationArgumentError extends Error {
  readonly code = 'invalid_argument' as const;

  constructor(message: string) {
    super(message);
    this.name = 'AutomationArgumentError';
  }
}

function outputError(error: unknown): void {
  const invalid = error instanceof AutomationArgumentError;
  const code = invalid
    ? 'invalid_argument'
    : error instanceof AutomationBudgetStoreError || error instanceof AutomationGrantStoreError
      || error instanceof AutomationControllerError || error instanceof AutomationControllerStoreError
      ? error.code
      : 'automation_budget_unavailable';
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${JSON.stringify({ ok: false, error: code, message })}\n`);
  process.exitCode = invalid ? 2 : 1;
}

/**
 * The operator-facing read of one run's budget. It prints the same projection
 * the board consumes, so an operator and a board never disagree about what a
 * run has spent or why it stopped.
 */
export function runAutomationBudgetShow(raw: AutomationBudgetRawOptions): void {
  const repo = raw.repo?.trim() || process.cwd();
  const run = raw.run?.trim();
  if (!run) throw new AutomationArgumentError('--run is required');
  const slice = readAutomationBudgetBoardSlice(repo, run);
  process.stdout.write(`${JSON.stringify(slice, null, 2)}\n`);
}

export function runAutomationBudgetList(raw: AutomationBudgetRawOptions): void {
  const repo = raw.repo?.trim() || process.cwd();
  process.stdout.write(`${JSON.stringify({ ok: true, runs: listAutomationBudgetRuns(repo) }, null, 2)}\n`);
}

/**
 * The operator mint. A `ProgramAuthorizationV1` is a human act, so it enters
 * the account-level gate store through this verb and nowhere else; the budget
 * store then accepts only grants that resolve here byte for byte.
 */
export function runAutomationGrantMint(raw: AutomationGrantRawOptions): void {
  const repo = raw.repo?.trim() || process.cwd();
  const from = raw.from?.trim();
  if (!from) throw new AutomationArgumentError('--from is required');
  let parsed: ProgramAuthorizationV1;
  try {
    parsed = validateProgramAuthorization(JSON.parse(readFileSync(from, 'utf8')) as ProgramAuthorizationV1);
  } catch (error) {
    throw new AutomationArgumentError(`--from is not a valid ProgramAuthorizationV1: ${(error as Error).message}`);
  }
  const path = mintProgramAuthorization({ repo_root: repo, authorization: parsed });
  process.stdout.write(`${JSON.stringify({
    ok: true,
    authorization_id: parsed.authorization_id,
    authorization_sha256: parsed.authorization_sha256,
    stored_at: path,
  }, null, 2)}\n`);
}

export function runAutomationGrantList(raw: AutomationGrantRawOptions): void {
  const repo = raw.repo?.trim() || process.cwd();
  process.stdout.write(`${JSON.stringify({
    ok: true,
    store: automationGrantStoreDirectory(repo),
    authorizations: listStoredProgramAuthorizations(repo),
  }, null, 2)}\n`);
}

export function buildAutomationCommand(): Command {
  const automation = new Command('automation').description('Read the per-goal automation budget ledger');
  const budget = new Command('budget').description('Read-only automation budget projections');
  budget
    .command('show')
    .description('Print the read-only budget projection for one automation run')
    .option('--repo <path>', 'Repository root', '.')
    .requiredOption('--run <automationRunId>', 'Automation run id (64-character hex digest)')
    .action((raw: AutomationBudgetRawOptions) => {
      try {
        runAutomationBudgetShow(raw);
      } catch (error) {
        outputError(error);
      }
    });
  budget
    .command('list')
    .description('List automation runs that carry a budget in this repository')
    .option('--repo <path>', 'Repository root', '.')
    .action((raw: AutomationBudgetRawOptions) => {
      try {
        runAutomationBudgetList(raw);
      } catch (error) {
        outputError(error);
      }
    });
  const grant = new Command('grant').description('Operator-owned automation authorization grants');
  grant
    .command('mint')
    .description('Store one operator-minted ProgramAuthorizationV1 in the harness home gate store')
    .option('--repo <path>', 'Repository root', '.')
    .requiredOption('--from <path>', 'Path to a canonical ProgramAuthorizationV1 JSON document')
    .action((raw: AutomationGrantRawOptions) => {
      try {
        runAutomationGrantMint(raw);
      } catch (error) {
        outputError(error);
      }
    });
  grant
    .command('list')
    .description('List the authorization digests stored for this repository')
    .option('--repo <path>', 'Repository root', '.')
    .action((raw: AutomationGrantRawOptions) => {
      try {
        runAutomationGrantList(raw);
      } catch (error) {
        outputError(error);
      }
    });
  automation.addCommand(budget);
  automation.addCommand(grant);
  const controller = new Command('controller').description('Run one bounded unattended Engineer controller');
  const number = (value: string, field: string): number => { const parsed = Number(value); if (!Number.isSafeInteger(parsed)) throw new AutomationArgumentError(`${field} must be an integer`); return parsed; };
  const collect = (value: string, previous: string[]): string[] => [...previous, value];
  controller.command('start')
    .requiredOption('--run <automationRunId>', 'Exact automation budget run digest')
    .requiredOption('--authorization-id <id>', 'Mapped Engineer OAuth authorization')
    .requiredOption('--idempotency-key <key>', 'Stable controller start key')
    .requiredOption('--protected-path <path>', 'Protected repository path; repeatable', collect, [])
    .option('--maximum-steps <n>', 'Hard steps per invocation', '8')
    .option('--maximum-duration-ms <n>', 'Hard invocation duration', '60000')
    .option('--maximum-transient-retries <n>', 'Bounded transient retries', '3')
    .option('--initial-backoff-ms <n>', 'Initial deterministic backoff', '500')
    .option('--maximum-backoff-ms <n>', 'Maximum deterministic backoff', '8000')
    .action((options: { run: string; authorizationId: string; idempotencyKey: string; protectedPath: string[]; maximumSteps: string; maximumDurationMs: string; maximumTransientRetries: string; initialBackoffMs: string; maximumBackoffMs: string }) => {
      try { process.stdout.write(`${JSON.stringify(startBoundedAutomationController({ repo_root: process.cwd(), automation_run_id: options.run, authorization_id: options.authorizationId, idempotency_key: options.idempotencyKey, protected_paths: options.protectedPath, policy: { maximum_steps_per_invocation: number(options.maximumSteps, 'maximum-steps'), maximum_duration_ms: number(options.maximumDurationMs, 'maximum-duration-ms'), maximum_transient_retries: number(options.maximumTransientRetries, 'maximum-transient-retries'), initial_backoff_ms: number(options.initialBackoffMs, 'initial-backoff-ms'), maximum_backoff_ms: number(options.maximumBackoffMs, 'maximum-backoff-ms') } }), null, 2)}\n`); } catch (error) { outputError(error); }
    });
  controller.command('step')
    .requiredOption('--run <automationRunId>', 'Exact controller run digest')
    .requiredOption('--idempotency-key <key>', 'Stable step key')
    .option('--dispatch-id <digest>', 'Exact already-admitted delegated-run dispatch')
    .option('--max-selection-attempts <n>', 'Bounded acquire-next rereads', '3')
    .action((options: { run: string; idempotencyKey: string; dispatchId?: string; maxSelectionAttempts: string }) => {
      try { process.stdout.write(`${JSON.stringify(stepAutomationController({ repo_root: process.cwd(), run_id: options.run, idempotency_key: options.idempotencyKey, dispatch_id: options.dispatchId, max_selection_attempts: number(options.maxSelectionAttempts, 'max-selection-attempts') }), null, 2)}\n`); } catch (error) { outputError(error); }
    });
  controller.command('status').option('--run <automationRunId>', 'Exact controller run digest').action((options: { run?: string }) => {
    try { process.stdout.write(`${JSON.stringify(options.run ? readAutomationControllerStatus(process.cwd(), options.run) : listAutomationControllerRuns(process.cwd()), null, 2)}\n`); } catch (error) { outputError(error); }
  });
  controller.command('stop').requiredOption('--run <automationRunId>').requiredOption('--idempotency-key <key>').action((options: { run: string; idempotencyKey: string }) => {
    try { process.stdout.write(`${JSON.stringify(stopAutomationController(process.cwd(), options.run, options.idempotencyKey), null, 2)}\n`); } catch (error) { outputError(error); }
  });
  controller.command('reconcile').requiredOption('--run <automationRunId>').requiredOption('--idempotency-key <key>').requiredOption('--evidence-ref <ref>', 'Exact evidence reference; repeatable', collect, []).action((options: { run: string; idempotencyKey: string; evidenceRef: string[] }) => {
    try { process.stdout.write(`${JSON.stringify(reconcileAutomationController(process.cwd(), options.run, options.idempotencyKey, options.evidenceRef), null, 2)}\n`); } catch (error) { outputError(error); }
  });
  automation.addCommand(controller);
  return automation;
}
