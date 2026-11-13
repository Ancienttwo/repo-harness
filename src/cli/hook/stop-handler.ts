/** Stop publishes the evidence checkpoint and reports notices; it never grants publication permission. */
import { collectArchitectureNotice } from './hook-protocol';
import { collectProtectedPathNotice } from './protected-path-notice';
import { publishCheckpointFromLedger } from '../../effects/evidence/checkpoint-store';
import type { StateInputCollector } from '../../effects/loop/state-input-collector';
import { resolveCapabilityOwnership } from '../../effects/state/resolve-effective-state';
import { payloadString, payloadValue, type HookIdentity, type HookPayload } from './hook-input';
import { SEAT_RESET_CONTEXT_TOKENS, seatResetAction, seatResetIdentity, seatResetReason } from '../../core/board/seat-reset';
import { readTranscriptUsage, seatResetRequested, writeSeatResetRequest } from '../../effects/board/seat-reset';

export type StopCollector = Pick<StateInputCollector, 'getRepoRoot'>;

export interface StopHandlerDependencies {
  readonly now?: () => Date;
}

export interface StopHandlerInput {
  readonly collector: StopCollector;
  readonly payload: HookPayload;
  readonly identity: HookIdentity;
  readonly env?: NodeJS.ProcessEnv;
  readonly dependencies?: StopHandlerDependencies;
}

export interface StopHandlerResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly systemMessage?: string;
}

/**
 * Stop publishes the evidence checkpoint, then reports changes under _ops/ and
 * _ref/ that no edit guard decision covered. A failed publish must not block
 * the turn: the next Stop publishes again from the same ledger.
 */
export function runStopHandler(opts: StopHandlerInput): StopHandlerResult {
  const repoRoot = opts.collector.getRepoRoot();
  const env = opts.env ?? process.env;
  const dependencies = opts.dependencies ?? {};
  const now = dependencies.now?.() ?? new Date();
  const stopHookActive = payloadValue(opts.payload, 'stop_hook_active');
  if (stopHookActive === true || stopHookActive === 'true') {
    return { exitCode: 0, stdout: '', stderr: '' };
  }
  try { publishCheckpointFromLedger(repoRoot, () => now); } catch { /* a failed publish never blocks the turn */ }
  if (opts.identity.host !== 'claude') return codexNotices(repoRoot, env);
  const reset = seatReset(opts.payload, env, now);
  return 'block' in reset ? reset.block : claudeNotices(repoRoot, env, reset.notices);
}

interface StopNotice {
  readonly content?: string;
  readonly systemMessage?: string;
  readonly diagnostics?: string;
}

/**
 * An orchestrator or advisor seat at or above the reset threshold blocks the stop once per session segment (exit 2
 * gives the reason to the model), so the seat writes its handoff and asks its peer for the reset. The hook is the one
 * authority for the action: the transcript size picks `/compact` or `/clear` and the request records it. Only the env
 * of `rh seats argv` names the seat. Any failure of this step resets nothing, names the failure and keeps
 * the notices.
 */
function seatReset(payload: HookPayload, env: NodeJS.ProcessEnv, now: Date): { readonly block: StopHandlerResult } | { readonly notices: readonly StopNotice[] } {
  try {
    const identity = seatResetIdentity(env);
    const transcript = payloadString(payload, 'transcript_path');
    if (identity === null || transcript === '' || seatResetRequested(identity, transcript)) return { notices: [] };
    const { contextTokens, bytes } = readTranscriptUsage(transcript);
    if (contextTokens === null || contextTokens < SEAT_RESET_CONTEXT_TOKENS) return { notices: [] };
    const action = seatResetAction(bytes);
    writeSeatResetRequest(identity, now, { contextTokens, transcriptPath: transcript, transcriptBytes: bytes, action });
    return { block: { exitCode: 2, stdout: '', stderr: `${seatResetReason(identity, contextTokens, bytes, action)}\n` } };
  } catch (error) {
    return { notices: [{ systemMessage: `repo-harness: seat reset skipped: ${(error as Error).message}` }] };
  }
}

/** The architecture and protected path notices fail independently. */
function claudeNotices(repoRoot: string, env: NodeJS.ProcessEnv, extra: readonly StopNotice[]): StopHandlerResult {
  const notices: StopNotice[] = [
    collectArchitectureNotice(repoRoot, options => resolveCapabilityOwnership(repoRoot, undefined, options), { env }),
    collectProtectedPathNotice(repoRoot, env),
    ...extra,
  ];
  const joined = (field: 'content' | 'systemMessage') => notices.map(notice => notice[field]).filter(Boolean).join('\n');
  const systemMessage = joined('systemMessage');
  return {
    exitCode: 0,
    stdout: joined('content'),
    stderr: notices.map(notice => notice.diagnostics ?? '').join(''),
    ...(systemMessage ? { systemMessage } : {}),
  };
}

/** Codex Stop writes no stdout, so the protected path report is one operator line on stderr. */
function codexNotices(repoRoot: string, env: NodeJS.ProcessEnv): StopHandlerResult {
  const notice = collectProtectedPathNotice(repoRoot, env);
  const line = notice.systemMessage ? `repo-harness: ${notice.systemMessage}\n` : '';
  return { exitCode: 0, stdout: '', stderr: `${notice.diagnostics ?? ''}${line}` };
}
