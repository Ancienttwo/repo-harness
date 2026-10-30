/** Stop renders the recovery views; it never grants publication permission. */
import { join } from 'path';
import { writeHookStateFile } from '../../effects/hook-state-file';
import { collectAgentNotice } from './agent-notice';
import { collectProtectedPathNotice } from './protected-path-notice';
import { publishCheckpointFromLedger } from '../../effects/evidence/checkpoint-store';
import {
  buildRecoveryContext,
  renderRecoveryHandoff,
  renderRecoveryResume,
  resolveRecoveryEvidence,
} from '../../effects/evidence/recovery-materializer';
import type { StateInputCollector } from '../../effects/loop/state-input-collector';
import { resolveCapabilityOwnership } from '../../effects/state/resolve-effective-state';
import { payloadValue, type HookIdentity, type HookPayload } from './hook-input';

export type StopCollector = Pick<StateInputCollector, 'getRepoRoot'>;

export interface StopProjectionTarget {
  readonly kind: 'handoff' | 'resume';
  readonly path: string;
}

export interface StopHandlerDependencies {
  readonly now?: () => Date;
  readonly observeProjectionWrite?: (target: StopProjectionTarget) => void;
  /** Narrow post-commit fault/observation seam; never driven by an env flag. */
  readonly afterProjectionWrite?: (target: StopProjectionTarget) => void;
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

/** Writes handoff then resume; each write replaces the whole file, so a retry converges. */
function writeRecoveryViews(
  repoRoot: string,
  env: NodeJS.ProcessEnv,
  identity: HookIdentity,
  now: Date,
  dependencies: StopHandlerDependencies,
): void {
  const context = buildRecoveryContext(repoRoot, env, { reason: 'session-stop', now: () => now, runId: identity.runId });
  const evidence = resolveRecoveryEvidence(repoRoot);
  const views: readonly [StopProjectionTarget, string][] = [
    [{ kind: 'handoff', path: context.paths.handoff }, renderRecoveryHandoff(context, evidence)],
    [{ kind: 'resume', path: context.paths.resume }, renderRecoveryResume(context, evidence)],
  ];
  for (const [target, content] of views) {
    writeHookStateFile(repoRoot, join(repoRoot, target.path), content);
    dependencies.observeProjectionWrite?.(target);
    dependencies.afterProjectionWrite?.(target);
  }
}

/**
 * Stop publishes the evidence checkpoint and renders handoff.md and resume.md.
 * It then reports changes under _ops/ and _ref/ that no edit guard decision covered.
 * A recovery write that would leave the repository or follow a symlink throws.
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
  // The views name the checkpoint they read, so a failed publish renders the
  // last published one.
  try { publishCheckpointFromLedger(repoRoot, () => now); } catch { /* see above */ }
  writeRecoveryViews(repoRoot, env, opts.identity, now, dependencies);
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
