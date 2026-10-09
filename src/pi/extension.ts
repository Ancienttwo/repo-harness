import { VERSION, getPackageDir, type ExtensionAPI, type ExtensionContext, type ToolCallEvent, type ToolResultEvent } from '@earendil-works/pi-coding-agent';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PiHookBridge } from './hook-bridge';
import { boundedHookDiagnostic, type HookJsonOutput } from './hook-protocol';

type ToolPathResolver = (path: string, cwd: string) => string;

interface ToolBinding {
  readonly payload: Record<string, unknown>;
  readonly runId: string;
}
interface SessionState {
  readonly sessionId: string;
  readonly cwd: string;
  readonly optedIn: boolean;
  availability: 'inactive' | 'ready' | 'unavailable';
  context: string | null;
  diagnostic: string;
  resolveToolPath: ToolPathResolver | null;
  runId: string;
  pendingStop: boolean;
  stop: Promise<void> | null;
  readonly tools: Map<string, ToolBinding>;
}

function optedIn(cwd: string): boolean {
  try {
    const root = execFileSync('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000,
    }).trim();
    return existsSync(join(root, '.ai/harness/workflow-contract.json'));
  } catch { return false; }
}

function toolPayload(event: ToolCallEvent, cwd: string, resolveToolPath: ToolPathResolver | null): Record<string, unknown> {
  const input = event.input as Record<string, unknown>;
  let toolInput: Record<string, unknown>;
  if (event.toolName === 'edit' || event.toolName === 'write') {
    if (typeof input.path !== 'string' || !input.path) throw new Error('PI_HOOK_INVALID_PATH');
    if (!resolveToolPath) throw new Error('PI_HOOK_PATH_RESOLVER_UNAVAILABLE');
    const filePath = resolveToolPath(input.path, cwd);
    if (event.toolName === 'write') {
      if (typeof input.content !== 'string') throw new Error('PI_HOOK_INVALID_CONTENT');
      toolInput = { file_path: filePath, content: input.content };
    } else {
      if (!Array.isArray(input.edits) || input.edits.length === 0
        || input.edits.some(edit => !edit || typeof edit !== 'object' || typeof edit.newText !== 'string')) {
        throw new Error('PI_HOOK_INVALID_EDITS');
      }
      toolInput = { file_path: filePath, new_string: input.edits.map(edit => edit.newText).join('\n') };
    }
  } else {
    toolInput = { command: input.command };
  }
  return { tool_name: event.toolName === 'edit' ? 'Edit' : event.toolName === 'write' ? 'Write' : 'Bash',
    tool_input: toolInput, tool_call_id: event.toolCallId, parent_tool_call_id: event.parentToolCallId ?? null };
}

/** Pi owns execution. This adapter only maps supported events to the existing rule owners. */
export default function repoHarnessPi(pi: ExtensionAPI): void {
  const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
  const bridge = new PiHookBridge(packageRoot);
  let current: SessionState | null = null;

  const notify = (ctx: ExtensionContext, message: string) => {
    if (ctx.hasUI) ctx.ui.notify(boundedHookDiagnostic(message), 'warning');
  };
  const failed = (state: SessionState, error: unknown, ctx: ExtensionContext) => {
    if (current !== state) return;
    state.availability = 'unavailable';
    state.diagnostic = boundedHookDiagnostic(error instanceof Error ? error.message : String(error));
    notify(ctx, `${state.diagnostic}. Run /reload after resolving the hook failure.`);
  };
  const invoke = (state: SessionState, event: 'SessionStart' | 'UserPromptSubmit' | 'PreToolUse' | 'PostToolUse' | 'Stop',
    route: 'default' | 'edit' | 'bash', payload: Record<string, unknown>, runId = state.runId, signal?: AbortSignal) =>
    bridge.invoke({ event, route, payload, cwd: state.cwd, sessionId: state.sessionId, runId, signal });
  const stop = (state: SessionState, ctx: ExtensionContext, aborted: boolean): Promise<void> => {
    if (state.stop) return state.stop;
    if (!state.pendingStop || !state.optedIn) return Promise.resolve();
    state.pendingStop = false;
    state.stop = invoke(state, 'Stop', 'default', { aborted }).then(output => {
      if (output.exit_code !== 0) throw new Error(output.diagnostics || output.reason);
    }).catch(error => { failed(state, error, ctx); });
    return state.stop;
  };

  pi.on('session_start', async (_event, ctx) => {
    bridge.cancel();
    const active = optedIn(ctx.cwd);
    const state: SessionState = {
      sessionId: ctx.sessionManager.getSessionId(), cwd: ctx.cwd, optedIn: active,
      availability: active ? 'unavailable' : 'inactive', context: null, diagnostic: '', resolveToolPath: null,
      runId: `run-pi-${randomUUID()}`, pendingStop: false, stop: null, tools: new Map(),
    };
    current = state;
    if (!active) return;
    try {
      if (VERSION !== '1.1.0') throw new Error(`PI_HOOK_UNSUPPORTED_VERSION: ${VERSION}; requires Pi 1.1.0`);
      // Pi has no public path resolver. Use the exact installed 1.1.0 tool resolver;
      // unavailable distributions fail closed instead of duplicating its grammar.
      const paths = await import(pathToFileURL(join(getPackageDir(), 'dist/core/tools/path-utils.js')).href);
      if (typeof paths.resolveToCwd !== 'function') throw new Error('PI_HOOK_PATH_RESOLVER_UNAVAILABLE');
      if (current !== state) return;
      state.resolveToolPath = paths.resolveToCwd;
      const output = await invoke(state, 'SessionStart', 'default', {});
      if (current !== state) return;
      if (output.exit_code !== 0 || output.decision === 'block' || output.reason !== 'ok') {
        throw new Error(output.diagnostics || output.reason);
      }
      state.context = output.additional_context;
      state.availability = 'ready';
    } catch (error) { failed(state, error, ctx); }
  });

  pi.on('before_agent_start', async (event, ctx) => {
    const state = current;
    if (!state || !state.optedIn) return;
    state.runId = `run-pi-${randomUUID()}`;
    state.pendingStop = true;
    state.stop = null;
    state.tools.clear();
    let output: HookJsonOutput | null = null;
    try {
      output = await invoke(state, 'UserPromptSubmit', 'default', { prompt: event.prompt }, state.runId, ctx.signal);
      if (output.exit_code !== 0) throw new Error(output.diagnostics || output.reason);
    } catch (error) { failed(state, error, ctx); }
    if (current !== state) return;
    const content = [state.context, output?.additional_context, output?.diagnostics,
      state.availability === 'unavailable' ? `[HarnessUnavailable] ${state.diagnostic}. Edits are blocked. Resolve the failure and run /reload.` : null]
      .filter(Boolean).join('\n\n');
    if (content) return { message: { customType: 'repo-harness-context', content, display: false } };
  });

  pi.on('tool_call', async (event, ctx) => {
    if (!['edit', 'write', 'bash'].includes(event.toolName)) return;
    const state = current;
    const mutation = event.toolName !== 'bash';
    if (!state || !state.optedIn) {
      if (mutation && optedIn(ctx.cwd)) return { block: true, reason: 'PI_HOOK_RELOAD_REQUIRED' };
      return;
    }
    if (state.sessionId !== ctx.sessionManager.getSessionId() || state.cwd !== ctx.cwd) {
      if (mutation) return { block: true, reason: 'PI_HOOK_SESSION_MISMATCH' };
      return;
    }
    if (mutation && state.availability !== 'ready') return { block: true, reason: state.diagnostic || 'PI_HOOK_UNAVAILABLE' };
    try {
      const payload = toolPayload(event, state.cwd, state.resolveToolPath);
      const runId = state.runId;
      if (mutation) {
        const output = await invoke(state, 'PreToolUse', 'edit', payload, runId, ctx.signal);
        if (current !== state || state.runId !== runId) return { block: true, reason: 'PI_HOOK_SESSION_REPLACED' };
        if (ctx.signal?.aborted) return { block: true, reason: 'PI_HOOK_CANCELLED' };
        if (output.exit_code !== 0 || output.decision !== 'allow') {
          return { block: true, reason: output.diagnostics || output.reason };
        }
      }
      state.tools.set(event.toolCallId, { payload, runId });
    } catch (error) {
      if (mutation) return { block: true, reason: boundedHookDiagnostic(error instanceof Error ? error.message : String(error)) };
      notify(ctx, 'PI_HOOK_COMMAND_OBSERVATION_UNAVAILABLE');
    }
  });

  pi.on('tool_result', async (event: ToolResultEvent, ctx) => {
    const state = current;
    const binding = state?.tools.get(event.toolCallId);
    if (!state || !binding || state.sessionId !== ctx.sessionManager.getSessionId()) return;
    state.tools.delete(event.toolCallId);
    // Native tools can report an error after bytes reach disk. Observe the attempt
    // with its original binding even when execution has already been cancelled.
    const text = event.content.filter(part => part.type === 'text').map(part => part.text).join('\n');
    const details = event.details as { exitCode?: unknown } | undefined;
    const exitCode = typeof details?.exitCode === 'number' && Number.isSafeInteger(details.exitCode) ? details.exitCode : null;
    try {
      const output = await invoke(state, 'PostToolUse', event.toolName === 'bash' ? 'bash' : 'edit', {
        ...binding.payload, tool_response: { stdout: text, is_error: event.isError }, exit_code: exitCode,
      }, binding.runId);
      if (output.exit_code !== 0) throw new Error(output.diagnostics || output.reason);
    } catch (error) {
      if (event.toolName === 'bash') notify(ctx, `PI_HOOK_COMMAND_OBSERVATION_FAILED: ${boundedHookDiagnostic(String(error))}`);
      else failed(state, error, ctx);
    }
  });

  pi.on('agent_settled', async (event, ctx) => {
    const state = current;
    if (state && state.sessionId === ctx.sessionManager.getSessionId() && state.cwd === ctx.cwd) {
      await stop(state, ctx, event.aborted);
    }
  });

  pi.on('session_shutdown', async (_event, ctx) => {
    const state = current;
    if (state && (state.sessionId !== ctx.sessionManager.getSessionId() || state.cwd !== ctx.cwd)) return;
    bridge.cancel();
    if (state) await stop(state, ctx, true);
    if (current === state) current = null;
  });
}
