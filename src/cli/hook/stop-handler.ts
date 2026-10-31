/** Stop publishes the evidence checkpoint and reports notices; it never grants publication permission. */
import { collectAgentNotice } from './agent-notice';
import { collectProtectedPathNotice } from './protected-path-notice';
import { publishCheckpointFromLedger } from '../../effects/evidence/checkpoint-store';
import type { StateInputCollector } from '../../effects/loop/state-input-collector';
import { resolveCapabilityOwnership } from '../../effects/state/resolve-effective-state';
import { payloadValue, type HookIdentity, type HookPayload } from './hook-input';

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
  return opts.identity.host === 'claude' ? claudeNotices(repoRoot, env) : codexNotices(repoRoot, env);
}

/** The architecture and protected path notices fail independently. */
function claudeNotices(repoRoot: string, env: NodeJS.ProcessEnv): StopHandlerResult {
  const notices = [
    collectAgentNotice(repoRoot, options => resolveCapabilityOwnership(repoRoot, undefined, options), { env }),
    collectProtectedPathNotice(repoRoot, env),
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
