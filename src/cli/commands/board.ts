import { Command } from 'commander';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { AdvisorSeatError, advisorSeatSendFailure, readAdvisorSeat, sendToAdvisorSeat } from '../../core/board/advisor-seat';
import { AttentionWatchError, attentionLogPath, runAttentionWindow, serviceTerminalRepository, startAttentionWatch } from '../../effects/board/attention-watch';
import { evaluateBoardAttention, type BoardAttentionV1 } from '../../core/board/attention';
import type { AttentionHostPortsV1 } from '../../core/board/attention-delivery';
import type { BoardHostPortsV1 } from '../../core/board/board';
import { BoardSourceError } from '../../core/board/source';
import { BoardCollectError, collectBoard, collectBoardThrough, readRepositoryId } from '../../effects/board/collect';
import { createKeyedSources } from '../../effects/board/keyed-sources';
import { renderDependencyMigrationPlan } from '../../core/board/dependency-migration';
import { DependencyMigrationError, runDependencyMigration, type DependencyMigrationResultV1 } from '../../effects/board/dependency-migration';
import { BoardParentsError, collectBoardParents } from '../../effects/board/parents';
import { BoardSeatsError, collectBoardSeats } from '../../effects/board/seats';
import { DispatchError, type DispatchPlanV1 } from '../../core/board/dispatch';
import { runDispatch } from '../../effects/board/dispatch';
import { runReview, type ReviewObserver, type ReviewResultV1 } from '../../effects/board/review';
import { runBoardMerge, type BoardMergeResultV1 } from '../../effects/board/merge';
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
  readonly review?: boolean;
  readonly space?: string;
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

function reviewText(result: ReviewResultV1): string {
  const started = new Set(result.started.map(entry => `${entry.pr}:${entry.seat}`));
  const refused = new Map(result.refused.map(entry => [entry.pr, entry.reason]));
  const lines = result.decisions.map(decision => decision.action === 'skip'
    ? `PR #${decision.pr} skipped (${decision.reason}): ${decision.detail}`
    : refused.has(decision.pr) ? `PR #${decision.pr} refused: ${refused.get(decision.pr)}`
      : `PR #${decision.pr} ${decision.seats.map(({ seat, delta_from }) => `${started.has(`${decision.pr}:${seat}`) ? 'started' : 'ready'} on ${seat} (${delta_from === null ? 'full review' : `delta review since ${delta_from}`})`).join('; ')}`);
  return `${lines.join('\n')}\n`;
}

function mergeText(result: BoardMergeResultV1, requested: number | null, dryRun: boolean): string {
  const lines = result.decisions.map(decision => (decision.eligible ? `PR #${decision.pr} eligible` : `PR #${decision.pr} not eligible (${decision.reason}): ${decision.detail}`));
  if (requested !== null && !result.decisions.some(decision => decision.pr === requested)) lines.push(`PR #${requested} is not an open pull request of the board`);
  if (result.target === null) lines.push('no eligible pull request selected; nothing merged');
  else if (dryRun) lines.push(`PR #${result.target} would merge`);
  else lines.push(JSON.stringify(result.merge));
  return `${lines.join('\n')}\n`;
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
    .option('--review', 'With --watch --deliver: run `board review` once per window and report each start or refusal (needs --space)')
    .option('--space <id>', 'With --review: the Herdr space that receives the review tabs')
    .action(async (_options: AttentionOptions, command: Command) => {
      const options = command.optsWithGlobals<AttentionOptions>();
      if (options.watch === true) return watchAttention(options, host, attentionHost);
      guarded((options: AttentionOptions) => {
        if (options.deliver === true) throw new AttentionWatchError('--deliver needs --watch');
        if (options.review === true) throw new AttentionWatchError('--review needs --watch');
        const attention = evaluateBoardAttention(collectBoard({ repo_root: process.cwd(), parent: parentNumber(options), host }));
        process.stdout.write(options.json === true ? `${JSON.stringify(attention)}\n` : attentionText(attention));
      })(options);
    });
  attention.command('start')
    .description('Start the resident watcher (--watch --deliver) of one parent issue in a new hc terminal, unless one is live (takes --parent)')
    .option('--review', 'Start the watcher with --review (needs --space)')
    .option('--space <id>', 'With --review: the Herdr space that receives the review tabs')
    .action((_options: AttentionOptions, command: Command) => guarded((options: AttentionOptions) => {
      if (options.review === true && options.space === undefined) throw new AttentionWatchError('--review needs --space');
      const parent = parentNumber(options);
      const result = startAttentionWatch({ parent, repository_id: readRepositoryId({ repo_root: process.cwd() }), repo_root: process.cwd(), cli: [process.execPath, CLI_ENTRY], host: attentionHost, ...(options.review === true ? { review_space: options.space } : {}) });
      process.stdout.write(`${result.started ? 'Started' : 'Already live:'} the attention watcher of #${parent} in hc terminal ${result.address}.\n`);
    })(command.optsWithGlobals<AttentionOptions>()));
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
  board.command('review')
    .description('Start the review seat of each ready, green pull request with no start marker for its head (takes --parent): marker comment and review tab in the writer worktree')
    .requiredOption('--space <id>', 'Herdr space that receives the review tabs')
    .option('--pr <number>', 'Review this pull request only')
    .option('--dry-run', 'Print the decision for each pull request and start nothing')
    .action(async (options: { space: string; pr?: string; dryRun?: boolean }, command: Command) => {
      try {
        if (options.pr !== undefined && !/^[1-9][0-9]*$/u.test(options.pr)) throw new BoardCollectError('--pr must be a pull request number');
        const result = await runReview({
          repo_root: process.cwd(), parent: parentNumber(command.optsWithGlobals<BoardOptions>()), space: options.space, host, dry_run: options.dryRun === true,
          ...(options.pr === undefined ? {} : { pr: Number(options.pr) }),
          launch: (seat, labels, cwd) => seatLaunch(seat, labels, process.env, cwd),
        });
        process.stdout.write(reviewText(result));
      } catch (error) {
        if (!(error instanceof BoardCollectError || error instanceof BoardSourceError)) throw error;
        process.stderr.write(`${JSON.stringify({ ok: false, error: error.name, message: error.message })}\n`);
        process.exitCode = 1;
      }
    });
  board.command('merge')
    .description('Merge one eligible pull request of the parent with publication merge (takes --parent): PASS record for the head, Required / CI, readiness, plan order and no hold. Start it from the orchestrator seat; exit codes follow publication merge, 4 when none is eligible')
    .option('--pr <number>', 'The pull request to merge; default: the first eligible one in plan merge order')
    .option('--dry-run', 'Print the decision for each pull request and merge nothing')
    .action((options: { pr?: string; dryRun?: boolean }, command: Command) => {
      try {
        if (options.pr !== undefined && !/^[1-9][0-9]*$/u.test(options.pr)) throw new BoardCollectError('--pr must be a pull request number');
        const pr = options.pr === undefined ? null : Number(options.pr);
        const result = runBoardMerge({ repo_root: process.cwd(), parent: parentNumber(command.optsWithGlobals<BoardOptions>()), host, pr, dry_run: options.dryRun === true });
        process.stdout.write(mergeText(result, pr, options.dryRun === true));
        process.exitCode = result.exit_code;
      } catch (error) {
        if (!(error instanceof BoardCollectError || error instanceof BoardSourceError)) throw error;
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

function reviewRunner(options: AttentionOptions, parent: number, host: BoardHostPortsV1): (observe: ReviewObserver) => Promise<unknown> {
  if (options.deliver !== true) throw new AttentionWatchError('--review needs --deliver');
  const space = options.space;
  if (space === undefined) throw new AttentionWatchError('--review needs --space');
  return observe => runReview({ repo_root: process.cwd(), parent, space, host, dry_run: false, observe, launch: (seat, labels, cwd) => seatLaunch(seat, labels, process.env, cwd) });
}

/** The resident loop. A provider 5xx or a gh call with no exit status skips one window; other board read or hc failures end it with exit 1. */
async function watchAttention(options: AttentionOptions, host: BoardHostPortsV1, attentionHost: AttentionHostPortsV1): Promise<void> {
  try {
    const parent = parentNumber(options);
    const repositoryId = serviceTerminalRepository(parent, attentionHost);
    const review = options.review === true ? reviewRunner(options, parent, host) : undefined;
    // The watcher keeps one keyed source store for its process lifetime; its review run reads its own board through a fresh one.
    const sources = createKeyedSources();
    const input = {
      parent, deliver: options.deliver === true, review, log_path: attentionLogPath(repositoryId, parent),
      collect: () => collectBoardThrough({ repo_root: process.cwd(), parent, host }, sources), host: attentionHost,
    };
    for (;;) await runAttentionWindow(input);
  } catch (error) {
    if (!(error instanceof BoardCollectError || error instanceof BoardSourceError || error instanceof AttentionWatchError)) throw error;
    process.stderr.write(`${JSON.stringify({ ok: false, error: error.name, message: error.message })}\n`);
    process.exitCode = 1;
  }
}
