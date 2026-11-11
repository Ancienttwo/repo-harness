import { Command } from 'commander';
import { OPERATOR_DEFAULT_HOST, OPERATOR_DEFAULT_MAX_CONCURRENCY, OPERATOR_DEFAULT_PORT, OPERATOR_DEFAULT_TIMEOUT_MS } from '../../core/review/operator-console-port';
import type { CleanupReviewHost } from '../../effects/operator/worktree-cleanup-investigation';
import type { OperatorCaptureRawOptions, OperatorServeRawOptions } from './operator-actions';

const actions = () => import('./operator-actions');

/** Only the guarded cleanup investigation child loads the injected task-agent-host runner. */
export function buildOperatorCommand(loadReviewHost: () => Promise<CleanupReviewHost> | CleanupReviewHost): Command {
  const operator = new Command('operator').description('Serve the local read-only Human Control Board');
  operator
    .command('serve')
    .description('Serve the loopback-only read-only Human Control Board')
    .option('--host <host>', 'Loopback bind host (127.0.0.1 or ::1)', OPERATOR_DEFAULT_HOST)
    .option('--port <port>', 'TCP port (0 selects an ephemeral test port)', String(OPERATOR_DEFAULT_PORT))
    .option('--max-concurrency <count>', 'Bounded Fleet collection concurrency (1-16)', String(OPERATOR_DEFAULT_MAX_CONCURRENCY))
    .option('--timeout-ms <milliseconds>', 'Fleet collection deadline (1000-30000)', String(OPERATOR_DEFAULT_TIMEOUT_MS))
    .option('--runtime-status-config <path>', 'Explicit read-only runtime source configuration; disabled when absent')
    .option('--exit-on-stdin-close', 'Shut down when stdin reaches EOF, so a killed parent leaves no server behind')
    .action(async (raw: OperatorServeRawOptions) => (await actions()).serve(raw));
  operator
    .command('capture')
    .description('Capture native runtime status from one explicit owned child')
    .requiredOption('--provider <provider>', 'Native provider (codex, claude, pi)')
    .requiredOption('--source-id <id>', 'Bounded source identity')
    .requiredOption('--snapshot <path>', 'New absolute snapshot path in an owned private directory')
    .argument('<argv...>', 'Child command and arguments after --')
    .action(async (argv: string[], raw: OperatorCaptureRawOptions) => (await actions()).capture(argv, raw));
  // The job child of POST /api/v1/worktrees/cleanup/investigation. Only the operator server starts it.
  operator
    .command('cleanup-investigation-job', { hidden: true })
    .argument('<session-id>')
    .argument('<job-id>')
    .argument('<deadline-ms>')
    .action(async (sessionId: string, jobId: string, deadlineMs: string) => (await actions()).cleanupInvestigationJob(sessionId, jobId, deadlineMs, await loadReviewHost()));
  return operator;
}
