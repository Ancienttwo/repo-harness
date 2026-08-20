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
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'path';
import { BOARD_SLICE_MARKER, resolveBoardSliceBlock } from './board-slice-context';
import { recordCircuitAttempt } from './circuit-breaker';
import { withExclusiveDirectoryLock } from '../../effects/locking/exclusive-directory-lock';
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

interface ActiveContractRef {
  readonly plan: string;
  readonly contract: string;
}

interface ActiveContract extends ActiveContractRef {
  readonly content: string;
}

type SandboxMode = 'read-only' | 'workspace-write';

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
  readonly sandbox_mode: SandboxMode | null;
  readonly reasoning_effort_status: 'configured_unverified';
  readonly status: 'verified' | 'mismatch' | 'invalid' | 'unavailable' | 'unverified';
  readonly reason: string;
  readonly checked_at: string;
}

const RETURN_CONTRACT_MARKER = '[repo-harness:return-channel]';
const RETURN_CONTRACT_TEXT = '\n\n[repo-harness:return-channel] Your final text message is the only channel returned to your caller. Put the complete findings/report in final text. Do not call SendUserMessage for report delivery; content sent through SendUserMessage is delivered outside the Agent tool result.';
export const LONG_COMMAND_GUARDRAIL_MARKER = '[repo-harness:long-command-guardrail]';
const LONG_COMMAND_GUARDRAIL_TEXT = `${LONG_COMMAND_GUARDRAIL_MARKER} Do not foreground-wait on a verification, test, or gate command you expect to exceed roughly five minutes; the host stream watchdog terminates an agent after 600 seconds of silence. The default action is to hand that command back to the orchestrator: name the command and return BLOCKED on your role's machine-readable first line (RESULT:/VERDICT:/RECOMMENDATION:) instead of waiting on it. Run it yourself only when you can start it in the background and poll a log that keeps producing output.`;
export const EXECUTION_BOUNDARY_MARKER = '[repo-harness:execution-boundary/v1]';
/**
 * The single runtime owner of the anti-extras clause on the Codex native-child
 * path. Personas and the delegation advisor deliberately carry none: a child
 * that reads the same authority two or three times reads it as boilerplate.
 * `SubagentStart` is the only injection site that sees the real child start,
 * its scanned `sandbox_mode`, and active contract state at once, so it is the
 * only site that can render the clause exactly when it applies. The marker
 * makes composed-stack occurrence counting deterministic.
 */
const EXECUTION_BOUNDARY_BLOCK = [
  `${EXECUTION_BOUNDARY_MARKER} Execution boundary: implement exactly the Goal, In scope items, Allowed Paths, and Exit Criteria in this brief. Treat absent requirements as forbidden design space, not as permission to improve.`,
  '',
  'Do not add optional features, alternate UX, extra integrations, migration paths, compatibility behavior, fallback behavior, telemetry, broad cleanup, refactors, new abstractions, extra docs, or polish unless that work is explicitly listed under In scope or required by Exit Criteria.',
  '',
  'If you discover useful additional work, record it under Out of scope / Future work in the notes or review artifact. Do not implement it. Do not end with unsolicited offers to do more work.',
  '',
  'If the requested outcome cannot be completed without expanding scope, fail closed: stop, name the missing decision, and cite the exact file/section that blocks execution.',
].join('\n');
const READ_ONLY_SCOPE_NOTE = 'Read-only scope: inspect, verify, and report against the active contract. Do not implement, edit files, or run write commands; hand any required change back to the parent.';
const CONTRACT_ACTIVE_STATUS = /^> \*\*Status\*\*:\s*(Active|Ready|Executing)\s*$/mi;
const CONTRACT_STRICT_OR_HIGH_RISK = /^> \*\*(Workflow Profile|Risk)\*\*:\s*(strict|high)\s*$/mi;
const NATIVE_ROLE_ROUTING_STATE_FILE = 'native-role-routing.json';
const NATIVE_ROLE_ROUTING_LOCK_RELATIVE = `${DELEGATION_STATE_RELATIVE}/native-role-routing.lock`;
const MAX_NATIVE_ROLE_OBSERVATIONS = 32;

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

interface PathIdentity {
  readonly path: string;
  readonly dev: number;
  readonly ino: number;
}

function captureEvidenceWritePath(stateRoot: string, path: string): PathIdentity[] {
  const root = resolve(stateRoot);
  const target = resolve(path);
  const parent = dirname(target);
  const rel = relative(root, target);
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`native role evidence path escapes state root: ${path}`);
  }
  const identities: PathIdentity[] = [];
  let current = root;
  const parentRelative = relative(root, parent);
  const segments = parentRelative ? parentRelative.split(sep) : [];
  for (const segment of ['', ...segments]) {
    if (segment) current = join(current, segment);
    const stat = lstatSync(current);
    if (stat.isSymbolicLink() || !stat.isDirectory() || realpathSync(current) !== current) {
      throw new Error(`native role evidence ancestor is unsafe: ${current}`);
    }
    identities.push({ path: current, dev: stat.dev, ino: stat.ino });
  }
  if (existsSync(target)) {
    const targetStat = lstatSync(target);
    if (targetStat.isSymbolicLink() || !targetStat.isFile()) {
      throw new Error(`native role evidence target is unsafe: ${target}`);
    }
  }
  return identities;
}

function assertEvidenceWritePath(identities: readonly PathIdentity[], path: string): void {
  for (const identity of identities) {
    const stat = lstatSync(identity.path);
    if (stat.isSymbolicLink() || !stat.isDirectory()
      || stat.dev !== identity.dev || stat.ino !== identity.ino
      || realpathSync(identity.path) !== identity.path) {
      throw new Error(`native role evidence ancestor changed during write: ${identity.path}`);
    }
  }
  if (existsSync(path)) {
    const targetStat = lstatSync(path);
    if (targetStat.isSymbolicLink() || !targetStat.isFile()) {
      throw new Error(`native role evidence target changed during write: ${path}`);
    }
  }
}

function atomicWriteJson(stateRoot: string, path: string, value: unknown): void {
  const identities = captureEvidenceWritePath(stateRoot, path);
  const temporary = `${path}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    assertEvidenceWritePath(identities, path);
    renameSync(temporary, path);
  } catch (error) {
    try { unlinkSync(temporary); } catch { /* no temporary file remains at the validated path */ }
    throw error;
  }
}

/**
 * Sole owner of the `.ai/harness/active-plan` -> contract path derivation.
 * Callers layer their own predicate on top: the advisor asks "is a contract
 * active" (`Status`), `runSubagentStart` also asks "is this strict/high risk"
 * (`Workflow Profile`/`Risk`). The two questions are deliberately not merged --
 * a Draft high-risk contract still tightens the spawn cap.
 */
function activeContractRef(repoRoot: string): ActiveContractRef | null {
  try {
    const plan = readFileSync(join(repoRoot, '.ai/harness/active-plan'), 'utf8').trim();
    const match = /^plans\/plan-([a-zA-Z0-9][a-zA-Z0-9._-]*)\.md$/.exec(plan);
    if (!match) return null;
    return { plan, contract: `tasks/contracts/${match[1]}.contract.md` };
  } catch {
    return null;
  }
}

function activeContractPath(repoRoot: string): ActiveContract | null {
  const ref = activeContractRef(repoRoot);
  if (!ref) return null;
  try {
    const planPath = join(repoRoot, ref.plan);
    const contractPath = join(repoRoot, ref.contract);
    if (!statSync(planPath).isFile() || !statSync(contractPath).isFile()) return null;
    const content = readFileSync(contractPath, 'utf8');
    if (!CONTRACT_ACTIVE_STATUS.test(content)) return null;
    return { ...ref, content };
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

function delegationTrigger(prompt: string): { readonly name: string } | null {
  return /^\s*\/(delegate|parallel)(?:\s|$)/i.test(prompt)
    ? { name: 'slash-delegate' }
    : null;
}

function renderDelegationOutput(context: string): string {
  return `${JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: context,
    },
  })}\n`;
}

/**
 * Append the read-only board slice once. Advisory in every direction: a
 * resolution failure means no block, and an already-present marker means no
 * second block.
 *
 * The `HOOK_HOST !== 'codex'` guard is what makes injection exactly-once. On
 * the Codex host the same slice already rides `SubagentStart.context`, and
 * `runReturnChannel` has no other host discrimination -- Codex spawning
 * through `Agent` would otherwise receive the block twice, from two routes,
 * with no marker shared between them at the moment the prompt is built.
 */
function appendBoardSlice(repoRoot: string, prompt: string, env: NodeJS.ProcessEnv): string {
  if (env.HOOK_HOST === 'codex') return prompt;
  if (prompt.includes(BOARD_SLICE_MARKER)) return prompt;
  const block = resolveBoardSliceBlock(repoRoot);
  return block === null ? prompt : `${prompt}\n\n${block}`;
}

/**
 * Two independent appendices, each gated by its own marker.
 *
 * The previous shape returned early on `RETURN_CONTRACT_MARKER`, which was
 * correct while the contract text was the only appendix and became a
 * swallowing bug the moment a second one existed: a re-spawn carrying an
 * already-stamped prompt would never receive the slice. Each appendix now
 * decides for itself, and the envelope is emitted whenever either one changed
 * the prompt.
 */
function runReturnChannel(repoRoot: string, input: JsonObject, env: NodeJS.ProcessEnv): SubagentHandlerResult {
  const toolName = String(input.tool_name ?? '');
  if (toolName === 'Task' || toolName === 'Agent') {
    const toolInput = input.tool_input;
    if (!toolInput || typeof toolInput !== 'object' || Array.isArray(toolInput)) return result();
    const prompt = (toolInput as JsonObject).prompt;
    if (typeof prompt !== 'string') return result();
    const withContract = prompt.includes(RETURN_CONTRACT_MARKER)
      ? prompt
      : prompt + RETURN_CONTRACT_TEXT;
    const updatedPrompt = appendBoardSlice(repoRoot, withContract, env);
    if (updatedPrompt === prompt) return result();
    return result(`${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
        permissionDecisionReason: 'subagent-return-channel-guard: delivery contract appended to spawn prompt',
        updatedInput: { ...(toolInput as JsonObject), prompt: updatedPrompt },
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
    const preferredRunners = ['subagent'];
    const scope = delegationScope(input, env);
    const relativeStateFile = scope ? join('turns', `${scope.id}.json`) : 'latest.json';
    const promptHash = hash(prompt, 'sha1');
    const state: DelegationState = {
      version: 2,
      eligible: true,
      explicit: true,
      spawned: false,
      mode: 'explicit',
      max_agents: maxAgents,
      max_depth: maxDepth,
      allow_parallel_writers: false,
      preferred_runners: preferredRunners,
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
      '- Call native spawn_agent with the requested installed agent_type and fork_turns="none". A named-role child works from its self-contained packet and the contract brief, not inherited parent history.',
      '- The agent_type field is mandatory. If the live spawn schema cannot accept it, stop and report native role routing unavailable; do not select another runner.',
      '- Record the requested agent_type and observed runtime model separately. Reasoning effort is configured_unverified because SubagentStart does not expose it.',
      '- Wait for all requested agents.',
      '- Reconcile contradictory findings in the parent.',
      '- Close completed native agents.',
      '- Do not spawn for a trivial or strictly sequential task.',
      '- A role label in the dispatch message does not prove selection. Only official SubagentStart agent_type/model evidence can verify the installed custom-agent profile.',
      '- If SubagentStart records unavailable, mismatch, invalid, or unverified routing, fail closed and report the status; do not claim role routing and do not select an alternate runner.',
    ];
    const permissionContext = [
      '[repo-harness:delegation]',
      '',
      'The current user prompt explicitly enabled bounded delegation. This is permission only; it does not instruct continuation, verification, or execution and does not override the current user prompt.',
      '',
      'No active task contract was resolved. Scope remains the current user prompt; do not invent implementation, verification, or workflow work.',
      '',
      'Runner authority: Codex native spawn_agent with an installed agent_type. Delegate only when the current prompt contains at least two independent bounded workstreams; otherwise run sequentially.',
      '',
      ...sharedRules,
    ].join('\n');
    // Parent permission and routing only. The anti-extras clause is owned by
    // `SubagentStart` (see EXECUTION_BOUNDARY_BLOCK): children spawn with
    // fork_turns="none" and never inherit this text anyway.
    const contractContext = [
      '[repo-harness:delegation]',
      '',
      'The current user prompt explicitly enabled bounded delegation.',
      '',
      `The current user turn is the execution authority. The active task contract (${activeContract?.contract}) constrains the implementation scope authorized by the current turn, but does not by itself authorize resuming prior implementation or completing Exit Criteria.`,
      '',
      'Runner authority: Codex native spawn_agent with the exact installed agent_type. The custom-agent TOML remains the persona/model configuration source; the live SubagentStart event is the runtime identity/model observation. If native agent_type selection or matching evidence is unavailable, fail closed and report it. Do not dispatch the fleet role through an App thread, codex-exec, the main thread, or another runner.',
      '',
      'If this task contains at least two independent, bounded workstreams, dispatch per the contract before doing the corresponding work in the parent; otherwise run it sequentially.',
      '',
      ...sharedRules,
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
  readonly sandboxMode: string;
}

interface CustomAgentProfile {
  readonly ok: boolean;
  readonly invalid?: boolean;
  readonly reason?: string;
  readonly configPath?: string;
  readonly model?: string;
  readonly configSha256?: string;
  readonly sandboxMode?: string;
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
          sandboxMode: typeof parsed.sandbox_mode === 'string' ? parsed.sandbox_mode.trim() : '',
        });
      }
    } catch {
      return { matches: [], invalid: true };
    }
  }
  return { matches, invalid: false };
}

/**
 * Writability is read from the selected profile, never inferred from the agent
 * name, and never defaulted: a profile that does not declare one of the two
 * legal `sandbox_mode` values is invalid, so the child falls into the
 * fail-closed routing row and receives no implementation boundary.
 */
function acceptAgentMatch(match: AgentMatch, scope: 'project' | 'user'): CustomAgentProfile {
  if (!validBoundedField(match.model, /^[A-Za-z0-9._-]+$/)) {
    return { ok: false, invalid: true, reason: `Selected ${scope} custom-agent profile does not pin a model.` };
  }
  if (match.sandboxMode !== 'read-only' && match.sandboxMode !== 'workspace-write') {
    return { ok: false, invalid: true, reason: `Selected ${scope} custom-agent profile does not declare a valid sandbox_mode.` };
  }
  return { ok: true, ...match };
}

function customAgentProfile(repoRoot: string, agentType: string, env: NodeJS.ProcessEnv): CustomAgentProfile {
  const projectCodexRoot = join(repoRoot, '.codex');
  const project = scanAgentDirectory(join(projectCodexRoot, 'agents'), projectCodexRoot, agentType);
  if (project.invalid) return { ok: false, invalid: true, reason: 'Project custom-agent configuration is malformed or ambiguous.' };
  if (project.matches.length > 1) return { ok: false, invalid: true, reason: 'Project custom-agent name is duplicated.' };
  if (project.matches.length === 1) return acceptAgentMatch(project.matches[0], 'project');
  const codexHome = env.CODEX_HOME || (env.HOME ? join(env.HOME, '.codex') : '');
  const user = scanAgentDirectory(codexHome ? join(codexHome, 'agents') : '', codexHome, agentType);
  if (user.invalid) return { ok: false, invalid: true, reason: 'User custom-agent configuration is malformed or ambiguous.' };
  if (user.matches.length > 1) return { ok: false, invalid: true, reason: 'User custom-agent name is duplicated.' };
  if (user.matches.length === 1) return acceptAgentMatch(user.matches[0], 'user');
  return { ok: false, invalid: true, reason: 'No custom-agent profile matches the authoritative agent_type.' };
}

function nativeRoleRoutingEvidence(repoRoot: string, input: JsonObject, env: NodeJS.ProcessEnv, now: Date): NativeRoleRouting {
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
    sandbox_mode: null,
    reasoning_effort_status: 'configured_unverified' as const,
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
  const sandboxMode = profile.sandboxMode as SandboxMode;
  if (profile.model !== observedModel) {
    return { ...base, status: 'mismatch', reason: `Codex started ${agentType} on ${observedModel}, but its custom-agent TOML requires ${profile.model}.`, configured_model: profile.model ?? null, config_path: profile.configPath ?? null, config_sha256: profile.configSha256 ?? null, sandbox_mode: sandboxMode };
  }
  return { ...base, status: 'verified', reason: `Codex started custom agent ${agentType} on its configured model ${observedModel}.`, configured_model: profile.model ?? null, config_path: profile.configPath ?? null, config_sha256: profile.configSha256 ?? null, sandbox_mode: sandboxMode };
}

function nativeRoleRoutingScope(input: JsonObject, env: NodeJS.ProcessEnv): string {
  const session = firstString(input, ['session_id', 'run_id']) || env.CODEX_SESSION_ID || '';
  if (session) return `session-${sanitize(session)}`;
  const turnId = firstString(input, ['turn_id']);
  return turnId ? `turn-${sanitize(turnId)}` : 'unscoped';
}

function safeUnlinkEvidenceFile(stateDir: string, path: string): void {
  const identities = captureEvidenceWritePath(stateDir, path);
  assertEvidenceWritePath(identities, path);
  unlinkSync(path);
}

function pruneNativeRoleRoutingEvidence(stateDir: string, currentEvidenceDir: string): void {
  const routingRoot = resolveEvidenceDir(stateDir, 'role-routing');
  if (!routingRoot) return;
  const scopeEntries = readdirSync(routingRoot, { withFileTypes: true });
  for (const scopeEntry of scopeEntries) {
    if (!scopeEntry.isDirectory() || !/^(?:session|turn)-[a-z0-9-]+$|^unscoped$/.test(scopeEntry.name)) continue;
    const scopeDir = join(routingRoot, scopeEntry.name);
    const fileEntries = readdirSync(scopeDir, { withFileTypes: true });
    if (fileEntries.some((entry) => !entry.isFile() || !/^[a-f0-9]{64}\.json$/.test(entry.name))) continue;
    const files = fileEntries.map((entry) => join(scopeDir, entry.name));
    if (scopeDir === currentEvidenceDir) {
      const stale = files
        .map((path) => ({ path, mtimeMs: statSync(path).mtimeMs }))
        .sort((left, right) => right.mtimeMs - left.mtimeMs || left.path.localeCompare(right.path))
        .slice(MAX_NATIVE_ROLE_OBSERVATIONS);
      for (const entry of stale) safeUnlinkEvidenceFile(stateDir, entry.path);
      continue;
    }
    for (const path of files) safeUnlinkEvidenceFile(stateDir, path);
    const scopeStat = lstatSync(scopeDir);
    if (!scopeStat.isSymbolicLink() && scopeStat.isDirectory() && realpathSync(scopeDir) === scopeDir) {
      rmdirSync(scopeDir);
    }
  }
}

function persistNativeRoleRoutingEvidence(
  repoRoot: string,
  input: JsonObject,
  env: NodeJS.ProcessEnv,
  now: Date,
): NativeRoleRouting {
  const canonicalRepoRoot = realpathSync(repoRoot);
  return withExclusiveDirectoryLock(canonicalRepoRoot, NATIVE_ROLE_ROUTING_LOCK_RELATIVE, () => {
    const stateDir = join(canonicalRepoRoot, DELEGATION_STATE_RELATIVE);
    const observation = nativeRoleRoutingEvidence(repoRoot, input, env, now);
    const evidenceRelative = join('role-routing', nativeRoleRoutingScope(input, env));
    const evidenceDir = resolveEvidenceDir(stateDir, evidenceRelative);
    if (!evidenceDir) {
      return {
        ...observation,
        status: observation.status === 'invalid' ? 'invalid' : 'unverified',
        reason: 'No safe native role-routing evidence directory is available.',
      };
    }
    const agentId = firstString(input, ['agent_id']);
    const turnId = firstString(input, ['turn_id']);
    const evidenceKey = agentId && turnId
      ? hash(`${turnId}\0${agentId}`, 'sha256')
      : hash(`${observation.checked_at}\0${randomBytes(16).toString('hex')}`, 'sha256');
    atomicWriteJson(stateDir, join(evidenceDir, `${evidenceKey}.json`), observation);
    atomicWriteJson(stateDir, join(stateDir, NATIVE_ROLE_ROUTING_STATE_FILE), {
      schema_version: 1,
      required: true,
      status: 'unverified',
      reason: 'Runtime status is aggregated from official SubagentStart observations.',
      evidence_dir: evidenceRelative,
      reasoning_effort_status: 'configured_unverified',
      updated_at: now.toISOString(),
    });
    try { pruneNativeRoleRoutingEvidence(stateDir, evidenceDir); } catch { /* bounded cleanup retries on the next event */ }
    return observation;
  });
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

/** Append the standing long-command advisory once; marker presence is authoritative. */
export function appendLongCommandGuardrail(context: string): string {
  return context.includes(LONG_COMMAND_GUARDRAIL_MARKER)
    ? context
    : `${context}\n\n${LONG_COMMAND_GUARDRAIL_TEXT}`;
}

function runSubagentStart(repoRoot: string, input: JsonObject, env: NodeJS.ProcessEnv, now: Date): SubagentHandlerResult {
  const effective = parseEffectiveState(repoRoot);
  let profile = typeof effective?.workflow_profile === 'string' ? effective.workflow_profile : '';
  let explicitHighRisk = false;
  const contractRef = activeContractRef(repoRoot);
  let contractContent = '';
  if (contractRef && existsSync(join(repoRoot, contractRef.contract))) {
    try { contractContent = readFileSync(join(repoRoot, contractRef.contract), 'utf8'); } catch { contractContent = ''; }
    if (CONTRACT_STRICT_OR_HIGH_RISK.test(contractContent)) {
      profile = 'strict';
      explicitHighRisk = true;
    }
  }
  const activeContract = contractContent && CONTRACT_ACTIVE_STATUS.test(contractContent)
    ? contractRef?.contract ?? ''
    : '';
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

  const observedRouting = nativeRoleRoutingEvidence(repoRoot, input, env, now);
  let nativeRoleRouting: NativeRoleRouting = observedRouting;
  try {
    withDelegationStateTransaction(
      repoRoot,
      delegationScopes(input, env),
      (transaction) => {
        const state = transaction.snapshot.state;
        if (state?.eligible) {
          const updated: Record<string, unknown> = { ...state };
          if (state.explicit && !state.spawned) {
            updated.spawned = true;
            updated.spawned_at = now.toISOString();
          }
          updated.updated_at = now.toISOString();
          transaction.commit(updated);
        }
      },
    );
  } catch {
    // Advisor lifecycle state is best effort and cannot suppress official event evidence.
  }
  try {
    nativeRoleRouting = persistNativeRoleRoutingEvidence(repoRoot, input, env, now);
  } catch {
    nativeRoleRouting = {
      ...observedRouting,
      status: observedRouting.status === 'invalid' ? 'invalid' : 'unverified',
      reason: 'Native role/model evidence could not be persisted safely; routing is not verified.',
    };
  }

  // Pure advisory, resolved before the guardrail so the block sits with the
  // rest of the spawn context rather than after the standing footer. A failure
  // here means no injection: SubagentStart must never become blocking over a
  // read-only observation, and the existing handler idiom for that is a
  // swallowing try/catch.
  let boardSlice: string | null = null;
  try {
    boardSlice = resolveBoardSliceBlock(repoRoot);
  } catch {
    boardSlice = null;
  }

  const contextRouting = nativeRoleRouting;
  // Scope decision table. The implementation boundary is authority over an
  // authorized edit, so it is rendered only when both halves are known: a
  // resolved active contract and a verified writable child. A read-only child
  // gets the inverse note, and an unresolved contract or unverified routing
  // gets neither -- an instruction to "implement exactly the Goal" with no
  // resolved Goal is a fabricated reference.
  const scopeMode: SandboxMode | null = activeContract && contextRouting.status === 'verified'
    ? contextRouting.sandbox_mode
    : null;
  const context = appendLongCommandGuardrail([
    '[repo-harness:subagent-context]',
    '',
    ...(boardSlice ? [boardSlice, ''] : []),
    ...(contextRouting
      ? [
          `[repo-harness:native-role-routing] ${contextRouting.status}: ${contextRouting.reason}`,
          contextRouting.status === 'verified'
            ? 'Custom-agent model routing is verified for this child; reasoning-effort routing remains unverified because SubagentStart does not expose it.'
            : 'Do not claim custom-agent model or reasoning-effort routing. Return this routing status to the parent and fail closed; no alternate fleet runner is authorized.',
          '',
        ]
      : []),
    ...(activeContract ? [`Read the active repo-harness contract before working: ${activeContract}.`] : []),
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
    ...(scopeMode === 'workspace-write' ? ['', EXECUTION_BOUNDARY_BLOCK] : []),
    ...(scopeMode === 'read-only' ? ['', READ_ONLY_SCOPE_NOTE] : []),
  ].join('\n'));
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
  if (opts.event === 'PreToolUse') return runReturnChannel(opts.repoRoot, input, env);
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
