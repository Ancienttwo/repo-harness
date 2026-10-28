import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { VERSION, getPackageDir, type ExtensionAPI, type ExtensionContext } from '@earendil-works/pi-coding-agent';
import { probePiCapability, type PiCapability } from './compat';
import { PiHookBridge, type PiHookRequest } from './hook-bridge';
import type { PiHookOutput } from '../cli/hook/hook-protocol';
import { gitExecFileSync } from '../effects/git/runner';

const REPO_PROBE_FAILED = 'PI_HOST_REPO_PROBE_FAILED' as const;

type Session = {
  readonly id: string;
  readonly bridge: PiHookBridge;
  capability: PiCapability | { readonly state: 'inactive' } | { readonly state: 'unknown'; readonly code: typeof REPO_PROBE_FAILED };
  start: Promise<PiHookOutput | null>;
  contextDelivered: boolean;
  runId: string | null;
  readonly calls: Map<string, string>;
};

function probeRepoOptIn(cwd: string): 'opted-in' | 'inactive' | 'unknown' {
  try {
    const root = gitExecFileSync(['-C', cwd, 'rev-parse', '--show-toplevel'], {
      // Exit 128 has both inactive and unknown outcomes, so keep its diagnostics stable.
      env: { ...process.env, LC_ALL: 'C' },
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 3_000,
    }).replace(/\r?\n$/, '');
    if (!isAbsolute(root) || /[\r\n\0]/.test(root)) return 'unknown';
    return existsSync(join(root, '.ai/harness/workflow-contract.json')) ? 'opted-in' : 'inactive';
  } catch (error) {
    const failure = error as { status?: number; stderr?: unknown } | null | undefined;
    const stderr = failure?.stderr;
    if (failure?.status === 128 && (typeof stderr === 'string' || Buffer.isBuffer(stderr))
      && /not a git repository|detected dubious ownership/.test(stderr.toString())) return 'inactive';
    return 'unknown';
  }
}

/** Options supply deterministic capability and transport seams for SDK fixtures. */
export function registerPiHooks(pi: ExtensionAPI, options: {
  readonly probe?: () => Promise<PiCapability>;
  readonly bridge?: () => PiHookBridge;
} = {}): void {
  let current: Session | undefined;
  const active = (state: Session, ctx: ExtensionContext) => current === state && state.id === ctx.sessionManager.getSessionId();
  const call = (state: Session, ctx: ExtensionContext, event: PiHookRequest['event'], routeId: PiHookRequest['routeId'], payload: Record<string, unknown> = {}) =>
    state.bridge.call({ event, routeId, cwd: ctx.cwd, payload: {
      cwd: ctx.cwd, session_id: state.id, run_id: state.runId, ...payload,
    } });

  pi.on('session_start', async (_event, ctx) => {
    current?.bridge.close();
    const state: Session = {
      id: ctx.sessionManager.getSessionId(), bridge: options.bridge?.() ?? new PiHookBridge(),
      capability: { state: 'inactive' }, start: Promise.resolve(null), contextDelivered: false, runId: null, calls: new Map(),
    };
    current = state;
    const repoProbe = probeRepoOptIn(ctx.cwd);
    if (repoProbe !== 'opted-in') {
      state.capability = repoProbe === 'unknown' ? { state: 'unknown', code: REPO_PROBE_FAILED } : { state: 'inactive' };
      return;
    }
    state.capability = { state: 'unavailable', code: 'PI_HOST_PATH_RESOLVER_UNAVAILABLE' };
    const capability = await (options.probe?.() ?? probePiCapability(VERSION, getPackageDir()));
    if (!active(state, ctx)) return;
    state.capability = capability;
    if (capability.state === 'unavailable') return;
    // Cache the outcome, not a second invocation at the first prompt.
    state.start = call(state, ctx, 'SessionStart', 'default').catch(() => null);
    await state.start;
  });

  pi.on('before_agent_start', async (_event, ctx) => {
    const state = current;
    if (!state || !active(state, ctx) || state.capability.state === 'inactive') return;
    state.runId = randomUUID();
    const runId = state.runId;
    if (state.capability.state === 'unavailable' || state.capability.state === 'unknown') {
      if (state.capability.state === 'unknown') {
        if (state.contextDelivered) return;
        state.contextDelivered = true;
      }
      return { message: { customType: 'repo-harness', content: state.capability.code, display: false } };
    }
    const texts: string[] = [];
    const start = await state.start;
    if (!active(state, ctx) || state.runId !== runId) return;
    if (!state.contextDelivered) {
      state.contextDelivered = true;
      if (start?.additional_context) texts.push(start.additional_context);
    }
    try {
      const notice = await call(state, ctx, 'UserPromptSubmit', 'inbox');
      if (notice.additional_context) texts.push(notice.additional_context);
    } catch { /* Advisory delivery cannot admit a tool. Tool guards run separately. */ }
    if (!active(state, ctx) || state.runId !== runId) return;
    if (texts.length) return { message: { customType: 'repo-harness', content: texts.join('\n\n'), display: false } };
  });

  pi.on('tool_call', async (event, ctx) => {
    if (!['edit', 'write', 'bash'].includes(event.toolName)) return;
    const state = current;
    if (!state || !active(state, ctx)) return { block: true, reason: 'PI_HOOK_STALE_SESSION' };
    if (state.capability.state === 'inactive') return;
    if (state.capability.state === 'unavailable' || state.capability.state === 'unknown') return { block: true, reason: state.capability.code };
    const runId = state.runId;
    if (!runId) return { block: true, reason: 'PI_HOOK_MISSING_RUN' };
    state.calls.set(event.toolCallId, runId);
    try {
      const input = event.input as Record<string, unknown>;
      const bash = event.toolName === 'bash';
      if (typeof input[bash ? 'command' : 'path'] !== 'string') throw new Error('PI_HOOK_INVALID_INPUT');
      const output = await call(state, ctx, 'PreToolUse', bash ? 'bash' : 'edit', {
        tool_name: bash ? 'Bash' : event.toolName === 'write' ? 'Write' : 'Edit',
        tool_call_id: event.toolCallId, parent_tool_call_id: event.parentToolCallId ?? null,
        tool_input: bash ? { command: input.command } : { file_path: state.capability.resolveToCwd(input.path as string, ctx.cwd) },
      });
      if (!active(state, ctx) || state.runId !== runId || state.calls.get(event.toolCallId) !== runId) throw new Error('PI_HOOK_STALE_SESSION');
      // A block is the only allowed outcome until Pi can apply the requested input change.
      if (output.updated_input) throw new Error('PI_HOST_UPDATED_INPUT_UNSUPPORTED');
      if (output.decision === 'block' || output.exit_code !== 0) return { block: true, reason: output.diagnostics || output.reason };
    } catch (error) {
      return { block: true, reason: error instanceof Error ? error.message : String(error) };
    } finally { state.calls.delete(event.toolCallId); }
  });

  pi.on('agent_settled', async (event, ctx) => {
    const state = current;
    if (!state || !active(state, ctx) || state.capability.state !== 'ready') return;
    try { await call(state, ctx, 'Stop', 'default', { aborted: event.aborted }); }
    catch { /* Stop is advisory. Never retry an uncertain effect. */ }
  });
  pi.on('session_shutdown', (_event, ctx) => {
    if (current && active(current, ctx)) { current.bridge.close(); current = undefined; }
  });
}

export default function repoHarnessPi(pi: ExtensionAPI): void { registerPiHooks(pi); }
