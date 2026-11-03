import { Command } from 'commander';
import { evaluateBoardAttention, type BoardAttentionV1 } from '../../core/board/attention';
import type { BoardHostPortsV1 } from '../../core/board/board';
import { BoardSourceError } from '../../core/board/source';
import { BoardCollectError, collectBoard } from '../../effects/board/collect';
import { renderDependencyMigrationPlan } from '../../core/board/dependency-migration';
import { applyDependencyMigration, DependencyMigrationError, planDependencyMigration, type DependencyMigrationResultV1 } from '../../effects/board/dependency-migration';

interface BoardOptions {
  readonly parent?: string;
  readonly json?: boolean;
}

interface MigrateDependenciesOptions extends BoardOptions {
  readonly write?: boolean;
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
      if (!(error instanceof BoardCollectError || error instanceof BoardSourceError)) throw error;
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
export function buildBoardCommand(host: BoardHostPortsV1): Command {
  const board = new Command('board')
    .description('Read the board of one parent issue: sub-issues, pull requests, plan block and hc seat terminals')
    .option('--parent <number>', 'Parent issue number')
    .option('--json', 'Output JSON: the repo-harness.board document, or with attention the repo-harness.board-attention document')
    .action(guarded((options: BoardOptions) => {
      if (options.json !== true) throw new BoardCollectError('board prints JSON only; pass --json');
      process.stdout.write(`${JSON.stringify(collectBoard({ repo_root: process.cwd(), parent: parentNumber(options), host }))}\n`);
    }));
  board.command('attention')
    .description('Run the attention rules on the board of one parent issue (takes the board options --parent and --json)')
    .action((_options: BoardOptions, command: Command) => guarded((options: BoardOptions) => {
      const attention = evaluateBoardAttention(collectBoard({ repo_root: process.cwd(), parent: parentNumber(options), host }));
      process.stdout.write(options.json === true ? `${JSON.stringify(attention)}\n` : attentionText(attention));
    })(command.optsWithGlobals<BoardOptions>()));
  board.command('migrate-dependencies')
    .description('One-shot operator migration: plan the blocked-by links for the Depends on / 依赖 lines of the open sub-issues of one parent and the tier labels, with no write; --write applies the plan (takes --parent and --json)')
    .option('--write', 'Apply the plan: create the planned labels and blocked-by links')
    .action((_options: MigrateDependenciesOptions, command: Command) => {
      const options = command.optsWithGlobals<MigrateDependenciesOptions>();
      try {
        const input = { repo_root: process.cwd(), parent: parentNumber(options) };
        const plan = planDependencyMigration(input);
        if (options.write !== true) {
          process.stdout.write(options.json === true ? `${JSON.stringify(plan)}\n` : renderDependencyMigrationPlan(plan));
          return;
        }
        const result = applyDependencyMigration(input, plan);
        process.stdout.write(options.json === true ? `${JSON.stringify(result)}\n` : migrationText(result));
      } catch (error) {
        if (!(error instanceof DependencyMigrationError || error instanceof BoardCollectError)) throw error;
        const done = error instanceof DependencyMigrationError ? { code: error.code, labels: error.labels, edges: error.edges } : {};
        process.stderr.write(`${JSON.stringify({ ok: false, error: error.name, ...done, message: error.message })}\n`);
        process.exitCode = 1;
      }
    });
  return board;
}
