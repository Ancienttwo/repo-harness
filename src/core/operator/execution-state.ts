/** Task execution state that the operator shows only after every session record agrees. */
export type ExecutionHost = 'claude' | 'codex' | 'pi';
export type UnverifiedExecutionReason =
  | 'closed' | 'binding_invalid' | 'binding_mismatch' | 'native_session_missing' | 'native_session_mismatch'
  | 'provider_exited' | 'provider_identity_lost';
/** The hc terminal of a task session. `core_id` names its core (hc `server.status`); the public view drops it. */
export interface HcTerminalLocation { readonly address: string; readonly name: string; readonly core_id: string }
/** The public location: the address, the name, and the command that opens the terminal in Herdr.app. */
export interface HcTerminalFollowUp { readonly address: string; readonly name: string; readonly open_command: string }
export interface VerifiedTaskExecution {
  readonly state: 'verified'; readonly task: string; readonly role: string; readonly issue_id: string | null;
  /** The admitted branch, named as Dev Activity names it; null for a session without admission. */
  readonly branch: string | null;
  readonly agent: ExecutionHost; readonly runtime: 'herdr-core' | 'terminal'; readonly native_session_id: string;
  readonly hc_terminal: HcTerminalLocation | null;
}
/** The operator shows this as "no verified session"; the reason is for diagnosis only. */
export interface UnverifiedTaskExecution {
  readonly state: 'unverified'; readonly task: string; readonly role: string; readonly reason: UnverifiedExecutionReason;
}
export type TaskExecution = VerifiedTaskExecution | UnverifiedTaskExecution;
export interface TaskExecutionSnapshot {
  readonly protocol: 1; readonly kind: 'operator_task_execution'; readonly observed_at: string;
  readonly executions: readonly TaskExecution[];
}

/** Copyable follow-up only. The console never writes to a coding session. */
export interface TaskFollowUp {
  readonly task_id: string;
  readonly resume: { readonly host: ExecutionHost; readonly command: string } | null;
  readonly hc_terminal: HcTerminalFollowUp | null;
}

// A pasted command must stay one argv word, whatever the host wrote as its session id.
const SHELL_WORD = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const RESUME = { claude: (id: string) => `claude --resume ${id}`, codex: (id: string) => `codex resume ${id}`,
  pi: (id: string) => `pi --session ${id}` } as const;

/** The shell text of the command that gives an hc terminal a pane in Herdr.app; `herdr-core.ts` owns its argv. */
export type HerdrAppOpenCommand = (address: string) => string;

export function buildTaskFollowUp(execution: TaskExecution, openCommand: HerdrAppOpenCommand): TaskFollowUp {
  if (execution.state !== 'verified') return { task_id: execution.task, resume: null, hc_terminal: null };
  const resume = SHELL_WORD.test(execution.native_session_id)
    ? { host: execution.agent, command: RESUME[execution.agent](execution.native_session_id) } : null;
  const terminal = execution.hc_terminal;
  return { task_id: execution.task, resume,
    hc_terminal: terminal === null ? null : { address: terminal.address, name: terminal.name, open_command: openCommand(terminal.address) } };
}

/** Why GET has no execution view for a repository. */
export type ExecutionStateUnavailableReason =
  | 'execution_state_pending' | 'registry_unavailable' | 'repository_not_found' | 'execution_state_unavailable';

/** One task of the public execution view. The session id appears only inside the resume command. */
export type TaskExecutionViewEntry =
  | { readonly state: 'verified'; readonly task: string; readonly role: string; readonly issue_id: string | null;
    readonly branch: string | null; readonly agent: ExecutionHost; readonly runtime: 'herdr-core' | 'terminal'; readonly follow_up: TaskFollowUp }
  | { readonly state: 'unverified'; readonly task: string; readonly role: string; readonly reason: UnverifiedExecutionReason;
    readonly follow_up: TaskFollowUp };

/** The execution state of one registered repository, as GET serves it. */
export interface TaskExecutionViewV1 {
  readonly protocol: 1; readonly kind: 'operator_task_execution'; readonly repository_id: string; readonly observed_at: string;
  readonly tasks: readonly TaskExecutionViewEntry[];
  /** Sessions whose task, role, ids or branch are not plain public text, so they are left out. */
  readonly unlisted_tasks: number;
}

const UNVERIFIED_REASONS: readonly UnverifiedExecutionReason[] = ['closed', 'binding_invalid', 'binding_mismatch',
  'native_session_missing', 'native_session_mismatch', 'provider_exited', 'provider_identity_lost'];
const TASK_TEXT = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const ROLE_TEXT = /^[a-z][a-z0-9_-]{0,31}$/u;
const ISSUE_TEXT = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/u;
const BRANCH_TEXT = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,254}$/u;
/** hc's terminal address on one core (see `herdr-core.ts`). */
const HC_ADDRESS_TEXT = /^t[1-9][0-9bcdfghjkmnpqrstvwxyz]{0,6}$/u;
const HC_NAME_TEXT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u;
const COMMAND_TEXT = /^[\x20-\x7e]{1,256}$/u;
const REPO_ID_TEXT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const ISO_TIME = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u;

// RegExp.test coerces its argument, so each field is checked to be a string first.
const matches = (value: unknown, pattern: RegExp): boolean => typeof value === 'string' && pattern.test(value);
const publicTerminal = (terminal: Readonly<Partial<Record<keyof HcTerminalFollowUp, unknown>>>): boolean =>
  matches(terminal.address, HC_ADDRESS_TEXT) && matches(terminal.name, HC_NAME_TEXT);

/**
 * The public view. An hc terminal location stays only when its core is the one
 * the operator reads (`hc_core`, its `core.id`); without a core, none is shown.
 */
export function projectTaskExecutionView(snapshot: TaskExecutionSnapshot, repository_id: string, hc_core: string | null,
  openCommand: HerdrAppOpenCommand): TaskExecutionViewV1 {
  const tasks: TaskExecutionViewEntry[] = [];
  let unlisted = 0;
  for (const execution of snapshot.executions) {
    const ids = TASK_TEXT.test(execution.task) && ROLE_TEXT.test(execution.role)
      && (execution.state !== 'verified' || ((execution.issue_id === null || ISSUE_TEXT.test(execution.issue_id))
        && (execution.branch === null || BRANCH_TEXT.test(execution.branch))));
    const terminal = execution.state === 'verified' ? execution.hc_terminal : null;
    if (!ids || (terminal !== null && !publicTerminal(terminal))) { unlisted++; continue; }
    if (execution.state !== 'verified') {
      tasks.push({ state: 'unverified', task: execution.task, role: execution.role, reason: execution.reason, follow_up: buildTaskFollowUp(execution, openCommand) });
      continue;
    }
    const located = terminal !== null && terminal.core_id === hc_core ? execution : { ...execution, hc_terminal: null };
    tasks.push({ state: 'verified', task: execution.task, role: execution.role, issue_id: execution.issue_id, branch: execution.branch,
      agent: execution.agent, runtime: execution.runtime, follow_up: buildTaskFollowUp(located, openCommand) });
  }
  return { protocol: 1, kind: 'operator_task_execution', repository_id, observed_at: snapshot.observed_at, tasks, unlisted_tasks: unlisted };
}

type Json = Record<string, unknown>;
function fail(what: string): never { throw new Error(`execution view invalid: ${what}`); }
function obj(value: unknown, keys: readonly string[], what: string): Json {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(what);
  const actual = Object.keys(value).sort();
  if (actual.length !== keys.length || [...keys].sort().some((key, index) => actual[index] !== key)) fail(`${what} keys`);
  return value as Json;
}
function text(value: unknown, pattern: RegExp, what: string): string {
  return matches(value, pattern) ? value as string : fail(what);
}

/** Strict decoder for the server, before it sends a cached view, and for the browser. */
export function decodeTaskExecutionView(value: unknown): TaskExecutionViewV1 {
  const v = obj(value, ['protocol', 'kind', 'repository_id', 'observed_at', 'tasks', 'unlisted_tasks'], 'view');
  if (v.protocol !== 1 || v.kind !== 'operator_task_execution') fail('protocol');
  text(v.repository_id, REPO_ID_TEXT, 'repository_id');
  text(v.observed_at, ISO_TIME, 'observed_at');
  if (!Number.isSafeInteger(v.unlisted_tasks) || (v.unlisted_tasks as number) < 0) fail('unlisted_tasks');
  if (!Array.isArray(v.tasks)) fail('tasks');
  for (const raw of v.tasks) {
    const state = (raw as Json | null)?.state;
    const entry = state === 'verified'
      ? obj(raw, ['state', 'task', 'role', 'issue_id', 'branch', 'agent', 'runtime', 'follow_up'], 'verified task')
      : state === 'unverified' ? obj(raw, ['state', 'task', 'role', 'reason', 'follow_up'], 'unverified task') : fail('task state');
    const task = text(entry.task, TASK_TEXT, 'task');
    text(entry.role, ROLE_TEXT, 'role');
    const follow = obj(entry.follow_up, ['task_id', 'resume', 'hc_terminal'], 'follow_up');
    if (follow.task_id !== task) fail('follow_up task_id');
    if (state === 'unverified') {
      if (!UNVERIFIED_REASONS.includes(entry.reason as UnverifiedExecutionReason)) fail('reason');
      if (follow.resume !== null || follow.hc_terminal !== null) fail('unverified follow_up');
      continue;
    }
    if (entry.issue_id !== null) text(entry.issue_id, ISSUE_TEXT, 'issue_id');
    if (entry.branch !== null) text(entry.branch, BRANCH_TEXT, 'branch');
    if (entry.agent !== 'claude' && entry.agent !== 'codex' && entry.agent !== 'pi') fail('agent');
    if (entry.runtime !== 'herdr-core' && entry.runtime !== 'terminal') fail('runtime');
    if (follow.resume !== null) {
      const resume = obj(follow.resume, ['host', 'command'], 'resume');
      if (resume.host !== entry.agent) fail('resume host');
      const id = typeof resume.command === 'string' ? resume.command.slice(RESUME[entry.agent]('').length) : '';
      if (!SHELL_WORD.test(id) || resume.command !== RESUME[entry.agent](id)) fail('resume command');
    }
    if (follow.hc_terminal !== null) {
      if (entry.runtime !== 'herdr-core') fail('hc_terminal runtime');
      const terminal = obj(follow.hc_terminal, ['address', 'name', 'open_command'], 'hc_terminal');
      if (!publicTerminal(terminal) || !matches(terminal.open_command, COMMAND_TEXT)) fail('hc_terminal');
    }
  }
  return value as TaskExecutionViewV1;
}
