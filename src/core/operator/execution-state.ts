/** Task execution state that the operator shows only after every session record agrees. */
export type ExecutionHost = 'claude' | 'codex';
export type UnverifiedExecutionReason =
  | 'closed' | 'binding_invalid' | 'binding_mismatch' | 'native_session_missing' | 'native_session_mismatch'
  | 'provider_exited' | 'provider_identity_lost';
export interface HerdrPaneLocation {
  readonly session: string; readonly workspace_id: string; readonly pane_id: string; readonly agent_name: string;
}
export interface VerifiedTaskExecution {
  readonly state: 'verified'; readonly task: string; readonly role: string; readonly issue_id: string | null;
  readonly agent: ExecutionHost; readonly runtime: 'herdr' | 'terminal'; readonly native_session_id: string;
  readonly herdr_pane: HerdrPaneLocation | null;
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
  readonly herdr_pane: HerdrPaneLocation | null;
}

// A pasted command must stay one argv word, whatever the host wrote as its session id.
const SHELL_WORD = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const RESUME = { claude: (id: string) => `claude --resume ${id}`, codex: (id: string) => `codex resume ${id}` } as const;

export function buildTaskFollowUp(execution: TaskExecution): TaskFollowUp {
  if (execution.state !== 'verified') return { task_id: execution.task, resume: null, herdr_pane: null };
  const resume = SHELL_WORD.test(execution.native_session_id)
    ? { host: execution.agent, command: RESUME[execution.agent](execution.native_session_id) } : null;
  return { task_id: execution.task, resume, herdr_pane: execution.herdr_pane };
}
