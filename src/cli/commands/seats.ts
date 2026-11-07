import { Command } from 'commander';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { CLAUDE_BUILTIN_AGENT_TYPES, SeatPaneNameError, buildSeatLaunch, seatPaneName, seatTabName, type SeatLaunchV1 } from '../../core/board/seat-launch';
import { SeatsConfigMigrationRequiredError, SEAT_IDS, decodeSeatsConfig, isWorkerSeat, type SeatId } from '../../core/board/seats-settings';
import { claudeReserved, effectiveSeatConfig, seatAccount, seatAccountQuotas } from '../../core/board/seat-routing';
import { classifyQuotaReading } from '../../core/board/quota';
import { readClaudeQuota, readCodexQuota } from '../../effects/board/quota';
import { version as PACKAGE_VERSION } from '../../../package.json';
import { readGlobalConfiguration } from '../../effects/configuration/global-configuration';
import { resolveGitCommonDirectory } from '../../effects/git/common-directory';
import { ClaudeAgentTypesError, claudeHostAgentTypes } from '../../effects/board/claude-agent-types';
import { RepoHarnessRegistryStrictError, canonicalRepoPath, readRepoHarnessRegistryStrictSnapshot, repoCheckoutProbeEnv } from '../../effects/repo-registry';
import { HerdrCoreError, RH_LABEL, hcLabel, hcLabelPairs, type HcLabels } from '../../effects/terminal/herdr-core';
import { MANAGED_AGENTS } from '../../effects/terminal/task-role-profiles';

const CLI_ENTRY = fileURLToPath(new URL('../index.ts', import.meta.url));

class SeatsCommandError extends Error {
  constructor(readonly code: 'seat_unknown' | 'seat_not_configured' | 'seat_quota_exhausted' | 'seat_quota_reserved' | 'config_invalid' | 'label_value_invalid' | 'repository_id_required' | 'terminal_unknown', message: string) {
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

/** The seat labels that the board reads (#1505), or none without `--repository-id`. The GitHub numeric repository id identifies the repository. */
function seatLabels(seat: SeatId, input: SeatLabelInput): HcLabels | undefined {
  const { repositoryId, release, qualifier, ...dispatch } = input;
  for (const [name, value] of Object.entries({ repositoryId, ...dispatch })) {
    if (value !== undefined && !POSITIVE.test(value)) throw new SeatsCommandError('label_value_invalid', `--${name === 'repositoryId' ? 'repository-id' : name} must be a positive decimal integer.`);
  }
  if ((seat === 'gatekeeper' || seat === 'reviewer') && (input.pr === undefined || input.issue !== undefined || release !== undefined)) {
    throw new SeatPaneNameError(`The ${seat} seat needs --pr and takes no --issue or --release.`);
  }
  if (repositoryId === undefined) {
    if ((seat === 'gatekeeper' || seat === 'reviewer') && input.parent === undefined && qualifier === undefined) return undefined;
    if ([...Object.values(dispatch), release, qualifier].some(value => value !== undefined)) {
      throw new SeatsCommandError('repository_id_required', '--issue, --pr, --parent, --release and --qualifier need --repository-id.');
    }
    return undefined;
  }
  return {
    [RH_LABEL.seat]: seat,
    [RH_LABEL.repository]: repositoryId,
    ...(dispatch.issue === undefined ? {} : { [RH_LABEL.issue]: dispatch.issue }),
    ...(dispatch.pr === undefined ? {} : { [RH_LABEL.pr]: dispatch.pr }),
    ...(dispatch.parent === undefined ? {} : { [RH_LABEL.parent]: dispatch.parent }),
  };
}

function seatId(seat: string): SeatId {
  if (!SEAT_IDS.includes(seat as SeatId)) throw new SeatsCommandError('seat_unknown', `Unknown seat ${seat}. Use one of: ${SEAT_IDS.join(', ')}.`);
  return seat as SeatId;
}

/**
 * The seat argv labels its own terminal before the agent starts (#1695). `herdr-app do` runs the argv in the new hc
 * terminal, so `seats label` labels `HC_TERMINAL_ID`, then `exec` replaces the shell with the agent. When the label
 * fails, the shell stops before the agent starts. Each token in the script is a seat id or a checked positive integer.
 */
function selfLabelingArgv(seat: SeatId, input: SeatLabelInput, agent: readonly string[]): string[] {
  const flags = ([['--repository-id', input.repositoryId], ['--issue', input.issue], ['--pr', input.pr], ['--parent', input.parent]] as const)
    .flatMap(([flag, value]) => value === undefined ? [] : [flag, value]);
  return ['/bin/sh', '-c', `"$0" "$1" seats label ${[seat, ...flags].join(' ')} && shift && exec "$@"`, process.execPath, CLI_ENTRY, ...agent];
}

/** `seats label`: set the seat labels on the calling hc terminal. The seat argv runs it before the agent starts. */
function labelOwnTerminal(seat: string, input: SeatLabelInput, env: NodeJS.ProcessEnv = process.env): void {
  const labels = seatLabels(seatId(seat), input);
  if (labels === undefined) throw new SeatsCommandError('repository_id_required', 'seats label needs --repository-id.');
  const terminal = env.HC_TERMINAL_ID;
  if (!terminal) throw new SeatsCommandError('terminal_unknown', 'HC_TERMINAL_ID is not set: start the seat argv with herdr-app do tab.new or pane.split.');
  hcLabel(terminal, labels, { env });
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

export async function seatLaunch(seat: string, labels: SeatLabelInput = {}, env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()): Promise<SeatLaunchV1 & {
  readonly labels: readonly string[]; readonly name: string | null; readonly tab: string | null;
}> {
  const id = seatId(seat);
  let config: Record<string, unknown>;
  try { config = readGlobalConfiguration(env).config; } catch (error) { throw new SeatsCommandError('config_invalid', (error as Error).message); }
  let seats;
  try { seats = decodeSeatsConfig(config.seats); } catch (error) {
    if (error instanceof SeatsConfigMigrationRequiredError) throw error;
    throw new SeatsCommandError('config_invalid', 'The seats section of the repo-harness configuration is not valid.');
  }
  const configured = seats[id];
  if (configured === null) throw new SeatsCommandError('seat_not_configured', `The ${id} seat is not configured. Configure it in the seats section before launch.`);
  const account = seatAccount(configured);
  const reading = account === 'claude' ? readClaudeQuota(env) : account === 'chatgpt' ? await readCodexQuota(env, PACKAGE_VERSION) : null;
  const readings = reading === null ? [] : [reading];
  if (id === 'worker-light' && account === 'chatgpt') readings.push(readClaudeQuota(env));
  const quota = seatAccountQuotas(readings.map(reading => classifyQuotaReading(reading, Date.now())), seats.routing);
  if (id === 'worker-light' && configured.runtime !== 'pi' && claudeReserved(quota)) {
    throw new SeatsCommandError('seat_quota_reserved', 'The worker-light seat must use Pi while Claude is reserved. Use the quota routes.');
  }
  if (account !== null && quota[account].state === 'exhausted') {
    throw new SeatsCommandError('seat_quota_exhausted', `The ${account} account is exhausted. Wait for quota before launching ${id}.`);
  }
  if (account === 'claude' && id !== 'advisor' && id !== 'orchestrator' && claudeReserved(quota)) {
    throw new SeatsCommandError('seat_quota_reserved', 'Claude is reserved for the advisor and the orchestrator. Use the quota routes.');
  }
  const effective = effectiveSeatConfig(id, seats, quota)!;
  const labelSet = seatLabels(id, labels);
  // The pane name needs the registry prefix, so it comes only with the seat labels.
  const name = labels.repositoryId === undefined ? null : seatPaneName({
    prefix: panePrefix(cwd, env), seat: id, issue: isWorkerSeat(id) ? labels.issue : undefined,
    pr: id === 'gatekeeper' || id === 'reviewer' ? labels.pr : undefined, release: labels.release, qualifier: labels.qualifier,
  });
  const tab = labels.repositoryId === undefined ? null : seatTabName(id, labels.parent);
  const agentTypes = effective.runtime === 'claude' && effective.fleet.length > 0
    ? [...MANAGED_AGENTS, ...CLAUDE_BUILTIN_AGENT_TYPES, ...claudeHostAgentTypes(env)]
    : [];
  const launch = buildSeatLaunch(id, effective, config.seats === undefined ? 'defaults' : 'seats', agentTypes, name ?? undefined);
  return {
    ...launch,
    argv: labelSet === undefined ? launch.argv : selfLabelingArgv(id, labels, launch.argv),
    labels: labelSet === undefined ? [] : hcLabelPairs(labelSet), name, tab,
  };
}

export function buildSeatsCommand(): Command {
  const seats = new Command('seats').description('Seat launch commands for Herdr panes');
  seats
    .command('argv')
    .description('Print the argv that starts a seat, from the seats section of ~/.repo-harness/config.json')
    .argument('<seat>', SEAT_IDS.join('|'))
    .option('--repository-id <id>', 'GitHub numeric repository id; the argv then labels its own terminal before the agent starts')
    .option('--issue <n>', 'Issue number for the seat labels')
    .option('--pr <n>', 'PR number for the seat labels')
    .option('--parent <n>', 'Parent issue number for the seat labels and the tab name')
    .option('--release <digits>', 'Release item of a worker pane name, for example 0252 for rh-w-rel0252')
    .option('--qualifier <word>', 'Slice word of a worker pane name when one issue has two live worker panes')
    .option('--json', 'Print the argv, the seat brief, the source, the limits, the labels, the pane name and the tab name as JSON')
    .action(async (seat: string, options: SeatLabelInput & { json?: boolean }) => {
      let launch: Awaited<ReturnType<typeof seatLaunch>>;
      try {
        launch = await seatLaunch(seat, {
          repositoryId: options.repositoryId, issue: options.issue, pr: options.pr, parent: options.parent, release: options.release, qualifier: options.qualifier,
        });
      } catch (error) {
        const code = error instanceof SeatsCommandError || error instanceof ClaudeAgentTypesError || error instanceof SeatPaneNameError
          || error instanceof RepoHarnessRegistryStrictError || error instanceof SeatsConfigMigrationRequiredError ? error.code : 'seat_launch_failed';
        process.stderr.write(`${JSON.stringify({ ok: false, error: code, message: (error as Error).message,
          ...(error instanceof SeatsConfigMigrationRequiredError ? { next_action: error.next_action } : {}) })}\n`);
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
  seats
    .command('label')
    .description('Set the seat labels on the calling hc terminal; the seat argv runs it before the agent starts')
    .argument('<seat>', SEAT_IDS.join('|'))
    .option('--repository-id <id>', 'GitHub numeric repository id')
    .option('--issue <n>', 'Issue number')
    .option('--pr <n>', 'PR number')
    .option('--parent <n>', 'Parent issue number')
    .action((seat: string, options: SeatLabelInput) => {
      try {
        labelOwnTerminal(seat, { repositoryId: options.repositoryId, issue: options.issue, pr: options.pr, parent: options.parent });
      } catch (error) {
        if (!(error instanceof SeatsCommandError || error instanceof HerdrCoreError)) throw error;
        const code = error instanceof SeatsCommandError ? error.code : 'label_failed';
        process.stderr.write(`${JSON.stringify({ ok: false, error: code, message: `The seat did not start: ${error.message}` })}\n`);
        process.exitCode = 1;
      }
    });
  return seats;
}
