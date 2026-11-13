import { readGlobalArchitectureConfiguration } from '../../effects/architecture/projection-config';
import type { ProjectionHumanActionReasonCode, ProjectionHumanActionV1, ProjectionMode } from 'archctx-contracts';
import { architectureProjectionRequest, inspectArchitectureProjectionReadiness, readArchitectureDocsAnchors, runArchitectureProjection } from '../../effects/architecture/archctx-provider';
import { architectureModelReady, readArchitectureHandEdits } from '../../effects/architecture/architecture-read';
import { ARCHITECTURE_DEBT_COMMAND, summarizeArchitectureRender } from '../../core/architecture/projection';
import { applyArchitectureProjection } from '../../effects/architecture/projection-apply';
import { runArchitectureWriter } from '../../effects/architecture/projection-writer';
import { gitExecFileSync } from '../../effects/git/runner';
import type { ProjectionCommandOptions } from './architecture-projection';

/** `architecture-projection` loads this module only after the architecture selection check. */
export function policy(): void {
  try {
    const { path, initialized, policy } = readGlobalArchitectureConfiguration();
    write({ ...policy, configuration: { scope: 'global', path, initialized } });
  } catch (error) { fail(error); }
}

export function status(): void {
  try {
    const root = repositoryRoot();
    const { path, initialized } = readGlobalArchitectureConfiguration();
    write({ ...inspectArchitectureProjectionReadiness(root, architectureModelReady), configuration: { scope: 'global', path, initialized } });
  }
  catch (error) { fail(error); }
}

export function anchors(): void {
  try { write(readArchitectureDocsAnchors(repositoryRoot())); }
  catch (error) { fail(error); }
}

export function renderCheck(): void {
  try {
    const root = repositoryRoot();
    const summary = summarizeArchitectureRender(runArchitectureProjection(architectureProjectionRequest('check', root), root));
    write(summary);
    if (summary.renderEquivalent !== true) process.exitCode = 1;
  } catch (error) { fail(error); }
}

export function handEdits(options: { base?: string }): void {
  try {
    const root = repositoryRoot();
    const base = options.base ? git(root, ['rev-parse', '--verify', `${options.base}^{commit}`]) : null;
    const paths = base ? new Set(gitExecFileSync(['-C', root, 'diff', '--name-only', '-z', `${base}...HEAD`, '--'], { encoding: 'utf8' }).split('\0').filter(Boolean)) : null;
    write({ edits: readArchitectureHandEdits(root).filter(edit => paths === null || paths.has(edit.path)) });
  } catch (error) { fail(error); }
}

export async function publish(mode: string): Promise<void> {
  try { process.exitCode = await runArchitectureWriter(repositoryRoot(), mode, process.env); }
  catch (error) { fail(error); }
}

export function execute(mode: ProjectionMode, options: ProjectionCommandOptions): void {
  try {
    const root = repositoryRoot();
    const requestOptions = { adoptionPlanId: options.adoptionPlanId, changedPaths: options.changedPath, requestId: options.requestId, expectedWorktreeDigest: options.expectedWorktreeDigest };
    const result = mode === 'apply' || mode === 'adopt'
      ? applyArchitectureProjection(root, { mode, ...requestOptions })
      : runArchitectureProjection(architectureProjectionRequest(mode, root, requestOptions), root);

    write(result);
    for (const action of result.humanActions) process.stderr.write(`${humanActionLine(action)}\n`);
    if (architectureProjectionExitCode(mode, result.status) !== 0) process.exitCode = 1;
  } catch (error) {
    fail(error);
  }
}

const ADOPTION_NEXT = 'resolve "$NODE" and "$ARCHCTX" from rh architecture-projection status --json, preview "$NODE" "$ARCHCTX" docs adopt --profile repo-harness/v1, then run rh architecture-projection adopt --json --adoption-plan-id <id> (repo-harness-architecture worker, "Managed archctx command" and "Adopt ArchContext" step 8)';
const ROLLING_PR_NEXT = 'inspect rh architecture-projection publish status (with the writer\'s own ARCHCONTEXT_STATE_DIR) and the open rolling PR; its merge is the acceptance; a feature worker does not apply or commit generated docs (repo-harness-architecture worker, "Rolling writer")';
const UNPROVABLE_FLOW_NEXT = `${ARCHITECTURE_DEBT_COMMAND}, then add the missing P1/P2 proof in a model PR; the rolling PR merge is the acceptance (repo-harness-architecture worker, "Adopt ArchContext" step 4)`;
const OWNER_DECISION_NEXT = 'the reported model, proof or ownership decision (external-tooling, "Rolling writer"); a feature worker does not apply or commit generated docs';

export function humanActionLine(action: ProjectionHumanActionV1): string {
  const subject = [...action.affectedNodeIds, ...(action.path ? [action.path] : [])].join(', ');
  return `archctx needs human action: ${action.reasonCode} [${subject}]; next: ${humanActionRemedy(action)}`;
}

function humanActionRemedy(action: ProjectionHumanActionV1): string {
  const code: ProjectionHumanActionReasonCode = action.reasonCode;
  switch (code) {
    case 'adoption-required': return ADOPTION_NEXT;
    case 'unresolved-major-change': return ROLLING_PR_NEXT;
    case 'unprovable-required-flow': return UNPROVABLE_FLOW_NEXT;
    case 'orphaned-document-review': return `a human must review, move or remove ${action.path ?? 'the orphaned document'}; apply never deletes it`;
    case 'manual-region-conflict': return 'inspect rh architecture-projection hand-edits --json; the writer or model owner repairs generated regions, and a feature worker does not apply or commit generated docs (external-tooling, "architecture checks in CI")';
    case 'target-collision': return OWNER_DECISION_NEXT;
    default: return assertNever(code);
  }
}

function assertNever(value: never): never {
  throw new Error(`unhandled projection human-action reason code: ${String(value)}`);
}

export function architectureProjectionExitCode(mode: ProjectionMode, status: string): 0 | 1 {
  if (status === 'noop') return 0;
  if (status === 'applied') return mode === 'apply' || mode === 'adopt' ? 0 : 1;
  return mode === 'plan' && status === 'planned' ? 0 : 1;
}

function fail(error: unknown): void {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

function repositoryRoot(): string { return git(process.cwd(), ['rev-parse', '--show-toplevel']); }
function git(cwd: string, args: string[]): string { return gitExecFileSync(['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
function write(value: unknown): void { process.stdout.write(`${JSON.stringify(value, null, 2)}\n`); }
