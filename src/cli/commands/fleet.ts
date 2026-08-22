import { Command } from 'commander';

import {
  MergeReadinessError,
  resolveFleetReadiness,
} from '../../effects/publication/merge-readiness';
import {
  acquireFleetTask,
  collectFleetOffers,
  FleetOffersError,
} from '../../effects/fleet/acquire';

function outputError(error: unknown): void {
  const code = error instanceof MergeReadinessError || error instanceof FleetOffersError
    ? error.code
    : 'provider_unavailable';
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${JSON.stringify({ ok: false, error: code, message })}\n`);
  process.exitCode = 1;
}

function optionalStringOption(value: string | undefined, name: string): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new Error(`--${name} must be a non-empty string`);
  return trimmed;
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
