import { Command } from 'commander';
import { CLAUDE_BUILTIN_AGENT_TYPES, buildSeatLaunch, type SeatLaunchV1 } from '../../core/operator/seat-launch';
import { SEAT_IDS, decodeSeatsConfig, type SeatId } from '../../core/operator/seats-settings';
import { readGlobalConfiguration } from '../../effects/configuration/global-configuration';
import { ClaudeAgentTypesError, claudeHostAgentTypes } from '../../effects/terminal/claude-agent-types';
import { MANAGED_AGENTS } from '../../effects/terminal/task-role-profiles';

class SeatsCommandError extends Error {
  constructor(readonly code: 'seat_unknown' | 'config_invalid', message: string) {
    super(message);
  }
}

export function seatLaunch(seat: string, env: NodeJS.ProcessEnv = process.env): SeatLaunchV1 {
  if (!SEAT_IDS.includes(seat as SeatId)) throw new SeatsCommandError('seat_unknown', `Unknown seat ${seat}. Use one of: ${SEAT_IDS.join(', ')}.`);
  let config: Record<string, unknown>;
  try { config = readGlobalConfiguration(env).config; } catch (error) { throw new SeatsCommandError('config_invalid', (error as Error).message); }
  let seats;
  try { seats = decodeSeatsConfig(config.seats); } catch { throw new SeatsCommandError('config_invalid', 'The seats section of the repo-harness configuration is not valid.'); }
  const id = seat as SeatId;
  const agentTypes = seats[id].runtime === 'claude' && seats[id].fleet.length > 0
    ? [...MANAGED_AGENTS, ...CLAUDE_BUILTIN_AGENT_TYPES, ...claudeHostAgentTypes(env)]
    : [];
  return buildSeatLaunch(id, seats[id], config.seats === undefined ? 'defaults' : 'seats', agentTypes);
}

export function buildSeatsCommand(): Command {
  const seats = new Command('seats').description('Seat launch commands for Herdr panes');
  seats
    .command('argv')
    .description('Print the argv that starts a seat, from the seats section of ~/.repo-harness/config.json')
    .argument('<seat>', SEAT_IDS.join('|'))
    .option('--json', 'Print the argv, the seat brief, the source and the limits as JSON')
    .action((seat: string, options: { json?: boolean }) => {
      let launch: SeatLaunchV1;
      try {
        launch = seatLaunch(seat);
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
    });
  return seats;
}
