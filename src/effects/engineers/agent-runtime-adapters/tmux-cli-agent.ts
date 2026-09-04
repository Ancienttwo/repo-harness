import { spawnSync, type SpawnSyncReturns } from 'child_process';

import { validateAgentRuntimeHostAction, type AgentRuntimeAdapterObservationV2, type AgentRuntimeHostActionV2, type AgentRuntimeOperation } from '../../../core/engineers/agent-runtime-effect';

/** The operations this adapter implements. An action naming anything else is
 * reported as a typed `unsupported` observation instead of being attempted. */
export const TMUX_CLI_AGENT_OPERATIONS: readonly AgentRuntimeOperation[] = Object.freeze(['notify_inbox', 'wake_for_offer']);

export type TmuxEndpointResolver = (input: Readonly<{ host_id: string; endpoint_id: string }>) => string;
export type TmuxSpawn = (command: string, args: readonly string[]) => SpawnSyncReturns<Buffer>;

const defaultSpawn: TmuxSpawn = (command, args) => spawnSync(command, [...args], { shell: false, stdio: ['ignore', 'ignore', 'ignore'], encoding: null });

export function executeTmuxCliAgentAction(
  actionValue: AgentRuntimeHostActionV2,
  resolveEndpoint: TmuxEndpointResolver,
  spawn: TmuxSpawn = defaultSpawn,
): AgentRuntimeAdapterObservationV2 {
  const action = validateAgentRuntimeHostAction(actionValue);
  if (action.adapter_kind !== 'tmux-cli-agent') throw new Error('agent_runtime_adapter_mismatch');
  if (!TMUX_CLI_AGENT_OPERATIONS.includes(action.operation)) return Object.freeze({ adapter_kind: 'tmux-cli-agent', outcome: 'unsupported', process_exit_code: null, process_signal: null });
  let target: string;
  try { target = resolveEndpoint({ host_id: action.host_id, endpoint_id: action.endpoint_id }); }
  catch { return Object.freeze({ adapter_kind: 'tmux-cli-agent', outcome: 'unavailable', process_exit_code: null, process_signal: null }); }
  if (!target || /[\u0000\r\n]/u.test(target)) return Object.freeze({ adapter_kind: 'tmux-cli-agent', outcome: 'unavailable', process_exit_code: null, process_signal: null });
  try {
    const result = spawn('tmux', ['send-keys', '-t', target, '--', action.control_ref, 'Enter']);
    const exitCode = typeof result.status === 'number' ? result.status : null;
    const signal = typeof result.signal === 'string' ? result.signal : null;
    return Object.freeze({ adapter_kind: 'tmux-cli-agent', outcome: exitCode === 0 ? 'accepted' : result.error ? 'unavailable' : exitCode === null ? 'unknown' : 'failed', process_exit_code: exitCode, process_signal: signal });
  } catch {
    return Object.freeze({ adapter_kind: 'tmux-cli-agent', outcome: 'unknown', process_exit_code: null, process_signal: null });
  }
}
