/**
 * UserPromptSubmit.delegation: bounded delegation permission for the typed
 * `/delegate` or `/parallel` command. The rule text is `policy.json`
 * `delegation.rule` and `delegation.runner_rule`, rendered word for word.
 */

import { readText } from '../../effects/state/collect-state-inputs';
import type { StateInputCollector } from '../../effects/loop/state-input-collector';
import type { HookHandlerResult } from './handler-contract';
import { payloadString, type HookPayload } from './hook-input';
import { activeContractPath, effectiveStateDiagnostic } from './subagent-context';

export interface DelegationAdvisorInput {
  readonly collector: Pick<StateInputCollector, 'getRepoRoot' | 'getEffectiveState'>;
  readonly payload: HookPayload;
}

/** The one delegation cap authority. Policy numeric fields are not read. */
const DELEGATION_CAPS = Object.freeze({ maxAgents: 2, highRiskMaxAgents: 3, maxDepth: 1 });

const POLICY_PATH = '.ai/harness/policy.json';
const DELEGATION_COMMAND = /^\s*\/(delegate|parallel)(?:\s|$)/i;

interface DelegationPolicyText {
  readonly rule: string;
  readonly runnerRule: string;
}

function readDelegationPolicyText(repoRoot: string): DelegationPolicyText {
  const raw = readText(repoRoot, POLICY_PATH);
  if (raw === null) throw new Error(`${POLICY_PATH} is missing`);
  const delegation = (JSON.parse(raw) as { readonly delegation?: unknown }).delegation;
  const fields = delegation && typeof delegation === 'object' && !Array.isArray(delegation)
    ? delegation as Readonly<Record<string, unknown>>
    : {};
  const { rule, runner_rule: runnerRule } = fields;
  if (typeof rule !== 'string' || !rule.trim()) throw new Error(`${POLICY_PATH} delegation.rule is not a non-empty string`);
  if (typeof runnerRule !== 'string' || !runnerRule.trim()) throw new Error(`${POLICY_PATH} delegation.runner_rule is not a non-empty string`);
  return { rule, runnerRule };
}

export function runDelegationAdvisor(input: DelegationAdvisorInput): HookHandlerResult {
  if (!DELEGATION_COMMAND.test(payloadString(input.payload, 'prompt'))) return { exitCode: 0 };

  let policy: DelegationPolicyText;
  try {
    policy = readDelegationPolicyText(input.collector.getRepoRoot());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      exitCode: 1,
      diagnostics: `repo-harness-hook: delegation advisor: ${message}\n`,
      reason: 'delegation-policy-invalid',
    };
  }

  const resolution = input.collector.getEffectiveState();
  const contract = resolution.ok ? activeContractPath(resolution.state) : null;
  const highRisk = resolution.ok && resolution.state.workflow_profile === 'high';
  const maxAgents = highRisk ? DELEGATION_CAPS.highRiskMaxAgents : DELEGATION_CAPS.maxAgents;
  const context = [
    '[repo-harness:delegation]',
    '',
    'The current user prompt explicitly enabled bounded delegation. This is permission only; it does not instruct continuation, verification, or execution and does not override the current user prompt.',
    '',
    contract
      ? `The active task contract (${contract}) constrains the implementation scope authorized by the current turn, but does not by itself authorize resuming prior implementation or completing Exit Criteria.`
      : 'No active task contract was resolved. Scope remains the current user prompt; do not invent implementation, verification, or workflow work.',
    '',
    `Spawn no more than ${maxAgents} agents. Keep max spawn depth at ${DELEGATION_CAPS.maxDepth}.`,
    '',
    `Delegation rule: ${policy.rule}`,
    '',
    `Runner rule: ${policy.runnerRule}`,
  ].join('\n');
  if (resolution.ok) return { exitCode: 0, additionalContext: context };
  return {
    exitCode: 0,
    additionalContext: context,
    diagnostics: effectiveStateDiagnostic('delegation advisor', resolution),
    reason: 'context-unavailable',
  };
}
