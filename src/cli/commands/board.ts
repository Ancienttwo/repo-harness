import { Command } from 'commander';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { AdvisorSeatError, advisorSeatSendFailure, readAdvisorSeat, sendToAdvisorSeat } from '../../core/board/advisor-seat';
import { AttentionWatchError, attentionLogPath, runAttentionWindow, serviceTerminalRepository, startAttentionWatch } from '../../effects/board/attention-watch';
import { evaluateBoardAttention, type BoardAttentionV1 } from '../../core/board/attention';
import type { AttentionHostPortsV1 } from '../../core/board/attention-delivery';
import type { BoardHostPortsV1 } from '../../core/board/board';
import { BoardSourceError } from '../../core/board/source';
import { BoardCollectError, collectBoard, readRepositoryId } from '../../effects/board/collect';
import { renderDependencyMigrationPlan } from '../../core/board/dependency-migration';
import { DependencyMigrationError, runDependencyMigration, type DependencyMigrationResultV1 } from '../../effects/board/dependency-migration';
import { BoardParentsError, collectBoardParents } from '../../effects/board/parents';
import { BoardSeatsError, collectBoardSeats } from '../../effects/board/seats';
import { DispatchError, type DispatchPlanV1 } from '../../core/board/dispatch';
import { runDispatch } from '../../effects/board/dispatch';
import { seatLaunch } from './seats';
import { runBoardCloseout, stopArchitectureDaemons, stopCodegraphServers } from '../../effects/board/closeout';
import { worktreeProcesses } from '../../effects/git/worktree-processes';

interface BoardOptions {
  readonly parent?: string;
  readonly json?: boolean;
}

interface AttentionOptions extends BoardOptions {
  readonly watch?: boolean;
  readonly deliver?: boolean;
}

const CLI_ENTRY = fileURLToPath(new URL('../index.ts', import.meta.url));

interface MigrateDependenciesOptions extends BoardOptions {
  readonly write?: boolean;
  readonly plan?: string;
}

function parentNumber(options: BoardOptions): number {
  if (options.parent === undefined || !/^[1-9][0-9]*$/u.test(options.parent)) throw new BoardCollectError('--parent <issue number> is required');
  return Number(options.parent);
}

/** A collect or source failure is the whole result; the board has no partial form. */
function guarded(action: (options: BoardOptions) => void): (options: BoardOptions) => void {
  return (options) => {
    try {
      action(options);
    } catch (error) {
      if (!(error instanceof BoardCollectError || error instanceof BoardSourceError || error instanceof AttentionWatchError)) throw error;
      process.stderr.write(`${JSON.stringify({ ok: false, error: error.name, message: error.message })}\n`);
      process.exitCode = 1;
    }
  };
}

function migrationText(result: DependencyMigrationResultV1): string {
  return [...result.labels.map(label => `label ${label.name}: ${label.result}`),
    ...result.edges.map(edge => `#${edge.issue} blocked by #${edge.blocker}: ${edge.result} (line ${edge.line_number}: ${edge.line.trim()})`),
    ...result.skipped.map(line => `#${line.issue} line ${line.line_number}: skipped (${line.line.trim()})`)].join('\n') + '\n';
}

function dispatchText(plan: DispatchPlanV1, started: readonly number[]): string {
  return plan.decisions.map(decision => decision.action === 'skip'
    ? `#${decision.issue} skipped (${decision.reason}): ${decision.detail}`
    : `#${decision.issue} ${started.includes(decision.issue) ? 'started' : 'ready'} on ${decision.seat}: ${decision.route_line}`).join('\n') + '\n';
}

function attentionText(attention: BoardAttentionV1): string {
  const lines = attention.findings.map(finding => `${finding.rule} ${finding.route}: ${finding.message}`);
  if (lines.length === 0) lines.push(`no attention findings for #${attention.parent}`);
  for (const entry of attention.unevaluated) lines.push(`${entry.rule} not evaluated: ${entry.reason}${entry.subject === null ? '' : ` (${entry.subject})`}`);
  return `${lines.join('\n')}\n`;
}

/**
 * `--parent` and `--json` belong to `board`. The root program does not use
 * positional options, so Commander binds them to `board` wherever they
 * appear; `board attention` reads them with `optsWithGlobals()`. They are not
 * mandatory options, because Commander would then check them for the
 * subcommand's ancestors too; `parentNumber` checks `--parent`.
 */
export function buildBoardCommand(host: BoardHostPortsV1, attentionHost: AttentionHostPortsV1): Command {
  const board = new Command('board')
    .description('Read a parent issue board, or list the parents and seats of this repository')
    .option('--parent <number>', 'Parent issue number')
    .option('--json', 'Output JSON: the repo-harness.board document, or with attention the repo-harness.board-attention document')
    .action(guarded((options: BoardOptions) => {
      if (options.json !== true) throw new BoardCollectError('board prints JSON only; pass --json');
      process.stdout.write(`${JSON.stringify(collectBoard({ repo_root: process.cwd(), parent: parentNumber(options), host }))}\n`);
    }));
  const attention = board.command('attention')
    .description('Run the attention rules on the board of one parent issue (takes the board options --parent and --json)')
    .option('--watch', 'Stay resident: one board read per window (15 min while a worker seat runs, else 60 min); runs only in the terminal that `attention start` opens')
    .option('--deliver', 'With --watch: send the findings to the seat terminals with hc send')
    .action(async (_options: AttentionOptions, command: Command) => {
      const options = command.optsWithGlobals<AttentionOptions>();
      if (options.watch === true) return watchAttention(options, host, attentionHost);
      guarded((options: AttentionOptions) => {
        if (options.deliver === true) throw new AttentionWatchError('--deliver needs --watch');
        const attention = evaluateBoardAttention(collectBoard({ repo_root: process.cwd(), parent: parentNumber(options), host }));
        process.stdout.write(options.json === true ? `${JSON.stringify(attention)}\n` : attentionText(attention));
      })(options);
    });
  attention.command('start')
    .description('Start the resident watcher (--watch --deliver) of one parent issue in a new hc terminal, unless one is live (takes --parent)')
    .action((_options: BoardOptions, command: Command) => guarded((options: BoardOptions) => {
      const parent = parentNumber(options);
      const result = startAttentionWatch({ parent, repository_id: readRepositoryId({ repo_root: process.cwd() }), repo_root: process.cwd(), cli: [process.execPath, CLI_ENTRY], host: attentionHost });
      process.stdout.write(`${result.started ? 'Started' : 'Already live:'} the attention watcher of #${parent} in hc terminal ${result.address}.\n`);
    })(command.optsWithGlobals<BoardOptions>()));
  board.command('parents')
    .description('List the open parent issues of this repository: open issues with sub-issues, their progress and live hc seat count (takes --json)')
    .action((_options: BoardOptions, command: Command) => {
      try {
        if (command.optsWithGlobals<BoardOptions>().json !== true) throw new BoardCollectError('board parents prints JSON only; pass --json');
        process.stdout.write(`${JSON.stringify(collectBoardParents({ repo_root: process.cwd(), host }))}\n`);
      } catch (error) {
        if (!(error instanceof BoardParentsError || error instanceof BoardSourceError || error instanceof BoardCollectError)) throw error;
        const code = error instanceof BoardParentsError ? { code: error.code } : {};
        process.stderr.write(`${JSON.stringify({ ok: false, error: error.name, ...code, message: error.message })}\n`);
        process.exitCode = 1;
      }
    });
  board.command('dispatch')
    .description('Start a seat for each ready sub-issue of the plan (takes --parent): worktree, claim comment and worker tab, on the seat that the quota route names')
    .requiredOption('--space <id>', 'Herdr space that receives the worker tabs')
    .option('--dry-run', 'Print the decision for each plan issue and start nothing')
    .action(async (options: { space: string; dryRun?: boolean }, command: Command) => {
      try {
        const parent = parentNumber(command.optsWithGlobals<BoardOptions>());
        const result = await runDispatch({
          repo_root: process.cwd(), parent, space: options.space, host, dry_run: options.dryRun === true,
          launch: (seat, labels, cwd) => seatLaunch(seat, labels, process.env, cwd),
        });
        process.stdout.write(dispatchText(result.plan, result.started.map(entry => entry.issue)));
      } catch (error) {
        if (!(error instanceof BoardCollectError || error instanceof BoardSourceError || error instanceof DispatchError)) throw error;
        process.stderr.write(`${JSON.stringify({ ok: false, error: error.name, message: error.message })}\n`);
        process.exitCode = 1;
      }
    });
  board.command('seats')
    .description('List every live seat of this repository, with or without a parent label (takes --json)')
    .action((_options: BoardOptions, command: Command) => {
      try {
        if (command.optsWithGlobals<BoardOptions>().json !== true) throw new BoardCollectError('board seats prints JSON only; pass --json');
        process.stdout.write(`${JSON.stringify(collectBoardSeats({ repo_root: process.cwd(), host }))}\n`);
      } catch (error) {
        if (!(error instanceof BoardSeatsError || error instanceof BoardCollectError)) throw error;
        const code = error instanceof BoardSeatsError ? { code: error.code } : {};
        process.stderr.write(`${JSON.stringify({ ok: false, error: error.name, ...code, message: error.message })}\n`);
        process.exitCode = 1;
      }
    });
  board.command('closeout')
    .description('After a merge, in the primary checkout: close each seat terminal of the pull request whose checkout is clean and pushed, then remove its merged worktree; prints JSON, exit 1 when anything is kept')
    .requiredOption('--pr <number>', 'The merged pull request')
    .action(async (options: { pr: string }) => {
      try {
        if (!/^[1-9][0-9]*$/u.test(options.pr)) throw new BoardCollectError('--pr must be a pull request number');
        const repo_root = process.cwd();
        const result = await runBoardCloseout({ repo_root, pr: Number(options.pr), host, caller_terminal: process.env.HC_TERMINAL_ID ?? null,
          stopDaemons: worktree => stopArchitectureDaemons(repo_root, worktree), processes: worktreeProcesses, stopCodegraphServers });
        process.stdout.write(`${JSON.stringify(result)}\n`);
        if (result.panes.some(pane => pane.outcome === 'kept') || result.worktree.outcome !== 'removed' || result.daemon_stop_failures.length > 0) process.exitCode = 1;
      } catch (error) {
        if (!(error instanceof BoardCollectError)) throw error;
        process.stderr.write(`${JSON.stringify({ ok: false, error: error.name, message: error.message })}\n`);
        process.exitCode = 1;
      }
    });
  // The operator advisor seat routes (#1756) run these two commands in the registered root.
  const advisor = board.command('advisor')
    .description('The advisor seat of one parent issue: the one live terminal with the advisor seat label (takes --parent and --json)');
  // A failed send also reports the scope and the resolved terminal, so the operator audit names the seat.
  const advisorAction = (action: (scope: Parameters<typeof readAdvisorSeat>[0]) => unknown, reportsSend = false) => (_options: BoardOptions, command: Command) => {
    let scope: Parameters<typeof readAdvisorSeat>[0] | undefined;
    try {
      const options = command.optsWithGlobals<BoardOptions>();
      if (options.json !== true) throw new BoardCollectError('board advisor prints JSON only; pass --json');
      const parent = parentNumber(options);
      scope = { github_repository_id: readRepositoryId({ repo_root: process.cwd() }), parent, host };
      process.stdout.write(`${JSON.stringify(action(scope))}\n`);
    } catch (error) {
      if (!(error instanceof AdvisorSeatError || error instanceof BoardCollectError)) throw error;
      const code = error instanceof AdvisorSeatError ? { code: error.code } : {};
      const failure = reportsSend && scope !== undefined && error instanceof AdvisorSeatError ? { failure: advisorSeatSendFailure(scope, error) } : {};
      process.stderr.write(`${JSON.stringify({ ok: false, error: error.name, ...code, ...failure, message: error.message })}\n`);
      process.exitCode = 1;
    }
  };
  advisor.command('send')
    .description('Send stdin as plain text to the advisor seat terminal with hc send')
    .action(advisorAction(scope => sendToAdvisorSeat(scope, readFileSync(0, 'utf8')), true));
  advisor.command('transcript')
    .description('Read the last lines of the advisor seat terminal with hc read; every line is redacted')
    .action(advisorAction(readAdvisorSeat));
  board.command('migrate-dependencies')
    .description('One-shot operator migration: plan the blocked-by links for the Depends on / 依赖 lines of the open sub-issues of one parent and the tier labels, with no write; --write applies the plan (takes --parent and --json)')
    .option('--write', 'Apply the plan: create the planned labels and blocked-by links (requires --plan)')
    .option('--plan <digest>', 'The plan digest that the checked run without --write printed')
    .action((_options: MigrateDependenciesOptions, command: Command) => {
      const options = command.optsWithGlobals<MigrateDependenciesOptions>();
      try {
        const outcome = runDependencyMigration({ repo_root: process.cwd(), parent: parentNumber(options) }, { write: options.write === true, plan: options.plan });
        if (options.json === true) process.stdout.write(`${JSON.stringify(outcome)}\n`);
        else process.stdout.write(outcome.kind === 'repo-harness.dependency-migration-plan' ? renderDependencyMigrationPlan(outcome) : migrationText(outcome));
      } catch (error) {
        if (!(error instanceof DependencyMigrationError || error instanceof BoardCollectError)) throw error;
        const done = error instanceof DependencyMigrationError ? { code: error.code, labels: error.labels, edges: error.edges } : {};
        process.stderr.write(`${JSON.stringify({ ok: false, error: error.name, ...done, message: error.message })}\n`);
        process.exitCode = 1;
      }
    });
  return board;
}

/** The resident loop. A failed board read or hc check ends it with exit 1; doctor then reports the watcher stopped. */
async function watchAttention(options: AttentionOptions, host: BoardHostPortsV1, attentionHost: AttentionHostPortsV1): Promise<void> {
  try {
    const parent = parentNumber(options);
    const repositoryId = serviceTerminalRepository(parent, attentionHost);
    const input = {
      parent, deliver: options.deliver === true, log_path: attentionLogPath(repositoryId, parent),
      collect: () => collectBoard({ repo_root: process.cwd(), parent, host }), host: attentionHost,
    };
    for (;;) await runAttentionWindow(input);
  } catch (error) {
    if (!(error instanceof BoardCollectError || error instanceof BoardSourceError || error instanceof AttentionWatchError)) throw error;
    process.stderr.write(`${JSON.stringify({ ok: false, error: error.name, message: error.message })}\n`);
    process.exitCode = 1;
  }
}
