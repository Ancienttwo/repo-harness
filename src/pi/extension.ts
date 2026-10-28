import { VERSION, getPackageDir, type ExtensionAPI, type ExtensionContext, type ToolCallEvent } from '@earendil-works/pi-coding-agent';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boundedHookDiagnostic, type PiHookResult } from '../cli/hook/hook-protocol';
import type { HookEvent, RouteId } from '../cli/hook/route-registry';
import { WORKFLOW_CONTRACT_MARKER_PATH } from '../core/adoption/minimum-harness-version';
import { gitExecFileSync } from '../effects/git/runner';
import { probePiHost, type ToolPathResolver } from './compat';
import { PiHookBridge } from './hook-bridge';

const GUARDED_TOOLS = new Set(['edit', 'write', 'bash']);

interface SessionState {
  readonly sessionId: string;
  readonly cwd: string;
  /** Resolved once at session start; null outside a git repository. */
  readonly gitRoot: string | null;
  readonly optedIn: boolean;
  availability: 'inactive' | 'pending' | 'ready' | 'unavailable';
  /** The probe failure code, shown on every blocked call. */
  unavailable: string;
  /** SessionStart context; delivered once, at the first run of the session. */
  context: string | null;
  resolveToolPath: ToolPathResolver | null;
  runId: string;
  pendingStop: boolean;
  /** Settles when the probe and the SessionStart hook finish. */
  started: Promise<void>;
}

function gitRoot(cwd: string): string | null {
  try {
    return gitExecFileSync(['-C', cwd, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000,
    }).trim() || null;
  } catch { return null; }
}

function optedIn(root: string | null): boolean {
  return root !== null && existsSync(join(root, WORKFLOW_CONTRACT_MARKER_PATH));
}

function errorText(error: unknown): string {
  return boundedHookDiagnostic(error instanceof Error ? error.message : String(error));
}

/** The Claude-shaped tool payload the edit and Bash guards read. */
function toolPayload(event: ToolCallEvent, cwd: string, resolveToolPath: ToolPathResolver): Record<string, unknown> {
  const input = event.input as Record<string, unknown>;
  if (event.toolName === 'bash') {
    if (typeof input.command !== 'string') throw new Error('PI_HOOK_INVALID_COMMAND');
    return { tool_name: 'Bash', tool_input: { command: input.command }, cwd };
  }
  if (typeof input.path !== 'string' || !input.path) throw new Error('PI_HOOK_INVALID_PATH');
  return { tool_name: event.toolName === 'edit' ? 'Edit' : 'Write', tool_input: { file_path: resolveToolPath(input.path, cwd) }, cwd };
}

/** Pi owns execution. This adapter only maps Pi events to the repo-harness hook routes. */
export default function repoHarnessPi(pi: ExtensionAPI): void {
  const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
  const bridge = new PiHookBridge(packageRoot);
  let current: SessionState | null = null;

  const notify = (ctx: ExtensionContext, message: string) => {
    if (message && ctx.hasUI) ctx.ui.notify(boundedHookDiagnostic(message), 'warning');
  };
  const invoke = (state: SessionState, event: HookEvent, route: RouteId, payload: Record<string, unknown>,
    signal?: AbortSignal): Promise<PiHookResult> =>
    bridge.invoke({ event, route, payload, cwd: state.cwd, sessionId: state.sessionId, runId: state.runId, signal });
  /** A hook that does not run in this session, or a session that Pi replaced. */
  const stale = (state: SessionState, ctx: ExtensionContext) =>
    current !== state || state.sessionId !== ctx.sessionManager.getSessionId() || state.cwd !== ctx.cwd;

  const start = async (state: SessionState, ctx: ExtensionContext): Promise<void> => {
    const probe = await probePiHost(VERSION, getPackageDir());
    if (current !== state) return;
    if (!probe.ok) {
      state.availability = 'unavailable';
      state.unavailable = probe.message;
      notify(ctx, `${probe.message}. repo-harness blocks edit, write and bash in this repository.`);
      return;
    }
    state.resolveToolPath = probe.resolveToCwd;
    state.availability = 'ready';
    // Each tool call runs its own guard, so a SessionStart failure reports and does not block, as in Claude and Codex.
    try {
      const output = await invoke(state, 'SessionStart', 'default', {});
      if (current !== state) return;
      state.context = output.additional_context;
      notify(ctx, [output.system_message, output.exit_code === 0 ? '' : output.diagnostics].filter(Boolean).join('\n'));
    } catch (error) {
      notify(ctx, `repo-harness SessionStart failed: ${errorText(error)}`);
    }
  };

  const stop = async (state: SessionState, ctx: ExtensionContext, aborted: boolean): Promise<void> => {
    if (!state.pendingStop || state.availability !== 'ready') return;
    state.pendingStop = false;
    try {
      const output = await invoke(state, 'Stop', 'default', { aborted });
      notify(ctx, [output.system_message, output.diagnostics].filter(Boolean).join('\n'));
    } catch (error) {
      notify(ctx, `repo-harness Stop failed: ${errorText(error)}`);
    }
  };

  pi.on('session_start', async (_event, ctx) => {
    // reload, /new, /resume and /fork start a new state; a late result of the old one is discarded.
    bridge.cancel();
    const root = gitRoot(ctx.cwd);
    const active = optedIn(root);
    const state: SessionState = {
      sessionId: ctx.sessionManager.getSessionId(), cwd: ctx.cwd, gitRoot: root, optedIn: active,
      availability: active ? 'pending' : 'inactive', unavailable: '', context: null, resolveToolPath: null,
      runId: `run-pi-${randomUUID()}`, pendingStop: false, started: Promise.resolve(),
    };
    current = state;
    if (active) state.started = start(state, ctx);
  });

  pi.on('before_agent_start', async (event, ctx) => {
    const state = current;
    if (!state || !state.optedIn || stale(state, ctx)) return;
    await state.started;
    if (current !== state) return;
    state.runId = `run-pi-${randomUUID()}`;
    state.pendingStop = true;
    const parts: string[] = [];
    if (state.context) parts.push(state.context);
    state.context = null;
    if (state.availability === 'unavailable') {
      parts.push(`[HarnessUnavailable] ${state.unavailable}. repo-harness blocks edit, write and bash until Pi meets the requirement and the session reloads.`);
    } else if (event.messageType === 'user') {
      try {
        const notice = await invoke(state, 'UserPromptSubmit', 'inbox', {});
        if (current !== state) return;
        if (notice.additional_context) parts.push(notice.additional_context);
        if (notice.exit_code !== 0) notify(ctx, notice.diagnostics);
      } catch (error) {
        notify(ctx, `repo-harness agent notice failed: ${errorText(error)}`);
      }
    }
    if (parts.length > 0) return { message: { customType: 'repo-harness-context', content: parts.join('\n\n'), display: false } };
  });

  // Nested calls from codemode arrive here too, with parentToolCallId set.
  pi.on('tool_call', async (event, ctx) => {
    if (!GUARDED_TOOLS.has(event.toolName)) return;
    const state = current;
    if (!state || !state.optedIn) {
      // A repository that opts in mid-session needs a reload. The session's git
      // root is cached, so a call outside the harness spawns no git process.
      const root = state && state.cwd === ctx.cwd ? state.gitRoot : gitRoot(ctx.cwd);
      return optedIn(root) ? { block: true, reason: 'PI_HOOK_RELOAD_REQUIRED: run /reload to load repo-harness for this repository' } : undefined;
    }
    if (stale(state, ctx)) return { block: true, reason: 'PI_HOOK_SESSION_MISMATCH' };
    await state.started;
    if (current !== state) return { block: true, reason: 'PI_HOOK_SESSION_REPLACED' };
    if (state.availability !== 'ready' || !state.resolveToolPath) return { block: true, reason: state.unavailable || 'PI_HOOK_UNAVAILABLE' };
    const runId = state.runId;
    try {
      const bash = event.toolName === 'bash';
      const output = await invoke(state, 'PreToolUse', bash ? 'bash' : 'edit', toolPayload(event, state.cwd, state.resolveToolPath), ctx.signal);
      if (current !== state || state.runId !== runId) return { block: true, reason: 'PI_HOOK_SESSION_REPLACED' };
      // The Bash tripwire is advisory when it cannot decide (exit 1), as in Claude; the edit guard must admit the call.
      if (output.decision === 'block' || (!bash && output.decision !== 'allow')) {
        return { block: true, reason: output.diagnostics || output.reason };
      }
      notify(ctx, output.diagnostics);
    } catch (error) {
      return { block: true, reason: errorText(error) };
    }
  });

  // agent_end can be followed by a retry, a compaction or queued input; agent_settled is final.
  pi.on('agent_settled', async (event, ctx) => {
    const state = current;
    if (state && !stale(state, ctx)) await stop(state, ctx, event.aborted);
  });

  pi.on('session_shutdown', async (_event, ctx) => {
    const state = current;
    if (state && stale(state, ctx)) return;
    bridge.cancel();
    if (state) await stop(state, ctx, true);
    if (current === state) current = null;
  });
}
