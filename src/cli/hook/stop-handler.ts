/** Stop renders the recovery views; it never grants publication permission. */
import { join } from 'path';
import { writeHookStateFile } from '../../effects/hook-state-file';
import { collectAgentNotice } from './agent-notice';
import { publishCheckpointFromLedger } from '../../effects/evidence/checkpoint-store';
import {
  activePlanForRecovery,
  buildRecoveryContext,
  renderRecoveryHandoff,
  renderRecoveryResume,
  resolveRecoveryEvidence,
} from '../../effects/evidence/recovery-materializer';
import type { StateInputCollector } from '../../effects/loop/state-input-collector';
import { resolveCapabilityOwnership } from '../../effects/state/resolve-effective-state';
import { payloadValue, type HookIdentity, type HookPayload } from './hook-input';

export type StopCollector = Pick<StateInputCollector, 'getRepoRoot' | 'getWorktreeOwnership' | 'getActivePlanMarker'>;

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
  activePlan: string | null,
  env: NodeJS.ProcessEnv,
  identity: HookIdentity,
  now: Date,
  dependencies: StopHandlerDependencies,
): void {
  const context = buildRecoveryContext(repoRoot, activePlan, env, { reason: 'session-stop', now: () => now, runId: identity.runId });
  const evidence = resolveRecoveryEvidence(repoRoot);
  const contractPath = context.artifacts.contract;
  const views: readonly [StopProjectionTarget, string][] = [
    [{ kind: 'handoff', path: context.paths.handoff }, renderRecoveryHandoff(context, evidence, contractPath)],
    [{ kind: 'resume', path: context.paths.resume }, renderRecoveryResume(context, evidence, contractPath)],
  ];
  for (const [target, content] of views) {
    writeHookStateFile(repoRoot, join(repoRoot, target.path), content);
    dependencies.observeProjectionWrite?.(target);
    dependencies.afterProjectionWrite?.(target);
  }
}

/**
 * Stop publishes the evidence checkpoint and renders handoff.md and resume.md.
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
  const activePlan = activePlanForRecovery(opts.collector);
  // The views name the checkpoint they read, so a failed publish renders the
  // last published one.
  try { publishCheckpointFromLedger(repoRoot, () => now); } catch { /* see above */ }
  writeRecoveryViews(repoRoot, activePlan, env, opts.identity, now, dependencies);
  const notice = opts.identity.host === 'claude'
    ? collectAgentNotice(repoRoot, options => resolveCapabilityOwnership(repoRoot, undefined, options), { env })
    : {};
  return { exitCode: 0, stdout: notice.content ?? '', stderr: notice.diagnostics ?? '', ...(notice.systemMessage ? { systemMessage: notice.systemMessage } : {}) };
}
