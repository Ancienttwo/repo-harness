import { canonicalEngineerJson, engineerSha256 } from '../../../core/engineers/profile-binding';
import { validateAgentRuntimeHostAction, type AgentRuntimeAdapterObservationV2, type AgentRuntimeHostActionV2, type AgentRuntimeOperation } from '../../../core/engineers/agent-runtime-effect';
import { herdrCommand, herdrResult, spawnHerdr, type HerdrEndpoint, type HerdrSpawn } from '../../terminal/herdr';

/** Identifies the exact named local transport configuration, not a physical host or credential. */
export function herdrEndpointIdentity(endpoint: HerdrEndpoint): string {
  return engineerSha256(canonicalEngineerJson({ domain: 'repo-harness-herdr-transport/v2', session: endpoint.session,
    configPath: endpoint.configPath ?? null, home: endpoint.home ?? null }));
}

export const HERDR_CLI_AGENT_OPERATIONS: readonly AgentRuntimeOperation[] = Object.freeze(['notify_inbox', 'wake_for_offer']);
export type HerdrEndpointResolver = (input: Readonly<{ transport_endpoint_sha256: string; endpoint_id: string }>) => HerdrEndpoint & { readonly agentName: string };

export function executeHerdrCliAgentAction(
  actionValue: AgentRuntimeHostActionV2,
  resolveEndpoint: HerdrEndpointResolver,
  spawn: HerdrSpawn = spawnHerdr,
): AgentRuntimeAdapterObservationV2 {
  const action = validateAgentRuntimeHostAction(actionValue);
  if (action.adapter_kind !== 'herdr-cli-agent') throw new Error('agent_runtime_adapter_mismatch');
  const observation = (outcome: AgentRuntimeAdapterObservationV2['outcome'], code: number | null = null, signal: string | null = null) =>
    Object.freeze({ adapter_kind: 'herdr-cli-agent' as const, outcome, process_exit_code: code, process_signal: signal });
  if (!HERDR_CLI_AGENT_OPERATIONS.includes(action.operation)) return observation('unsupported');
  let endpoint: ReturnType<HerdrEndpointResolver>;
  try {
    endpoint = resolveEndpoint({ transport_endpoint_sha256: action.transport_endpoint_sha256, endpoint_id: action.endpoint_id });
    // Names are binding-owned live aliases, cleared by herdr when the occupant exits.
    if (!endpoint || herdrEndpointIdentity(endpoint) !== action.transport_endpoint_sha256 || endpoint.agentName !== action.endpoint_id || !/^[a-z][a-z0-9_-]{0,31}$/.test(endpoint.agentName)
      || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(endpoint.session)) return observation('unavailable');
  } catch { return observation('unavailable'); }
  try {
    const result = herdrCommand(endpoint, ['agent', 'prompt', endpoint.agentName, action.control_ref], 'herdr', spawn);
    const code = typeof result.status === 'number' ? result.status : null;
    const signal = typeof result.signal === 'string' ? result.signal : null;
    if ((result.error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') return observation('unavailable', code, signal);
    // Timeout, truncation and an unrecognized error can occur after a write. Never replay on that evidence.
    if (result.error || signal) return observation('unknown', code, signal);
    if (code === 0) {
      const value = herdrResult(result);
      return observation(value.type === 'agent_prompted' && value.agent?.name === endpoint.agentName ? 'accepted' : 'unknown', code, signal);
    }
    try {
      const error = JSON.parse(result.stderr.toString('utf8'));
      if (typeof error.id === 'string' && ['agent_blocked', 'agent_not_found', 'agent_not_ready'].includes(error.error?.code)) return observation('unavailable', code, signal);
    } catch { /* Unknown delivery stays ambiguous, including malformed CLI diagnostics. */ }
    return observation('unknown', code, signal);
  } catch { return observation('unknown'); }
}
