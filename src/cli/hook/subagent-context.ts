/**
 * SubagentStart.context: record the official native role/model observation
 * and give the child its bounded context. The runtime decides which hosts run
 * this route; the handler reads the active contract from Effective State.
 */

import { createHash, randomBytes } from 'crypto';
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
import type { EffectiveState } from '../../core/state/types';
import type { EffectiveStateResolution, StateInputCollector } from '../../effects/loop/state-input-collector';
import { withExclusiveDirectoryLock } from '../../effects/locking/exclusive-directory-lock';
import { resolveBoardSliceBlock } from './board-slice-context';
import type { HookHandlerResult } from './handler-contract';
import { payloadIdentityField, type HookIdentity, type HookPayload } from './hook-input';

export interface SubagentContextInput {
  readonly collector: Pick<StateInputCollector, 'getRepoRoot' | 'getActivePlanMarker' | 'getEffectiveState'>;
  readonly payload: HookPayload;
  readonly identity: HookIdentity;
  readonly env: NodeJS.ProcessEnv;
  readonly now?: () => Date;
}

type JsonObject = Readonly<Record<string, unknown>>;

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

/** Native-role evidence lives here; scripts/check-agent-tooling.sh reads it. */
export const DELEGATION_EVIDENCE_RELATIVE = '.ai/harness/delegation';
export const LONG_COMMAND_GUARDRAIL_MARKER = '[repo-harness:long-command-guardrail]';
const LONG_COMMAND_GUARDRAIL_TEXT = `${LONG_COMMAND_GUARDRAIL_MARKER} Do not foreground-wait on any command you expect to exceed roughly five minutes; the host stream watchdog terminates an agent after 600 seconds of silence. The default action is to hand that command back to the orchestrator: name the command and return BLOCKED on your role's machine-readable first line (RESULT:/VERDICT:/RECOMMENDATION:) instead of waiting on it. Run it yourself only when you can start it in the background and poll a log that keeps producing output.`;
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
  `${EXECUTION_BOUNDARY_MARKER} Execution boundary: implement exactly the parent brief Goal/Scope/Verify/Rollback. Treat absent requirements as forbidden design space, not as permission to improve.`,
  'Unrequested extras are forbidden. Do not add features, integrations, migrations, compatibility, fallback behavior, telemetry, cleanup, refactors, abstractions, docs, or polish beyond that Scope.',
  'This clause grants no write permissions. Follow the original host-granted role and permissions.',
  'Report useful out-of-scope findings to the parent. If the Goal requires a missing decision or broader Scope, identify it before proceeding.',
].join('\n');
const READ_ONLY_SCOPE_NOTE = 'Read-only scope: inspect, verify, and report against the parent brief. Do not implement, edit files, or run write commands; hand any required change back to the parent.';
const ACTIVE_CONTRACT_STATUSES: ReadonlySet<string> = new Set(['active', 'ready', 'executing']);
const NATIVE_ROLE_ROUTING_STATE_FILE = 'native-role-routing.json';
const NATIVE_ROLE_ROUTING_LOCK_RELATIVE = `${DELEGATION_EVIDENCE_RELATIVE}/native-role-routing.lock`;
const MAX_NATIVE_ROLE_OBSERVATIONS = 32;

/** The active task contract path from Effective State, or null. */
export function activeContractPath(state: EffectiveState): string | null {
  const contract = state.contract;
  return contract && ACTIVE_CONTRACT_STATUSES.has((contract.status ?? '').toLowerCase()) ? contract.path : null;
}

/** Operator text for an Effective State failure; the advisory still renders without a contract. */
export function effectiveStateDiagnostic(
  owner: string,
  resolution: Extract<EffectiveStateResolution, { readonly ok: false }>,
): string {
  return `repo-harness-hook: ${owner}: effective state unavailable (${resolution.reason_code} ${resolution.error_hash}); run repo-harness state resolve --json\n`;
}

export function sanitize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 120);
}

function hash(value: string, algorithm: 'sha1' | 'sha256'): string {
  return createHash(algorithm).update(value).digest('hex');
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

function nativeRoleRoutingEvidence(
  repoRoot: string,
  payload: HookPayload,
  identity: HookIdentity,
  env: NodeJS.ProcessEnv,
  now: Date,
): NativeRoleRouting {
  const agentType = payloadIdentityField(payload, 'agent_type') ?? '';
  const observedModel = payloadIdentityField(payload, 'model') ?? '';
  const agentId = payloadIdentityField(payload, 'agent_id') ?? '';
  const turnId = identity.turnId ?? '';
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

function nativeRoleRoutingScope(identity: HookIdentity): string {
  if (identity.sessionId) return `session-${sanitize(identity.sessionId)}`;
  return identity.turnId ? `turn-${sanitize(identity.turnId)}` : 'unscoped';
}

function persistNativeRoleRoutingEvidence(
  repoRoot: string,
  observation: NativeRoleRouting,
  identity: HookIdentity,
  now: Date,
): NativeRoleRouting {
  const canonicalRepoRoot = realpathSync(repoRoot);
  return withExclusiveDirectoryLock(canonicalRepoRoot, NATIVE_ROLE_ROUTING_LOCK_RELATIVE, () => {
    const stateDir = join(canonicalRepoRoot, DELEGATION_EVIDENCE_RELATIVE);
    const evidenceRelative = join('role-routing', nativeRoleRoutingScope(identity));
    const evidenceDir = resolveEvidenceDir(stateDir, evidenceRelative);
    if (!evidenceDir) {
      return {
        ...observation,
        status: observation.status === 'invalid' ? 'invalid' : 'unverified',
        reason: 'No safe native role-routing evidence directory is available.',
      };
    }
    const evidenceKey = observation.agent_id && observation.turn_id
      ? hash(`${observation.turn_id}\0${observation.agent_id}`, 'sha256')
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

/** Append the standing long-command advisory once; marker presence is authoritative. */
export function appendLongCommandGuardrail(context: string): string {
  return context.includes(LONG_COMMAND_GUARDRAIL_MARKER)
    ? context
    : `${context}\n\n${LONG_COMMAND_GUARDRAIL_TEXT}`;
}

export function runSubagentContext(input: SubagentContextInput): HookHandlerResult {
  const repoRoot = input.collector.getRepoRoot();
  const now = input.now?.() ?? new Date();
  const resolution = input.collector.getEffectiveState();
  const activeContract = resolution.ok ? activeContractPath(resolution.state) : null;

  const observedRouting = nativeRoleRoutingEvidence(repoRoot, input.payload, input.identity, input.env, now);
  let routing: NativeRoleRouting;
  try {
    routing = persistNativeRoleRoutingEvidence(repoRoot, observedRouting, input.identity, now);
  } catch {
    routing = {
      ...observedRouting,
      status: observedRouting.status === 'invalid' ? 'invalid' : 'unverified',
      reason: 'Native role/model evidence could not be persisted safely; routing is not verified.',
    };
  }

  // Pure advisory, resolved before the guardrail so the block sits with the
  // rest of the spawn context rather than after the standing footer.
  const boardSlice = resolveBoardSliceBlock(input.collector);

  // Permission observation controls scope constraints. A parent brief needs
  // no workflow artifact; unknown routing never fabricates a writable grant.
  const scopeMode: SandboxMode | null = routing.status === 'verified' ? routing.sandbox_mode : null;
  const startContext = appendLongCommandGuardrail([
    '[repo-harness:subagent-context]',
    '',
    ...(boardSlice ? [boardSlice, ''] : []),
    `[repo-harness:native-role-routing] ${routing.status}: ${routing.reason}`,
    routing.status === 'verified'
      ? 'Custom-agent model routing is verified for this child; reasoning-effort routing remains unverified because SubagentStart does not expose it.'
      : 'Do not claim custom-agent model or reasoning-effort routing. Return this routing status to the parent. Continue only within the host-granted role and permissions.',
    '',
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
  if (resolution.ok) return { exitCode: 0, additionalContext: startContext };
  return {
    exitCode: 0,
    additionalContext: startContext,
    diagnostics: effectiveStateDiagnostic('subagent context', resolution),
    reason: 'context-unavailable',
  };
}
