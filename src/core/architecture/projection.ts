import {
  ARCHCTX_CAPABILITIES_SCHEMA_VERSION,
  NATIVE_CONTEXT_PROFILE,
  NATIVE_CONTEXT_SCHEMA_VERSION,
  nativeContextSchemaResolver,
  type ArchContextError,
  type ArchitectureDocsProjectionManifestTargetV4,
  type NativeContextExportV1,
  architectureDebtReportIssues,
  docsAnchorsReportIssues,
  projectionApplyReadbackResultInvariantIssues,
  projectionResultInvariantIssues,
  validateJsonSchema,
  type ArchitectureDebtReportV1,
  type ArchitectureFlowSelectorCheckV1,
  type DependencyConstraintEvaluationV1,
  type DocsAnchorsReportV1,
  type Json,
  type ProjectionApplyReadbackResultV2,
  type ProjectionFreshnessReasonCode,
  type ProjectionRequestV1,
  type ProjectionResultV3,
  type RefImpactV1,
} from 'archctx-contracts';
import projectionResultSchema from 'archctx-contracts/schemas/runtime/projection-result.schema.json';
import projectionReadbackSchema from 'archctx-contracts/schemas/runtime/projection-apply-readback.schema.json';
import docsAnchorsSchema from 'archctx-contracts/schemas/runtime/docs-anchors.schema.json';
import architectureDebtSchema from 'archctx-contracts/schemas/runtime/architecture-debt.schema.json';
import flowSelectorCheckSchema from 'archctx-contracts/schemas/runtime/flow-selector-check.schema.json';
import dependencyConstraintEvaluationSchema from 'archctx-contracts/schemas/runtime/dependency-constraint-evaluation.schema.json';
import refImpactSchema from 'archctx-contracts/schemas/runtime/ref-impact.schema.json';
import nativeContextExportSchema from 'archctx-contracts/schemas/runtime/native-context-export.schema.json';
import nodeSchema from 'archctx-contracts/schemas/repo/architecture-node.schema.json';
import relationSchema from 'archctx-contracts/schemas/repo/architecture-relation.schema.json';
import flowSchema from 'archctx-contracts/schemas/repo/architecture-flow.schema.json';
import { dependencies } from '../../../package.json';
import type { ArchitectureProjectionPolicy } from './contracts';

export const ARCHCTX_REQUIRED_VERSION = dependencies.archctx;

/**
 * A delivery view of archctx's per-target output decisions. `changes[]` has one entry per targetId;
 * agent-context targets share a contract file path, so a path is listed once.
 */
export function summarizeArchitectureRender(result: ProjectionResultV3) {
  if (!result.changes) throw new Error('archctx check omitted per-target changes');
  const differing = result.changes.filter(change => change.outputChanged);
  const differingPaths = [...new Set(differing.map(change => change.path))];
  const complete = (result.status === 'noop' || result.status === 'planned')
    && result.coverage === undefined && result.humanActions.length === 0;
  return {
    status: result.status,
    renderEquivalent: complete ? differingPaths.length === 0 : null,
    differingPaths,
    // archctx adds or removes a target only when the model layout or the renderer changes.
    differingTargets: differing.map(change => ({
      targetId: change.targetId,
      layoutChanged: change.reasonCodes.some(code => code === 'target-added' || code === 'target-removed'),
    })),
    humanActions: result.humanActions,
  };
}

export interface DifferingRenderTarget { readonly targetId: string; readonly layoutChanged: boolean }

/** One first-parent commit after the newest manifest commit: its changed paths, and whether it changes the archctx renderer version. */
export interface RenderInputCommit { readonly sha: string; readonly paths: readonly string[]; readonly rendererChanged: boolean }

export interface RenderInputAuthority {
  /** Rows of the committed projection manifest, the rows archctx compares each target against. */
  readonly committedRows: Readonly<Record<string, Pick<ArchitectureDocsProjectionManifestTargetV4, 'type' | 'scope'>>>;
  /** The capability node ids of the architecture model at HEAD. */
  readonly capabilityNodeIds: ReadonlySet<string>;
  /**
   * `archctx resolve` at HEAD: undefined when no declared source footprint includes the path, the owning
   * capability node id, or null when archctx names no single owning capability.
   */
  readonly ownerOf: (path: string) => string | null | undefined;
}

/**
 * The commit that starts the daily lag clock: the first commit after M (the newest manifest commit) that
 * changes an input of a differing target, else M itself, because then the outputs already differ from M.
 * Manifest v4 changes only with a render, so M and the first commit after it can be days older than the
 * render change. archctx classes a target by the type of its manifest row (`projectionTargetChanges`):
 * an entity summary or agent context documents the capability of its row scope and renders from that
 * capability's declared source footprint; every other target renders the whole model, so from every declared
 * footprint. Every target also renders from the model (`.archcontext/`) and the renderer version; an added or
 * removed target from those alone. A null owner counts for every capability target. `commits` are oldest first.
 */
export function firstRenderChangeCommit(
  manifestCommit: string,
  commits: readonly RenderInputCommit[],
  targets: readonly DifferingRenderTarget[],
  authority: RenderInputAuthority,
): string {
  if (targets.length === 0) return manifestCommit;
  let wholeModel = false;
  const capabilities = new Set<string>();
  for (const { targetId, layoutChanged } of targets) {
    if (layoutChanged) continue;
    if (!Object.hasOwn(authority.committedRows, targetId)) throw new Error(`differing target ${targetId} has no committed manifest row`);
    const { type, scope } = authority.committedRows[targetId]!;
    if (type !== 'entity-summary' && type !== 'agent-context') { wholeModel = true; continue; }
    if (scope.entityKind !== 'capability' || scope.id === undefined || !authority.capabilityNodeIds.has(scope.id)) {
      throw new Error(`differing target ${targetId} documents ${scope.id ?? 'no entity'}, which is no capability of the architecture model`);
    }
    capabilities.add(scope.id);
  }
  const changesInput = (path: string) => {
    if (path.startsWith('.archcontext/')) return true;
    const owner = authority.ownerOf(path);
    if (owner === undefined) return false;
    return wholeModel || (capabilities.size > 0 && (owner === null || capabilities.has(owner)));
  };
  return commits.find(commit => commit.rendererChanged || commit.paths.some(changesInput))?.sha ?? manifestCommit;
}

/** The rolling writer publishes after the product merge: 11 to 102 min for 8 projections in 2026-11 (#2590). */
export const ARCHITECTURE_LAG_BOUND_MS = 3 * 60 * 60 * 1000;
export type ArchitectureFreshness = 'fresh' | 'lag' | 'stale' | 'human-action' | 'incomplete';

/**
 * The daily lane verdict. A difference is `lag` while the oldest unpublished main commit is younger than the bound,
 * because the writer publishes it later. An incomplete check gets no grace.
 */
export function classifyArchitectureFreshness(
  summary: Pick<ReturnType<typeof summarizeArchitectureRender>, 'renderEquivalent' | 'humanActions'>,
  unpublishedSince: Date,
  now: Date,
): ArchitectureFreshness {
  if (summary.renderEquivalent === true) return 'fresh';
  if (summary.renderEquivalent === null) return summary.humanActions.length > 0 ? 'human-action' : 'incomplete';
  return now.getTime() - unpublishedSince.getTime() < ARCHITECTURE_LAG_BOUND_MS ? 'lag' : 'stale';
}

/** docs drift has no published JSON schema. Validate the fields this reader consumes. */
export function decodeArchitectureHandEdits(value: unknown): Array<{ path: string; reasonCode: string }> {
  const report = record(value, 'archctx docs drift');
  if (report.schemaVersion !== 'archcontext.docs-drift/v1') throw new Error('archctx docs drift schema mismatch');
  const drift = record(report.drift, 'archctx docs drift.drift');
  if (!Array.isArray(drift.diffs)) throw new Error('archctx docs drift omitted diffs');
  return drift.diffs.map(value => {
    const diff = record(value, 'archctx docs drift diff');
    if (typeof diff.path !== 'string' || !diff.path || typeof diff.reasonCode !== 'string') throw new Error('archctx docs drift diff is invalid');
    return { path: diff.path, reasonCode: diff.reasonCode };
  }).filter(diff => diff.reasonCode === 'projection-generated-region-manually-edited'
    || diff.reasonCode === 'projection-generated-file-manually-edited');
}

const ARCHCTX_MAINTENANCE_REMINDER = 'User authorization required: ask before replacing the shared daemon with daemon upgrade; this interrupts other clients. Use the same managed package-local archctx and Node runtime, then verify daemon status. After replacement, check the configured CodeGraph index for this repository; request authorization to rebuild only if it is missing or stale. Do not delete shared state or automatically restart/reindex.';

export class ArchctxClientError extends Error {
  readonly code: string;
  readonly action: string;
  readonly reasonCode?: string;
  readonly details?: ArchContextError['details'];
  readonly retryable?: boolean;
  readonly providerMessage: string;

  constructor(error: Pick<ArchContextError, 'message' | 'action'> & { code: string } & Partial<Omit<ArchContextError, 'code' | 'message' | 'action'>>) {
    const maintenance = error.code === 'AC_RUNTIME_VERSION_UNSUPPORTED' && error.action === 'upgrade-archctx-runtime' ? ` ${ARCHCTX_MAINTENANCE_REMINDER}` : '';
    super(`${error.code}: ${error.message}${maintenance}${error.reasonCode ? ` (reasonCode: ${error.reasonCode})` : ''}; action: ${error.action}`);
    this.name = 'ArchctxClientError';
    this.code = error.code;
    this.action = error.action;
    this.reasonCode = error.reasonCode;
    this.details = error.details;
    this.retryable = error.retryable;
    this.providerMessage = error.message;
  }
}

/** The archctx model entry. archctx 0.9.1 checkpoint refuses a repository without it. */
export const ARCHCONTEXT_MANIFEST = '.archcontext/manifest.yaml';

export type NativeContextSource = { readonly kind: 'worktree' } | { readonly kind: 'ref'; readonly commit: string };

/** Validate the provider contract and bind its snapshot to the requested source. */
export function decodeNativeContextExport(value: unknown, source: NativeContextSource): NativeContextExportV1 {
  try {
    type Schema = Parameters<typeof validateJsonSchema>[0];
    const validation = validateJsonSchema(nativeContextExportSchema as unknown as Schema, value as Json, {
      resolveSchema: nativeContextSchemaResolver({ node: nodeSchema as Schema, relation: relationSchema as Schema, flow: flowSchema as Schema }),
    });
    if (!validation.valid) throw new Error(validation.issues.slice(0, 5).map((issue) => `${issue.path} ${issue.message}`).join('; '));
    const context = value as NativeContextExportV1;
    if (context.schemaVersion !== NATIVE_CONTEXT_SCHEMA_VERSION || context.profile !== NATIVE_CONTEXT_PROFILE) throw new Error('schema version or profile mismatch');
    if (source.kind === 'ref') {
      if (context.snapshot.source !== 'ref' || context.snapshot.commitSha !== source.commit) throw new Error('ref snapshot mismatch');
    } else if (context.snapshot.source !== 'worktree') throw new Error('worktree snapshot mismatch');
    return context;
  } catch (error) {
    throw new ArchctxClientError({ code: 'RH_ARCHCTX_NATIVE_CONTEXT_INVALID', action: 'update-repo-harness', message: `native context invalid: ${error instanceof Error ? error.message : String(error)}` });
  }
}

type JsonRecord = Record<string, unknown>;

export function readArchitectureProjectionPolicy(value: unknown): ArchitectureProjectionPolicy {
  const root = record(value, 'policy');
  const architecture = root.architecture === undefined ? {} : record(root.architecture, 'policy.architecture');
  const provider = architecture.projection_provider ?? 'disabled';
  const applyMode = architecture.projection_apply ?? 'disabled';
  const requiredVersion = ARCHCTX_REQUIRED_VERSION;
  const timeoutMs = architecture.projection_timeout_ms ?? 120_000;
  if (provider !== 'disabled' && provider !== 'archctx') throw new Error('policy.architecture.projection_provider must be disabled|archctx');
  if (applyMode !== 'disabled' && applyMode !== 'manual') throw new Error('policy.architecture.projection_apply must be disabled|manual');
  if (provider === 'disabled') {
    if (applyMode !== 'disabled') throw new Error('projection_apply must be disabled when projection_provider is disabled');
    return { provider, applyMode, requiredVersion: ARCHCTX_REQUIRED_VERSION, timeoutMs: 120_000 };
  }
  if (!Number.isInteger(timeoutMs) || (timeoutMs as number) < 1_000 || (timeoutMs as number) > 600_000) throw new Error('policy.architecture.projection_timeout_ms must be 1000..600000');
  return { provider, applyMode, requiredVersion, timeoutMs: timeoutMs as number };
}

/** The exact package pin is the whole compatibility contract: one archctx version owns one wire protocol. */
export function assertArchctxVersion(value: unknown, requiredVersion: string = ARCHCTX_REQUIRED_VERSION): void {
  const input = record(value, 'archctx capabilities');
  const pkg = record(input.package, 'archctx capabilities.package');
  if (input.schemaVersion !== ARCHCTX_CAPABILITIES_SCHEMA_VERSION || pkg.name !== 'archctx' || pkg.version !== requiredVersion) {
    throw new Error(`archctx package mismatch: expected archctx@${requiredVersion}, got ${String(pkg.name)}@${String(pkg.version)}`);
  }
}

/** ArchContext owns the result contract; repo-harness applies its published schema and invariants. */
export function assertProjectionResult(value: unknown, expectedRequestId: string): ProjectionResultV3 {
  const result = decode(projectionResultSchema, value, 'projection result') as unknown as ProjectionResultV3;
  const issues = projectionResultInvariantIssues(result);
  if (result.requestId !== expectedRequestId) issues.push('requestId mismatch');
  if (issues.length > 0) throw new Error(`projection result invalid: ${issues.join('; ')}`);
  return result;
}

/** A readback proves an earlier committed apply of this exact request; an absence proof means none exists. */
export function assertProjectionApplyReadbackResult(value: unknown, request: ProjectionRequestV1): ProjectionApplyReadbackResultV2 {
  const readback = decode(projectionReadbackSchema, value, 'projection readback');
  if (readback.schemaVersion === 'archcontext.projection-apply-absence/v1') throw new Error(`no committed projection apply exists for ${request.requestId}`);
  const result = readback as unknown as ProjectionApplyReadbackResultV2;
  const issues = projectionApplyReadbackResultInvariantIssues(result, request);
  if (issues.length > 0) throw new Error(`projection readback invalid: ${issues.join('; ')}`);
  return result;
}

/**
 * Generated-summary freshness from one `architecture-projection check` result.
 * `stalePaths` holds the paths of targets whose render differs from the committed manifest row.
 * `complete` is false when the check failed for a reason that is not per target.
 */
export interface GeneratedSummaryFreshness {
  readonly commit: string;
  readonly stalePaths: ReadonlySet<string>;
  readonly complete: boolean;
}

/** Both codes still compare every target, so the per-target answer is complete. */
const PER_TARGET_FRESHNESS_REASONS: ReadonlySet<ProjectionFreshnessReasonCode> = new Set(['projection-output-changed', 'projection-manifest-changed']);

/**
 * Reads generated-summary freshness from a saved `architecture-projection check`
 * result. Only a check result carries `freshness`; any other result is refused.
 */
export function decodeProjectionCheckFreshness(value: unknown): GeneratedSummaryFreshness {
  const result = decode(projectionResultSchema, value, 'projection check result') as unknown as ProjectionResultV3;
  const issues = projectionResultInvariantIssues(result);
  if (issues.length > 0) throw new Error(`projection check result invalid: ${issues.join('; ')}`);
  if (!result.freshness) throw new Error('projection result has no freshness; save the output of architecture-projection check');
  return {
    commit: result.inputSnapshot.baseHeadSha,
    stalePaths: new Set(result.freshness.staleTargets.map((target) => target.path)),
    complete: result.freshness.reasonCodes.every((code) => PER_TARGET_FRESHNESS_REASONS.has(code)),
  };
}

/** ArchContext owns the `docs anchors` report contract; this applies its schema and invariants. */
export function decodeDocsAnchorsReport(value: unknown): DocsAnchorsReportV1 {
  const report = decode(docsAnchorsSchema, value, 'docs anchors report') as unknown as DocsAnchorsReportV1;
  const issues = docsAnchorsReportIssues(report);
  if (issues.length > 0) throw new Error(`docs anchors report invalid: ${issues.join('; ')}`);
  return report;
}

/**
 * ArchContext owns the architecture debt report contract; this applies its
 * schema and invariants. The digest binds the whole report, so any change fails.
 */
export function decodeArchitectureDebtReport(value: unknown): ArchitectureDebtReportV1 {
  const report = decode(architectureDebtSchema, value, 'architecture debt report') as unknown as ArchitectureDebtReportV1;
  const issues = architectureDebtReportIssues(report);
  if (issues.length > 0) throw new Error(`architecture debt report invalid: ${issues.join('; ')}`);
  return report;
}

/** ArchContext owns the `flows check` report contract; this applies its published schema. */
export function decodeFlowSelectorCheck(value: unknown): ArchitectureFlowSelectorCheckV1 {
  return decode(flowSelectorCheckSchema, value, 'flows check report') as unknown as ArchitectureFlowSelectorCheckV1;
}

/** ArchContext owns the `constraints check` report contract; this applies its published schema. */
export function decodeConstraintEvaluation(value: unknown): DependencyConstraintEvaluationV1 {
  return decode(dependencyConstraintEvaluationSchema, value, 'constraints check report') as unknown as DependencyConstraintEvaluationV1;
}

/** `refs`: `archctx impact --base --head`; `paths`: `--paths-from`, which reads the worktree model at `head`. */
export type RefImpactSource =
  | { readonly kind: 'refs'; readonly base: string; readonly head: string }
  | { readonly kind: 'paths'; readonly head: string };

/** ArchContext owns the `impact` report contract; this applies its published schema and binds the snapshots to the request. */
export function decodeRefImpact(value: unknown, source: RefImpactSource): RefImpactV1 {
  const report = decode(refImpactSchema, value, 'impact report') as unknown as RefImpactV1;
  const bound = source.kind === 'refs'
    ? report.base?.source === 'ref' && report.base.commitSha === source.base && report.head.source === 'ref' && report.head.commitSha === source.head
    : report.base === null && report.head.source === 'worktree' && report.head.headSha === source.head;
  if (!bound) throw new Error('impact report snapshot mismatch');
  return report;
}

export const ARCHITECTURE_DEBT_COMMAND = 'rh architecture-debt --json';
// archctx names its own CLI in item actions, but a global install has no archctx
// on PATH. Name the repo-harness command that runs the same report. An archctx
// action without one points to the full debt report instead.
export const MANAGED_ARCHCTX_ACTIONS: ReadonlyMap<string, string> = new Map([['archctx docs anchors --json', 'rh architecture-projection anchors --json']]);

export function managedArchctxAction(raw: string): string {
  const action = raw.replace(/[\r\n\t]+/g, ' ').trim();
  return MANAGED_ARCHCTX_ACTIONS.get(action) ?? (/^archctx(\s|$)/.test(action) ? ARCHITECTURE_DEBT_COMMAND : action);
}

function decode(schema: unknown, value: unknown, label: string): JsonRecord {
  const validation = validateJsonSchema(schema as Parameters<typeof validateJsonSchema>[0], value as Json);
  if (!validation.valid) throw new Error(`${label} invalid: ${validation.issues.slice(0, 5).map((issue) => `${issue.path} ${issue.message}`).join('; ')}`);
  return value as JsonRecord;
}

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as JsonRecord;
}
