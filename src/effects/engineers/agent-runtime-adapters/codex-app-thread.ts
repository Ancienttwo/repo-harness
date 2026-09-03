import { validateAgentRuntimeHostAction, type AgentRuntimeAdapterObservationV2, type AgentRuntimeHostActionV2, type AgentRuntimeOperation } from '../../../core/engineers/agent-runtime-effect';

/** The operations this adapter implements. An action naming anything else is
 * reported as a typed `unsupported` observation instead of being attempted. */
export const CODEX_APP_THREAD_OPERATIONS: readonly AgentRuntimeOperation[] = Object.freeze(['notify_inbox', 'wake_for_offer']);

export interface CodexAppThreadInvoker {
  (input: Readonly<{ host_id: string; thread_id: string; operation: AgentRuntimeOperation; control_ref: string }>): Readonly<{ accepted: boolean }>;
}

export function executeCodexAppThreadAction(actionValue: AgentRuntimeHostActionV2, invoke: CodexAppThreadInvoker): AgentRuntimeAdapterObservationV2 {
  const action = validateAgentRuntimeHostAction(actionValue);
  if (action.adapter_kind !== 'codex-app-thread') throw new Error('agent_runtime_adapter_mismatch');
  if (!CODEX_APP_THREAD_OPERATIONS.includes(action.operation)) return Object.freeze({ adapter_kind: 'codex-app-thread', outcome: 'unsupported', process_exit_code: null, process_signal: null });
  try {
    const result = invoke({ host_id: action.host_id, thread_id: action.endpoint_id, operation: action.operation, control_ref: action.control_ref });
    return Object.freeze({ adapter_kind: 'codex-app-thread', outcome: result.accepted ? 'accepted' : 'failed', process_exit_code: null, process_signal: null });
  } catch {
    return Object.freeze({ adapter_kind: 'codex-app-thread', outcome: 'unknown', process_exit_code: null, process_signal: null });
  }
}
