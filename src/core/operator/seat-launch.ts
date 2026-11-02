// The launch of one seat in a Herdr pane (#1473): the argv for its runtime and
// the seat brief. Each limit names what the host does with it, so the output
// never claims a limit that the host cannot apply.
import type { SeatConfigV1, SeatId, SeatTool } from './seats-settings';

/** `seats`: the stored section. `defaults`: no section, so `DEFAULT_SEATS_CONFIG`. */
export type SeatLaunchSource = 'seats' | 'defaults';

/**
 * - `enforced`: the host refuses the tool.
 * - `named_types_only`: the host refuses the agent types that the argv names; other types are not refused.
 * - `common_commands`: the host refuses the named tools and command prefixes; a shell can still reach the same effect.
 * - `instructions_only`: written into the launch instructions only; the host does not refuse it.
 * - `unavailable`: the seat has the group, but the host sandbox removes it.
 */
export type SeatLimitLevel = 'enforced' | 'named_types_only' | 'common_commands' | 'instructions_only' | 'unavailable';

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

/** Built-in Claude Code agent types (Claude Code 2.1.316 init event and Agent tool), and `fork`. */
export const CLAUDE_BUILTIN_AGENT_TYPES = ['claude', 'claude-code-guide', 'Explore', 'fork', 'general-purpose', 'Plan', 'statusline-setup', 'web-fetch'] as const;

/** The triage queue of the orchestrator seat keeps its name when the seat restarts (#1510). */
export const ORCHESTRATOR_TASK_LIST_ID = 'repo-harness-orchestrator';

const CLAUDE_TASK_TOOLS = ['TaskCreate', 'TaskGet', 'TaskList', 'TaskUpdate'];

/** GitHub write commands that a missing `gh` group refuses. Other commands, such as `gh api`, still run. */
const GITHUB_WRITE_COMMANDS = [
  'gh issue close', 'gh issue comment', 'gh issue create', 'gh issue edit',
  'gh pr close', 'gh pr comment', 'gh pr create', 'gh pr edit', 'gh pr merge', 'gh pr review',
  'gh release create', 'git push',
];

const CLAUDE_DENIED_TOOLS: Readonly<Record<SeatGroup, { readonly rules: readonly string[]; readonly level: SeatLimitLevel }>> = {
  edit: { rules: ['Edit', 'NotebookEdit', 'Write'], level: 'enforced' },
  shell: { rules: ['Bash'], level: 'enforced' },
  net: { rules: ['WebFetch', 'WebSearch'], level: 'common_commands' },
  tasks: { rules: CLAUDE_TASK_TOOLS, level: 'enforced' },
  mcp: { rules: ['ListMcpResourcesTool', 'ReadMcpResourceDirTool', 'ReadMcpResourceTool', 'mcp__*'], level: 'enforced' },
  gh: { rules: GITHUB_WRITE_COMMANDS.map(command => `Bash(${command} *)`), level: 'common_commands' },
};

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
    return [
      'You are the orchestrator seat. You hold the coordinator and integrator seats of repo-harness-issue-flow. You dispatch, accept and merge. You do not edit product code, tests or configuration. You do not review a PR that you dispatched; route that review to another seat. You do not push, tag, release, delete, or change credentials or permissions.',
      'You do not dispatch sub-agents (the Agent tool) for execution. Dispatch work only to seats through Herdr. When `publication.acceptance_merge` is `on`, merge only with `repo-harness publication merge`. When it is `off`, hand each ready PR to the owner.',
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
  return [
    'You are a worker seat. You deliver one issue or PR and report to the orchestrator.',
    fleet.length === 0 ? 'You have no sub-agents.' : `You may call these sub-agents: ${roleList(fleet)}. Call no other agent type.`,
  ];
}

/** `fleet` is the list that the brief names: Pi has no sub-agents, whatever the stored list holds. */
function brief(seat: SeatId, config: SeatConfigV1, fleet: readonly string[], selfKept: readonly string[]): string {
  const limits = selfKept.length === 0 ? [] : [`The host enforces these limits only in part or not at all. Keep them yourself. ${selfKept.join(' ')}`];
  return [...roleParagraphs(seat, config, fleet), ...limits].join('\n\n');
}

function claudeLaunch(seat: SeatId, config: SeatConfigV1, agentTypes: readonly string[]): Omit<SeatLaunchV1, 'protocol' | 'kind' | 'seat' | 'runtime' | 'source'> {
  const off = OFF_GROUPS(config);
  const fleetRules = config.fleet.length === 0
    ? ['Agent']
    : [...new Set(agentTypes)].filter(type => !config.fleet.includes(type)).sort().map(type => `Agent(${type})`);
  const denied = [...off.flatMap(group => CLAUDE_DENIED_TOOLS[group].rules), ...fleetRules];
  // A plain session has no Glob, Grep or task tools; naming one of each in --allowedTools turns its set on.
  const allowed = ['Glob', 'Grep', ...(config.tools.includes('tasks') ? CLAUDE_TASK_TOOLS : [])];
  const softGroups = off.filter(group => CLAUDE_DENIED_TOOLS[group].level === 'common_commands').map(group => GROUP_TEXT[group]);
  const text = brief(seat, config, config.fleet, softGroups);
  return {
    argv: [
      ...(seat === 'orchestrator' && config.tools.includes('tasks') ? ['env', `CLAUDE_CODE_TASK_LIST_ID=${ORCHESTRATOR_TASK_LIST_ID}`] : []),
      'claude',
      ...(config.model === null ? [] : ['--model', config.model]),
      ...(config.effort === null ? [] : ['--effort', config.effort]),
      '--allowedTools', ...allowed,
      '--disallowedTools', ...denied,
      '--append-system-prompt', text,
    ],
    brief: text,
    limits: [
      ...off.map(group => ({ subject: group, level: CLAUDE_DENIED_TOOLS[group].level })),
      { subject: 'fleet', level: config.fleet.length === 0 ? 'enforced' : 'named_types_only' },
    ],
  };
}

function codexLaunch(seat: SeatId, config: SeatConfigV1): Omit<SeatLaunchV1, 'protocol' | 'kind' | 'seat' | 'runtime' | 'source'> {
  const off = OFF_GROUPS(config);
  const writable = config.tools.includes('edit');
  // The sandbox mode enforces `edit`; `network_access=false` or the read-only sandbox enforces `net`.
  const instructed: readonly SeatGroup[] = off.filter(group => group !== 'edit' && group !== 'net');
  const text = brief(seat, config, config.fleet, instructed.map(group => GROUP_TEXT[group]));
  const limits: SeatLimitV1[] = off.map(group => ({ subject: group, level: instructed.includes(group) ? 'instructions_only' : 'enforced' }));
  // The read-only sandbox has no network access, whatever the seat's net group says (codex sandbox probe, #1473).
  if (!writable && config.tools.includes('net')) limits.push({ subject: 'net', level: 'unavailable' });
  if (config.fleet.length > 0) limits.push({ subject: 'fleet', level: 'instructions_only' });
  return {
    argv: [
      'codex',
      ...(config.model === null ? [] : ['-m', config.model]),
      ...(config.effort === null ? [] : ['-c', `model_reasoning_effort=${JSON.stringify(config.effort)}`]),
      '-s', writable ? 'workspace-write' : 'read-only',
      ...(writable ? ['-c', `sandbox_workspace_write.network_access=${config.tools.includes('net')}`] : []),
      // A JSON string is a TOML basic string, so `-c` reads it back as the same text.
      '-c', `developer_instructions=${JSON.stringify(text)}`,
    ],
    brief: text,
    limits,
  };
}

function piLaunch(seat: SeatId, config: SeatConfigV1): Omit<SeatLaunchV1, 'protocol' | 'kind' | 'seat' | 'runtime' | 'source'> {
  const off = OFF_GROUPS(config);
  const text = brief(seat, config, [], off.map(group => GROUP_TEXT[group]));
  return {
    argv: ['pi', '--append-system-prompt', text],
    brief: text,
    limits: off.map(group => ({ subject: group, level: 'instructions_only' })),
  };
}

/**
 * `claudeAgentTypes` is every agent type that a Claude session of this host can
 * call. A Claude seat with a fleet refuses each of them that is not in the fleet.
 */
export function buildSeatLaunch(seat: SeatId, config: SeatConfigV1, source: SeatLaunchSource, claudeAgentTypes: readonly string[]): SeatLaunchV1 {
  const launch = config.runtime === 'claude'
    ? claudeLaunch(seat, config, claudeAgentTypes)
    : config.runtime === 'codex' ? codexLaunch(seat, config) : piLaunch(seat, config);
  return { protocol: 1, kind: 'seat_launch', seat, runtime: config.runtime, source, ...launch };
}
