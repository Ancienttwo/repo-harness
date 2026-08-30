import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import { type AgentRuntimeAdapterKind } from '../../core/engineers/agent-runtime-effect';

export type AgentRuntimeMode = 'off' | 'shadow' | 'active';
export interface AgentRuntimePolicy {
  readonly mode: AgentRuntimeMode;
  readonly adapters: Readonly<Record<AgentRuntimeAdapterKind, { readonly enabled: boolean }>>;
}

export class AgentRuntimePolicyError extends Error {
  constructor(readonly code: 'agent_runtime_policy_invalid' | 'agent_runtime_disabled', message: string, readonly cause?: unknown) {
    super(message); this.name = 'AgentRuntimePolicyError';
  }
}

const POLICY_PATH = '.ai/harness/policy.json';
const DISABLED = Object.freeze({
  mode: 'off',
  adapters: Object.freeze({ 'codex-app-thread': Object.freeze({ enabled: false }), 'tmux-cli-agent': Object.freeze({ enabled: false }) }),
}) satisfies AgentRuntimePolicy;

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function readAgentRuntimePolicy(repoRoot: string): AgentRuntimePolicy {
  const file = join(repoRoot, POLICY_PATH);
  if (!existsSync(file)) return DISABLED;
  let root: Record<string, unknown>;
  try { root = object(JSON.parse(readFileSync(file, 'utf8'))) ?? {}; }
  catch (error) { throw new AgentRuntimePolicyError('agent_runtime_policy_invalid', `${POLICY_PATH} is unreadable`, error); }
  if (root.agent_runtime === undefined) return DISABLED;
  const runtime = object(root.agent_runtime);
  if (!runtime || Object.keys(runtime).sort().join(',') !== 'adapters,mode'
    || (runtime.mode !== 'off' && runtime.mode !== 'shadow' && runtime.mode !== 'active')) {
    throw new AgentRuntimePolicyError('agent_runtime_policy_invalid', `${POLICY_PATH}#agent_runtime.mode must be off, shadow, or active`);
  }
  const adapters = object(runtime.adapters);
  const codex = object(adapters?.['codex-app-thread']);
  const tmux = object(adapters?.['tmux-cli-agent']);
  if (!adapters || Object.keys(adapters).sort().join(',') !== 'codex-app-thread,tmux-cli-agent'
    || Object.keys(codex ?? {}).join(',') !== 'enabled' || typeof codex?.enabled !== 'boolean'
    || Object.keys(tmux ?? {}).join(',') !== 'enabled' || typeof tmux?.enabled !== 'boolean') {
    throw new AgentRuntimePolicyError('agent_runtime_policy_invalid', `${POLICY_PATH}#agent_runtime.adapters must contain exact boolean enablement for both adapters`);
  }
  return Object.freeze({
    mode: runtime.mode,
    adapters: Object.freeze({
      'codex-app-thread': Object.freeze({ enabled: codex.enabled }),
      'tmux-cli-agent': Object.freeze({ enabled: tmux.enabled }),
    }),
  });
}

export function assertAgentRuntimePrepareEnabled(repoRoot: string): AgentRuntimePolicy {
  const policy = readAgentRuntimePolicy(repoRoot);
  if (policy.mode === 'off') throw new AgentRuntimePolicyError('agent_runtime_disabled', 'agent_runtime.mode=off forbids new effects');
  return policy;
}

export function assertAgentRuntimeActionEnabled(repoRoot: string, adapter: AgentRuntimeAdapterKind): AgentRuntimePolicy {
  const policy = readAgentRuntimePolicy(repoRoot);
  if (policy.mode !== 'active') throw new AgentRuntimePolicyError('agent_runtime_disabled', `agent_runtime.mode=${policy.mode} forbids Host actions`);
  if (!policy.adapters[adapter].enabled) throw new AgentRuntimePolicyError('agent_runtime_disabled', `${adapter} is disabled by agent_runtime policy`);
  return policy;
}
