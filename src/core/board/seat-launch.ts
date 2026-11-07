// The launch of one seat in a Herdr pane (#1473): the argv for its runtime and
// the seat brief. Each limit names what the host does with it, so the output
// never claims a limit that the host cannot apply.
import { PANE_PREFIX } from '../terminal/pane-prefix';
import { isWorkerSeat, type SeatConfigV1, type SeatId, type SeatTool } from './seats-settings';

/** `seats`: the stored section. `defaults`: no section, so `DEFAULT_SEATS_CONFIG`. */
export type SeatLaunchSource = 'seats' | 'defaults';

/**
 * - `enforced`: the argv blocks every path to the effect.
 * - `named_types_only`: the host refuses the agent types that the argv names; other types are not refused.
 * - `common_commands`: the argv blocks the direct tools, but a shell command or an MCP tool can still reach the same effect.
 * - `instructions_only`: written into the launch instructions only; the host does not refuse it.
 */
export type SeatLimitLevel = 'enforced' | 'named_types_only' | 'common_commands' | 'instructions_only';

/** A tool group that a seat can turn off. `read` is always on. */
type SeatGroup = Exclude<SeatTool, 'read'>;

export interface SeatLimitV1 {
  readonly subject: SeatGroup | 'fleet';
  readonly level: SeatLimitLevel;
}

export interface SeatLaunchV1 {
  readonly protocol: 1;
  readonly kind: 'seat_launch';
  readonly seat: SeatId;
  readonly runtime: SeatConfigV1['runtime'];
  readonly source: SeatLaunchSource;
  readonly argv: readonly string[];
  readonly brief: string;
  readonly limits: readonly SeatLimitV1[];
}

/** Built-in Claude Code agent types (Claude Code 2.1.316 and 2.1.317 init events and Agent tool), and `fork`. */
export const CLAUDE_BUILTIN_AGENT_TYPES = ['claude', 'claude-code-guide', 'Explore', 'fork', 'general-purpose', 'Plan', 'statusline-setup', 'web-fetch'] as const;

/** The triage queue of the orchestrator seat keeps its name when the seat restarts (#1510). */
export const ORCHESTRATOR_TASK_LIST_ID = 'repo-harness-orchestrator';

/** GitHub write commands that a missing `gh` group refuses. Other commands, such as `gh api`, still run. */
const GITHUB_WRITE_COMMANDS = [
  'gh issue close', 'gh issue comment', 'gh issue create', 'gh issue edit',
  'gh pr close', 'gh pr comment', 'gh pr create', 'gh pr edit', 'gh pr merge', 'gh pr review',
  'gh release create', 'git push',
];

/**
 * The built-in Claude tools of each group, for the `--tools` allow list (owner decision M22). Every built-in tool
 * that no enabled group names is off, also a tool that a later host version adds. `gh` names no tool: it needs the
 * shell, and a seat without `gh` denies the GitHub write command prefixes of Bash. `--tools` does not filter MCP
 * tools, so a seat without `mcp` also passes `--strict-mcp-config` (init-event probe, #1473).
 */
const CLAUDE_GROUP_TOOLS: Readonly<Record<SeatTool, readonly string[]>> = {
  read: ['Read', 'Glob', 'Grep'],
  edit: ['Edit', 'Write', 'NotebookEdit'],
  shell: ['Bash', 'Monitor', 'TaskStop'],
  net: ['WebFetch', 'WebSearch'],
  tasks: ['TaskCreate', 'TaskGet', 'TaskList', 'TaskUpdate'],
  mcp: ['ToolSearch', 'ListMcpResourcesTool', 'ReadMcpResourceTool'],
  gh: [],
};

/** Groups whose effect a shell command or an MCP tool can also reach. */
const SIDE_PATH_GROUPS: ReadonlySet<SeatGroup> = new Set(['edit', 'gh', 'net']);

/**
 * The one level rule for every runtime: a group is `enforced` only when the argv blocks every path to it. When the
 * argv blocks the direct tools of `edit`, `gh` or `net` and a shell or MCP path stays open, it is `common_commands`.
 */
function pathLevel(group: SeatGroup, direct: SeatLimitLevel, sidePathOpen: boolean): SeatLimitLevel {
  return direct === 'enforced' && sidePathOpen && SIDE_PATH_GROUPS.has(group) ? 'common_commands' : direct;
}

const GROUP_TEXT: Readonly<Record<SeatGroup, string>> = {
  edit: 'Do not edit files.',
  shell: 'Do not run shell commands.',
  net: 'Do not use the network.',
  tasks: 'Do not use the task list tools.',
  mcp: 'Do not use MCP tools.',
  gh: 'Do not write to GitHub.',
};

const OFF_GROUPS = (config: SeatConfigV1): SeatGroup[] =>
  (['edit', 'shell', 'net', 'tasks', 'mcp', 'gh'] as const).filter(group => !config.tools.includes(group));

const roleList = (fleet: readonly string[]) => fleet.map(role => `\`${role}\``).join(', ');

function roleParagraphs(seat: SeatId, config: SeatConfigV1, fleet: readonly string[]): string[] {
  if (seat === 'orchestrator') {
    const queue = config.tools.includes('tasks')
      ? ['Keep worker notices in a triage queue with TaskCreate, TaskUpdate, TaskList and TaskGet, as `references/orchestrator.md` §8.1 of repo-harness-issue-flow says: answer the owner first, then take one queue item at a time by priority.']
      : [];
    // A gatekeeper sub-agent is an independent reviewer inside this seat; every other review and every writer stays in a seat.
    const review = fleet.includes('gatekeeper')
      ? 'You do not review a PR yourself. An independent `gatekeeper` sub-agent may review a PR that you dispatched; route every other review of that PR to another seat.'
      : 'You do not review a PR that you dispatched; route that review to another seat.';
    const dispatch = fleet.length === 0
      ? 'You do not dispatch sub-agents (the Agent tool) for execution. Dispatch work only to seats through Herdr.'
      : `You may call these read-only sub-agents: ${roleList(fleet)}. Call no other agent type. Writers and the Codex review run only in Herdr seats: dispatch them to seats through Herdr.`;
    return [
      `You are the orchestrator seat. You hold the coordinator and integrator seats of repo-harness-issue-flow. You dispatch, accept and merge. You do not edit product code, tests or configuration. ${review} You push only the branch of a Codex worker seat handoff: commit its worktree diff with its message and explicit paths only, push the branch, open the PR, and push each fix round. You do not tag, release, delete, or change credentials or permissions.`,
      `${dispatch} When \`publication.acceptance_merge\` is \`on\`, merge only with \`repo-harness publication merge\`. When it is \`off\`, hand each ready PR to the owner.`,
      'Before each dispatch wave, run `repo-harness quota`. Launch each task on the seat its route line names with `repo-harness seats argv <seat>`; state the boundary in the task.',
      ...queue,
    ];
  }
  if (seat === 'advisor') {
    const evidence = fleet.length === 0
      ? 'You have no sub-agents. Collect evidence yourself.'
      : [
        `Collect evidence through your sub-agents: ${roleList(fleet)}. Split one research request into 2 to 4 read-only briefs with scopes that do not overlap, and send them in parallel.`,
        ...(fleet.includes('deep-reasoner') ? ['Use deep-reasoner only for an independent second judgment.'] : []),
        'Keep judgment, synthesis and the proposal for yourself. Run a check of one or two commands yourself.',
      ].join(' ');
    return [
      'You are the advisor seat. You serve only the orchestrator. You do research and write proposals. You do not edit code, commit or write to GitHub.',
      'You may read the processes of worker seats (hc ls, hc get and hc read on seat-labeled terminals) for evidence. You do not send messages or keys to a worker. You report only to the orchestrator.',
      evidence,
    ];
  }
  if (seat === 'gatekeeper' || seat === 'reviewer') {
    return [`You are the ${seat} seat. Perform a read-only review of the assigned PR. Do not edit files, commit, push, or write to GitHub. Report the verdict first, then the findings and evidence.`,
      fleet.length === 0 ? 'You have no sub-agents.' : `You may call these sub-agents: ${roleList(fleet)}. Call no other agent type.`];
  }
  return [
    'You are a worker seat. You deliver one issue or PR and report to the orchestrator.',
    fleet.length === 0 ? 'You have no sub-agents.' : `You may call these sub-agents: ${roleList(fleet)}. Call no other agent type.`,
    ...(config.runtime === 'codex' ? [
      'As a Codex worker seat in a linked contract worktree, edit files and run checks only. Do not run `git fetch`, `git commit` or `git push`. In your last message, give the commit subject and body, the PR title and body, and the check results. The orchestrator commits your worktree diff with that message and explicit paths only, pushes the branch and opens the PR. It is the head owner of record and pushes each fix round; no other agent pushes to that PR. You remain the content author and answer review threads through the orchestrator.',
    ] : []),
  ];
}

const KEEP_YOURSELF = {
  common_commands: 'The host refuses only common commands for these limits. Keep them yourself.',
  instructions_only: 'These limits are instructions only; the host does not enforce them. Keep them yourself.',
} as const;

/**
 * `fleet` is the list that the brief names: Pi has no sub-agents, whatever the stored list holds.
 * Each tool group that the host does not fully enforce goes into a keep-yourself paragraph.
 */
function brief(seat: SeatId, config: SeatConfigV1, fleet: readonly string[], limits: readonly SeatLimitV1[]): string {
  const kept = (Object.keys(KEEP_YOURSELF) as (keyof typeof KEEP_YOURSELF)[]).flatMap((level) => {
    const groups = limits.flatMap(limit => (limit.level === level && limit.subject !== 'fleet' ? [GROUP_TEXT[limit.subject]] : []));
    return groups.length === 0 ? [] : [`${KEEP_YOURSELF[level]} ${groups.join(' ')}`];
  });
  return [...roleParagraphs(seat, config, fleet), ...kept].join('\n\n');
}

function claudeLaunch(seat: SeatId, config: SeatConfigV1, agentTypes: readonly string[], name: string | undefined): Omit<SeatLaunchV1, 'protocol' | 'kind' | 'seat' | 'runtime' | 'source'> {
  const on = (group: SeatTool) => config.tools.includes(group);
  // `--tools` cannot name agent types (`Agent(<type>)` there removes the Agent tool), so a fleet keeps the Agent
  // tool and denies every other known type by name.
  const tools = [...config.tools.flatMap(group => CLAUDE_GROUP_TOOLS[group]), ...(config.fleet.length > 0 ? ['Agent'] : [])];
  const denied = [
    ...(on('shell') && !on('gh') ? GITHUB_WRITE_COMMANDS.map(command => `Bash(${command} *)`) : []),
    ...(config.fleet.length > 0 ? [...new Set(agentTypes)].filter(type => !config.fleet.includes(type)).sort().map(type => `Agent(${type})`) : []),
  ];
  const limits: SeatLimitV1[] = [
    ...OFF_GROUPS(config).map(group => ({ subject: group, level: pathLevel(group, 'enforced', on('shell') || on('mcp')) })),
    { subject: 'fleet', level: config.fleet.length === 0 ? 'enforced' : 'named_types_only' },
  ];
  const text = brief(seat, config, config.fleet, limits);
  return {
    argv: [
      ...(seat === 'orchestrator' && on('tasks') ? ['env', `CLAUDE_CODE_TASK_LIST_ID=${ORCHESTRATOR_TASK_LIST_ID}`] : []),
      'claude',
      ...(name === undefined ? [] : ['-n', name]),
      ...(config.model === null ? [] : ['--model', config.model]),
      ...(config.effort === null ? [] : ['--effort', config.effort]),
      '--tools', ...tools,
      ...(on('mcp') ? [] : ['--strict-mcp-config']),
      ...(denied.length === 0 ? [] : ['--disallowedTools', ...denied]),
      '--append-system-prompt', text,
    ],
    brief: text,
    limits,
  };
}

function codexLaunch(seat: SeatId, config: SeatConfigV1): Omit<SeatLaunchV1, 'protocol' | 'kind' | 'seat' | 'runtime' | 'source'> {
  const off = OFF_GROUPS(config);
  const writable = config.tools.includes('edit');
  const network = config.tools.includes('net');
  // The sandbox blocks shell writes (`edit`) and shell network access, and `web_search="disabled"` removes web search.
  // No `-c` override disables every inherited MCP server (probe, #1473): `mcp_servers={}` merges into the table, and
  // `mcp_servers.<name>.enabled=false` needs every server name. So an MCP path to `edit` and `net` always stays open.
  const direct = (group: SeatGroup): SeatLimitLevel => (group === 'edit' || group === 'net' ? 'enforced' : 'instructions_only');
  const limits: SeatLimitV1[] = [
    ...off.map(group => ({ subject: group, level: pathLevel(group, direct(group), true) })),
    { subject: 'fleet', level: 'instructions_only' },
  ];
  const text = brief(seat, config, config.fleet, limits);
  return {
    argv: [
      'codex',
      ...(config.model === null ? [] : ['-m', config.model]),
      ...(config.effort === null ? [] : ['-c', `model_reasoning_effort=${JSON.stringify(config.effort)}`]),
      '-s', writable ? 'workspace-write' : 'read-only',
      // `checkCodexSeatNetwork` refuses `edit` with `net` at the launch. The form reads the limits of any draft here, so this does not throw.
      ...(writable ? ['-c', 'sandbox_workspace_write.network_access=false'] : []),
      ...(network ? [] : ['-c', 'web_search="disabled"']),
      // A JSON string is a TOML basic string, so `-c` reads it back as the same text.
      '-c', `developer_instructions=${JSON.stringify(text)}`,
    ],
    brief: text,
    limits,
  };
}

function piLaunch(seat: SeatId, config: SeatConfigV1): Omit<SeatLaunchV1, 'protocol' | 'kind' | 'seat' | 'runtime' | 'source'> {
  const review = seat === 'gatekeeper' || seat === 'reviewer';
  // Pi's denylist blocks the edit/write tools; shell paths stay open.
  const limits: SeatLimitV1[] = OFF_GROUPS(config).map(group => ({
    subject: group,
    level: review && group === 'edit' ? pathLevel(group, 'enforced', true) : 'instructions_only',
  }));
  const text = brief(seat, config, [], limits);
  return {
    argv: ['pi', ...(review ? ['--exclude-tools', 'edit,write', '--no-extensions', '--no-skills',
      '--no-prompt-templates', '--no-context-files', '--no-mcp'] : []), '--append-system-prompt', text],
    brief: text, limits,
  };
}

/**
 * `claudeAgentTypes` is every agent type that a Claude session of this host can
 * call. A Claude seat with a fleet refuses each of them that is not in the fleet.
 * `paneName` (`seatPaneName`) becomes the Claude session name `-n`.
 */
export function buildSeatLaunch(seat: SeatId, config: SeatConfigV1, source: SeatLaunchSource, claudeAgentTypes: readonly string[], paneName?: string): SeatLaunchV1 {
  const launch = config.runtime === 'claude'
    ? claudeLaunch(seat, config, claudeAgentTypes, paneName)
    : config.runtime === 'codex' ? codexLaunch(seat, config) : piLaunch(seat, config);
  return { protocol: 1, kind: 'seat_launch', seat, runtime: config.runtime, source, ...launch };
}

const PANE_ROLE = { orchestrator: 'orch', advisor: 'adv', worker: 'w', 'worker-deep': 'w', 'worker-important': 'w', 'worker-important-fast': 'w', 'worker-light': 'w', gatekeeper: 'gk', reviewer: 'rv' } as const;
const PANE_NAME_MAX = 32;
const POSITIVE = /^[1-9][0-9]*$/u;
const WORD = /^[a-z][a-z0-9]*$/u;

export class SeatPaneNameError extends Error {
  readonly code = 'pane_name_invalid';
}

export interface SeatPaneNameInput {
  /** The `panePrefix` of the repository's registry entry (#1544). */
  readonly prefix: string;
  readonly seat: SeatId;
  readonly issue?: string;
  readonly pr?: string;
  /** The digits of a release item, for example `0252`. */
  readonly release?: string;
  readonly qualifier?: string;
}

/**
 * The hc `--name` and Claude `-n` of a seat pane: `<prefix>-<role>[-<item>][-<qualifier>]`. The worker item is its
 * issue or `rel<digits>`; the reviewer item is its PR. The name carries no state, so it never goes stale.
 */
export function seatPaneName(input: SeatPaneNameInput): string {
  const fail = (why: string): never => { throw new SeatPaneNameError(`Pane name: ${why}.`); };
  const { prefix, seat, issue, pr, release, qualifier } = input;
  if (!PANE_PREFIX.test(prefix)) fail(`prefix ${JSON.stringify(prefix)} must match ${PANE_PREFIX.source}`);
  const role: string | undefined = PANE_ROLE[seat];
  if (role === undefined) fail(`unknown seat ${JSON.stringify(seat)}`);
  let item: string | undefined;
  if (isWorkerSeat(seat)) {
    if ((issue === undefined) === (release === undefined)) fail('a worker needs exactly one of an issue and a release item');
    if (pr !== undefined) fail('a worker takes no PR');
    if (issue !== undefined && !POSITIVE.test(issue)) fail('the issue must be a positive decimal integer');
    if (release !== undefined && !/^[0-9]+$/u.test(release)) fail('the release item must be digits');
    item = issue ?? `rel${release}`;
  } else if (seat === 'reviewer' || seat === 'gatekeeper') {
    if (pr === undefined || !POSITIVE.test(pr)) fail(`a ${seat} needs a PR, a positive decimal integer`);
    if (issue !== undefined || release !== undefined) fail(`a ${seat} takes only a PR`);
    item = pr;
  } else if (issue !== undefined || pr !== undefined || release !== undefined || qualifier !== undefined) {
    fail(`the ${seat} pane takes no item and no qualifier`);
  }
  if (qualifier !== undefined && !WORD.test(qualifier)) fail(`qualifier ${JSON.stringify(qualifier)} must match ${WORD.source}`);
  const name = [prefix, role, item, qualifier].filter(part => part !== undefined).join('-');
  if (name.length > PANE_NAME_MAX) fail(`${name} is longer than ${PANE_NAME_MAX} characters`);
  return name;
}

/**
 * The Herdr.app tab of a new seat pane, before the fullness suffix: the orchestrator tab, the worker tab of its parent
 * issue (`other` without one), or the review tab. A full tab gets the next number, for example `#1000 2`.
 */
export function seatTabName(seat: SeatId, parent?: string): string {
  if (parent !== undefined && !POSITIVE.test(parent)) throw new SeatPaneNameError('Tab name: the parent must be a positive decimal integer.');
  if (seat === 'reviewer' || seat === 'gatekeeper') return 'review';
  if (isWorkerSeat(seat)) return parent === undefined ? 'other' : `#${parent}`;
  return 'orch';
}
