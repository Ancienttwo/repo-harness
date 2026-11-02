import { Command } from 'commander';
import { evaluateBoardAttention, type BoardAttentionV1 } from '../../core/board/attention';
import { BoardSourceError } from '../../core/board/source';
import { BoardCollectError, collectBoard } from '../../effects/board/collect';

interface BoardOptions {
  readonly parent?: string;
  readonly json?: boolean;
}

function parentNumber(options: BoardOptions): number {
  if (options.parent === undefined || !/^[1-9][0-9]*$/u.test(options.parent)) throw new BoardCollectError('--parent <issue number> is required');
  return Number(options.parent);
}

function collect(options: BoardOptions) {
  return collectBoard({ repo_root: process.cwd(), parent: parentNumber(options) });
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

function attentionText(attention: BoardAttentionV1): string {
  const lines = attention.findings.map(finding => `${finding.rule} ${finding.route}: ${finding.message}`);
  if (lines.length === 0) lines.push(`no attention findings for #${attention.parent}`);
  for (const entry of attention.unevaluated) lines.push(`${entry.rule} not evaluated: ${entry.reason}${entry.subject === null ? '' : ` (${entry.subject})`}`);
  return `${lines.join('\n')}\n`;
}

/**
 * Commander checks the mandatory options of every ancestor, so `--parent` on
 * `board` would also bind `board attention`; both commands check it themselves.
 */
export function buildBoardCommand(): Command {
  const board = new Command('board')
    .description('Read the board of one parent issue: sub-issues, pull requests, plan block and hc seat terminals')
    .option('--parent <number>', 'Parent issue number')
    .option('--json', 'Output the repo-harness.board document (the only format)')
    .action(guarded((options: BoardOptions) => {
      if (options.json !== true) throw new BoardCollectError('board prints JSON only; pass --json');
      process.stdout.write(`${JSON.stringify(collect(options))}\n`);
    }));
  board.command('attention')
    .description('Run the attention rules on the board of one parent issue')
    .option('--parent <number>', 'Parent issue number')
    .option('--json', 'Output the repo-harness.board-attention document')
    .action(guarded((options: BoardOptions) => {
      const attention = evaluateBoardAttention(collect(options));
      process.stdout.write(options.json === true ? `${JSON.stringify(attention)}\n` : attentionText(attention));
    }));
  return board;
}
