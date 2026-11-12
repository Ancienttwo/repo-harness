import { Command } from 'commander';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { CLAUDE_BUILTIN_AGENT_TYPES, SeatPaneNameError, buildSeatLaunch, seatPaneName, seatTabName, type SeatLaunchV1 } from '../../core/board/seat-launch';
import { LAUNCH_SEAT_IDS, SeatsConfigMigrationRequiredError, decodeSeatsConfig, isWorkerSeat, type LaunchSeatId, type SeatConfigV1, type SeatsConfigV1 } from '../../core/board/seats-settings';
import { claudeReserved, effectiveGatekeeper, effectiveSeatConfig, seatAccount, seatAccountQuotas, seatState, type SeatRouteV1 } from '../../core/board/seat-routing';
import { classifyQuotaReading, type QuotaAccount, type QuotaReading } from '../../core/board/quota';
import { readClaudeQuota, readCodexQuota } from '../../effects/board/quota';
import { version as PACKAGE_VERSION } from '../../../package.json';
import { readGlobalConfiguration } from '../../effects/configuration/global-configuration';
import { resolveGitCommonDirectory } from '../../effects/git/common-directory';
import { ClaudeAgentTypesError, claudeHostAgentTypes } from '../../effects/board/claude-agent-types';
import { RepoHarnessRegistryStrictError, canonicalRepoPath, readRepoHarnessRegistryStrictSnapshot, repoCheckoutProbeEnv, setRepoHarnessPanePrefix } from '../../effects/repo-registry';
import { HerdrCoreError, RH_LABEL, hcLabel, hcLabelPairs, type HcLabels } from '../../effects/terminal/herdr-core';
import { PiFleetRolesError, writePiFleetRoles } from '../../effects/board/pi-fleet-roles';
import { PiShellError, assertPiShell } from '../../effects/board/pi-shell';
import { MANAGED_AGENTS } from '../../effects/terminal/task-role-profiles';
import { SeatResetError, readSeatSession, readTranscriptUsage, runSeatReset, writeSeatResetRequest, type SeatRelaunch, type SeatResetNotify, type TranscriptUsage } from '../../effects/board/seat-reset';
import { seatResetAction, seatResetIdentity, seatResetSteps, type SeatResetIdentity } from '../../core/board/seat-reset';

const CLI_ENTRY = fileURLToPath(new URL('../index.ts', import.meta.url));

class SeatsCommandError extends Error {
  constructor(readonly code: 'seat_unknown' | 'seat_not_configured' | 'seat_quota_exhausted' | 'seat_quota_reserved' | 'config_invalid' | 'label_value_invalid' | 'repository_id_required' | 'terminal_unknown' | 'seat_identity_missing' | 'seat_session_unknown' | 'seat_context_unknown', message: string) {
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
function seatLabels(seat: LaunchSeatId, input: SeatLabelInput): HcLabels | undefined {
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

/** The gatekeeper-fallback seat is no launch target: `seats argv gatekeeper` launches it when it is the effective gatekeeper. */
function seatId(seat: string): LaunchSeatId {
  if (!LAUNCH_SEAT_IDS.includes(seat as LaunchSeatId)) throw new SeatsCommandError('seat_unknown', `Unknown seat ${seat}. Use one of: ${LAUNCH_SEAT_IDS.join(', ')}.`);
  return seat as LaunchSeatId;
}

/**
 * The seat argv labels its own terminal before the agent starts (#1695). `herdr-app do` runs the argv in the new hc
 * terminal, so `seats label` labels `HC_TERMINAL_ID`, then `exec` replaces the shell with the agent. When the label
 * fails, the shell stops before the agent starts. Each token in the script is a seat id or a checked positive integer.
 */
function selfLabelingArgv(seat: LaunchSeatId, input: SeatLabelInput, agent: readonly string[]): string[] {
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
  if (prefix === undefined) throw new SeatPaneNameError(`Pane name: run repo-harness seats prefix --repo ${root} --pane-prefix <prefix>.`);
  return prefix;
}

function plannedGatekeeper(route: SeatRouteV1): SeatConfigV1 {
  if (route.id === null) throw new SeatsCommandError('seat_quota_exhausted', `No gatekeeper seat can launch. Route ${route.line}`);
  return route.seat;
}

/**
 * The seat config that launches for `id` under the current quota, or the quota refusal. `modeKnown` is false when the
 * account of the launched seat has no fresh weekly reading (missing, unreadable or stale capture), so its mode is unknown.
 */
async function quotaCheckedSeat(id: LaunchSeatId, seats: SeatsConfigV1, configured: SeatConfigV1, env: NodeJS.ProcessEnv): Promise<{
  readonly seat: SeatConfigV1; readonly modeKnown: boolean;
}> {
  const readings: QuotaReading[] = [];
  const read = async (account: QuotaAccount | null) => {
    if (account === 'claude') readings.push(readClaudeQuota(env));
    if (account === 'chatgpt') readings.push(await readCodexQuota(env, PACKAGE_VERSION));
    return seatAccountQuotas(readings.map(reading => classifyQuotaReading(reading, Date.now())), seats.routing);
  };
  const own = seatAccount(configured);
  let quota = await read(own);
  // The fallback account is read only when the gatekeeper account is exhausted, the one state in which the fallback can launch.
  const fallback = seats['gatekeeper-fallback'];
  if (id === 'gatekeeper' && fallback !== null && own !== null && quota[own].state === 'exhausted' && seatAccount(fallback) !== own) {
    quota = await read(seatAccount(fallback));
  }
  const gatekeeper = id === 'gatekeeper' ? effectiveGatekeeper(seats, quota) : null;
  const launchedId = gatekeeper?.id === 'gatekeeper-fallback' ? 'gatekeeper-fallback' : id;
  const launched = launchedId === 'gatekeeper-fallback' ? fallback! : configured;
  const account = seatAccount(launched);
  if (account !== null && seatState(launchedId, launched, quota) === 'exhausted') {
    throw new SeatsCommandError('seat_quota_exhausted', `The ${account} account is exhausted. Wait for quota before launching ${id}.${gatekeeper === null ? '' : ` Route ${gatekeeper.line}`}`);
  }
  if (account === 'claude' && id !== 'advisor' && id !== 'orchestrator' && claudeReserved(quota)) {
    throw new SeatsCommandError('seat_quota_reserved', 'Claude is reserved for the advisor and the orchestrator. Use the quota routes.');
  }
  return { seat: gatekeeper?.id === 'gatekeeper-fallback' ? gatekeeper.seat : effectiveSeatConfig(id, seats, quota)!,
    modeKnown: account === null || quota[account].mode !== 'unknown' };
}

type SeatLaunchResult = SeatLaunchV1 & { readonly labels: readonly string[]; readonly name: string | null; readonly tab: string | null };

export async function seatLaunch(seat: string, labels: SeatLabelInput = {}, env: NodeJS.ProcessEnv = process.env, cwd = process.cwd(), planned?: SeatRouteV1): Promise<SeatLaunchResult> {
  return (await effectiveSeatLaunch(seat, labels, env, cwd, planned)).launch;
}

/**
 * The launch of a reset seat for `seats reset` (#2633): its argv, its effective model and effort, and whether the quota
 * mode that chose them is known.
 */
export async function seatResetLaunch(identity: SeatResetIdentity, env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()): Promise<SeatRelaunch> {
  const { launch, effective, modeKnown } = await effectiveSeatLaunch(identity.seat, { repositoryId: identity.repository }, env, cwd);
  return { argv: launch.argv, model: effective.model, effort: effective.effort, modeKnown };
}

/** The launch and the effective seat config that it starts; the seat reset compares the config with the session record (#2633). */
async function effectiveSeatLaunch(seat: string, labels: SeatLabelInput, env: NodeJS.ProcessEnv, cwd: string, planned?: SeatRouteV1): Promise<{
  readonly launch: SeatLaunchResult; readonly effective: SeatConfigV1; readonly modeKnown: boolean;
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
  // The board review passes the gatekeeper route that its plan checked: the launched seat is the planned one, with no second quota read.
  // The config is still read for the source of the brief and for the migration error.
  const { seat: effective, modeKnown } = id === 'gatekeeper' && planned !== undefined ? { seat: plannedGatekeeper(planned), modeKnown: true }
    : await quotaCheckedSeat(id, seats, configured, env);
  if (effective.runtime === 'pi') await assertPiShell(env, cwd);
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
  const piRoleDirectory = effective.runtime === 'pi' && effective.fleet.length > 0 ? writePiFleetRoles(effective.fleet, env) : undefined;
  const launch = buildSeatLaunch(id, effective, config.seats === undefined ? 'defaults' : 'seats', agentTypes, name ?? undefined, labels.repositoryId, piRoleDirectory);
  return { effective, modeKnown, launch: {
    ...launch,
    argv: labelSet === undefined ? launch.argv : selfLabelingArgv(id, labels, launch.argv),
    labels: labelSet === undefined ? [] : hcLabelPairs(labelSet), name, tab,
  } };
}

/**
 * `seats handoff`: an on-demand reset. It records a reset request for the current session, as the Stop hook does at
 * the threshold, so the peer's `seats reset` accepts the handoff, and returns the steps that the hook prints.
 */
export function seatHandoff(env: NodeJS.ProcessEnv = process.env, now = new Date()): string {
  const identity = seatResetIdentity(env);
  if (identity === null) {
    throw new SeatsCommandError('seat_identity_missing', 'REPO_HARNESS_SEAT and REPO_HARNESS_SEAT_REPOSITORY name no orchestrator or advisor seat: start the seat with repo-harness seats argv <seat> --repository-id <id>.');
  }
  const transcript = readSeatSession(identity)?.transcriptPath;
  if (transcript === undefined) throw new SeatsCommandError('seat_session_unknown', `The SessionStart record of the ${identity.seat} seat is missing or not valid, so the session transcript is unknown.`);
  let usage: TranscriptUsage;
  try { usage = readTranscriptUsage(transcript); } catch (error) {
    throw new SeatsCommandError('seat_context_unknown', `The transcript ${transcript} cannot be read: ${(error as Error).message}`);
  }
  const { contextTokens, bytes } = usage;
  if (contextTokens === null) throw new SeatsCommandError('seat_context_unknown', `The transcript ${transcript} has no assistant entry with a context size.`);
  const action = seatResetAction(bytes);
  writeSeatResetRequest(identity, now, { contextTokens, transcriptPath: transcript, transcriptBytes: bytes, action });
  return seatResetSteps(identity, action);
}

/** `loadNotify` comes from the composition root, only when peer-runtime is selected. */
export function buildSeatsCommand(loadNotify?: () => Promise<SeatResetNotify>): Command {
  const seats = new Command('seats').description('Seat launch commands for Herdr panes');
  seats
    .command('argv')
    .description('Print the argv that starts a seat, from the seats section of ~/.repo-harness/config.json')
    .argument('<seat>', LAUNCH_SEAT_IDS.join('|'))
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
        }, process.env, process.cwd());
      } catch (error) {
        const code = error instanceof SeatsCommandError || error instanceof ClaudeAgentTypesError || error instanceof PiFleetRolesError || error instanceof PiShellError || error instanceof SeatPaneNameError
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
    .argument('<seat>', LAUNCH_SEAT_IDS.join('|'))
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
  seats
    .command('prefix')
    .description('Set the pane prefix that labeled seat panes use for a repository')
    .requiredOption('--repo <path>', 'Adopted repository')
    .requiredOption('--pane-prefix <prefix>', 'Lowercase letter, then 1 to 5 lowercase letters or digits')
    .action((options: { repo: string; panePrefix: string }) => {
      try {
        const result = setRepoHarnessPanePrefix(options.repo, options.panePrefix);
        if (!result.registered) throw new Error(result.reason ?? 'repo is not adopted');
        process.stdout.write(`${JSON.stringify({ ok: true, ...result }, null, 2)}\n`);
      } catch (error) {
        process.stderr.write(`${JSON.stringify({ ok: false, error: 'pane_prefix_failed', message: (error as Error).message })}\n`);
        process.exitCode = 1;
      }
    });
  seats
    .command('handoff')
    .description('In the orchestrator or advisor seat: record a reset request now and print the handoff steps of the Stop hook')
    .action(() => {
      try {
        process.stdout.write(`${seatHandoff()}\n`);
      } catch (error) {
        if (!(error instanceof SeatsCommandError)) throw error;
        process.stderr.write(`${JSON.stringify({ ok: false, error: error.code, message: error.message })}\n`);
        process.exitCode = 1;
      }
    });
  seats
    .command('reset')
    .description('On a RESET-REQUEST from the orchestrator or advisor seat: check its handoff, ask for a rewrite or send /clear, then resume it; run it in the background')
    .argument('<handoff>', 'The handoff path of the RESET-REQUEST')
    .argument('<sha256>', 'The handoff sha256 of the RESET-REQUEST')
    .action(async (handoff: string, sha256: string) => {
      try {
        const result = await runSeatReset(handoff, sha256, {
          ...(loadNotify === undefined ? {} : { notify: await loadNotify() }),
          relaunch: identity => seatResetLaunch(identity),
        });
        process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
      } catch (error) {
        if (!(error instanceof SeatResetError)) throw error;
        process.stderr.write(`${JSON.stringify({ ok: false, error: error.code, outcome: error.outcome, message: error.message, logErrors: error.logErrors })}\n`);
        process.exitCode = 1;
      }
    });
  return seats;
}
