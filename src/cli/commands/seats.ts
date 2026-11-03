import { Command } from 'commander';
import { dirname } from 'path';
import { CLAUDE_BUILTIN_AGENT_TYPES, SeatPaneNameError, buildSeatLaunch, seatPaneName, seatTabName, type SeatLaunchV1 } from '../../core/operator/seat-launch';
import { SEAT_IDS, decodeSeatsConfig, type SeatId } from '../../core/operator/seats-settings';
import { readGlobalConfiguration } from '../../effects/configuration/global-configuration';
import { resolveGitCommonDirectory } from '../../effects/git/common-directory';
import { ClaudeAgentTypesError, claudeHostAgentTypes } from '../../effects/operator/claude-agent-types';
import { RepoHarnessRegistryStrictError, canonicalRepoPath, readRepoHarnessRegistryStrictSnapshot, repoCheckoutProbeEnv } from '../../effects/repo-registry';
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
  /** Pane name inputs only (#1544): the release item digits and the slice word. */
  readonly release?: string;
  readonly qualifier?: string;
}

const POSITIVE = /^[1-9][0-9]*$/u;

/** The `hc label` pairs that the board reads (#1505). The GitHub numeric repository id identifies the repository. */
function seatLabels(seat: SeatId, input: SeatLabelInput): string[] {
  const { repositoryId, release, qualifier, ...dispatch } = input;
  for (const [name, value] of Object.entries({ repositoryId, ...dispatch })) {
    if (value !== undefined && !POSITIVE.test(value)) throw new SeatsCommandError('label_value_invalid', `--${name === 'repositoryId' ? 'repository-id' : name} must be a positive decimal integer.`);
  }
  if (repositoryId === undefined) {
    if ([...Object.values(dispatch), release, qualifier].some(value => value !== undefined)) {
      throw new SeatsCommandError('repository_id_required', '--issue, --pr, --parent, --release and --qualifier need --repository-id.');
    }
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

/** The registry entry of the primary checkout of `cwd` holds the pane prefix; a linked worktree resolves to its primary root. */
function panePrefix(cwd: string, env: NodeJS.ProcessEnv): string {
  let root: string;
  try {
    root = canonicalRepoPath(dirname(resolveGitCommonDirectory(cwd, undefined, undefined, repoCheckoutProbeEnv(env))));
  } catch {
    throw new SeatPaneNameError(`Pane name: ${cwd} is not in a git repository, so its registry entry is unknown.`);
  }
  const registry = readRepoHarnessRegistryStrictSnapshot({ env });
  const prefix = registry.repos.find(repo => repo.path === root)?.panePrefix;
  if (prefix === undefined) throw new SeatPaneNameError(`Pane name: set panePrefix for ${root} in ${registry.registryPath}.`);
  return prefix;
}

export function seatLaunch(seat: string, labels: SeatLabelInput = {}, env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()): SeatLaunchV1 & {
  readonly labels: readonly string[]; readonly name: string | null; readonly tab: string | null;
} {
  if (!SEAT_IDS.includes(seat as SeatId)) throw new SeatsCommandError('seat_unknown', `Unknown seat ${seat}. Use one of: ${SEAT_IDS.join(', ')}.`);
  let config: Record<string, unknown>;
  try { config = readGlobalConfiguration(env).config; } catch (error) { throw new SeatsCommandError('config_invalid', (error as Error).message); }
  let seats;
  try { seats = decodeSeatsConfig(config.seats); } catch { throw new SeatsCommandError('config_invalid', 'The seats section of the repo-harness configuration is not valid.'); }
  const id = seat as SeatId;
  const pairs = seatLabels(id, labels);
  // The pane name needs the registry prefix, so it comes only with the seat labels.
  const name = labels.repositoryId === undefined ? null : seatPaneName({
    prefix: panePrefix(cwd, env), seat: id, issue: id === 'worker' ? labels.issue : undefined, release: labels.release, qualifier: labels.qualifier,
  });
  const tab = labels.repositoryId === undefined ? null : seatTabName(id, labels.parent);
  const agentTypes = seats[id].runtime === 'claude' && seats[id].fleet.length > 0
    ? [...MANAGED_AGENTS, ...CLAUDE_BUILTIN_AGENT_TYPES, ...claudeHostAgentTypes(env)]
    : [];
  return { ...buildSeatLaunch(id, seats[id], config.seats === undefined ? 'defaults' : 'seats', agentTypes, name ?? undefined), labels: pairs, name, tab };
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
    .option('--parent <n>', 'Parent issue number for the seat labels and the tab name')
    .option('--release <digits>', 'Release item of a worker pane name, for example 0252 for rh-w-rel0252')
    .option('--qualifier <word>', 'Slice word of a worker pane name when one issue has two live worker panes')
    .option('--json', 'Print the argv, the seat brief, the source, the limits, the labels, the pane name and the tab name as JSON')
    .action((seat: string, options: SeatLabelInput & { json?: boolean }) => {
      let launch: ReturnType<typeof seatLaunch>;
      try {
        launch = seatLaunch(seat, {
          repositoryId: options.repositoryId, issue: options.issue, pr: options.pr, parent: options.parent, release: options.release, qualifier: options.qualifier,
        });
      } catch (error) {
        const code = error instanceof SeatsCommandError || error instanceof ClaudeAgentTypesError || error instanceof SeatPaneNameError
          || error instanceof RepoHarnessRegistryStrictError ? error.code : 'seat_launch_failed';
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
      if (launch.name !== null) process.stderr.write(`name: ${launch.name}\ntab: ${launch.tab}\n`);
    });
  return seats;
}
