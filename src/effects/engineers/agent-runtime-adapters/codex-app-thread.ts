import { validateAgentRuntimeHostAction, type AgentRuntimeAdapterObservationV2, type AgentRuntimeHostActionV2 } from '../../../core/engineers/agent-runtime-effect';

export interface CodexAppThreadInvoker {
  (input: Readonly<{ host_id: string; thread_id: string; control_ref: string }>): Readonly<{ accepted: boolean }>;
}

export function executeCodexAppThreadAction(actionValue: AgentRuntimeHostActionV2, invoke: CodexAppThreadInvoker): AgentRuntimeAdapterObservationV2 {
  const action = validateAgentRuntimeHostAction(actionValue);
  if (action.adapter_kind !== 'codex-app-thread') throw new Error('agent_runtime_adapter_mismatch');
  try {
    const result = invoke({ host_id: action.host_id, thread_id: action.endpoint_id, control_ref: action.control_ref });
    return Object.freeze({ adapter_kind: 'codex-app-thread', outcome: result.accepted ? 'accepted' : 'failed', process_exit_code: null, process_signal: null });
  } catch {
    return Object.freeze({ adapter_kind: 'codex-app-thread', outcome: 'unknown', process_exit_code: null, process_signal: null });
  }
}
