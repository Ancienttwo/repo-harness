import { Command } from 'commander';

import {
  AutomationBudgetStoreError,
  listAutomationBudgetRuns,
  readAutomationBudgetBoardSlice,
} from '../../effects/automation/budget-store';

export interface AutomationBudgetRawOptions {
  readonly repo?: string;
  readonly run?: string;
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
    : error instanceof AutomationBudgetStoreError
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
  automation.addCommand(budget);
  return automation;
}
