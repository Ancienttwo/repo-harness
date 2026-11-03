import { Command } from 'commander';
import { fileURLToPath } from 'url';
import { AttentionWatchError, attentionLogPath, runAttentionWindow, serviceTerminalRepository, startAttentionWatch } from '../../effects/board/attention-watch';
import { evaluateBoardAttention, type BoardAttentionV1 } from '../../core/board/attention';
import type { AttentionHostPortsV1 } from '../../core/board/attention-delivery';
import type { BoardHostPortsV1 } from '../../core/board/board';
import { BoardSourceError } from '../../core/board/source';
import { BoardCollectError, collectBoard, readRepositoryId } from '../../effects/board/collect';

interface BoardOptions {
  readonly parent?: string;
  readonly json?: boolean;
}

interface AttentionOptions extends BoardOptions {
  readonly watch?: boolean;
  readonly deliver?: boolean;
}

const CLI_ENTRY = fileURLToPath(new URL('../index.ts', import.meta.url));

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
    .description('Read the board of one parent issue: sub-issues, pull requests, plan block and hc seat terminals')
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
