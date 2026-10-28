import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { VERSION, getPackageDir, type ExtensionAPI, type ExtensionContext } from '@earendil-works/pi-coding-agent';
import { probePiCapability, type PiCapability } from './compat';
import { PiHookBridge, type PiHookRequest } from './hook-bridge';
import type { PiHookOutput } from '../cli/hook/hook-protocol';

type Session = {
  readonly id: string;
  readonly bridge: PiHookBridge;
  capability: PiCapability | { readonly state: 'inactive' };
  start: Promise<PiHookOutput | null>;
  contextDelivered: boolean;
  runId: string | null;
  readonly calls: Map<string, string>;
};

function optedIn(cwd: string): boolean {
  try {
    const root = execFileSync('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return existsSync(join(root, '.ai/harness/workflow-contract.json'));
  } catch { return false; }
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
    if (!optedIn(ctx.cwd)) return;
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
    if (state.capability.state === 'unavailable') {
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
    if (state.capability.state === 'unavailable') return { block: true, reason: state.capability.code };
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
  pi.on('session_shutdown', () => { current?.bridge.close(); current = undefined; });
}

export default function repoHarnessPi(pi: ExtensionAPI): void { registerPiHooks(pi); }
