/**
 * In-process ports for the four Codex/subagent hook routes.
 *
 * The handlers intentionally keep the shell routes' observable contract:
 * payloads are parsed once, decisions are emitted as the same JSON envelopes,
 * delegation state uses the same paths and scope keys, and all filesystem
 * writes remain fail-open for hook callers.  Runtime dispatch owns host I/O;
 * this module only returns a result.
 */

import {
  createHash,
  randomBytes,
} from 'crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'path';
import { recordCircuitAttempt } from './circuit-breaker';
import type { WorkflowProfile } from '../../core/workflow/profile';
import {
  DELEGATION_STATE_RELATIVE,
  delegationScope,
  delegationScopes,
  type DelegationState,
  withDelegationStateTransaction,
} from './delegation-state';

export type SubagentHandlerEvent =
  | 'PreToolUse'
  | 'UserPromptSubmit'
  | 'SubagentStart'
  | 'SubagentStop';

export interface SubagentHandlerInput {
  readonly event: SubagentHandlerEvent;
  readonly repoRoot: string;
  readonly input?: string | Buffer;
  readonly env?: NodeJS.ProcessEnv;
  readonly now?: () => Date;
}

export interface SubagentHandlerResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

interface JsonObject {
  readonly [key: string]: unknown;
}

interface ActiveContract {
  readonly plan: string;
  readonly contract: string;
  readonly content: string;
}

interface NativeRoleRouting {
  readonly schema_version: 1;
  readonly required: true;
  readonly agent_id: string | null;
  readonly turn_id: string | null;
  readonly agent_type: string | null;
  readonly observed_model: string | null;
  readonly configured_model: string | null;
  readonly config_path: string | null;
  readonly config_sha256: string | null;
  readonly status: 'verified' | 'mismatch' | 'invalid' | 'unavailable' | 'unverified';
  readonly reason: string;
  readonly checked_at: string;
}

const RETURN_CONTRACT_MARKER = '[repo-harness:return-channel]';
const RETURN_CONTRACT_TEXT = '\n\n[repo-harness:return-channel] Your final text message is the only channel returned to your caller. Put the complete findings/report in final text. Do not call SendUserMessage for report delivery; content sent through SendUserMessage is delivered outside the Agent tool result.';

function result(stdout = '', stderr = '', exitCode = 0): SubagentHandlerResult {
  return { exitCode, stdout, stderr };
}

function parsePayload(input: string | Buffer | undefined): JsonObject {
  if (input === undefined) return {};
  const text = input.toString().trim();
  if (!text) return {};
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as JsonObject
      : {};
  } catch {
    return {};
  }
}

function firstString(input: JsonObject | undefined, keys: readonly string[]): string {
  for (const key of keys) {
    const value = input?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function nestedValue(input: unknown, keys: readonly string[]): unknown {
  let value = input;
  for (const key of keys) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    value = (value as JsonObject)[key];
  }
  return value;
}

function sanitize(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 120);
}

function hash(value: string, algorithm: 'sha1' | 'sha256'): string {
  return createHash(algorithm).update(value).digest('hex');
}

function readJson(path: string): JsonObject | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as JsonObject
      : null;
  } catch {
    return null;
  }
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function atomicWriteJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, path);
}

function activeContractPath(repoRoot: string): ActiveContract | null {
  try {
    const plan = readFileSync(join(repoRoot, '.ai/harness/active-plan'), 'utf8').trim();
    const match = /^plans\/plan-([a-zA-Z0-9][a-zA-Z0-9._-]*)\.md$/.exec(plan);
    if (!match) return null;
    const contract = `tasks/contracts/${match[1]}.contract.md`;
    const planPath = join(repoRoot, plan);
    const contractPath = join(repoRoot, contract);
    if (!statSync(planPath).isFile() || !statSync(contractPath).isFile()) return null;
    const content = readFileSync(contractPath, 'utf8');
    if (!/^> \*\*Status\*\*:\s*(Active|Ready|Executing)\s*$/mi.test(content)) return null;
    return { plan, contract, content };
  } catch {
    return null;
  }
}

function parseEffectiveState(repoRoot: string): JsonObject | null {
  return readJson(join(repoRoot, '.ai/harness/state/effective.json'));
}

function policyDelegation(repoRoot: string): JsonObject {
  const policy = readJson(join(repoRoot, '.ai/harness/policy.json'));
  const delegation = policy?.delegation;
  return delegation && typeof delegation === 'object' && !Array.isArray(delegation)
    ? delegation as JsonObject
    : {};
}

function isDelegationDiscussion(text: string): boolean {
  if (!/\b(spawn|use|run)\s+(bounded\s+)?subagents?\b/i.test(text)) return false;
  if (/^\s*(please\s+)?(spawn|use|run)\s+(bounded\s+)?subagents?\s+(to|for)\b/i.test(text)) return false;
  return [
    /[?？]/,
    /\b(should|need|necessary)\b/i,
    /(机制|有必要|必要|是否|为什么|怎么|如何|架构|设计|注册|路由|本来就有)/i,
    /\b(mechanism|architecture|design|registration|route|routing|adapter|hook)\b/i,
  ].some((pattern) => pattern.test(text));
}

function delegationTrigger(prompt: string): { readonly name: string } | null {
  const triggers: readonly { readonly name: string; readonly pattern: RegExp; readonly skipDiscussion?: boolean }[] = [
    { name: 'slash-delegate', pattern: /(^|\s)\/(delegate|parallel)\b/i },
    { name: 'spawn-subagents', pattern: /\b(spawn|use|run)\s+(bounded\s+)?subagents?\b/i, skipDiscussion: true },
    { name: 'multiple-agents', pattern: /\buse\s+multiple\s+agents?\b/i },
    { name: 'parallel-agents', pattern: /\bparallel\s+(agents?|workstreams?|investigation|research)\b/i },
    { name: 'chinese-subagent', pattern: /交给\s*子代理|使用多个\s*(agent|代理)|并行(调查|研究|处理|执行|agent|代理)/i },
  ];
  return triggers.find((entry) => entry.pattern.test(prompt) && !(entry.skipDiscussion && isDelegationDiscussion(prompt))) ?? null;
}

function renderDelegationOutput(context: string): string {
  return `${JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: context,
    },
  })}\n`;
}

function runReturnChannel(input: JsonObject): SubagentHandlerResult {
  const toolName = String(input.tool_name ?? '');
  if (toolName === 'Task' || toolName === 'Agent') {
    const toolInput = input.tool_input;
    if (!toolInput || typeof toolInput !== 'object' || Array.isArray(toolInput)) return result();
    const prompt = (toolInput as JsonObject).prompt;
    if (typeof prompt !== 'string' || prompt.includes(RETURN_CONTRACT_MARKER)) return result();
    return result(`${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
        permissionDecisionReason: 'subagent-return-channel-guard: delivery contract appended to spawn prompt',
        updatedInput: { ...(toolInput as JsonObject), prompt: prompt + RETURN_CONTRACT_TEXT },
      },
    })}\n`);
  }
  if (toolName === 'SendUserMessage') {
    const agentId = String(input.agent_id ?? '');
    const transcriptPath = String(input.transcript_path ?? '');
    if (!agentId && !transcriptPath.includes('/subagents/agent-')) return result();
    return result(`${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: 'subagent-return-channel-guard: SendUserMessage from a spawned subagent does not reach the caller Agent tool result. Put the full report in final text and end the subagent turn.',
      },
    })}\n`);
  }
  return result();
}

function runDelegationAdvisor(repoRoot: string, input: JsonObject, env: NodeJS.ProcessEnv, now: Date): SubagentHandlerResult {
  const prompt = firstString(input, ['prompt', 'user_prompt', 'user_message', 'message', 'input']);
  if (!prompt) return result();
  const trigger = delegationTrigger(prompt);
  if (!trigger) return result();

  try {
    const policy = policyDelegation(repoRoot);
    const activeContract = activeContractPath(repoRoot);
    const strictContract = Boolean(activeContract && /^> \*\*Workflow Profile\*\*:\s*strict\s*$/mi.test(activeContract.content));
    const defaultMax = Number.isInteger(policy.max_agents) ? policy.max_agents as number : 2;
    const strictMax = Number.isInteger(policy.strict_max_agents) ? policy.strict_max_agents as number : 3;
    const maxAgents = strictContract ? Math.min(strictMax, 3) : Math.min(defaultMax, 2);
    const maxDepth = Number.isInteger(policy.max_depth) ? policy.max_depth as number : 1;
    const preferredRunners = Array.isArray(policy.preferred_runners) && policy.preferred_runners.length
      ? policy.preferred_runners
      : ['subagent'];
    const fallbackRunner = typeof policy.fallback_runner === 'string' && policy.fallback_runner
      ? policy.fallback_runner
      : null;
    const scope = delegationScope(input, env);
    const relativeStateFile = scope ? join('turns', `${scope.id}.json`) : 'latest.json';
    const promptHash = hash(prompt, 'sha1');
    const evidenceScope = `${scope?.id || 'unscoped'}-${promptHash.slice(0, 16)}`;
    const state: DelegationState = {
      version: 2,
      eligible: true,
      explicit: true,
      spawned: false,
      fallback_used: false,
      mode: 'explicit',
      max_agents: maxAgents,
      max_depth: maxDepth,
      allow_parallel_writers: false,
      stop_fallback: true,
      native_role_routing: {
        required: true,
        status: 'unverified',
        reason: 'No authoritative SubagentStart role/model evidence has been recorded for this delegation.',
        evidence_dir: join('role-routing', evidenceScope),
      },
      preferred_runners: preferredRunners,
      fallback_runner: fallbackRunner,
      trigger: trigger.name,
      prompt_hash: promptHash,
      scope_source: scope?.source || 'unscoped',
      scope_id: scope?.id || '',
      state_file: relativeStateFile,
      created_at: now.toISOString(),
      created_at_epoch: Math.floor(now.getTime() / 1000),
      updated_at: now.toISOString(),
    };
    try {
      withDelegationStateTransaction(
        repoRoot,
        scope ? [scope] : [],
        (transaction) => {
          const stateFile = transaction.snapshot.paths?.stateFile ?? relativeStateFile;
        transaction.commit(
          { ...state, state_file: stateFile },
          { stateFile: relativeStateFile, replace: true },
        );
        },
      );
    } catch {
      // A convenience pointer failure must not suppress the delegation
      // permission/context envelope for the current prompt.
    }

    const sharedRules = [
      'Rules:',
      `- Spawn no more than ${maxAgents} agents.`,
      '- Use explorer for read-only code mapping.',
      '- Use worker only for an isolated implementation slice.',
      '- Use reviewer for correctness, regression, security, and missing-test review.',
      '- Never give two agents overlapping write ownership.',
      `- Keep max spawn depth at ${maxDepth}.`,
      '- Give every agent a precise scope and required return format.',
      '- Pass fork_turns="none" on every spawn_agent call that selects an agent_type: the default fork_turns="all" copies the full parent conversation into the child. A named-role child works from its self-contained packet and the contract brief, not inherited parent history.',
      '- Wait for all requested agents.',
      '- Reconcile contradictory findings in the parent.',
      '- Close completed agent threads.',
      '- Do not spawn for a trivial or strictly sequential task.',
      '- The role labels above describe responsibilities only; they do not prove that Codex selected a same-name custom-agent profile or its configured model.',
      '- Treat native children as inherited-model until the SubagentStart hook records matching non-default agent_type and model evidence. If it records unavailable or mismatch, report runner degradation and use the contract runner fallback instead of claiming role-specific routing.',
    ];
    const permissionContext = [
      '[repo-harness:delegation]',
      '',
      'The current user prompt explicitly enabled bounded delegation. This is permission only; it does not instruct continuation, verification, or execution and does not override the current user prompt.',
      '',
      'No active task contract was resolved. Scope remains the current user prompt; do not invent implementation, verification, or workflow work.',
      '',
      `Runner preference (policy delegation.preferred_runners): ${preferredRunners.join(', ')}. Delegate only when the current prompt contains at least two independent bounded workstreams; otherwise run sequentially.`,
      '',
      ...sharedRules,
    ].join('\n');
    const contractContext = [
      '[repo-harness:delegation]',
      '',
      'The current user prompt explicitly enabled bounded delegation.',
      '',
      `The current user turn is the execution authority. The active task contract (${activeContract?.contract}) constrains the implementation scope authorized by the current turn, but does not by itself authorize resuming prior implementation or completing Exit Criteria.`,
      '',
      `Runner preference (policy delegation.preferred_runners): ${preferredRunners.join(', ')}. Native subagent (spawn_agent) is the preferred parallelism accelerator that consumes the contract brief. When spawn_agent is unavailable, sandboxed, or unreliable, degrade to ${fallbackRunner || 'main-thread'} on the SAME contract via contract-run. Runner-availability degradation MUST be recorded in the contract-run manifest and MUST NOT silently succeed; it is a runner-availability fallback, not a product-semantics change.`,
      '',
      'If this task contains at least two independent, bounded workstreams, dispatch per the contract before doing the corresponding work in the parent; otherwise run it sequentially.',
      '',
      ...sharedRules,
      '',
      'Execution boundary: implement exactly the Goal, In scope items, Allowed Paths, and Exit Criteria in this brief. Treat absent requirements as forbidden design space, not as permission to improve.',
      '',
      'Do not add optional features, alternate UX, extra integrations, migration paths, compatibility behavior, fallback behavior, telemetry, broad cleanup, refactors, new abstractions, extra docs, or polish unless that work is explicitly listed under In scope or required by Exit Criteria.',
      '',
      'If you discover useful additional work, record it under Out of scope / Future work in the notes or review artifact. Do not implement it. Do not end with unsolicited offers to do more work.',
      '',
      'If the requested outcome cannot be completed without expanding scope, fail closed: stop, name the missing decision, and cite the exact file/section that blocks execution.',
    ].join('\n');
    return result(renderDelegationOutput(activeContract ? contractContext : permissionContext));
  } catch {
    // The shell route is deliberately fail-open for advisor state/context
    // failures. A lost convenience pointer must not block the user turn.
    return result();
  }
}

function validBoundedField(value: unknown, pattern: RegExp): value is string {
  return typeof value === 'string'
    && value.length <= 128
    && !/[\u0000-\u001f\u007f]/.test(value)
    && pattern.test(value);
}

interface AgentMatch {
  readonly configPath: string;
  readonly model: string;
  readonly configSha256: string;
}

interface AgentScan {
  readonly matches: AgentMatch[];
  readonly invalid: boolean;
}

function scanAgentDirectory(directory: string, authorityRoot: string, agentType: string): AgentScan {
  if (!directory || !existsSync(directory)) return { matches: [], invalid: false };
  let entries: { readonly name: string; readonly isFile: () => boolean }[];
  try {
    const authorityStat = lstatSync(authorityRoot);
    const directoryStat = lstatSync(directory);
    if (authorityStat.isSymbolicLink() || !authorityStat.isDirectory() || directoryStat.isSymbolicLink() || !directoryStat.isDirectory()) {
      return { matches: [], invalid: true };
    }
    const canonicalRoot = realpathSync(authorityRoot);
    const canonicalDirectory = realpathSync(directory);
    if (!canonicalDirectory.startsWith(`${canonicalRoot}${sep}`)) return { matches: [], invalid: true };
    entries = readdirSync(directory, { withFileTypes: true })
      .filter((entry: { name: string }) => entry.name.endsWith('.toml'))
      .sort((left: { name: string }, right: { name: string }) => left.name.localeCompare(right.name));
  } catch {
    return { matches: [], invalid: true };
  }
  const matches: AgentMatch[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) return { matches: [], invalid: true };
    const configPath = join(directory, entry.name);
    try {
      const raw = readFileSync(configPath, 'utf8');
      const parsed = Bun.TOML.parse(raw) as JsonObject;
      const requiredStrings = [parsed.name, parsed.description, parsed.developer_instructions];
      if (requiredStrings.some((value) => typeof value !== 'string' || !value.trim())) return { matches: [], invalid: true };
      if (parsed.name === agentType) {
        matches.push({
          configPath,
          model: typeof parsed.model === 'string' ? parsed.model.trim() : '',
          configSha256: hash(raw, 'sha256'),
        });
      }
    } catch {
      return { matches: [], invalid: true };
    }
  }
  return { matches, invalid: false };
}

function customAgentProfile(repoRoot: string, agentType: string, env: NodeJS.ProcessEnv): { readonly ok: boolean; readonly invalid?: boolean; readonly reason?: string; readonly configPath?: string; readonly model?: string; readonly configSha256?: string } {
  const projectCodexRoot = join(repoRoot, '.codex');
  const project = scanAgentDirectory(join(projectCodexRoot, 'agents'), projectCodexRoot, agentType);
  if (project.invalid) return { ok: false, invalid: true, reason: 'Project custom-agent configuration is malformed or ambiguous.' };
  if (project.matches.length > 1) return { ok: false, invalid: true, reason: 'Project custom-agent name is duplicated.' };
  if (project.matches.length === 1) {
    const match = project.matches[0];
    return validBoundedField(match.model, /^[A-Za-z0-9._-]+$/)
      ? { ok: true, ...match }
      : { ok: false, invalid: true, reason: 'Selected project custom-agent profile does not pin a model.' };
  }
  const codexHome = env.CODEX_HOME || (env.HOME ? join(env.HOME, '.codex') : '');
  const user = scanAgentDirectory(codexHome ? join(codexHome, 'agents') : '', codexHome, agentType);
  if (user.invalid) return { ok: false, invalid: true, reason: 'User custom-agent configuration is malformed or ambiguous.' };
  if (user.matches.length > 1) return { ok: false, invalid: true, reason: 'User custom-agent name is duplicated.' };
  if (user.matches.length === 1) {
    const match = user.matches[0];
    return validBoundedField(match.model, /^[A-Za-z0-9._-]+$/)
      ? { ok: true, ...match }
      : { ok: false, invalid: true, reason: 'Selected user custom-agent profile does not pin a model.' };
  }
  return { ok: false, invalid: true, reason: 'No custom-agent profile matches the authoritative agent_type.' };
}

function nativeRoleRoutingEvidence(repoRoot: string, input: JsonObject, state: DelegationState, env: NodeJS.ProcessEnv, now: Date): NativeRoleRouting | null {
  if (state.native_role_routing?.required !== true) return null;
  const agentType = firstString(input, ['agent_type']);
  const observedModel = firstString(input, ['model']);
  const agentId = firstString(input, ['agent_id']);
  const turnId = firstString(input, ['turn_id']);
  const base = {
    schema_version: 1 as const,
    required: true as const,
    agent_id: agentId || null,
    turn_id: turnId || null,
    agent_type: agentType || null,
    observed_model: observedModel || null,
    configured_model: null,
    config_path: null,
    config_sha256: null,
    checked_at: now.toISOString(),
  };
  if (!agentType || !observedModel || !agentId || !turnId) {
    return { ...base, status: 'unverified', reason: 'SubagentStart omitted one or more required role-routing fields.' };
  }
  if (!validBoundedField(agentType, /^[A-Za-z0-9_-]+$/)
    || !validBoundedField(observedModel, /^[A-Za-z0-9._-]+$/)
    || !validBoundedField(agentId, /^[A-Za-z0-9._:-]+$/)
    || !validBoundedField(turnId, /^[A-Za-z0-9._:-]+$/)) {
    return { ...base, agent_id: null, turn_id: null, agent_type: null, observed_model: null, status: 'invalid', reason: 'SubagentStart supplied malformed authoritative role-routing fields.' };
  }
  if (agentType === 'default') {
    return { ...base, status: 'unavailable', reason: `Codex resolved the native child as default on ${observedModel}; no custom-agent role was selected.` };
  }
  const profile = customAgentProfile(repoRoot, agentType, env);
  if (!profile.ok) return { ...base, status: profile.invalid ? 'invalid' : 'unverified', reason: profile.reason ?? '' };
  if (profile.model !== observedModel) {
    return { ...base, status: 'mismatch', reason: `Codex started ${agentType} on ${observedModel}, but its custom-agent TOML requires ${profile.model}.`, configured_model: profile.model ?? null, config_path: profile.configPath ?? null, config_sha256: profile.configSha256 ?? null };
  }
  return { ...base, status: 'verified', reason: `Codex started custom agent ${agentType} on its configured model ${observedModel}.`, configured_model: profile.model ?? null, config_path: profile.configPath ?? null, config_sha256: profile.configSha256 ?? null };
}

function resolveEvidenceDir(stateDir: string, relativePath: unknown): string | null {
  if (typeof relativePath !== 'string' || !relativePath.trim() || isAbsolute(relativePath)) return null;
  const stateRootStat = lstatSync(stateDir);
  if (stateRootStat.isSymbolicLink() || !stateRootStat.isDirectory()) return null;
  const root = resolve(stateDir);
  const resolved = resolve(root, relativePath);
  if (resolved === root || !resolved.startsWith(`${root}${sep}`)) return null;
  let current = root;
  for (const segment of relative(root, resolved).split(sep)) {
    current = join(current, segment);
    if (existsSync(current)) {
      const stat = lstatSync(current);
      if (stat.isSymbolicLink() || !stat.isDirectory()) return null;
    } else {
      try { mkdirSync(current, { mode: 0o700 }); } catch (error) {
        if (!error || typeof error !== 'object' || (error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      }
      const stat = lstatSync(current);
      if (stat.isSymbolicLink() || !stat.isDirectory()) return null;
    }
    if (!resolve(current).startsWith(`${root}${sep}`)) return null;
  }
  return current;
}

function runSubagentStart(repoRoot: string, input: JsonObject, env: NodeJS.ProcessEnv, now: Date): SubagentHandlerResult {
  const effective = parseEffectiveState(repoRoot);
  let profile = typeof effective?.workflow_profile === 'string' ? effective.workflow_profile : '';
  let explicitHighRisk = false;
  const activePlan = (() => {
    try { return readFileSync(join(repoRoot, '.ai/harness/active-plan'), 'utf8').trim(); } catch { return ''; }
  })();
  const activeContract = activePlan
    ? activePlan.replace(/^plans\/plan-/, 'tasks/contracts/').replace(/\.md$/, '.contract.md')
    : '';
  if (activeContract && existsSync(join(repoRoot, activeContract))) {
    let content = '';
    try { content = readFileSync(join(repoRoot, activeContract), 'utf8'); } catch { content = ''; }
    if (/^> \*\*(Workflow Profile|Risk)\*\*:\s*(strict|high)\s*$/mi.test(content)) {
      profile = 'strict';
      explicitHighRisk = true;
    }
  }
  const progressToken = typeof effective?.progress_token === 'string' && effective.progress_token ? effective.progress_token : 'unknown';
  const normalizedProfile: WorkflowProfile = profile === 'lite' || profile === 'strict' ? profile : 'standard';
  try {
    const decision = recordCircuitAttempt(repoRoot, {
      kind: 'subagent',
      guard: 'SubagentLimit',
      reason: 'bounded subagent spawn cap',
      pathOrAction: 'spawn-subagent',
      progressToken,
      fingerprint: 'subagent-spawn',
      profile: normalizedProfile,
      explicitHighRiskContract: explicitHighRisk,
      riskTriggeredConsult: false,
      userRequestedConsult: false,
      strongBoundary: false,
    });
    if (!decision.allowed) return result('', `${JSON.stringify(decision)}\n`, 2);
  } catch {
    return result('', '', 2);
  }

  const stateDir = join(repoRoot, DELEGATION_STATE_RELATIVE);
  let nativeRoleRouting: NativeRoleRouting | null = null;
  try {
    let routingForContext: NativeRoleRouting | null = null;
    withDelegationStateTransaction(
      repoRoot,
      delegationScopes(input, env),
      (transaction) => {
        const state = transaction.snapshot.state;
        if (!state?.eligible) return;
        const updated: Record<string, unknown> = { ...state };
        if (state.explicit && !state.spawned) {
          updated.spawned = true;
          updated.spawned_at = now.toISOString();
        }
        routingForContext = nativeRoleRoutingEvidence(repoRoot, input, state, env, now);
        if (routingForContext) {
          const evidenceDir = resolveEvidenceDir(stateDir, state.native_role_routing?.evidence_dir);
          const agentId = firstString(input, ['agent_id']);
          const turnId = firstString(input, ['turn_id']);
          if (!evidenceDir || !agentId || !turnId) {
            routingForContext = {
              ...routingForContext,
              status: routingForContext.status === 'invalid' ? 'invalid' : 'unverified',
              reason: evidenceDir
                ? 'SubagentStart omitted the identity fields required to persist role-routing evidence.'
                : 'Delegation state has no safe role-routing evidence directory.',
            };
          } else {
            const evidenceKey = hash(`${turnId}\0${agentId}`, 'sha256');
            atomicWriteJson(join(evidenceDir, `${evidenceKey}.json`), routingForContext);
          }
        }
        updated.updated_at = now.toISOString();
        transaction.commit(updated);
      },
    );
    nativeRoleRouting = routingForContext;
  } catch {
    // Context remains useful even when delegation state is absent or malformed.
  }

  const contextRouting = nativeRoleRouting as NativeRoleRouting | null;
  const context = [
    '[repo-harness:subagent-context]',
    '',
    ...(contextRouting
      ? [
          `[repo-harness:native-role-routing] ${contextRouting.status}: ${contextRouting.reason}`,
          contextRouting.status === 'verified'
            ? 'Custom-agent model routing is verified for this child; reasoning-effort routing remains unverified because SubagentStart does not expose it.'
            : 'Do not claim custom-agent model or reasoning-effort routing. Return this routing status to the parent so it can record runner degradation or use the configured fallback.',
          '',
        ]
      : []),
    'Read the active repo-harness contract before working.',
    'Stay within the assigned role and permission scope.',
    'Do not broaden the task.',
    'Explorer and reviewer roles are read-only unless the parent prompt explicitly assigns a writable worker scope.',
    '',
    'Return complete findings in your final response, including:',
    '- files and symbols inspected',
    '- evidence',
    '- risks or uncertainty',
    '- tests or commands run when relevant',
    '- recommended parent action',
    '',
    'Do not claim overall task completion.',
    '',
    'Execution boundary: implement exactly the Goal, In scope items, Allowed Paths, and Exit Criteria in this brief. Treat absent requirements as forbidden design space, not as permission to improve.',
    '',
    'Do not add optional features, alternate UX, extra integrations, migration paths, compatibility behavior, fallback behavior, telemetry, broad cleanup, refactors, new abstractions, extra docs, or polish unless that work is explicitly listed under In scope or required by Exit Criteria.',
    '',
    'If you discover useful additional work, record it under Out of scope / Future work in the notes or review artifact. Do not implement it. Do not end with unsolicited offers to do more work.',
    '',
    'If the requested outcome cannot be completed without expanding scope, fail closed: stop, name the missing decision, and cite the exact file/section that blocks execution.',
  ].join('\n');
  return result(`${JSON.stringify({ hookSpecificOutput: { hookEventName: 'SubagentStart', additionalContext: context } })}\n`);
}

function runStopQuality(repoRoot: string, input: JsonObject, env: NodeJS.ProcessEnv, now: Date): SubagentHandlerResult {
  if (input.stop_hook_active === true || input.subagent_stop_hook_active === true) return result();
  const message = firstString(input, ['final_message', 'last_assistant_message', 'subagent_result', 'result', 'response', 'output', 'message', 'assistant_message']);
  if (!message) return result();
  const trimmed = message.trim();
  const tooThin = trimmed.length < 120;
  const looksLikeBareApproval = /^(looks good|lgtm|ok|done|no issues|all good)[.!\s]*$/i.test(trimmed);
  const mentionsUnresolvedError = /\b(error|failed|failure|blocked|exception|timeout)\b/i.test(trimmed)
    && !/\b(risk|uncertain|recommend|next|because|原因|风险|建议|不确定)\b/i.test(trimmed);
  const hasEvidence = /([A-Za-z0-9_.-]+\/[A-Za-z0-9_./-]+|\.(ts|tsx|js|jsx|sh|md|json|toml)\b|\b(symbols?|files?|evidence|tests?|commands?)\b|文件|证据|测试|命令)/i.test(trimmed);
  let reason = '';
  if (looksLikeBareApproval || tooThin) reason = 'The subagent final report is too thin for repo-harness delegation.';
  else if (mentionsUnresolvedError) reason = 'The subagent reported an unresolved error without a risk or parent-action recommendation.';
  else if (!hasEvidence && /\b(review|explore|investigate|audit|map)\b/i.test(trimmed)) reason = 'The subagent report lacks file, symbol, command, or evidence references.';
  if (!reason) return result();

  const statePath = join(repoRoot, DELEGATION_STATE_RELATIVE, 'subagent-stop-quality.json');
  const reportHash = hash(trimmed, 'sha1');
  const sessionIdentity = firstString(input, ['run_id', 'session_id', 'transcript_path']) || env.CODEX_SESSION_ID || env.CLAUDE_SESSION_ID || '';
  const subagentIdentity = firstString(input, ['subagent_id', 'agent_id', 'task_id', 'thread_id', 'name', 'role']);
  const scopeKey = [sessionIdentity ? sanitize(sessionIdentity) : 'unscoped-session', subagentIdentity ? sanitize(subagentIdentity) : 'unscoped-subagent', reportHash].join(':');
  try {
    const state = readJson(statePath);
    if (state?.last_blocked_key === scopeKey) return result();
    writeJson(statePath, {
      version: 1,
      last_blocked_key: scopeKey,
      last_blocked_hash: reportHash,
      scope: {
        session: sessionIdentity ? sanitize(sessionIdentity) : '',
        subagent: subagentIdentity ? sanitize(subagentIdentity) : '',
      },
      updated_at: now.toISOString(),
    });
  } catch {
    return result();
  }
  return result(`${JSON.stringify({
    decision: 'block',
    reason: `[SubagentQualityGate] ${reason} Continue the subagent once and return a complete final response with: files and symbols inspected, evidence, risks or uncertainty, tests or commands run when relevant, and recommended parent action. Do not claim overall task completion.`,
  })}\n`);
}

/** Dispatch one of the four formerly shell-backed routes. */
export function runSubagentHandler(opts: SubagentHandlerInput): SubagentHandlerResult {
  const env = opts.env ?? process.env;
  const input = parsePayload(opts.input);
  const now = opts.now?.() ?? new Date();
  if (opts.event === 'PreToolUse') return runReturnChannel(input);
  if (opts.event === 'UserPromptSubmit') {
    if (env.HOOK_HOST !== 'codex') return result();
    return runDelegationAdvisor(opts.repoRoot, input, env, now);
  }
  if (opts.event === 'SubagentStart') {
    if (env.HOOK_HOST !== 'codex') return result();
    return runSubagentStart(opts.repoRoot, input, env, now);
  }
  if (env.HOOK_HOST !== 'codex') return result();
  return runStopQuality(opts.repoRoot, input, env, now);
}
