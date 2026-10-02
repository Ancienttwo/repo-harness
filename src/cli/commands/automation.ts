import { Command } from 'commander';
import { canonicalRepoPath } from '../../effects/repo-registry';

import { readFileSync } from 'fs';
import { validateSelectedEngineerTaskChoice } from '../../effects/engineers/scheduling-acquire-next';

import { validateProgramAuthorization, type ProgramAuthorizationV1 } from '../../core/automation/budget';
import {
  AutomationBudgetStoreError,
  listAutomationBudgetRuns,
  readAutomationBudgetBoardSlice,
  repairAutomationBudgetDrift,
  repairAutomationReconciliation,
  type RepairAutomationReconciliationInput,
} from '../../effects/automation/budget-store';
import {
  AutomationGrantStoreError,
  automationGrantStoreDirectory,
  listStoredProgramAuthorizations,
  mintProgramAuthorization,
} from '../../effects/automation/grant-store';
import { AutomationControllerError } from '../../core/automation/controller';
import { buildLeaseLivenessPolicy } from '../../core/state/lease-liveness';
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
  const repo = canonicalRepoPath(raw.repo?.trim() || process.cwd());
  const run = raw.run?.trim();
  if (!run) throw new AutomationArgumentError('--run is required');
  const slice = readAutomationBudgetBoardSlice(repo, run);
  process.stdout.write(`${JSON.stringify(slice, null, 2)}\n`);
}

/**
 * The one write an operator may ask of the budget store on its own: it re-runs
 * the locked reconciliation so a stopped or expired run seals its exhaustion
 * receipt. It never reserves, charges or changes a cap, and on a run that is
 * already reconciled it is a plain read.
 */
export function runAutomationBudgetRepair(raw: AutomationBudgetRawOptions): void {
  const repo = canonicalRepoPath(raw.repo?.trim() || process.cwd());
  const run = raw.run?.trim();
  if (!run) throw new AutomationArgumentError('--run is required');
  const status = repairAutomationBudgetDrift({ repo_root: repo, automation_run_id: run });
  process.stdout.write(`${JSON.stringify({
    ok: true,
    automation_run_id: run,
    state: status.current.state,
    drift: status.drift,
    stop_receipt: status.stop_receipt,
    consumed: status.current.consumed,
    open_reservation_sha256s: status.current.open_reservation_sha256s,
  }, null, 2)}\n`);
}

export function runAutomationBudgetList(raw: AutomationBudgetRawOptions): void {
  const repo = canonicalRepoPath(raw.repo?.trim() || process.cwd());
  process.stdout.write(`${JSON.stringify({ ok: true, runs: listAutomationBudgetRuns(repo) }, null, 2)}\n`);
}

/**
 * The operator mint. A `ProgramAuthorizationV1` is a human act, so it enters
 * the account-level gate store through this verb and nowhere else; the budget
 * store then accepts only grants that resolve here byte for byte.
 */
export function runAutomationGrantMint(raw: AutomationGrantRawOptions): void {
  const repo = canonicalRepoPath(raw.repo?.trim() || process.cwd());
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
  const repo = canonicalRepoPath(raw.repo?.trim() || process.cwd());
  process.stdout.write(`${JSON.stringify({
    ok: true,
    store: automationGrantStoreDirectory(repo),
    authorizations: listStoredProgramAuthorizations(repo),
  }, null, 2)}\n`);
}

export function buildAutomationCommand(): Command {
  const automation = new Command('automation').description('Read the per-goal automation budget ledger');
  const budget = new Command('budget').description('Automation budget projections and the operator drift repair verb');
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
  budget
    .command('repair')
    .description('Re-run the locked reconciliation so a stopped or expired run seals its exhaustion receipt')
    .option('--repo <path>', 'Repository root', '.')
    .requiredOption('--run <automationRunId>', 'Automation run id (64-character hex digest)')
    .action((raw: AutomationBudgetRawOptions) => {
      try {
        runAutomationBudgetRepair(raw);
      } catch (error) {
        outputError(error);
      }
    });
  budget.command('repair-reconciliation')
    .description('Preview an exact malformed-evidence repair; --apply records its full reserved charge')
    .option('--repo <path>', 'Repository root', '.')
    .requiredOption('--from <path>', 'JSON with run, reservation, expected record digest, outcome, corrected evidence and repair reason')
    .option('--apply', 'Append the immutable repair receipt and usage event')
    .action((raw: { repo: string; from: string; apply?: boolean }) => {
      try {
        const request = JSON.parse(readFileSync(raw.from, 'utf8')) as Record<string, unknown>;
        const fields = ['automation_run_id', 'reservation_sha256', 'expected_reconciliation_sha256', 'outcome', 'evidence_refs', 'repair_reason'];
        if (!request || typeof request !== 'object' || Array.isArray(request)
          || JSON.stringify(Object.keys(request).sort()) !== JSON.stringify(fields.sort())) {
          throw new AutomationArgumentError('--from must contain exactly the reconciliation repair request fields');
        }
        const result = repairAutomationReconciliation({ ...request, repo_root: canonicalRepoPath(raw.repo),
          mode: raw.apply ? 'apply' : 'dry_run' } as RepairAutomationReconciliationInput);
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      } catch (error) { outputError(error); }
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
    .option('--lease-renewal-interval-ms <n>', 'Controller lease renewal interval', '30000')
    .option('--lease-maximum-ttl-ms <n>', 'Maximum controller lease TTL', '120000')
    .action((options: { run: string; authorizationId: string; idempotencyKey: string; protectedPath: string[]; maximumSteps: string; maximumDurationMs: string; maximumTransientRetries: string; initialBackoffMs: string; maximumBackoffMs: string; leaseRenewalIntervalMs: string; leaseMaximumTtlMs: string }) => {
      try { process.stdout.write(`${JSON.stringify(startBoundedAutomationController({ repo_root: process.cwd(), automation_run_id: options.run, authorization_id: options.authorizationId, idempotency_key: options.idempotencyKey, protected_paths: options.protectedPath, policy: { maximum_steps_per_invocation: number(options.maximumSteps, 'maximum-steps'), maximum_duration_ms: number(options.maximumDurationMs, 'maximum-duration-ms'), maximum_transient_retries: number(options.maximumTransientRetries, 'maximum-transient-retries'), initial_backoff_ms: number(options.initialBackoffMs, 'initial-backoff-ms'), maximum_backoff_ms: number(options.maximumBackoffMs, 'maximum-backoff-ms'), lease_liveness: buildLeaseLivenessPolicy({ renewal_interval_ms: number(options.leaseRenewalIntervalMs, 'lease-renewal-interval-ms'), maximum_ttl_ms: number(options.leaseMaximumTtlMs, 'lease-maximum-ttl-ms'), renewal_actor_kind: 'controller', required_evidence_sources: ['controller', 'runtime_effect', 'publication', 'binding'], unproven_behavior: 'require_attention' }) } }), null, 2)}\n`); } catch (error) { outputError(error); }
    });
  controller.command('step')
    .requiredOption('--run <automationRunId>', 'Exact controller run digest')
    .requiredOption('--idempotency-key <key>', 'Stable step key')
    .option('--dispatch-id <digest>', 'Exact already-admitted delegated-run dispatch')
    .option('--max-selection-attempts <n>', 'Bounded acquire-next rereads (auto only)')
    .option('--selected', 'Use an exact caller-selected observation; never auto-pick')
    .option('--observation-ref <digest>', 'Server-produced reference required with --selected')
    .option('--assertion-file <path>', '13-field assertion JSON required with --selected')
    .action((options: { run:string;idempotencyKey:string;dispatchId?:string;maxSelectionAttempts?:string;selected?:boolean;observationRef?:string;assertionFile?:string })=>{
      try {
        if(!options.selected && (options.observationRef!==undefined || options.assertionFile!==undefined)) throw new Error('selected-only fields require --selected');
        if(options.selected && (!options.observationRef || !options.assertionFile || options.maxSelectionAttempts!==undefined)) throw new Error('--selected requires observation-ref/assertion-file and forbids auto selection attempts');
        const selected=options.selected?validateSelectedEngineerTaskChoice({observation_ref:options.observationRef,assertion:JSON.parse(readFileSync(options.assertionFile!,'utf8'))}):null;
        process.stdout.write(`${JSON.stringify(stepAutomationController({repo_root:process.cwd(),run_id:options.run,idempotency_key:options.idempotencyKey,dispatch_id:options.dispatchId,
          ...(selected?{selected}:{max_selection_attempts:number(options.maxSelectionAttempts??'3','max-selection-attempts')})}),null,2)}\n`);
      } catch(error){outputError(error);}
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
