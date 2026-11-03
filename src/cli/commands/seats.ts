import { Command } from 'commander';
import { CLAUDE_BUILTIN_AGENT_TYPES, buildSeatLaunch, type SeatLaunchV1 } from '../../core/operator/seat-launch';
import { SEAT_IDS, decodeSeatsConfig, type SeatId } from '../../core/operator/seats-settings';
import { readGlobalConfiguration } from '../../effects/configuration/global-configuration';
import { ClaudeAgentTypesError, claudeHostAgentTypes } from '../../effects/operator/claude-agent-types';
import { RH_LABEL, hcLabelPairs } from '../../effects/terminal/herdr-core';
import { MANAGED_AGENTS } from '../../effects/terminal/task-role-profiles';

class SeatsCommandError extends Error {
  constructor(readonly code: 'seat_unknown' | 'config_invalid' | 'label_value_invalid' | 'repository_id_required', message: string) {
    super(message);
  }
}

/** The dispatch values of the seat labels. Each is a positive decimal integer. */
export interface SeatLabelInput {
  readonly repositoryId?: string;
  readonly issue?: string;
  readonly pr?: string;
  readonly parent?: string;
}

const POSITIVE = /^[1-9][0-9]*$/u;

/** The `hc label` pairs that the board reads (#1505). The GitHub numeric repository id identifies the repository. */
function seatLabels(seat: SeatId, input: SeatLabelInput): string[] {
  const { repositoryId, ...dispatch } = input;
  for (const [name, value] of Object.entries(input)) {
    if (value !== undefined && !POSITIVE.test(value)) throw new SeatsCommandError('label_value_invalid', `--${name === 'repositoryId' ? 'repository-id' : name} must be a positive decimal integer.`);
  }
  if (repositoryId === undefined) {
    if (Object.values(dispatch).some(value => value !== undefined)) throw new SeatsCommandError('repository_id_required', '--issue, --pr and --parent need --repository-id.');
    return [];
  }
  return hcLabelPairs({
    [RH_LABEL.seat]: seat,
    [RH_LABEL.repository]: repositoryId,
    ...(dispatch.issue === undefined ? {} : { [RH_LABEL.issue]: dispatch.issue }),
    ...(dispatch.pr === undefined ? {} : { [RH_LABEL.pr]: dispatch.pr }),
    ...(dispatch.parent === undefined ? {} : { [RH_LABEL.parent]: dispatch.parent }),
  });
}

export function seatLaunch(seat: string, labels: SeatLabelInput = {}, env: NodeJS.ProcessEnv = process.env): SeatLaunchV1 & { readonly labels: readonly string[] } {
  if (!SEAT_IDS.includes(seat as SeatId)) throw new SeatsCommandError('seat_unknown', `Unknown seat ${seat}. Use one of: ${SEAT_IDS.join(', ')}.`);
  let config: Record<string, unknown>;
  try { config = readGlobalConfiguration(env).config; } catch (error) { throw new SeatsCommandError('config_invalid', (error as Error).message); }
  let seats;
  try { seats = decodeSeatsConfig(config.seats); } catch { throw new SeatsCommandError('config_invalid', 'The seats section of the repo-harness configuration is not valid.'); }
  const id = seat as SeatId;
  const pairs = seatLabels(id, labels);
  const agentTypes = seats[id].runtime === 'claude' && seats[id].fleet.length > 0
    ? [...MANAGED_AGENTS, ...CLAUDE_BUILTIN_AGENT_TYPES, ...claudeHostAgentTypes(env)]
    : [];
  return { ...buildSeatLaunch(id, seats[id], config.seats === undefined ? 'defaults' : 'seats', agentTypes), labels: pairs };
}

export function buildSeatsCommand(): Command {
  const seats = new Command('seats').description('Seat launch commands for Herdr panes');
  seats
    .command('argv')
    .description('Print the argv that starts a seat, from the seats section of ~/.repo-harness/config.json')
    .argument('<seat>', SEAT_IDS.join('|'))
    .option('--repository-id <id>', 'GitHub numeric repository id; adds the seat labels for `hc label`')
    .option('--issue <n>', 'Issue number for the seat labels')
    .option('--pr <n>', 'PR number for the seat labels')
    .option('--parent <n>', 'Parent issue number for the seat labels')
    .option('--json', 'Print the argv, the seat brief, the source, the limits and the labels as JSON')
    .action((seat: string, options: SeatLabelInput & { json?: boolean }) => {
      let launch: ReturnType<typeof seatLaunch>;
      try {
        launch = seatLaunch(seat, { repositoryId: options.repositoryId, issue: options.issue, pr: options.pr, parent: options.parent });
      } catch (error) {
        const code = error instanceof SeatsCommandError || error instanceof ClaudeAgentTypesError ? error.code : 'seat_launch_failed';
        process.stderr.write(`${JSON.stringify({ ok: false, error: code, message: (error as Error).message })}\n`);
        process.exitCode = 1;
        return;
      }
      if (options.json === true) {
        process.stdout.write(`${JSON.stringify(launch, null, 2)}\n`);
        return;
      }
      // stdout is the argv alone, so `--argv "$(repo-harness seats argv <seat>)"` takes it as is.
      process.stdout.write(`${JSON.stringify(launch.argv)}\n`);
      process.stderr.write(`source: ${launch.source}\n`);
      for (const limit of launch.limits) {
        const note = limit.level === 'instructions_only' ? ' (written into the launch instructions only)' : '';
        process.stderr.write(`limit ${limit.subject}: ${limit.level}${note}\n`);
      }
      if (launch.labels.length > 0) process.stderr.write(`labels: ${launch.labels.join(' ')}\n`);
    });
  return seats;
}
