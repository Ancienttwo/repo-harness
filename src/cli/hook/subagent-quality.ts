/**
 * SubagentStop.quality: advisory note on a thin native-child final report.
 * Codex sends the report as `last_assistant_message`. The runtime decides
 * which hosts run this route.
 */

import { createHash } from 'crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import type { HookHandlerResult } from './handler-contract';
import { payloadIdentityField, payloadString, payloadValue, type HookIdentity, type HookPayload } from './hook-input';
import { DELEGATION_EVIDENCE_RELATIVE, sanitize } from './subagent-context';

export interface SubagentQualityInput {
  readonly repoRoot: string;
  readonly payload: HookPayload;
  readonly identity: HookIdentity;
  readonly now?: () => Date;
}

const NO_OUTPUT: HookHandlerResult = { exitCode: 0 };

function lastObservedKey(path: string): unknown {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Readonly<Record<string, unknown>>).last_observed_key
      : undefined;
  } catch {
    return undefined;
  }
}

export function runSubagentQuality(input: SubagentQualityInput): HookHandlerResult {
  if (payloadValue(input.payload, 'stop_hook_active') === true) return NO_OUTPUT;
  const trimmed = payloadString(input.payload, 'last_assistant_message').trim();
  if (!trimmed) return NO_OUTPUT;
  const tooThin = trimmed.length < 120;
  const looksLikeBareApproval = /^(looks good|lgtm|ok|done|no issues|all good)[.!\s]*$/i.test(trimmed);
  const mentionsUnresolvedError = /\b(error|failed|failure|blocked|exception|timeout)\b/i.test(trimmed)
    && !/\b(risk|uncertain|recommend|next|because|原因|风险|建议|不确定)\b/i.test(trimmed);
  const hasEvidence = /([A-Za-z0-9_.-]+\/[A-Za-z0-9_./-]+|\.(ts|tsx|js|jsx|sh|md|json|toml)\b|\b(symbols?|files?|evidence|tests?|commands?)\b|文件|证据|测试|命令)/i.test(trimmed);
  let reason = '';
  if (looksLikeBareApproval || tooThin) reason = 'The subagent final report is too thin for repo-harness delegation.';
  else if (mentionsUnresolvedError) reason = 'The subagent reported an unresolved error without a risk or parent-action recommendation.';
  else if (!hasEvidence && /\b(review|explore|investigate|audit|map)\b/i.test(trimmed)) reason = 'The subagent report lacks file, symbol, command, or evidence references.';
  if (!reason) return NO_OUTPUT;

  const statePath = join(input.repoRoot, DELEGATION_EVIDENCE_RELATIVE, 'subagent-stop-quality.json');
  const reportHash = createHash('sha1').update(trimmed).digest('hex');
  const session = input.identity.sessionId ? sanitize(input.identity.sessionId) : '';
  const agentId = payloadIdentityField(input.payload, 'agent_id');
  const subagent = agentId ? sanitize(agentId) : '';
  const scopeKey = [session || 'unscoped-session', subagent || 'unscoped-subagent', reportHash].join(':');
  try {
    if (lastObservedKey(statePath) === scopeKey) return NO_OUTPUT;
    mkdirSync(dirname(statePath), { recursive: true });
    writeFileSync(statePath, `${JSON.stringify({
      version: 1,
      last_observed_key: scopeKey,
      last_observed_hash: reportHash,
      scope: { session, subagent },
      updated_at: (input.now?.() ?? new Date()).toISOString(),
    }, null, 2)}\n`);
  } catch {
    return NO_OUTPUT;
  }
  return {
    exitCode: 0,
    additionalContext: `[SubagentQuality] ${reason} Record the report gap; return a complete final response with: files and symbols inspected, evidence, risks or uncertainty, tests or commands run when relevant, and recommended parent action. Do not claim overall task completion.`,
  };
}
