import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { execFileSync, spawnSync } from 'child_process';
import { basename, dirname, join } from 'path';
import { buildReviewSubject } from '../../effects/review/diff-fingerprint';
import { recordCircuitAttempt } from './circuit-breaker';
import {
  buildPromptIntentContext,
  deriveDoneOutcome,
  derivePendingOrchestrationKind,
  derivePlanStartSlug,
  derivePlanStartTitle,
  isAgenticPackagingIntent,
  isBugFixIntent,
  isBugOrHuntIntent,
  isCodegraphRouteIntent,
  isDoneIntent,
  isEmbeddedApprovedPlanIntent,
  isExecutionApprovalIntent,
  isHealthRouteIntent,
  isImplementIntent,
  isNextSliceOrStatusAdvisoryIntent,
  isNontrivialCodeTaskIntent,
  isPassiveWorktreeStatusIntent,
  isPlanCreationIntent,
  isPlanDiscussionContinuationIntent,
  isPlanExecutionProjectionIntent,
  isPlanShapedMarkdownIntent,
  isPlainFeaturePlanStartIntent,
  isRetrospectiveCompletionReportIntent,
  isReviewReleaseAdvisoryIntent,
  isReviewReleaseIntent,
  isSpaDayIntent,
  isThinkPlanStartIntent,
  isTriggerQuestionPrompt,
  shouldEmitBddFeatureAdvice,
  shouldEmitTddBugFixAdvice,
  shouldEmitUxFeatureGuardAdvice,
} from './prompt-intents';
import {
  classifyPromptGuardIntent,
  decidePromptGuardAction,
  type PromptGuardAction,
  type PromptGuardIntentFacts,
  type PromptGuardPlanState,
  type PromptGuardState,
} from './prompt-guard-decision';
import { routePromptExplicitFirst } from './prompt-router';
import { renderMinimalChangePromptAdvice } from './minimal-change-context';
import { loadMinimalChangePolicy } from './minimal-change-policy';
import { renderReviewRubric } from './review-rubric';
import { parseHookInput, readHookText, type HookInputFs } from './hook-input';
import { parseAcceptancePolicy } from '../../../scripts/acceptance-receipt';
import type { CircuitAttempt, CircuitDecision } from './circuit-breaker';

/** A command result is intentionally structural so tests can inject a direct,
 * in-process command authority without changing prompt semantics. */
export interface PromptCommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface PromptHandlerDependencies {
  readonly fs?: PromptHandlerFs;
  readonly now?: () => Date;
  readonly runCommand?: (
    args: readonly string[],
    input?: string,
  ) => PromptCommandResult;
  readonly recordCircuit?: typeof recordCircuitAttempt;
}

export interface PromptHandlerFs extends HookInputFs {
  mkdirSync(path: string, options?: { readonly recursive?: boolean }): void;
  unlinkSync(path: string): void;
  writeFileSync(path: string, data: string): void;
}

export interface PromptHandlerInput {
  readonly repoRoot: string;
  readonly input?: string | Buffer;
  readonly prompt?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly dependencies?: PromptHandlerDependencies;
}

export interface PromptHandlerResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly reason?: string;
}

export interface PromptGuardRuntimeState extends PromptGuardState {
  readonly activePlan: string | null;
  readonly planStatus: string;
  readonly contractFile: string | null;
  readonly contractPath: 'present' | 'missing';
  readonly reviewFile: string | null;
  readonly checksFile: string;
  readonly evidenceError: string;
  readonly markerProblem: string;
}

const DEFAULT_FS: PromptHandlerFs = {
  existsSync,
  readFileSync: (path, encoding) => readFileSync(path, encoding),
  realpathSync,
  statSync,
  mkdirSync: (path, options) => mkdirSync(path, options),
  unlinkSync,
  writeFileSync: (path, data) => writeFileSync(path, data),
};

function text(fsApi: HookInputFs, repoRoot: string, relPath: string): string | null {
  return readHookText(repoRoot, relPath, fsApi);
}

function xargsTrim(value: string): string {
  return value.trim().split(/\s+/u).filter(Boolean).join(' ');
}

function pathFromRepo(repoRoot: string, value: string): string {
  return value.startsWith('/') ? value : join(repoRoot, value);
}

function repoPath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.\//u, '');
}

function markerField(raw: string, label: string): string {
  const marker = `**${label}**:`;
  for (const line of raw.split('\n')) {
    const index = line.lastIndexOf(marker);
    if (index >= 0) return xargsTrim(line.slice(index + marker.length).replace(/`/g, ''));
  }
  return '';
}

function planSlug(planPath: string): string | null {
  const match = /^plan-\d{8}-\d{4}-(.+)\.md$/u.exec(basename(planPath));
  return match?.[1] ?? null;
}

function planStem(planPath: string): string | null {
  const match = /^plan-(\d{8})-(\d{4})-(.+)\.md$/u.exec(basename(planPath));
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function declaredArtifactPath(planText: string, labels: readonly string[]): string {
  for (const label of labels) {
    const value = markerField(planText, label);
    if (value) return value;
  }
  return '';
}

function deriveContractPath(repoRoot: string, planPath: string, planText: string, fsApi: HookInputFs): string | null {
  const explicit = declaredArtifactPath(planText, ['Task Contract', 'Sprint Contract']);
  if (explicit) return repoPath(explicit);
  const stem = planStem(planPath);
  const slug = planSlug(planPath);
  if (!stem || !slug) return null;
  const preferred = `tasks/contracts/${stem}.contract.md`;
  const legacy = `tasks/contracts/${slug}.contract.md`;
  return fsApi.existsSync(pathFromRepo(repoRoot, preferred)) || !fsApi.existsSync(pathFromRepo(repoRoot, legacy))
    ? preferred
    : legacy;
}

function deriveReviewPath(repoRoot: string, planPath: string, planText: string, fsApi: HookInputFs): string | null {
  const explicit = declaredArtifactPath(planText, ['Task Review', 'Sprint Review']);
  if (explicit) return repoPath(explicit);
  const stem = planStem(planPath);
  const slug = planSlug(planPath);
  if (!stem || !slug) return null;
  const preferred = `tasks/reviews/${stem}.review.md`;
  const legacy = `tasks/reviews/${slug}.review.md`;
  return fsApi.existsSync(pathFromRepo(repoRoot, preferred)) || !fsApi.existsSync(pathFromRepo(repoRoot, legacy))
    ? preferred
    : legacy;
}

function evidenceContractError(planText: string): string {
  const start = /^## Evidence Contract\s*$/mu.exec(planText);
  if (!start || start.index === undefined) return 'missing ## Evidence Contract section';
  const tail = planText.slice(start.index + start[0].length);
  const end = /^## /mu.exec(tail);
  const section = end ? tail.slice(0, end.index) : tail;
  const required = ['State/progress path', 'Verification evidence', 'Evaluator rubric', 'Stop condition', 'Rollback surface'];
  const missing: string[] = [];
  for (const label of required) {
    const line = new RegExp(`^\\s*-\\s*(?:\\*\\*)?${label}(?:\\*\\*)?\\s*:\\s*(.*?)\\s*$`, 'imu').exec(section)?.[1] ?? '';
    if (!line || /^(?:tbd|todo|n\/a|none|unknown|\.\.\.)$/iu.test(line)) missing.push(`missing field: ${label}`);
  }
  return missing.length > 0 ? missing.join('\n') : '';
}

function readActivePlan(repoRoot: string, fsApi: PromptHandlerFs): {
  readonly activePlan: string | null;
  readonly markerProblem: string;
  readonly worktree: 'current' | 'foreign_marker';
} {
  const current = (() => {
    try { return fsApi.realpathSync(repoRoot); } catch { return repoRoot; }
  })();
  const ownerRaw = text(fsApi, repoRoot, '.ai/harness/active-worktree')?.split('\n')[0]?.trim() ?? '';
  if (ownerRaw) {
    let owner = ownerRaw;
    try { owner = fsApi.realpathSync(ownerRaw); } catch { /* owner may be stale */ }
    if (owner !== current) {
      return { activePlan: null, markerProblem: `active plan marker belongs to a different worktree: ${ownerRaw}`, worktree: 'foreign_marker' };
    }
  }
  const marker = text(fsApi, repoRoot, '.ai/harness/active-plan')?.trim().split(/\s+/u).join(' ') ?? '';
  if (!marker) return { activePlan: null, markerProblem: '', worktree: 'current' };
  if (!fsApi.existsSync(pathFromRepo(repoRoot, marker))) {
    return { activePlan: null, markerProblem: `stale active plan marker points to missing plan: ${marker}`, worktree: 'current' };
  }
  return { activePlan: marker, markerProblem: '', worktree: 'current' };
}

function pendingFile(repoRoot: string, fsApi: HookInputFs): string {
  const policy = text(fsApi, repoRoot, '.ai/harness/policy.json');
  if (policy) {
    try {
      const pending = (JSON.parse(policy) as { planning?: { pending_orchestration_file?: unknown } }).planning?.pending_orchestration_file;
      if (typeof pending === 'string' && pending.startsWith('.ai/harness/')) return pending;
    } catch { /* default */ }
  }
  return '.ai/harness/planning/pending.json';
}

function pendingFresh(repoRoot: string, fsApi: PromptHandlerFs, now: Date): boolean {
  const rel = pendingFile(repoRoot, fsApi);
  const path = pathFromRepo(repoRoot, rel);
  if (!fsApi.existsSync(path)) return false;
  try {
    const mtimeMs = fsApi.statSync(path).mtimeMs;
    if (typeof mtimeMs !== 'number') return false;
    const age = now.getTime() - mtimeMs;
    return age <= 259200000;
  } catch {
    return false;
  }
}

function resolvePromptGuardState(repoRoot: string, env: NodeJS.ProcessEnv, deps: PromptHandlerDependencies = {}): PromptGuardRuntimeState {
  const fsApi = deps.fs ?? DEFAULT_FS;
  const now = (deps.now ?? (() => new Date()))();
  const marker = readActivePlan(repoRoot, fsApi);
  let plan: PromptGuardPlanState = 'none';
  let planStatus = '';
  let contractFile: string | null = null;
  let contractPath: 'present' | 'missing' = 'missing';
  let reviewFile: string | null = null;
  let evidenceError = '';
  if (marker.activePlan) {
    const planText = text(fsApi, repoRoot, marker.activePlan) ?? '';
    planStatus = markerField(planText, 'Status');
    switch (planStatus) {
      case 'Draft': plan = 'draft'; break;
      case 'Annotating': plan = 'annotating'; break;
      case 'Approved': plan = 'approved'; break;
      case 'Executing': plan = 'executing'; break;
      default: plan = 'unknown'; break;
    }
    contractFile = deriveContractPath(repoRoot, marker.activePlan, planText, fsApi);
    contractPath = contractFile ? 'present' : 'missing';
    reviewFile = deriveReviewPath(repoRoot, marker.activePlan, planText, fsApi);
    evidenceError = evidenceContractError(planText);
  }
  const contractPresent = Boolean(contractFile && fsApi.existsSync(pathFromRepo(repoRoot, contractFile)));
  const evidence = !marker.activePlan ? 'unchecked' : evidenceError ? 'incomplete' : 'complete';
  return {
    spec: fsApi.existsSync(pathFromRepo(repoRoot, 'docs/spec.md')) ? 'present' : 'missing',
    plan,
    pending: pendingFresh(repoRoot, fsApi, now) ? 'fresh' : fsApi.existsSync(pathFromRepo(repoRoot, pendingFile(repoRoot, fsApi))) ? 'stale' : 'none',
    worktree: marker.worktree,
    contract: contractPresent ? 'present' : 'missing',
    contractPath,
    evidence,
    activePlan: marker.activePlan,
    planStatus,
    contractFile,
    reviewFile,
    checksFile: '.ai/harness/checks/latest.json',
    evidenceError,
    markerProblem: marker.markerProblem,
  };
}

function factsForPrompt(prompt: string, pending: boolean): PromptGuardIntentFacts {
  const context = buildPromptIntentContext(prompt, pending);
  return {
    done: isDoneIntent(context),
    planStart: isPlanCreationIntent(context) || isThinkPlanStartIntent(context),
    implement: isImplementIntent(context),
    planningDiscussion: isPlanDiscussionContinuationIntent(context),
    reviewRelease: isReviewReleaseAdvisoryIntent(context),
    passiveWorktreeStatus: isPassiveWorktreeStatusIntent(context),
    passiveCompletionReport: isRetrospectiveCompletionReportIntent(context),
    passiveNextSliceReport: isNextSliceOrStatusAdvisoryIntent(context),
    embeddedApprovedPlan: isEmbeddedApprovedPlanIntent(context),
    planShapedMarkdown: isPlanShapedMarkdownIntent(context),
    bugOrHunt: isBugOrHuntIntent(context),
    planExecutionProjection: isPlanExecutionProjectionIntent(context),
  };
}

function commandRunner(repoRoot: string, env: NodeJS.ProcessEnv): (args: readonly string[], input?: string) => PromptCommandResult {
  return (args, input) => {
    const sourceCli = env.REPO_HARNESS_CLI && existsSync(env.REPO_HARNESS_CLI)
      ? env.REPO_HARNESS_CLI
      : join(repoRoot, 'src/cli/index.ts');
    const command = existsSync(sourceCli) ? process.execPath : 'repo-harness';
    const commandArgs = existsSync(sourceCli) ? [sourceCli, ...args] : [...args];
    const result = spawnSync(command, commandArgs, {
      cwd: repoRoot,
      input,
      encoding: 'utf8',
      env: { ...env, HOOK_REPO_ROOT: repoRoot },
      maxBuffer: 4 * 1024 * 1024,
    });
    return {
      exitCode: result.status ?? (result.error ? 1 : 0),
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
    };
  };
}

function structuredError(
  guard: string,
  reason: string,
  fix: string,
  failureClass: string,
): PromptHandlerResult {
  return {
    exitCode: 2,
    stdout: `${JSON.stringify({ guard, action: 'block', reason, fix, failure_class: failureClass, run_id: '' })}\n`,
    stderr: `[${guard}] ${reason}\n  Fix: ${fix}\n`,
    reason,
  };
}

export function renderPromptGuardAction(
  action: PromptGuardAction,
  state: PromptGuardRuntimeState,
  fsApi: PromptHandlerFs = DEFAULT_FS,
  repoRoot = '',
): PromptHandlerResult {
  switch (action) {
    case 'allow':
    case 'done_gate':
      return { exitCode: 0, stdout: '', stderr: '' };
    case 'spec_block':
      return { exitCode: 0, stdout: '[SpecGuard] Advisory: docs/spec.md is missing. Create stable product truth before implementation.\n[SpecGuard] Run repo-harness run new-spec and capture stable product intent; implementation edits without a spec are blocked at the edit layer.\n', stderr: '' };
    case 'stale_active_plan_advice':
      for (const file of ['.ai/harness/active-plan', '.ai/harness/active-worktree']) {
        try { fsApi.unlinkSync(pathFromRepo(repoRoot, file)); } catch { /* stale cleanup is advisory */ }
      }
      return { exitCode: 0, stdout: `[PlanStatusGuard] Advisory: ${state.markerProblem}; cleared stale active markers. Capture or switch to an approved plan before editing implementation files.\n`, stderr: '' };
    case 'plan_capture_pending_advice':
      return { exitCode: 0, stdout: '[PlanCaptureGate] Implementation requested while a pending plan/orchestration discussion has not been captured.\n[PlanCaptureGate] Capture the final plan body first; if implementation is already approved, use --status Approved --execute with a work-package promotion reason:\n', stderr: '' };
    case 'worktree_execution_advice':
      return { exitCode: 0, stdout: '[WorktreeExecutionGate] Active plan is in linked worktree. Continue from that worktree instead of recapturing a plan.\n', stderr: '' };
    case 'plan_capture_missing_active_advice':
      return { exitCode: 0, stdout: '[PlanCaptureGate] Approval detected before an active plan artifact exists.\n[PlanCaptureGate] Let the agent run the approved-plan capture path now.\n', stderr: '' };
    case 'plan_status_no_active_block':
      return { exitCode: 0, stdout: '[PlanStatusGuard] Advisory: No active plan found in plans/. Implementation edits will be blocked at the edit layer until a plan is captured.\n[PlanStatusGuard] Capture the approved planning output with: repo-harness run capture-plan --slug <slug> --title <title> --artifact-level work-package --promotion-reason human_decision_boundary --status Approved --execute\n', stderr: '' };
    case 'plan_capture_draft_advice':
      return { exitCode: 0, stdout: `[PlanCaptureGate] Approval detected for ${state.planStatus} plan: ${state.activePlan ?? '(none)'}\n[PlanCaptureGate] Recapture the exact approved plan body with --artifact-level work-package --promotion-reason <reason> --status Approved --execute, or mark this plan Approved and run:\n  repo-harness run plan-to-todo --plan ${state.activePlan ?? '<plan>'}\n`, stderr: '' };
    case 'plan_status_not_approved_block':
      return { exitCode: 0, stdout: `[PlanStatusGuard] Advisory: plan status is '${state.planStatus}' in ${state.activePlan ?? '(none)'}. Complete the annotation cycle and move the plan to Approved; implementation edits are blocked at the edit layer until then.\n`, stderr: '' };
    case 'evidence_contract_block':
      return { exitCode: 0, stdout: `[EvidenceContractGuard] Advisory: plan Evidence Contract is incomplete in ${state.activePlan ?? '(none)'}:\n${state.evidenceError}\n[EvidenceContractGuard] Fill ## Evidence Contract with state/progress path, verification evidence, evaluator rubric, stop condition, and rollback surface before implementation.\n`, stderr: '' };
    case 'plan_execution_scaffold_advice':
      return { exitCode: 0, stdout: `[PlanExecutionGate] Approval detected for approved plan: ${state.activePlan ?? '(none)'}\n[PlanExecutionGate] Create the sprint contract/review/notes before implementation:\n  repo-harness run plan-to-todo --plan ${state.activePlan ?? '<plan>'}\n`, stderr: '' };
    case 'contract_missing_block':
      return { exitCode: 0, stdout: `[ContractGuard] Advisory: missing active sprint contract for ${state.activePlan ?? '(none)'}.\n[ContractGuard] Run repo-harness run plan-to-todo --plan ${state.activePlan ?? '<plan>'} to create the contract/review/notes scaffold before implementation.\n`, stderr: '' };
    case 'done_missing_active_plan':
      return structuredError('ContractGuard', 'Done intent detected without an active plan.', 'Finish the plan workflow and ensure plans/ contains the active plan before marking work done.', 'state_violation');
    case 'done_contract_path_missing':
      return structuredError('ContractGuard', `Could not derive a contract path from plan: ${state.activePlan ?? '(none)'}`, 'Rename the plan to plan-<timestamp>-<slug>.md so the matching contract can be resolved.', 'missing_artifact');
    case 'done_missing_contract':
      return structuredError('ContractGuard', `Missing task contract: ${state.contractFile ?? '(none)'}`, 'Create the contract or regenerate tasks from the active plan before marking work done.', 'missing_artifact');
    case 'done_evidence_contract_block':
      return structuredError('EvidenceContractGuard', `Done intent detected without a complete plan Evidence Contract. ${state.evidenceError}`, 'Fill ## Evidence Contract with state/progress path, verification evidence, evaluator rubric, stop condition, and rollback surface before marking work done.', 'quality_gate');
    default:
      return structuredError('PromptGuard', `Unknown prompt guard decision action: ${action}.`, 'Fix the TypeScript prompt guard decision table before continuing.', 'state_violation');
  }
}

function strictWorkflow(repoRoot: string, state: PromptGuardRuntimeState, fsApi: HookInputFs): boolean {
  if (!state.contractFile) return false;
  const contract = text(fsApi, repoRoot, state.contractFile) ?? '';
  return /^> \*\*Workflow Profile\*\*:\s*strict\s*$/mu.test(contract);
}

// Resolves worktree_strategy.review_base -- the same key
// scripts/acceptance-receipt.ts's reviewBase() diffs against -- never
// merge_back.target (where finished work lands after merge). This is the
// only caller (the [AcceptanceSubject] advisory hint), so it must name the
// exact ref the real acceptance-receipt validator will require; showing a
// hint computed against merge_back.target would silently disagree with the
// receipt the user is about to record. Mirrors reviewBase()'s fail-closed
// behavior: missing/empty review_base throws (the caller is advisory-only
// and already wraps this in try/catch), never falls back to base_branch or
// 'main'.
function currentReviewBaseRef(repoRoot: string, fsApi: HookInputFs): string {
  const raw = text(fsApi, repoRoot, '.ai/harness/policy.json');
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { worktree_strategy?: { review_base?: unknown } };
      if (typeof parsed.worktree_strategy?.review_base === 'string' && parsed.worktree_strategy.review_base.trim()) {
        return parsed.worktree_strategy.review_base;
      }
    } catch { /* fall through to the hard error below */ }
  }
  throw new Error('worktree_strategy.review_base is missing');
}

function promptCircuitState(repoRoot: string, state: PromptGuardRuntimeState, fsApi: HookInputFs): {
  readonly profile: 'lite' | 'standard' | 'strict';
  readonly progressToken: string;
} {
  let profile: 'lite' | 'standard' | 'strict' = 'standard';
  let progressToken = 'unknown';
  const raw = text(fsApi, repoRoot, '.ai/harness/state/effective.json');
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { workflow_profile?: unknown; progress_token?: unknown };
      if (parsed.workflow_profile === 'lite' || parsed.workflow_profile === 'strict') profile = parsed.workflow_profile;
      if (typeof parsed.progress_token === 'string' && parsed.progress_token) progressToken = parsed.progress_token;
    } catch { /* fail closed to stable standard/unknown circuit identity */ }
  }
  if (strictWorkflow(repoRoot, state, fsApi)) profile = 'strict';
  return { profile, progressToken };
}

function recordPromptCircuit(
  repoRoot: string,
  attempt: CircuitAttempt,
  recordCircuit: typeof recordCircuitAttempt,
  err: string[],
): boolean {
  try {
    const decision: CircuitDecision = recordCircuit(repoRoot, attempt);
    if (decision.allowed) return true;
    err.push(`${JSON.stringify(decision)}\n`);
    return false;
  } catch {
    return false;
  }
}

function emitReviewHints(
  repoRoot: string,
  env: NodeJS.ProcessEnv,
  state: PromptGuardRuntimeState,
  fsApi: PromptHandlerFs,
  out: string[],
  err: string[],
  recordCircuit: typeof recordCircuitAttempt,
): void {
  const circuit = promptCircuitState(repoRoot, state, fsApi);
  if (!recordPromptCircuit(repoRoot, {
    kind: 'review',
    guard: 'ReviewLimit',
    reason: 'automatic review routing cap',
    pathOrAction: '/check',
    progressToken: circuit.progressToken,
    fingerprint: 'review-route',
    profile: circuit.profile,
  }, recordCircuit, err)) return;

  out.push('[WazaRoute] Review/release intent detected. Default route: Waza /check.\n');
  out.push(`${renderReviewRubric('prompt')}\n`);
  let subject = 'unknown';
  let target = 'unknown';
  try {
    const result = buildReviewSubject(repoRoot, { targetRef: currentReviewBaseRef(repoRoot, fsApi) });
    if (result.status === 'ok') {
      subject = result.review_subject_sha256;
      target = result.target_rev;
    }
  } catch { /* advisory only */ }
  out.push(`[AcceptanceSubject] The typed AcceptanceReceipt will bind normalized subject ${subject} at target ${target}.\n`);
  if (strictWorkflow(repoRoot, state, fsApi)) {
    if (!state.contractFile) {
      out.push('[ExternalAcceptance] Active contract has no valid Acceptance Policy; fix the contract before acceptance.\n');
    } else {
      const contract = text(fsApi, repoRoot, state.contractFile) ?? '';
      try {
        const policy = parseAcceptancePolicy(contract);
        const source = policy.reviewer === 'Claude' ? 'claude-review' : 'codex-review';
        const command = policy.reviewer === 'Claude' ? '/claude-review' : 'codex-review';
        out.push('[ExternalAcceptance] Review/release intent detected. Start peer acceptance in parallel with local /check.\n');
        out.push(`[ExternalAcceptance] Current active plan: ${state.activePlan ?? '(none)'}\n`);
        out.push(`[ExternalAcceptance] Current contract: ${state.contractFile}\n`);
        out.push(`[ExternalAcceptance] Current review: ${state.reviewFile ?? 'tasks/reviews/<slug>.review.md'}\n`);
        out.push(`[ExternalAcceptance] Current checks: ${state.checksFile}\n`);
        out.push(`[ExternalAcceptance] Peer reviewer: ${policy.reviewer} via ${command}\n`);
        out.push(`[ExternalAcceptance] Record external acceptance only through repo-harness run acceptance-receipt record --contract "${state.contractFile}" --verification "${state.checksFile}" --review "${state.reviewFile ?? 'tasks/reviews/<slug>.review.md'}" --disposition external_pass --reviewer "${policy.reviewer}" --source "${source}". Markdown is projection only.\n`);
        if (policy.user_waiver === 'allowed') {
          out.push('[ExternalAcceptance] If the contract owner chooses the allowed user-waiver path:\n');
          out.push('1. Obtain one explicit owner decision for this contract/goal authority. Do not ask the owner to quote or track a subject hash; the helper binds the verified subject.\n');
          out.push(`2. Record that decision once:\n   repo-harness run acceptance-receipt grant-waiver --contract "${state.contractFile}" --actor "<contract owner>" --summary "<accepted bounded risk>"\n`);
          out.push(`3. After each fresh passing verify-sprint evidence bundle, materialize the exact receipt:\n   repo-harness run acceptance-receipt record --contract "${state.contractFile}" --verification "${state.checksFile}" --review "${state.reviewFile ?? 'tasks/reviews/<slug>.review.md'}" --disposition user_waiver\n\n`);
          out.push('A semantic correction still invalidates the old receipt and requires fresh verification. The same grant may rematerialize the new exact receipt while contract/goal authority is unchanged, without asking the owner again. This grant never authorizes provider disclosure or merge.\n');
        }
      } catch {
        out.push('[ExternalAcceptance] Active contract has no valid Acceptance Policy; fix the contract before acceptance.\n');
      }
    }
  }

  const userRequested = env.REPO_HARNESS_USER_REQUESTED_CROSS_MODEL === 'true';
  if (!recordPromptCircuit(repoRoot, {
    kind: 'cross-model-consult',
    guard: 'CrossModelLimit',
    reason: 'cross-model consultation cap',
    pathOrAction: 'merge',
    progressToken: circuit.progressToken,
    fingerprint: 'cross-model-consult',
    profile: circuit.profile,
    explicitHighRiskContract: false,
    riskTriggeredConsult: circuit.profile === 'strict',
    userRequestedConsult: userRequested,
    strongBoundary: false,
  }, recordCircuit, err)) return;
  const peer = env.HOOK_HOST === 'codex' ? 'Claude' : 'Codex';
  const skill = env.HOOK_HOST === 'codex' ? 'claude-review' : 'codex-review';
  out.push(`[CrossReview] Pre-merge moment — consider an independent ${peer} review of the diff via ${skill}: a different training distribution has non-overlapping blind spots. Skip if the change is trivial.\n`);
}

function emitCodegraphHint(repoRoot: string, inputSession: string, out: string[], fsApi: PromptHandlerFs): void {
  const safe = inputSession.replace(/[^A-Za-z0-9._-]/gu, '_') || 'unknown';
  const marker = join(repoRoot, '.claude/.codegraph-state', `${safe}.nudged`);
  if (fsApi.existsSync(marker)) return;
  try {
    fsApi.mkdirSync(dirname(marker), { recursive: true });
    fsApi.writeFileSync(marker, '');
  } catch { /* advisory marker */ }
  out.push('[CodegraphRoute] Structural code-navigation intent detected. Prefer CodeGraph context/search/callers/impact before grep/read when available.\n');
}

function emitWorkflowFileGuards(repoRoot: string, out: string[], fsApi: HookInputFs): void {
  let changed = '';
  try { changed = execFileSync('git', ['-C', repoRoot, 'status', '--porcelain=v1', '--untracked-files=no'], { encoding: 'utf8' }); } catch { return; }
  const paths = changed.split('\n').map((line) => line.slice(3)).filter(Boolean);
  if (paths.includes('tasks/todos.md') && fsApi.existsSync(join(repoRoot, 'tasks/todos.md'))) out.push('[PlanGuard] tasks/todos.md has been modified. Read annotations and update the plan. Do not implement yet.\n');
  if (paths.includes('tasks/lessons.md') && fsApi.existsSync(join(repoRoot, 'tasks/lessons.md'))) out.push('[LessonGuard] tasks/lessons.md has updates. Review prevention rules before coding.\n');
  const research = paths.find((path) => /^docs\/researches\/.*\.md$/u.test(path));
  if (research) out.push(`[ResearchGuard] ${research} updated. Review research deeply before planning or implementation.\n`);
  const plan = paths.find((path) => /^plans\/plan-.*\.md$/u.test(path));
  if (plan) out.push(`[AnnotationGuard] ${plan} has annotations. Process all notes and revise. Do not implement yet.\n`);
}

function writePendingOrchestration(repoRoot: string, fsApi: PromptHandlerFs, kind: string, slug: string, title: string, env: NodeJS.ProcessEnv, now: Date): void {
  const target = join(repoRoot, '.ai/harness/planning/pending.json');
  fsApi.mkdirSync(dirname(target), { recursive: true });
  fsApi.writeFileSync(target, `${JSON.stringify({
    version: 1,
    kind,
    host: env.HOOK_HOST ?? 'unknown',
    prompt_slug: slug,
    draft_plan_path: '',
    source_ref: title,
    expected_artifact: 'plans/plan-*.md',
    cwd: repoRoot,
    created_at: now.toISOString(),
  }, null, 2)}\n`);
}

function appendTddBddAdvice(context: ReturnType<typeof buildPromptIntentContext>, out: string[]): void {
  if (shouldEmitTddBugFixAdvice(context)) out.push('[TDD] Bug-fix intent detected. Reproduce with a failing test first.\n  检测到修复请求：先写失败测试复现问题，再重写实现。\n');
  if (shouldEmitBddFeatureAdvice(context)) out.push('[BDD] Feature intent detected. Define Given-When-Then acceptance scenarios first.\n  检测到新功能请求：先定义 Given-When-Then 验收场景。\n');
  if (shouldEmitUxFeatureGuardAdvice(context)) out.push('[UXFeatureGuard] For user-visible behavior, first freeze rules/non-goals, separate instruction from payload, and inventory existing UI/domain reuse targets.\n  Read: repo-harness docs show ux-feature-guard (fail loudly; no parallel authority or compatibility fallback).\n');
}

function checkStructuredEvidence(repoRoot: string, state: PromptGuardRuntimeState, fsApi: HookInputFs): string | null {
  const path = join(repoRoot, state.checksFile);
  const raw = text(fsApi, repoRoot, state.checksFile);
  if (!raw) return `Missing structured checks file: ${state.checksFile}`;
  try {
    const record = JSON.parse(raw) as { status?: unknown; source?: unknown; exit_code?: unknown; contract?: unknown; review?: unknown };
    if (record.status !== 'pass') return `Structured checks are not passing in ${state.checksFile} (status=${String(record.status ?? 'missing')}).`;
    if (record.source !== 'verify-sprint') return `Structured checks must come from verify-sprint, got ${String(record.source ?? 'missing')}.`;
    if (record.exit_code !== 0) return `Structured checks did not record a zero verify-sprint exit code (exit_code=${String(record.exit_code ?? 'missing')}).`;
    if (state.contractFile && typeof record.contract === 'object' && record.contract !== null && (record.contract as { file?: unknown }).file !== state.contractFile) return `Structured checks are stale for contract ${String((record.contract as { file?: unknown }).file ?? 'missing')}; expected ${state.contractFile}.`;
    return null;
  } catch {
    return `Structured checks file is not valid JSON: ${path}`;
  }
}

function incompletePlanTask(planText: string): { readonly remaining: number; readonly next: string } {
  const lines = planText.split('\n');
  let inBreakdown = false;
  let remaining = 0;
  let next = '';
  for (const line of lines) {
    if (/^## Task Breakdown\s*$/u.test(line)) {
      inBreakdown = true;
      continue;
    }
    if (inBreakdown && /^##\s+/u.test(line)) break;
    if (!inBreakdown) continue;
    const match = /^\s*-\s*\[([ xX])\]\s+(.+)$/u.exec(line);
    if (!match || /[xX]/u.test(match[1] ?? '')) continue;
    remaining += 1;
    if (!next) next = match[2]?.trim() ?? '';
  }
  return { remaining, next };
}

function isLinkedWorktree(repoRoot: string): boolean {
  try {
    const gitDir = execFileSync('git', ['-C', repoRoot, 'rev-parse', '--git-dir'], { encoding: 'utf8' }).trim();
    return gitDir.includes('.git/worktrees/');
  } catch {
    return false;
  }
}

function appendCommandOutput(result: PromptCommandResult, stdout: string[], stderr: string[]): void {
  if (result.stdout) stdout.push(result.stdout.endsWith('\n') ? result.stdout : `${result.stdout}\n`);
  if (result.stderr) stderr.push(result.stderr.endsWith('\n') ? result.stderr : `${result.stderr}\n`);
}

export function runPromptHandler(opts: PromptHandlerInput): PromptHandlerResult {
  const env = opts.env ?? process.env;
  const deps = opts.dependencies ?? {};
  const fsApi = deps.fs ?? DEFAULT_FS;
  const now = (deps.now ?? (() => new Date()))();
  const parsed = parseHookInput(opts.input, { env, repoRoot: opts.repoRoot });
  const prompt = opts.prompt ?? parsed.getPrompt();
  const stderrPrefix = parsed.warnings.length > 0 ? `${parsed.warnings.join('\n')}\n` : '';
  const state = resolvePromptGuardState(opts.repoRoot, env, deps);
  const route = routePromptExplicitFirst(prompt, { hasActiveTask: state.plan === 'approved' || state.plan === 'executing' });
  if (route.kind === 'bypass' || (route.kind === 'explicit' && (route.action === 'setup' || route.action === 'handoff'))) {
    return { exitCode: 0, stdout: '', stderr: stderrPrefix };
  }

  const context = buildPromptIntentContext(prompt, state.pending === 'fresh');
  const facts = factsForPrompt(prompt, state.pending === 'fresh');
  const intent = classifyPromptGuardIntent(facts);
  const action = decidePromptGuardAction(intent, state);
  const out: string[] = [];
  const err: string[] = [];
  const command = deps.runCommand ?? commandRunner(opts.repoRoot, env);

  if (isAgenticPackagingIntent(context)) {
    out.push('[AgenticDevRoute] Reusable workflow packaging intent detected.\n[AgenticDevRoute] Suggested route: repo-harness-autoplan after user authorization; hook will not plan or create assets.\n');
  }
  if (!isAgenticPackagingIntent(context)) {
    if (isThinkPlanStartIntent(context)) out.push('[WazaRoute] Planning intent detected. Default route: Waza /think.\n');
    else if (isHealthRouteIntent(context)) out.push('[WazaRoute] Agent workflow/tooling intent detected. Default route: Waza /health.\n');
    else if (isReviewReleaseIntent(context)) emitReviewHints(opts.repoRoot, env, state, fsApi, out, err, deps.recordCircuit ?? recordCircuitAttempt);
  }
  if (isCodegraphRouteIntent(context) || isNontrivialCodeTaskIntent(context)) {
    emitCodegraphHint(opts.repoRoot, parsed.getSessionId(''), out, fsApi);
  }
  if (state.pending === 'fresh' && isPlanDiscussionContinuationIntent(context) && !state.activePlan) {
    out.push('[PlanDiscussionGate] Pending plan/orchestration discussion is still open; continuing discussion, not implementation.\n');
  }

  if (facts.planStart && !facts.implement && !facts.done && state.pending !== 'fresh') {
    const researchFiles = (() => {
      try { return fsApi.existsSync(join(opts.repoRoot, 'docs/researches')); } catch { return false; }
    })();
    if (!researchFiles) out.push('[ResearchGate] Advisory: docs/researches/*.md is missing or older than the latest plan; skipping automatic Draft plan creation.\n');
    else {
      const title = derivePlanStartTitle(context);
      const slug = derivePlanStartSlug(context, now);
      writePendingOrchestration(opts.repoRoot, fsApi, derivePendingOrchestrationKind(context), slug, title, env, now);
      const run = command(['run', 'ensure-task-workflow', '--new-plan', '--slug', slug, '--title', title]);
      if (run.stdout) out.push(run.stdout.endsWith('\n') ? run.stdout : `${run.stdout}\n`);
      if (run.stderr) out.push(run.stderr.endsWith('\n') ? run.stderr : `${run.stderr}\n`);
    }
  }

  if (!facts.implement) emitWorkflowFileGuards(opts.repoRoot, out, fsApi);

  if (facts.implement) {
    if (action !== 'allow') {
      const rendered = renderPromptGuardAction(action, state, fsApi, opts.repoRoot);
      return { exitCode: rendered.exitCode, stdout: `${out.join('')}${rendered.stdout}`, stderr: `${stderrPrefix}${err.join('')}${rendered.stderr}`, reason: rendered.reason };
    }
    if (facts.embeddedApprovedPlan || facts.planShapedMarkdown) {
      const title = derivePlanStartTitle(context);
      const slug = derivePlanStartSlug(context, now);
      const body = context.text;
      const run = command(
        ['run', 'capture-plan', '--slug', slug, '--title', title, '--artifact-level', 'work-package', '--promotion-reason', 'human_decision_boundary', '--status', 'Approved', '--source', 'user-approved-plan', '--route', 'planning', '--execute'],
        body,
      );
      const rendered = run.exitCode === 0
        ? { exitCode: 0, stdout: run.stdout, stderr: run.stderr }
        : structuredError('PlanCaptureGate', 'Embedded approved plan capture failed.', 'Fix the repo-harness run capture-plan or plan-to-todo error before editing implementation files.', 'state_violation');
      return { exitCode: rendered.exitCode, stdout: `${out.join('')}${rendered.stdout}`, stderr: `${stderrPrefix}${err.join('')}${rendered.stderr}`, reason: rendered.reason };
    }
    const advice = renderMinimalChangePromptAdvice(loadMinimalChangePolicy(opts.repoRoot), intent);
    if (advice) out.push(`${advice}\n`);
  }

  if (facts.done) {
    if (action !== 'done_gate') {
      const rendered = renderPromptGuardAction(action, state, fsApi, opts.repoRoot);
      return { exitCode: rendered.exitCode, stdout: `${out.join('')}${rendered.stdout}`, stderr: `${stderrPrefix}${rendered.stderr}`, reason: rendered.reason };
    }
    const contractVerification = command(['run', 'verify-contract', '--contract', state.contractFile ?? '', '--strict', '--read-only']);
    if (contractVerification.exitCode !== 0) {
      const detail = contractVerification.stderr.trim() || contractVerification.stdout.trim();
      const rendered = structuredError(
        'ContractGuard',
        `Contract verification failed for ${state.contractFile ?? '(none)'}.${detail ? ` ${detail}` : ''}`,
        'Resolve the failing exit criteria in the contract before marking work done.',
        'contract_failure',
      );
      return { exitCode: rendered.exitCode, stdout: `${out.join('')}${rendered.stdout}`, stderr: `${stderrPrefix}${contractVerification.stderr}${rendered.stderr}`, reason: rendered.reason };
    }
    const contractOutput: string[] = [];
    const contractErrors: string[] = [];
    appendCommandOutput(contractVerification, contractOutput, contractErrors);
    out.push(...contractOutput);

    const evidenceError = checkStructuredEvidence(opts.repoRoot, state, fsApi);
    if (evidenceError) {
      const rendered = structuredError('EvidenceGuard', evidenceError, 'Run repo-harness run verify-sprint so .ai/harness/checks/latest.json records a passing current sprint verification.', 'quality_gate');
      return { exitCode: rendered.exitCode, stdout: `${out.join('')}${rendered.stdout}`, stderr: `${stderrPrefix}${contractErrors.join('')}${rendered.stderr}`, reason: rendered.reason };
    }

    const acceptance = command([
      'run', 'acceptance-receipt', 'verify',
      '--contract', state.contractFile ?? '',
      '--verification', state.checksFile,
      '--format', 'row',
    ]);
    const acceptanceFields = acceptance.stdout.trim().split('\t');
    if (acceptance.exitCode !== 0 || acceptanceFields[0] !== 'pass') {
      const detail = acceptance.stderr.trim() || acceptanceFields[4]?.trim() || acceptance.stdout.trim() || 'A valid AcceptanceReceipt is missing.';
      const rendered = structuredError(
        'AcceptanceReceiptGuard',
        detail,
        'Run verify-sprint --prepare-acceptance, then record external acceptance or materialize user_waiver from one valid contract-bound UserWaiverGrant; do not ask the owner to repeat a subject hash.',
        'quality_gate',
      );
      return { exitCode: rendered.exitCode, stdout: `${out.join('')}${rendered.stdout}`, stderr: `${stderrPrefix}${contractErrors.join('')}${acceptance.stderr}${rendered.stderr}`, reason: rendered.reason };
    }

    const activePlanText = state.activePlan ? text(fsApi, opts.repoRoot, state.activePlan) ?? '' : '';
    const planTasks = incompletePlanTask(activePlanText);
    if (planTasks.remaining > 0) {
      const rendered = structuredError(
        'ArchiveGuard',
        `Done intent with ${planTasks.remaining} unchecked active-plan task(s).`,
        `Finish the remaining Task Breakdown item: ${planTasks.next || `see ${state.activePlan ?? 'the active plan'}`}.`,
        'state_violation',
      );
      return { exitCode: rendered.exitCode, stdout: `${out.join('')}${rendered.stdout}`, stderr: `${stderrPrefix}${contractErrors.join('')}${rendered.stderr}`, reason: rendered.reason };
    }

    if (isLinkedWorktree(opts.repoRoot)) {
      out.push(`[WorkflowNextAction] Done quality gates passed for ${state.activePlan ?? '(none)'}.\n`);
      out.push('[WorkflowNextAction] Review/checks pass; finish and fast-forward merge this contract worktree.\n');
      out.push('[WorkflowNextAction] repo-harness run contract-worktree finish\n');
      return { exitCode: 0, stdout: out.join(''), stderr: `${stderrPrefix}${contractErrors.join('')}` };
    }

    const run = command(['run', 'archive-workflow', '--plan', state.activePlan ?? '', '--outcome', deriveDoneOutcome(context)]);
    if (run.exitCode !== 0) {
      const detail = run.stderr.trim() || run.stdout.trim() || 'archive-workflow failed';
      const rendered = structuredError('AutoArchive', detail, 'Fix the archive-workflow error before marking the workflow complete.', 'missing_artifact');
      return { exitCode: rendered.exitCode, stdout: `${out.join('')}${run.stdout}${rendered.stdout}`, stderr: `${stderrPrefix}${contractErrors.join('')}${run.stderr}${rendered.stderr}`, reason: rendered.reason };
    }
    return { exitCode: 0, stdout: `${out.join('')}${run.stdout}`, stderr: `${stderrPrefix}${contractErrors.join('')}${run.stderr}` };
  }

  appendTddBddAdvice(context, out);
  return { exitCode: 0, stdout: out.join(''), stderr: `${stderrPrefix}${err.join('')}` };
}

export { resolvePromptGuardState };
