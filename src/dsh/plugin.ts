import { randomUUID } from 'node:crypto';
import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-agent';
import type { PreToolDecision, ToolExecution } from '@deepseek-ai/dsh-tools';
import type { UserMessage } from '@deepseek-ai/dsh-llm/message';
import type { BridgeHookOutput } from '../cli/hook/hook-protocol';
import type { HookEvent, RouteId } from '../cli/hook/route-registry';
import { resolveDshBridge, type DshBridgeOptions } from './bridge';
import { guardDenialsProjection } from './guard-denials';
import { GUARD_DENIED_ERROR_CODE, GUARD_DENIED_ERROR_NAME } from './protocol';
import type { HookBridge } from '../cli/hook/bridge-client';

/**
 * repo-harness Cordis plugin for DeepSeek Harness.
 *
 * DSH dispatches every native tool through `tools/pre-execute`. This plugin
 * maps `write`, `edit` and `bash` calls to the existing typed hook runtime and
 * denies the call when the runtime denies it. Session context is injected once
 * through `agent/pre-step`; `agent/turn-stopping` records the existing Stop
 * observation. Every denial carries `REPO_HARNESS_GUARD_DENIED` as its error
 * code; the `guard-denials` projection lists those calls for the web client.
 * The plugin never changes tool definitions and never inspects repository
 * policy itself.
 *
 * Scope: native `write`, `edit`, `bash`, including nested PTC calls that use
 * the same pipeline. MCP writes, `pwsh`, user `!` commands and writes from
 * other plugins stay outside this boundary. This is not an OS sandbox.
 */

declare module '@deepseek-ai/dsh-llm/message' {
  interface MessageSourceMap {
    'repo-harness': { readonly kind: 'repo-harness' };
  }
}

type ExecutingAgent = NonNullable<ToolExecution['agent']>;
type Session = ExecutingAgent['session'];

const GUARDED_TOOLS = Object.freeze({
  write: { toolName: 'Write', routeId: 'edit' },
  edit: { toolName: 'Edit', routeId: 'edit' },
  bash: { toolName: 'Bash', routeId: 'bash' },
} as const);

type GuardedTool = keyof typeof GUARDED_TOOLS;
type Enablement = 'unknown' | 'ready' | 'inactive' | 'unavailable';

interface SessionState {
  readonly id: string;
  readonly cwd: string;
  enablement: Enablement;
  /** Fixed capability or hook failure code; only meaningful when unavailable. */
  code: string;
  start: Promise<void> | null;
  startOutput: BridgeHookOutput | null;
  contextDelivered: boolean;
  diagnosticDelivered: boolean;
  runId: string | null;
  turn: number | null;
}

export interface DshPluginConfig extends DshBridgeOptions {
  /** Test seam: a bridge already bound to a deterministic transport. */
  readonly bridge?: HookBridge;
}

export interface DshPlugin {
  readonly name: string;
  readonly inject: readonly string[];
  apply(ctx: Context, config?: DshPluginConfig): void;
}

function codeOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

/** One durable user message owned by this plugin; unknown sources fall through in the UI. */
function contextMessage(text: string): UserMessage {
  return deepFreeze({
    id: randomUUID(),
    role: 'user',
    content: [{ type: 'text', text }],
    source: { kind: 'repo-harness' },
  }) as unknown as UserMessage;
}

function alreadyHasContext(session: Session): boolean {
  for (const seq of session.surface.nodes) {
    const event = session.eventAt(seq);
    if (event?.type !== 'user/message') continue;
    const source = isRecord(event.data) ? event.data.source : undefined;
    if (isRecord(source) && source.kind === 'repo-harness') return true;
  }
  return false;
}

export function createDshPlugin(config: DshPluginConfig = {}): DshPlugin {
  return {
    name: 'repo-harness',
    inject: ['tools'],
    apply(ctx) {
      const resolved = config.bridge
        ? { bridge: config.bridge, unavailable: null }
        : resolveDshBridge(config);
      const bridge = resolved.bridge;
      const sessions = new WeakMap<Session, SessionState>();

      // DSH persists `info` on the `tool/result` event, so the client can tell
      // a repo-harness denial from any other tool failure without parsing text.
      const deny = (reason: string): PreToolDecision => ({
        kind: 'deny',
        reason,
        info: { name: GUARD_DENIED_ERROR_NAME, code: GUARD_DENIED_ERROR_CODE, reason },
      });

      const stateFor = (session: Session): SessionState => {
        let state = sessions.get(session);
        if (state) return state;
        const cwd = session.header.cwd;
        state = {
          id: String(session.id),
          cwd: cwd ?? '',
          enablement: resolved.unavailable === null ? 'unknown' : 'unavailable',
          code: resolved.unavailable ?? '',
          start: null,
          startOutput: null,
          contextDelivered: false,
          diagnosticDelivered: false,
          runId: null,
          turn: null,
        };
        if (cwd === undefined) {
          state.enablement = 'unavailable';
          state.code = 'DSH_HOOK_NO_CWD';
        }
        sessions.set(session, state);
        return state;
      };

      const call = (
        state: SessionState,
        event: HookEvent,
        routeId: RouteId,
        payload: Record<string, unknown>,
      ): Promise<BridgeHookOutput> => bridge.call({
        event,
        routeId,
        cwd: state.cwd,
        payload: { cwd: state.cwd, session_id: state.id, run_id: state.runId, ...payload },
      });

      const startSession = (state: SessionState): Promise<void> => {
        if (state.enablement === 'unavailable') return Promise.resolve();
        if (state.start) return state.start;
        state.start = (async () => {
          try {
            const output = await call(state, 'SessionStart', 'default', {});
            state.startOutput = output;
            if (output.exit_code !== 0) {
              state.enablement = 'unavailable';
              state.code = output.reason;
              return;
            }
            state.enablement = output.reason === 'non-opt-in' || output.reason === 'not-in-git-repo'
              ? 'inactive'
              : 'ready';
          } catch (error) {
            state.enablement = 'unavailable';
            state.code = codeOf(error);
          }
        })();
        return state.start;
      };

      ctx.on('agent/pre-step', async (payload, next) => {
        const decision = await next();
        const state = stateFor(payload.agent.session);
        if (payload.step === 1) {
          state.runId = randomUUID();
          state.turn = payload.turn;
          await startSession(state);
        }
        if (decision.kind !== 'enter') return decision;

        const texts: string[] = [];
        if (state.enablement === 'unavailable') {
          if (state.diagnosticDelivered) return decision;
          state.diagnosticDelivered = true;
          texts.push(`repo-harness is unavailable: ${state.code}`);
        } else if (state.enablement === 'ready') {
          const startOutput = state.startOutput;
          if (!state.contextDelivered && !alreadyHasContext(payload.agent.session)) {
            state.contextDelivered = true;
            if (startOutput?.additional_context) texts.push(startOutput.additional_context);
          }
          if (payload.step === 1) {
            try {
              const notice = await call(state, 'UserPromptSubmit', 'inbox', {});
              if (notice.additional_context) texts.push(notice.additional_context);
            } catch {
              // Advisory delivery cannot admit a tool. Tool guards run separately.
            }
          }
        }
        if (texts.length === 0) return decision;
        const message = contextMessage(texts.join('\n\n'));
        let lastClaimed = -1;
        for (let index = decision.messages.length - 1; index >= 0; index -= 1) {
          if (payload.messages.includes(decision.messages[index]!)) { lastClaimed = index; break; }
        }
        const messages = [...decision.messages];
        messages.splice(lastClaimed + 1, 0, message);
        return { ...decision, messages };
      });

      ctx.on('tools/pre-execute', async (exec, next) => {
        if (!(exec.name in GUARDED_TOOLS)) return next();
        const tool = exec.name as GuardedTool;
        const mapping = GUARDED_TOOLS[tool];
        const agent = exec.agent;
        if (!agent) return deny('DSH_HOOK_NO_SESSION');
        const state = stateFor(agent.session);
        if (state.enablement === 'inactive') return next();
        if (state.enablement === 'unavailable') return deny(state.code);
        if (state.enablement !== 'ready' || state.runId === null) return deny('DSH_HOOK_SESSION_NOT_READY');
        if (!isRecord(exec.arguments)) return deny('DSH_HOOK_INVALID_INPUT');
        const target = tool === 'bash' ? exec.arguments.command : exec.arguments.file_path;
        if (typeof target !== 'string') return deny('DSH_HOOK_INVALID_INPUT');
        let output: BridgeHookOutput;
        try {
          output = await call(state, 'PreToolUse', mapping.routeId, {
            tool_name: mapping.toolName,
            tool_input: exec.arguments,
            tool_call_id: String(exec.callId),
          });
        } catch (error) {
          return deny(codeOf(error));
        }
        if (output.updated_input) return deny('DSH_HOOK_UPDATED_INPUT_UNSUPPORTED');
        if (output.decision === 'block' || output.exit_code !== 0) return deny(output.diagnostics || output.reason);
        return next();
      });

      ctx.on('agent/turn-stopping', async (payload) => {
        const state = sessions.get(payload.agent.session);
        if (!state || state.enablement !== 'ready' || state.runId === null) return;
        try {
          await call(state, 'Stop', 'default', { aborted: payload.signal.aborted });
        } catch {
          // Stop is advisory. Never retry an uncertain effect.
        }
      });

      // The denial list is optional: a composition without the projection
      // registry (headless, SDK) still runs the guard.
      ctx.inject(['sessionProjections'], (inner) => {
        inner.sessionProjections.register(guardDenialsProjection);
      });

      ctx.effect(() => () => bridge.close());
    },
  };
}

const plugin = createDshPlugin();
export default plugin;
