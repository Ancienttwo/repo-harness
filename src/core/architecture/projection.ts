import { createHash } from 'node:crypto';
import type { AcceptedArchitectureChangeReferenceV1 } from 'archctx-contracts';
import { canonicalize } from '../evidence/canonical-json';

export const PROJECTION_REQUEST_VERSION = 'archcontext.projection-request/v1' as const;
export const PROJECTION_RESULT_VERSION = 'archcontext.projection-result/v2' as const;
export const PROJECTION_APPLY_IDENTITY_VERSION = 'archcontext.projection-apply-identity/v1' as const;
export const ARCHCTX_CAPABILITIES_VERSION = 'archcontext.capabilities/v1' as const;
export const ARCHITECTURE_REFRESH_SIGNAL_VERSION = 'archcontext.architecture-refresh-signal/v1' as const;
export const ARCHITECTURE_DOCS_RENDERER_VERSION = 'archcontext.docs-renderer/v4' as const;
export const ARCHITECTURE_DOCS_LAYOUT_VERSION = 'archcontext.docs-layout/v1' as const;
export const ARCHCTX_REQUIRED_VERSION = '0.4.7' as const;
export const ARCHCTX_REQUIRED_FEATURES = Object.freeze([
  'architecture-docs-renderer-v2',
  'architecture-refresh-signal-v1',
  'projection-apply-receipt-v1',
  'projection-protocol-v2',
] as const);
export const PROJECTION_STATUSES = Object.freeze([
  'adoption-required', 'applied', 'applied-reconcile-required', 'blocked', 'human-action-required', 'noop',
  'permanent-failure', 'planned', 'retryable-failure',
] as const);
export const ARCHITECTURE_MAJOR_CHANGE_REASONS = Object.freeze([
  'constraint-changed', 'entrypoint-changed', 'interface-changed', 'lifecycle-changed',
  'node-added', 'node-moved', 'node-removed', 'node-renamed', 'ownership-changed',
  'relation-changed', 'responsibility-changed', 'risk-boundary-changed',
  'verified-flow-proof-changed',
] as const);
export const ARCHITECTURE_REFRESH_TARGETS = Object.freeze([
  'architecture-contract-context', 'architecture-readiness', 'architecture-request-index',
  'capability-context', 'capability-index',
] as const);

export type Sha256Digest = `sha256:${string}`;
export type ProjectionProvider = 'disabled' | 'archctx';
export type ProjectionApplyMode = 'disabled' | 'manual' | 'automatic';
export type ProjectionMode = 'check' | 'plan' | 'apply' | 'adopt';
export type ProjectionStatus =
  | 'adoption-required'
  | 'applied'
  | 'applied-reconcile-required'
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
  acceptedChange?: AcceptedArchitectureChangeReferenceV1;
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

export interface ProjectionApplyIdentityV1 {
  schemaVersion: typeof PROJECTION_APPLY_IDENTITY_VERSION;
  applyId: Sha256Digest;
  lookupKey: Sha256Digest;
  repositoryId: string;
  workspaceId: string;
  acceptedChange: AcceptedArchitectureChangeReferenceV1;
  semanticCommit: { changeSetId: string; idempotencyKey: string };
  ownedFilesDigest: Sha256Digest;
  refreshSignalsDigest: Sha256Digest;
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
  applyReceipt?: ProjectionApplyIdentityV1;
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
  failureGate: 'advisory' | 'strict';
  requiredVersion: string;
  timeoutMs: number;
}

export interface ArchitectureProjectionReadinessV1 {
  schemaVersion: 'repo-harness.architecture-projection-readiness/v1';
  modelAuthority: { source: 'registry' | 'archcontext'; ready: boolean };
  projectionProvider: { provider: ProjectionProvider; state: 'disabled' | 'missing' | 'mismatch' | 'error' | 'ready'; binaryPath: string | null; version: string | null; reason: string };
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
  const architecture = root.architecture === undefined ? {} : record(root.architecture, 'policy.architecture');
  const provider = architecture.projection_provider ?? 'disabled';
  const applyMode = architecture.projection_apply ?? 'disabled';
  const failureGate = architecture.projection_failure_gate ?? 'advisory';
  const requiredVersion = architecture.projection_version ?? ARCHCTX_REQUIRED_VERSION;
  const timeoutMs = architecture.projection_timeout_ms ?? 120_000;
  if (provider !== 'disabled' && provider !== 'archctx') throw new Error('policy.architecture.projection_provider must be disabled|archctx');
  if (applyMode !== 'disabled' && applyMode !== 'manual' && applyMode !== 'automatic') throw new Error('policy.architecture.projection_apply must be disabled|manual|automatic');
  if (provider === 'disabled') {
    if (applyMode !== 'disabled') throw new Error('projection_apply must be disabled when projection_provider is disabled');
    return { provider, applyMode, failureGate: 'advisory', requiredVersion: ARCHCTX_REQUIRED_VERSION, timeoutMs: 120_000 };
  }
  if (failureGate !== 'advisory' && failureGate !== 'strict') throw new Error('policy.architecture.projection_failure_gate must be advisory|strict');
  if (typeof requiredVersion !== 'string' || requiredVersion.trim() === '') throw new Error('policy.architecture.projection_version must be a non-empty string');
  if (!Number.isInteger(timeoutMs) || (timeoutMs as number) < 1_000 || (timeoutMs as number) > 120_000) throw new Error('policy.architecture.projection_timeout_ms must be 1000..120000');
  return { provider, applyMode, failureGate, requiredVersion, timeoutMs: timeoutMs as number };
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
  if (input.acceptedChange) {
    if (input.acceptedChange.changeSetId.trim() === '') issues.push('acceptedChange.changeSetId must not be empty');
    if (input.acceptedChange.eventId.trim() === '') issues.push('acceptedChange.eventId must not be empty');
    if (!sortedUnique(input.acceptedChange.reasonCodes) || input.acceptedChange.reasonCodes.length === 0) issues.push('acceptedChange.reasonCodes must be sorted, unique and non-empty');
    if (!sortedUnique(input.acceptedChange.affectedNodeIds) || input.acceptedChange.affectedNodeIds.length === 0) issues.push('acceptedChange.affectedNodeIds must be sorted, unique and non-empty');
    for (const reason of input.acceptedChange.reasonCodes) {
      if (!(ARCHITECTURE_MAJOR_CHANGE_REASONS as readonly string[]).includes(reason)) issues.push(`acceptedChange.reasonCodes contains unsupported reason: ${reason}`);
    }
    if (input.acceptedChange.affectedNodeIds.some((nodeId) => nodeId.trim() === '')) issues.push('acceptedChange.affectedNodeIds must not contain empty node ids');
  }
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
  if (!sortedUnique(input.refreshSignals.map((signal) => signal.signalId))) issues.push('refreshSignals.signalId must be sorted and unique');
  for (const [index, action] of input.humanActions.entries()) if (!sortedUnique(action.affectedNodeIds)) issues.push(`humanActions[${index}].affectedNodeIds must be sorted and unique`);
  if (!sameIdentity(input.inputSnapshot, input.outputSnapshot)) issues.push('input/output snapshot identity mismatch');
  for (const [index, file] of input.files.entries()) {
    if (file.action === 'create' && (file.preimageDigest !== null || file.outputDigest === null)) issues.push(`files[${index}] create digest contract invalid`);
    if (file.action === 'delete' && (file.preimageDigest === null || file.outputDigest !== null)) issues.push(`files[${index}] delete digest contract invalid`);
    if (file.action === 'update' && (file.preimageDigest === null || file.outputDigest === null || file.preimageDigest === file.outputDigest)) issues.push(`files[${index}] update digest contract invalid`);
    if (file.action === 'unchanged' && (file.preimageDigest === null || file.outputDigest === null || file.preimageDigest !== file.outputDigest)) issues.push(`files[${index}] unchanged digest contract invalid`);
  }
  const { receiptDigest, ...receiptPayload } = input;
  if (projectionResultReceiptDigest(receiptPayload) !== receiptDigest) issues.push('receiptDigest mismatch');
  for (const [index, signal] of input.refreshSignals.entries()) {
    issues.push(...refreshSignalIssues(signal, `refreshSignals[${index}]`));
    if (signal.projectionReceiptDigest !== input.receiptDigest) issues.push(`signal ${signal.signalId} receipt mismatch`);
    if (signal.repository.repositoryId !== input.outputSnapshot.repositoryId || signal.worktree.workspaceId !== input.outputSnapshot.workspaceId || signal.worktree.headSha !== input.outputSnapshot.headSha || signal.worktree.worktreeDigest !== input.outputSnapshot.worktreeDigest) issues.push(`signal ${signal.signalId} snapshot mismatch`);
  }
  if ((input.status === 'adoption-required' || input.status === 'human-action-required') !== (input.humanActions.length > 0)) issues.push('human action/status mismatch');
  if (input.status === 'applied-reconcile-required') {
    if (!input.applyReceipt) issues.push('applied-reconcile-required requires applyReceipt');
    if (input.refreshSignals.length > 0) issues.push('applied-reconcile-required cannot deliver refreshSignals');
  }
  if (input.applyReceipt) issues.push(...projectionApplyIdentityIssues(input.applyReceipt, input));
  if (input.applyReceipt) {
    for (const [index, signal] of input.refreshSignals.entries()) {
      if (!signal.acceptedChange || !sameAcceptedArchitectureChange(input.applyReceipt.acceptedChange, signal.acceptedChange)) {
        issues.push(`refreshSignals[${index}].acceptedChange must match applyReceipt.acceptedChange`);
      }
    }
  }
  return issues;
}

function projectionApplyIdentityIssues(identity: ProjectionApplyIdentityV1, result: ProjectionResultV1): string[] {
  const issues: string[] = [];
  if (identity.schemaVersion !== PROJECTION_APPLY_IDENTITY_VERSION) issues.push('applyReceipt.schemaVersion mismatch');
  for (const field of ['applyId', 'lookupKey', 'ownedFilesDigest', 'refreshSignalsDigest'] as const) {
    if (!isDigest(identity[field])) issues.push(`applyReceipt.${field} invalid`);
  }
  if (identity.repositoryId !== result.outputSnapshot.repositoryId) issues.push('applyReceipt.repositoryId mismatch');
  if (identity.workspaceId !== result.outputSnapshot.workspaceId) issues.push('applyReceipt.workspaceId mismatch');
  if (identity.semanticCommit.changeSetId.trim() === '' || identity.semanticCommit.idempotencyKey.trim() === '') issues.push('applyReceipt.semanticCommit invalid');
  issues.push(...acceptedChangeIssues(identity.acceptedChange, 'applyReceipt.acceptedChange'));
  return issues;
}

function acceptedChangeIssues(change: AcceptedArchitectureChangeReferenceV1, label: string): string[] {
  const issues: string[] = [];
  if (change.changeSetId.trim() === '' || change.eventId.trim() === '') issues.push(`${label} identity invalid`);
  if (!sortedUnique(change.reasonCodes) || change.reasonCodes.length === 0) issues.push(`${label}.reasonCodes must be sorted, unique and non-empty`);
  if (!sortedUnique(change.affectedNodeIds) || change.affectedNodeIds.length === 0) issues.push(`${label}.affectedNodeIds must be sorted, unique and non-empty`);
  for (const reason of change.reasonCodes) if (!(ARCHITECTURE_MAJOR_CHANGE_REASONS as readonly string[]).includes(reason)) issues.push(`${label}.reasonCodes invalid`);
  return issues;
}

export function sameAcceptedArchitectureChange(
  left: Readonly<{ changeSetId: string; eventId: string; reasonCodes: readonly string[]; affectedNodeIds: readonly string[] }>,
  right: Readonly<{ changeSetId: string; eventId: string; reasonCodes: readonly string[]; affectedNodeIds: readonly string[] }>,
): boolean {
  return left.changeSetId === right.changeSetId
    && left.eventId === right.eventId
    && left.reasonCodes.join('\0') === right.reasonCodes.join('\0')
    && left.affectedNodeIds.join('\0') === right.affectedNodeIds.join('\0');
}

function refreshSignalIssues(signal: ArchitectureRefreshSignalV1, label: string): string[] {
  const issues: string[] = [];
  if (!sortedUnique(signal.reasonCodes) || signal.reasonCodes.length === 0) issues.push(`${label}.reasonCodes must be sorted, unique and non-empty`);
  if (!sortedUnique(signal.affectedNodeIds) || signal.affectedNodeIds.length === 0) issues.push(`${label}.affectedNodeIds must be sorted, unique and non-empty`);
  if (!sortedUnique(signal.refreshTargets) || signal.refreshTargets.length === 0) issues.push(`${label}.refreshTargets must be sorted, unique and non-empty`);
  if (signal.cause === 'unresolved-major-candidate' && signal.mode !== 'human-action-required') issues.push(`${label} unresolved major candidate mode mismatch`);
  if (signal.cause !== 'unresolved-major-candidate' && signal.mode !== 'refresh-required') issues.push(`${label} accepted change mode mismatch`);
  if (signal.mode === 'refresh-required' && !signal.acceptedChange) issues.push(`${label} refresh-required needs acceptedChange`);
  if (signal.mode === 'human-action-required' && signal.acceptedChange) issues.push(`${label} human-action-required forbids acceptedChange`);
  if (signal.acceptedChange) {
    if (!sortedUnique(signal.acceptedChange.reasonCodes) || !sortedUnique(signal.acceptedChange.affectedNodeIds)) issues.push(`${label}.acceptedChange arrays must be sorted and unique`);
    if (signal.acceptedChange.reasonCodes.join('\0') !== signal.reasonCodes.join('\0')) issues.push(`${label}.acceptedChange reasonCodes mismatch`);
    if (signal.acceptedChange.affectedNodeIds.join('\0') !== signal.affectedNodeIds.join('\0')) issues.push(`${label}.acceptedChange affectedNodeIds mismatch`);
  }
  return issues;
}

/** Strict untrusted-wire decoder. Structural validation happens before invariant checks so corrupt
 * provider JSON becomes one fail-closed contract error rather than a property-access TypeError. */
export function assertProjectionResult(value: unknown, expectedRequestId?: string): ProjectionResultV1 {
  const input = record(value, 'projection result');
  if (input.schemaVersion !== PROJECTION_RESULT_VERSION) throw new Error('projection result schemaVersion mismatch');
  if (typeof input.requestId !== 'string' || !/^[a-zA-Z0-9_.:-]+$/.test(input.requestId)) throw new Error('projection result requestId invalid');
  if (expectedRequestId !== undefined && input.requestId !== expectedRequestId) throw new Error('projection result requestId mismatch');
  if (typeof input.status !== 'string' || !(PROJECTION_STATUSES as readonly string[]).includes(input.status)) throw new Error('projection result status invalid');
  assertProjectionSnapshot(input.inputSnapshot, 'projection result inputSnapshot');
  assertProjectionSnapshot(input.outputSnapshot, 'projection result outputSnapshot');
  assertStringArray(input.affectedNodeIds, 'projection result affectedNodeIds');
  if (!Array.isArray(input.files)) throw new Error('projection result files must be an array');
  for (const [index, value] of input.files.entries()) {
    const file = record(value, `projection result files[${index}]`);
    if (typeof file.path !== 'string' || !repoRelativePosix(file.path)) throw new Error(`projection result files[${index}].path invalid`);
    if (file.action !== 'create' && file.action !== 'delete' && file.action !== 'unchanged' && file.action !== 'update') throw new Error(`projection result files[${index}].action invalid`);
    if (file.preimageDigest !== null && !isDigest(file.preimageDigest)) throw new Error(`projection result files[${index}].preimageDigest invalid`);
    if (file.outputDigest !== null && !isDigest(file.outputDigest)) throw new Error(`projection result files[${index}].outputDigest invalid`);
  }
  if (!Array.isArray(input.humanActions)) throw new Error('projection result humanActions must be an array');
  for (const [index, value] of input.humanActions.entries()) {
    const action = record(value, `projection result humanActions[${index}]`);
    if (!['adoption-required', 'manual-region-conflict', 'target-collision', 'unprovable-required-flow', 'unresolved-major-change'].includes(String(action.reasonCode))) throw new Error(`projection result humanActions[${index}].reasonCode invalid`);
    assertStringArray(action.affectedNodeIds, `projection result humanActions[${index}].affectedNodeIds`);
    if (!isDigest(action.requestPayloadDigest)) throw new Error(`projection result humanActions[${index}].requestPayloadDigest invalid`);
  }
  if (!Array.isArray(input.refreshSignals)) throw new Error('projection result refreshSignals must be an array');
  for (const [index, signal] of input.refreshSignals.entries()) assertArchitectureRefreshSignal(signal, `projection result refreshSignals[${index}]`);
  if (input.applyReceipt !== undefined) assertProjectionApplyIdentity(input.applyReceipt, 'projection result applyReceipt');
  if (!isDigest(input.receiptDigest)) throw new Error('projection result receiptDigest invalid');
  const result = input as unknown as ProjectionResultV1;
  const issues = projectionResultIssues(result);
  if (issues.length > 0) throw new Error(`projection result invariant failed: ${issues.join('; ')}`);
  return result;
}

function assertProjectionApplyIdentity(value: unknown, label: string): void {
  const identity = record(value, label);
  if (identity.schemaVersion !== PROJECTION_APPLY_IDENTITY_VERSION) throw new Error(`${label}.schemaVersion mismatch`);
  for (const field of ['applyId', 'lookupKey', 'ownedFilesDigest', 'refreshSignalsDigest'] as const) if (!isDigest(identity[field])) throw new Error(`${label}.${field} invalid`);
  if (typeof identity.repositoryId !== 'string' || identity.repositoryId.trim() === '') throw new Error(`${label}.repositoryId invalid`);
  if (typeof identity.workspaceId !== 'string' || identity.workspaceId.trim() === '') throw new Error(`${label}.workspaceId invalid`);
  const semanticCommit = record(identity.semanticCommit, `${label}.semanticCommit`);
  if (typeof semanticCommit.changeSetId !== 'string' || semanticCommit.changeSetId.trim() === '' || typeof semanticCommit.idempotencyKey !== 'string' || semanticCommit.idempotencyKey.trim() === '') throw new Error(`${label}.semanticCommit invalid`);
  const accepted = record(identity.acceptedChange, `${label}.acceptedChange`);
  if (typeof accepted.changeSetId !== 'string' || accepted.changeSetId.trim() === '' || typeof accepted.eventId !== 'string' || accepted.eventId.trim() === '') throw new Error(`${label}.acceptedChange identity invalid`);
  assertStringArray(accepted.reasonCodes, `${label}.acceptedChange.reasonCodes`);
  assertStringArray(accepted.affectedNodeIds, `${label}.acceptedChange.affectedNodeIds`);
}

function assertProjectionSnapshot(value: unknown, label: string): void {
  const snapshot = record(value, label);
  if (typeof snapshot.repositoryId !== 'string' || snapshot.repositoryId.trim() === '') throw new Error(`${label}.repositoryId invalid`);
  if (typeof snapshot.workspaceId !== 'string' || snapshot.workspaceId.trim() === '') throw new Error(`${label}.workspaceId invalid`);
  if (typeof snapshot.headSha !== 'string' || !HEAD.test(snapshot.headSha)) throw new Error(`${label}.headSha invalid`);
  if (typeof snapshot.baseHeadSha !== 'string' || !HEAD.test(snapshot.baseHeadSha)) throw new Error(`${label}.baseHeadSha invalid`);
  for (const field of ['worktreeDigest', 'sourceTreeDigest', 'modelDigest', 'codeGraphDigest', 'projectionInputDigest'] as const) {
    if (!isDigest(snapshot[field])) throw new Error(`${label}.${field} invalid`);
  }
  if (snapshot.indexedWorktreeDigest !== null && !isDigest(snapshot.indexedWorktreeDigest)) throw new Error(`${label}.indexedWorktreeDigest invalid`);
  if (snapshot.rendererVersion !== ARCHITECTURE_DOCS_RENDERER_VERSION || snapshot.layoutVersion !== ARCHITECTURE_DOCS_LAYOUT_VERSION) throw new Error(`${label} renderer/layout mismatch`);
  const generated = record(snapshot.generatedFrom, `${label}.generatedFrom`);
  if (generated.codeGraphPackage !== '@colbymchenry/codegraph' || generated.codeGraphVersion !== '1.5.0') throw new Error(`${label}.generatedFrom package/version mismatch`);
  if (!isDigest(generated.codeGraphBinaryDigest) || (generated.codeGraphStatus !== 'ready' && generated.codeGraphStatus !== 'unavailable')) throw new Error(`${label}.generatedFrom invalid`);
  if (generated.codeGraphStatus === 'ready' && !isDigest(snapshot.indexedWorktreeDigest)) throw new Error(`${label}.indexedWorktreeDigest required when CodeGraph is ready`);
}

function assertArchitectureRefreshSignal(value: unknown, label: string): void {
  const signal = record(value, label);
  if (signal.schemaVersion !== ARCHITECTURE_REFRESH_SIGNAL_VERSION) throw new Error(`${label}.schemaVersion mismatch`);
  for (const field of ['signalId', 'idempotencyKey', 'projectionReceiptDigest'] as const) if (!isDigest(signal[field])) throw new Error(`${label}.${field} invalid`);
  if (signal.mode !== 'human-action-required' && signal.mode !== 'refresh-required') throw new Error(`${label}.mode invalid`);
  if (signal.cause !== 'accepted-semantic-delta' && signal.cause !== 'unresolved-major-candidate' && signal.cause !== 'verified-flow-proof-delta') throw new Error(`${label}.cause invalid`);
  const repository = record(signal.repository, `${label}.repository`);
  const worktree = record(signal.worktree, `${label}.worktree`);
  if (typeof repository.repositoryId !== 'string' || repository.repositoryId.trim() === '') throw new Error(`${label}.repositoryId invalid`);
  if (typeof worktree.workspaceId !== 'string' || typeof worktree.headSha !== 'string' || !HEAD.test(worktree.headSha) || !isDigest(worktree.worktreeDigest)) throw new Error(`${label}.worktree invalid`);
  const reasonCodes = assertStringArray(signal.reasonCodes, `${label}.reasonCodes`);
  if (reasonCodes.some((reason) => !(ARCHITECTURE_MAJOR_CHANGE_REASONS as readonly string[]).includes(reason))) throw new Error(`${label}.reasonCodes invalid`);
  assertStringArray(signal.affectedNodeIds, `${label}.affectedNodeIds`);
  const targets = assertStringArray(signal.refreshTargets, `${label}.refreshTargets`);
  if (targets.some((target) => !(ARCHITECTURE_REFRESH_TARGETS as readonly string[]).includes(target))) throw new Error(`${label}.refreshTargets invalid`);
  assertDigestSet(signal.baseDigests, `${label}.baseDigests`);
  assertDigestSet(signal.resultingDigests, `${label}.resultingDigests`);
  if (signal.acceptedChange !== undefined) {
    const accepted = record(signal.acceptedChange, `${label}.acceptedChange`);
    if (typeof accepted.changeSetId !== 'string' || accepted.changeSetId.trim() === '' || typeof accepted.eventId !== 'string' || accepted.eventId.trim() === '') throw new Error(`${label}.acceptedChange identity invalid`);
    assertStringArray(accepted.reasonCodes, `${label}.acceptedChange.reasonCodes`);
    assertStringArray(accepted.affectedNodeIds, `${label}.acceptedChange.affectedNodeIds`);
  }
}

function assertDigestSet(value: unknown, label: string): void {
  const set = record(value, label);
  for (const field of ['modelDigest', 'sourceTreeDigest', 'flowProofDigest', 'projectionDigest'] as const) if (!isDigest(set[field])) throw new Error(`${label}.${field} invalid`);
}

function assertStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || entry.trim() === '')) throw new Error(`${label} must be an array of non-empty strings`);
  return value as string[];
}

function isDigest(value: unknown): value is Sha256Digest { return typeof value === 'string' && DIGEST.test(value); }
function repoRelativePosix(value: string): boolean { return value !== '' && !value.startsWith('/') && !value.includes('\\') && !value.split('/').some((part) => part === '' || part === '.' || part === '..'); }

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
