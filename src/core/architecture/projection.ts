import { createHash } from 'node:crypto';
import { canonicalize } from '../evidence/canonical-json';

export const PROJECTION_REQUEST_VERSION = 'archcontext.projection-request/v1' as const;
export const PROJECTION_RESULT_VERSION = 'archcontext.projection-result/v1' as const;
export const ARCHCTX_CAPABILITIES_VERSION = 'archcontext.capabilities/v1' as const;
export const ARCHITECTURE_REFRESH_SIGNAL_VERSION = 'archcontext.architecture-refresh-signal/v1' as const;
export const ARCHITECTURE_DOCS_RENDERER_VERSION = 'archcontext.docs-renderer/v2' as const;
export const ARCHITECTURE_DOCS_LAYOUT_VERSION = 'archcontext.docs-layout/v1' as const;
export const ARCHCTX_REQUIRED_VERSION = '0.4.0' as const;
export const ARCHCTX_REQUIRED_FEATURES = Object.freeze([
  'architecture-docs-renderer-v2',
  'architecture-refresh-signal-v1',
  'projection-protocol-v1',
] as const);

export type Sha256Digest = `sha256:${string}`;
export type ProjectionProvider = 'disabled' | 'archctx';
export type ProjectionApplyMode = 'disabled' | 'manual' | 'automatic';
export type ProjectionMode = 'check' | 'plan' | 'apply' | 'adopt';
export type ProjectionStatus =
  | 'adoption-required'
  | 'applied'
  | 'blocked'
  | 'human-action-required'
  | 'noop'
  | 'permanent-failure'
  | 'planned'
  | 'retryable-failure';

export interface ProjectionExpectedSnapshotV1 {
  repositoryId: string;
  workspaceId: string;
  headSha: string;
  worktreeDigest: Sha256Digest;
}

export interface ProjectionRequestV1 {
  schemaVersion: typeof PROJECTION_REQUEST_VERSION;
  requestId: string;
  profile: 'repo-harness/v1';
  mode: ProjectionMode;
  targets: ('agent-context' | 'architecture-docs')[];
  changedPaths: string[];
  expected: ProjectionExpectedSnapshotV1;
  adoptionPlanId?: string;
}

export interface ProjectionSnapshotV1 extends ProjectionExpectedSnapshotV1 {
  baseHeadSha: string;
  sourceTreeDigest: Sha256Digest;
  modelDigest: Sha256Digest;
  codeGraphDigest: Sha256Digest;
  indexedWorktreeDigest: Sha256Digest | null;
  projectionInputDigest: Sha256Digest;
  rendererVersion: typeof ARCHITECTURE_DOCS_RENDERER_VERSION;
  layoutVersion: typeof ARCHITECTURE_DOCS_LAYOUT_VERSION;
  generatedFrom: {
    codeGraphPackage: '@colbymchenry/codegraph';
    codeGraphVersion: '1.5.0';
    codeGraphBinaryDigest: Sha256Digest;
    codeGraphStatus: 'ready' | 'unavailable';
  };
}

export interface ArchitectureRefreshSignalV1 {
  schemaVersion: typeof ARCHITECTURE_REFRESH_SIGNAL_VERSION;
  signalId: Sha256Digest;
  idempotencyKey: Sha256Digest;
  mode: 'human-action-required' | 'refresh-required';
  repository: { repositoryId: string };
  worktree: { workspaceId: string; headSha: string; worktreeDigest: Sha256Digest };
  cause: 'accepted-semantic-delta' | 'unresolved-major-candidate' | 'verified-flow-proof-delta';
  acceptedChange?: {
    changeSetId: string;
    eventId: string;
    reasonCodes: string[];
    affectedNodeIds: string[];
  };
  reasonCodes: string[];
  affectedNodeIds: string[];
  refreshTargets: string[];
  baseDigests: Record<string, Sha256Digest>;
  resultingDigests: Record<string, Sha256Digest>;
  projectionReceiptDigest: Sha256Digest;
}

export interface ProjectionResultV1 {
  schemaVersion: typeof PROJECTION_RESULT_VERSION;
  requestId: string;
  status: ProjectionStatus;
  inputSnapshot: ProjectionSnapshotV1;
  outputSnapshot: ProjectionSnapshotV1;
  affectedNodeIds: string[];
  files: Array<{
    path: string;
    action: 'create' | 'delete' | 'unchanged' | 'update';
    preimageDigest: Sha256Digest | null;
    outputDigest: Sha256Digest | null;
  }>;
  humanActions: Array<{
    reasonCode: 'adoption-required' | 'manual-region-conflict' | 'target-collision' | 'unprovable-required-flow' | 'unresolved-major-change';
    affectedNodeIds: string[];
    requestPayloadDigest: Sha256Digest;
  }>;
  refreshSignals: ArchitectureRefreshSignalV1[];
  receiptDigest: Sha256Digest;
}

export interface ArchctxCapabilitiesV1 {
  schemaVersion: typeof ARCHCTX_CAPABILITIES_VERSION;
  package: { name: 'archctx'; version: string };
  protocols: {
    projectionRequest: typeof PROJECTION_REQUEST_VERSION;
    projectionResult: typeof PROJECTION_RESULT_VERSION;
    architectureRefreshSignal: typeof ARCHITECTURE_REFRESH_SIGNAL_VERSION;
  };
  renderers: { architectureDocs: typeof ARCHITECTURE_DOCS_RENDERER_VERSION; agentContext: string };
  features: string[];
}

export interface ArchitectureProjectionPolicy {
  provider: ProjectionProvider;
  applyMode: ProjectionApplyMode;
  requiredVersion: string;
  timeoutMs: number;
}

export interface ArchitectureProjectionReadinessV1 {
  schemaVersion: 'repo-harness.architecture-projection-readiness/v1';
  modelAuthority: { source: 'registry' | 'archcontext'; ready: boolean };
  projectionProvider: { provider: ProjectionProvider; state: 'disabled' | 'missing' | 'mismatch' | 'ready'; binaryPath: string | null; version: string | null; reason: string };
  codeFacts: { requirement: 'required'; state: 'not-evaluated' | 'ready' | 'unavailable' };
  apply: { mode: ProjectionApplyMode; enabled: boolean };
}

type JsonRecord = Record<string, unknown>;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const HEAD = /^[a-f0-9]{40}$/;

export function digestProjectionJson(value: unknown): Sha256Digest {
  return `sha256:${createHash('sha256').update(canonicalize(value as never)).digest('hex')}`;
}

export function readArchitectureProjectionPolicy(value: unknown): ArchitectureProjectionPolicy {
  const root = record(value, 'policy');
  const architecture = record(root.architecture, 'policy.architecture');
  const provider = architecture.projection_provider ?? 'disabled';
  const applyMode = architecture.projection_apply ?? 'disabled';
  const requiredVersion = architecture.projection_version ?? ARCHCTX_REQUIRED_VERSION;
  const timeoutMs = architecture.projection_timeout_ms ?? 120_000;
  if (provider !== 'disabled' && provider !== 'archctx') throw new Error('policy.architecture.projection_provider must be disabled|archctx');
  if (applyMode !== 'disabled' && applyMode !== 'manual' && applyMode !== 'automatic') throw new Error('policy.architecture.projection_apply must be disabled|manual|automatic');
  if (typeof requiredVersion !== 'string' || requiredVersion.trim() === '') throw new Error('policy.architecture.projection_version must be a non-empty string');
  if (!Number.isInteger(timeoutMs) || (timeoutMs as number) < 1_000 || (timeoutMs as number) > 120_000) throw new Error('policy.architecture.projection_timeout_ms must be 1000..120000');
  if (provider === 'disabled' && applyMode !== 'disabled') throw new Error('projection_apply must be disabled when projection_provider is disabled');
  return { provider, applyMode, requiredVersion, timeoutMs: timeoutMs as number };
}

export function assertArchctxCapabilities(value: unknown, requiredVersion: string = ARCHCTX_REQUIRED_VERSION): ArchctxCapabilitiesV1 {
  const input = record(value, 'archctx capabilities');
  const pkg = record(input.package, 'archctx capabilities.package');
  const protocols = record(input.protocols, 'archctx capabilities.protocols');
  const renderers = record(input.renderers, 'archctx capabilities.renderers');
  if (input.schemaVersion !== ARCHCTX_CAPABILITIES_VERSION) throw new Error(`archctx capabilities schema mismatch: ${String(input.schemaVersion)}`);
  if (pkg.name !== 'archctx' || pkg.version !== requiredVersion) throw new Error(`archctx package mismatch: expected archctx@${requiredVersion}, got ${String(pkg.name)}@${String(pkg.version)}`);
  if (protocols.projectionRequest !== PROJECTION_REQUEST_VERSION || protocols.projectionResult !== PROJECTION_RESULT_VERSION || protocols.architectureRefreshSignal !== ARCHITECTURE_REFRESH_SIGNAL_VERSION) throw new Error('archctx projection protocol feature mismatch');
  if (renderers.architectureDocs !== ARCHITECTURE_DOCS_RENDERER_VERSION) throw new Error('archctx architecture docs renderer mismatch');
  const features = Array.isArray(input.features) ? input.features : [];
  if (ARCHCTX_REQUIRED_FEATURES.some((feature) => !features.includes(feature))) throw new Error('archctx required feature set mismatch');
  return input as unknown as ArchctxCapabilitiesV1;
}

export function projectionRequestIssues(input: ProjectionRequestV1): string[] {
  const issues: string[] = [];
  if (input.schemaVersion !== PROJECTION_REQUEST_VERSION) issues.push('schemaVersion mismatch');
  if (!/^[a-zA-Z0-9_.:-]+$/.test(input.requestId)) issues.push('requestId invalid');
  if (input.profile !== 'repo-harness/v1') issues.push('profile mismatch');
  if (!sortedUnique(input.targets) || input.targets.length === 0) issues.push('targets must be sorted, unique and non-empty');
  if (!sortedUnique(input.changedPaths)) issues.push('changedPaths must be sorted and unique');
  if (!HEAD.test(input.expected.headSha)) issues.push('expected.headSha invalid');
  if (!DIGEST.test(input.expected.worktreeDigest)) issues.push('expected.worktreeDigest invalid');
  if (input.mode === 'adopt' && !input.adoptionPlanId) issues.push('adoptionPlanId required');
  if (input.mode !== 'adopt' && input.adoptionPlanId !== undefined) issues.push('adoptionPlanId only allowed for adopt');
  return issues;
}

export function projectionResultReceiptDigest(input: Omit<ProjectionResultV1, 'receiptDigest'>): Sha256Digest {
  const refreshSignals = input.refreshSignals.map(({ projectionReceiptDigest: _ignored, ...signal }) => signal);
  return digestProjectionJson({ ...input, refreshSignals });
}

export function projectionResultIssues(input: ProjectionResultV1): string[] {
  const issues: string[] = [];
  if (input.schemaVersion !== PROJECTION_RESULT_VERSION) issues.push('schemaVersion mismatch');
  if (!sortedUnique(input.affectedNodeIds)) issues.push('affectedNodeIds must be sorted and unique');
  if (!sortedUnique(input.files.map((file) => file.path))) issues.push('files must be sorted and unique by path');
  if (!sameIdentity(input.inputSnapshot, input.outputSnapshot)) issues.push('input/output snapshot identity mismatch');
  const { receiptDigest, ...receiptPayload } = input;
  if (projectionResultReceiptDigest(receiptPayload) !== receiptDigest) issues.push('receiptDigest mismatch');
  for (const signal of input.refreshSignals) {
    if (signal.projectionReceiptDigest !== input.receiptDigest) issues.push(`signal ${signal.signalId} receipt mismatch`);
    if (signal.repository.repositoryId !== input.outputSnapshot.repositoryId || signal.worktree.workspaceId !== input.outputSnapshot.workspaceId || signal.worktree.headSha !== input.outputSnapshot.headSha || signal.worktree.worktreeDigest !== input.outputSnapshot.worktreeDigest) issues.push(`signal ${signal.signalId} snapshot mismatch`);
  }
  if ((input.status === 'adoption-required' || input.status === 'human-action-required') !== (input.humanActions.length > 0)) issues.push('human action/status mismatch');
  return issues;
}

function sameIdentity(left: ProjectionSnapshotV1, right: ProjectionSnapshotV1): boolean {
  return left.repositoryId === right.repositoryId && left.workspaceId === right.workspaceId && left.baseHeadSha === right.baseHeadSha;
}

function sortedUnique(values: readonly string[]): boolean {
  return values.every((value, index) => index === 0 || values[index - 1]! < value);
}

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as JsonRecord;
}
