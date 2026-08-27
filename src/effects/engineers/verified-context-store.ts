import { createHash, randomUUID } from 'crypto';
import { execFileSync } from 'child_process';
import {
  closeSync,
  constants,
  existsSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeSync,
} from 'fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'path';

import {
  buildDecisionRequestCurrent,
  buildDecisionRequestEvent,
  buildSemanticContractProjection,
  canonicalDecisionRequestBytes,
  canonicalDecisionRequestCurrentBytes,
  canonicalDecisionRequestEventBytes,
  canonicalEngineerStepProposalBytes,
  canonicalSemanticContractProjectionBytes,
  canonicalSemanticVerificationAssertionBytes,
  canonicalVerifiedEvidenceContextBytes,
  canonicalWorkerRoundReceiptBytes,
  compileVerifiedEvidenceContext,
  deriveDecisionOperationFingerprint,
  deriveDecisionTransitionId,
  validateDecisionRequest,
  validateDecisionRequestCurrent,
  validateDecisionRequestEvent,
  validateEngineerStepProposal,
  validateSemanticContractProjection,
  validateSemanticVerificationAssertion,
  validateVerifiedEvidenceContext,
  validateWorkerRoundReceipt,
  type CompileVerifiedEvidenceContextInput,
  type DecisionRequestCurrentV1,
  type DecisionRequestEventV1,
  type DecisionRequestV1,
  type DecisionTransitionInput,
  type EngineerStepProposalV1,
  type SemanticConstraintV1,
  type SemanticContractProjectionV1,
  type SemanticVerificationAssertionV1,
  type VerifiedEvidenceContextV1,
  type VerifiedEvidenceRefV1,
  type WorkerRoundReceiptV1,
} from '../../core/engineers/verified-context';
import { messageSha256 } from '../../core/messages/mechanics';
import { resolveGitCommonDirectory } from '../git/common-directory';
import { withExclusiveDirectoryLock } from '../locking/exclusive-directory-lock';
import { readEngineerBindingStatus } from './binding-store';
import {
  readCodexProcessReceipt,
  readDelegatedRunEvidenceBlob,
  readDelegatedRunResult,
  readDelegatedRunRunRef,
} from './delegated-run-store';

export const VERIFIED_CONTEXT_STORE_RELATIVE_ROOT = 'repo-harness/verified-context/v1';

type ImmutableKind = 'contracts' | 'proposals' | 'rounds' | 'assertions' | 'contexts' | 'decision-requests' | 'decision-events' | 'decision-event-transitions';

export type VerifiedContextStoreErrorCode =
  | 'verified_context_store_invalid'
  | 'verified_context_store_not_found'
  | 'verified_context_store_conflict'
  | 'verified_context_store_unsafe_path'
  | 'verified_context_store_persistence_failed';

export class VerifiedContextStoreError extends Error {
  constructor(readonly code: VerifiedContextStoreErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'VerifiedContextStoreError';
  }
}

export type DecisionCrashBoundary = 'before_event' | 'after_transition_fsync' | 'after_event_fsync' | 'after_current_fsync';
export type DecisionCrashHook = (boundary: DecisionCrashBoundary) => void;

interface StorePaths {
  readonly common: string;
  readonly root: string;
}

interface DecisionPaths {
  readonly store: StorePaths;
  readonly key: string;
  readonly root: string;
  readonly events: string;
  readonly current: string;
  readonly lock_relative: string;
}

function fail(code: VerifiedContextStoreErrorCode, message: string, cause?: unknown): never {
  throw new VerifiedContextStoreError(code, message, cause === undefined ? undefined : { cause });
}

function storePaths(repoRoot: string): StorePaths {
  const common = resolveGitCommonDirectory(repoRoot);
  return { common, root: resolve(common, VERIFIED_CONTEXT_STORE_RELATIVE_ROOT) };
}

function digestHex(value: string, field: string): string {
  const matched = /^sha256:([0-9a-f]{64})$/u.exec(value);
  if (!matched) fail('verified_context_store_invalid', `${field} is invalid`);
  return matched[1];
}

function decisionKey(decisionId: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(decisionId)) fail('verified_context_store_invalid', 'decision_id is invalid');
  return createHash('sha256').update(Buffer.from(decisionId, 'utf8')).digest('hex');
}

function decisionPaths(repoRoot: string, decisionId: string): DecisionPaths {
  const store = storePaths(repoRoot);
  const key = decisionKey(decisionId);
  const root = join(store.root, 'decisions', key);
  return { store, key, root, events: join(root, 'events'), current: join(root, 'current.json'), lock_relative: `${VERIFIED_CONTEXT_STORE_RELATIVE_ROOT}/locks/${key}.lock` };
}

function scopedSegments(root: string, target: string): string[] {
  const scoped = relative(root, target);
  if (!scoped || scoped === '..' || scoped.startsWith(`..${sep}`) || isAbsolute(scoped)) fail('verified_context_store_unsafe_path', `path escapes store root: ${target}`);
  return scoped.split(sep).filter(Boolean);
}

function ensureDirectoryChain(root: string, target: string): void {
  let current = root;
  for (const segment of scopedSegments(root, target)) {
    current = join(current, segment);
    try {
      const stat = lstatSync(current);
      if (!stat.isDirectory() || stat.isSymbolicLink()) fail('verified_context_store_unsafe_path', `unsafe store directory: ${current}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      try { mkdirSync(current, { mode: 0o700 }); } catch (mkdirError) { if ((mkdirError as NodeJS.ErrnoException).code !== 'EEXIST') throw mkdirError; }
      const stat = lstatSync(current);
      if (!stat.isDirectory() || stat.isSymbolicLink()) fail('verified_context_store_unsafe_path', `unsafe store directory: ${current}`);
      fsyncDirectory(dirname(current));
    }
  }
}

function prepareStore(store: StorePaths): void {
  ensureDirectoryChain(store.common, store.root);
  for (const child of ['contracts', 'proposals', 'rounds', 'assertions', 'contexts', 'decision-requests', 'decision-events', 'decision-event-transitions', 'decisions', 'locks']) ensureDirectoryChain(store.common, join(store.root, child));
}

function fsyncDirectory(path: string): void {
  const fd = openSync(path, constants.O_RDONLY);
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

function writeAll(fd: number, bytes: Buffer): void {
  let offset = 0;
  while (offset < bytes.length) offset += writeSync(fd, bytes, offset, bytes.length - offset);
}

function regularBytes(path: string, label: string): Buffer {
  let stat;
  try { stat = lstatSync(path); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fail('verified_context_store_not_found', `${label} is missing`);
    throw error;
  }
  if (!stat.isFile() || stat.isSymbolicLink()) fail('verified_context_store_unsafe_path', `${label} is not a regular file`);
  return readFileSync(path);
}

function immutablePath(repoRoot: string, kind: ImmutableKind, digest: string, create = false): string {
  const store = storePaths(repoRoot);
  if (create) prepareStore(store);
  const directory = join(store.root, kind);
  if (create) ensureDirectoryChain(store.common, directory);
  return join(directory, `${digestHex(digest, `${kind} digest`)}.json`);
}

function persistImmutable(repoRoot: string, kind: ImmutableKind, digest: string, canonical: string): void {
  const target = immutablePath(repoRoot, kind, digest, true);
  const bytes = Buffer.from(`${canonical}\n`, 'utf8');
  if (existsSync(target)) {
    if (!regularBytes(target, `${kind} evidence`).equals(bytes)) fail('verified_context_store_conflict', `${kind} digest already names different bytes`);
    return;
  }
  const temporary = join(dirname(target), `.${process.pid}.${randomUUID()}.tmp`);
  let fd: number | null = null;
  try {
    fd = openSync(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    writeAll(fd, bytes); fsyncSync(fd);
  } finally { if (fd !== null) closeSync(fd); }
  try {
    linkSync(temporary, target);
    fsyncDirectory(dirname(target));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') fail('verified_context_store_persistence_failed', `cannot persist ${kind}`, error);
    if (!regularBytes(target, `${kind} evidence`).equals(bytes)) fail('verified_context_store_conflict', `${kind} digest already names different bytes`);
  } finally {
    try { unlinkSync(temporary); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
}

function readImmutable<T>(repoRoot: string, kind: ImmutableKind, digest: string, validate: (value: unknown) => T, canonical: (value: T) => string): T {
  const raw = regularBytes(immutablePath(repoRoot, kind, digest), `${kind} evidence`);
  let parsed: unknown;
  try { parsed = JSON.parse(raw.toString('utf8')); } catch (error) { return fail('verified_context_store_invalid', `${kind} evidence is not JSON`, error); }
  let value: T;
  try { value = validate(parsed); } catch (error) { return fail('verified_context_store_invalid', `${kind} evidence is invalid`, error); }
  if (!raw.equals(Buffer.from(`${canonical(value)}\n`, 'utf8'))) fail('verified_context_store_conflict', `${kind} evidence is not canonical`);
  return value;
}

function parseConstraintCatalog(contractBytes: Buffer): readonly SemanticConstraintV1[] {
  const markdown = contractBytes.toString('utf8');
  // A lookahead terminator keeps the block separator unconsumed so two adjacent
  // catalogs are both counted instead of the second hiding behind lastIndex.
  const sections = [...markdown.matchAll(/(?:^|\n)## Semantic Constraint Catalog\s*\n+```json\s*\n([\s\S]*?)\n```(?=\n|$)/gu)];
  if (sections.length !== 1) fail('verified_context_store_invalid', 'exact Contract requires exactly one Semantic Constraint Catalog JSON block');
  let parsed: unknown;
  try { parsed = JSON.parse(sections[0]![1]!); } catch (error) { return fail('verified_context_store_invalid', 'Semantic Constraint Catalog is invalid JSON', error); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) fail('verified_context_store_invalid', 'Semantic Constraint Catalog must be an object');
  const catalog = parsed as Record<string, unknown>;
  if (JSON.stringify(Object.keys(catalog).sort()) !== JSON.stringify(['constraints', 'protocol'])) fail('verified_context_store_invalid', 'Semantic Constraint Catalog fields are invalid');
  if (catalog.protocol !== 1 || !Array.isArray(catalog.constraints) || catalog.constraints.length === 0) fail('verified_context_store_invalid', 'Semantic Constraint Catalog protocol or constraints are invalid');
  for (const value of catalog.constraints) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || JSON.stringify(Object.keys(value as object).sort()) !== JSON.stringify(['constraint_id', 'statement'])) fail('verified_context_store_invalid', 'Semantic Constraint fields are invalid');
  }
  return catalog.constraints as unknown as readonly SemanticConstraintV1[];
}

function gitBytes(repoRoot: string, revision: string, contractRef: string): { bytes: Buffer; blob: string; revision: string } {
  if (!/^[0-9a-f]{40,64}$/u.test(revision)) fail('verified_context_store_invalid', 'contract_revision must be an exact Git object ID');
  if (isAbsolute(contractRef) || contractRef.split('/').includes('..') || !contractRef.endsWith('.contract.md')) fail('verified_context_store_unsafe_path', 'contract_ref is unsafe');
  try {
    const exactRevision = execFileSync('git', ['rev-parse', '--verify', `${revision}^{commit}`], { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    if (exactRevision !== revision) fail('verified_context_store_invalid', 'contract_revision does not resolve exactly');
    const blob = execFileSync('git', ['rev-parse', '--verify', `${revision}:${contractRef}`], { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    if (!/^[0-9a-f]{40,64}$/u.test(blob)) fail('verified_context_store_invalid', 'contract blob OID is invalid');
    const bytes = execFileSync('git', ['show', `${revision}:${contractRef}`], { cwd: repoRoot, encoding: 'buffer', stdio: ['ignore', 'pipe', 'pipe'] });
    return { bytes, blob, revision: exactRevision };
  } catch (error) {
    if (error instanceof VerifiedContextStoreError) throw error;
    return fail('verified_context_store_not_found', 'exact tracked Contract revision cannot be read', error);
  }
}

export function projectSemanticContract(repoRoot: string, contractRef: string, contractRevision: string): SemanticContractProjectionV1 {
  const root = resolve(repoRoot);
  const source = gitBytes(root, contractRevision, contractRef);
  const projection = buildSemanticContractProjection({ contract_ref: contractRef, contract_revision: source.revision, contract_blob_oid: source.blob, contract_sha256: messageSha256(source.bytes), constraints: parseConstraintCatalog(source.bytes) });
  persistImmutable(root, 'contracts', projection.projection_sha256, canonicalSemanticContractProjectionBytes(projection));
  return projection;
}

export function readSemanticContractProjection(repoRoot: string, digest: string): SemanticContractProjectionV1 {
  const value = readImmutable(resolve(repoRoot), 'contracts', digest, validateSemanticContractProjection, canonicalSemanticContractProjectionBytes);
  const exact = gitBytes(resolve(repoRoot), value.contract_revision, value.contract_ref);
  if (exact.blob !== value.contract_blob_oid || messageSha256(exact.bytes) !== value.contract_sha256) fail('verified_context_store_conflict', 'exact Contract bytes no longer match projection');
  const rebuilt = buildSemanticContractProjection({ contract_ref: value.contract_ref, contract_revision: value.contract_revision, contract_blob_oid: value.contract_blob_oid, contract_sha256: value.contract_sha256, constraints: parseConstraintCatalog(exact.bytes) });
  if (rebuilt.projection_sha256 !== value.projection_sha256) fail('verified_context_store_conflict', 'Contract constraint catalog no longer matches projection');
  return value;
}

export function persistEngineerStepProposal(repoRoot: string, value: EngineerStepProposalV1): EngineerStepProposalV1 { const exact = validateEngineerStepProposal(value); persistImmutable(resolve(repoRoot), 'proposals', exact.proposal_sha256, canonicalEngineerStepProposalBytes(exact)); return exact; }
export function readEngineerStepProposal(repoRoot: string, digest: string): EngineerStepProposalV1 { return readImmutable(resolve(repoRoot), 'proposals', digest, validateEngineerStepProposal, canonicalEngineerStepProposalBytes); }
export function persistWorkerRoundReceipt(repoRoot: string, value: WorkerRoundReceiptV1): WorkerRoundReceiptV1 { const exact = validateWorkerRoundReceipt(value); persistImmutable(resolve(repoRoot), 'rounds', exact.round_receipt_sha256, canonicalWorkerRoundReceiptBytes(exact)); return exact; }
export function readWorkerRoundReceipt(repoRoot: string, digest: string): WorkerRoundReceiptV1 { return readImmutable(resolve(repoRoot), 'rounds', digest, validateWorkerRoundReceipt, canonicalWorkerRoundReceiptBytes); }
export function persistSemanticVerificationAssertion(repoRoot: string, value: SemanticVerificationAssertionV1): SemanticVerificationAssertionV1 { const exact = validateSemanticVerificationAssertion(value); persistImmutable(resolve(repoRoot), 'assertions', exact.assertion_sha256, canonicalSemanticVerificationAssertionBytes(exact)); return exact; }
export function readSemanticVerificationAssertion(repoRoot: string, digest: string): SemanticVerificationAssertionV1 { return readImmutable(resolve(repoRoot), 'assertions', digest, validateSemanticVerificationAssertion, canonicalSemanticVerificationAssertionBytes); }
export function readVerifiedEvidenceContext(repoRoot: string, digest: string): VerifiedEvidenceContextV1 { return readImmutable(resolve(repoRoot), 'contexts', digest, validateVerifiedEvidenceContext, canonicalVerifiedEvidenceContextBytes); }

function repoEvidence(root: string, ref: string, expected: string): Buffer {
  const relativePath = ref.slice('repo:'.length);
  if (!relativePath || isAbsolute(relativePath) || relativePath.split('/').includes('..')) fail('verified_context_store_unsafe_path', 'repository evidence ref is unsafe');
  const target = resolve(root, relativePath);
  const scoped = relative(root, target);
  if (!scoped || scoped === '..' || scoped.startsWith(`..${sep}`) || isAbsolute(scoped)) fail('verified_context_store_unsafe_path', 'repository evidence ref escapes root');
  let current = root;
  for (const segment of scoped.split(sep)) {
    current = join(current, segment);
    const stat = lstatSync(current);
    if (stat.isSymbolicLink()) fail('verified_context_store_unsafe_path', 'repository evidence ref contains a symlink');
  }
  const bytes = regularBytes(target, 'repository evidence');
  if (messageSha256(bytes) !== expected) fail('verified_context_store_conflict', `repository evidence bytes changed: ${relativePath}`);
  return bytes;
}

export function validateVerifiedEvidenceRef(repoRoot: string, evidence: VerifiedEvidenceRefV1): Buffer {
  if (evidence.ref.startsWith('repo:')) return repoEvidence(resolve(repoRoot), evidence.ref, evidence.sha256);
  if (evidence.ref.startsWith('evidence-blob:')) {
    try { return readDelegatedRunEvidenceBlob(resolve(repoRoot), evidence.ref, evidence.sha256); } catch (error) { return fail('verified_context_store_conflict', 'delegated-run evidence bytes are invalid', error); }
  }
  return fail('verified_context_store_invalid', 'evidence ref scheme is unsupported');
}

export function readVerifiedWorkerResultEvidence(repoRoot: string, resultSha256: string) {
  try { return readDelegatedRunResult(resolve(repoRoot), resultSha256); } catch (error) { return fail('verified_context_store_conflict', 'Worker result cannot be revalidated', error); }
}

export function compileVerifiedCheckpointProjection(input: CompileVerifiedEvidenceContextInput): VerifiedEvidenceContextV1 {
  return compileVerifiedEvidenceContext(input);
}

export interface CompileStoredVerifiedContextInput {
  readonly repo_root: string;
  readonly contract_projection_sha256: string;
  readonly task: CompileVerifiedEvidenceContextInput['task'];
  readonly binding: CompileVerifiedEvidenceContextInput['binding'];
  readonly proposal_sha256s: readonly string[];
  readonly round_receipt_sha256s: readonly string[];
  readonly assertion_sha256s: readonly string[];
  readonly decision_ids: readonly string[];
}

export function compileStoredVerifiedEvidenceContext(input: CompileStoredVerifiedContextInput): VerifiedEvidenceContextV1 {
  const root = resolve(input.repo_root);
  const contract = readSemanticContractProjection(root, input.contract_projection_sha256);
  const proposals = input.proposal_sha256s.map((digest) => readEngineerStepProposal(root, digest));
  const rounds = input.round_receipt_sha256s.map((digest) => readWorkerRoundReceipt(root, digest));
  const assertions = input.assertion_sha256s.map((digest) => readSemanticVerificationAssertion(root, digest));
  const runRefs = rounds.map((round) => {
    try {
      const runRef = readDelegatedRunRunRef(root, round.worker_run_ref_sha256);
      const receipt = readCodexProcessReceipt(root, round.worker_runtime_receipt_sha256);
      if (receipt.process_receipt_sha256 !== round.worker_runtime_receipt_sha256) fail('verified_context_store_conflict', 'worker runtime receipt subject changed');
      return runRef;
    } catch (error) { return fail('verified_context_store_conflict', 'Worker run evidence cannot be revalidated', error); }
  });
  const results = rounds.map((round) => {
    return readVerifiedWorkerResultEvidence(root, round.result_sha256);
  });
  const decisions = input.decision_ids.map((decisionId) => readDecisionStatus(root, decisionId));
  const refs = [
    ...proposals.flatMap((item) => item.input_evidence_refs),
    ...rounds.flatMap((item) => item.evidence_refs),
    ...assertions.flatMap((item) => item.evidence_refs),
    ...results.flatMap((item) => item.evidence_refs),
  ];
  for (const evidence of refs) validateVerifiedEvidenceRef(root, evidence);
  const context = compileVerifiedCheckpointProjection({ contract, task: input.task, binding: input.binding, proposals, rounds, assertions, worker_run_refs: runRefs, worker_results: results, decisions });
  persistImmutable(root, 'contexts', context.context_packet_sha256, canonicalVerifiedEvidenceContextBytes(context));
  return context;
}

function prepareDecision(paths: DecisionPaths): void {
  prepareStore(paths.store);
  ensureDirectoryChain(paths.store.common, paths.root);
  ensureDirectoryChain(paths.store.common, paths.events);
}

function currentOptional(paths: DecisionPaths): DecisionRequestCurrentV1 | null {
  if (!existsSync(paths.current)) return null;
  const raw = regularBytes(paths.current, 'decision current');
  let value: DecisionRequestCurrentV1;
  try { value = validateDecisionRequestCurrent(JSON.parse(raw.toString('utf8'))); } catch (error) { return fail('verified_context_store_invalid', 'decision current is invalid', error); }
  if (!raw.equals(Buffer.from(`${canonicalDecisionRequestCurrentBytes(value)}\n`, 'utf8'))) fail('verified_context_store_conflict', 'decision current is not canonical');
  return value;
}

function replaceCurrent(paths: DecisionPaths, current: DecisionRequestCurrentV1): void {
  const bytes = Buffer.from(`${canonicalDecisionRequestCurrentBytes(current)}\n`, 'utf8');
  const temporary = join(paths.root, `.${process.pid}.${randomUUID()}.tmp`);
  let fd: number | null = null;
  try { fd = openSync(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600); writeAll(fd, bytes); fsyncSync(fd); } finally { if (fd !== null) closeSync(fd); }
  try { renameSync(temporary, paths.current); fsyncDirectory(paths.root); } catch (error) { fail('verified_context_store_persistence_failed', 'cannot publish decision current', error); } finally { try { unlinkSync(temporary); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; } }
}

export interface TransitionDecisionInput extends DecisionTransitionInput {
  readonly repo_root: string;
  readonly request: DecisionRequestV1;
  readonly crash_hook?: DecisionCrashHook;
}

export function validateCurrentDecisionEngineerBinding(repoRoot: string, request: DecisionRequestV1, actor: DecisionTransitionInput['actor']): void {
  if (actor.kind !== 'engineer') return;
  const fence = request.binding_fence;
  const status = readEngineerBindingStatus(repoRoot, fence.engineer_id, fence.engineer_contract_revision);
  const binding = status.binding;
  if (!binding || binding.state !== 'active' || status.current.state !== 'active'
    || binding.binding_id !== fence.binding_id
    || binding.binding_generation !== fence.binding_generation
    || binding.engineer_contract_revision !== fence.engineer_contract_revision
    || actor.binding_generation !== fence.binding_generation) {
    fail('verified_context_store_conflict', 'decision Engineer actor does not match the exact current Binding');
  }
}

export function buildVerifiedDecisionEvent(
  request: DecisionRequestV1,
  previous: DecisionRequestCurrentV1 | null,
  input: DecisionTransitionInput,
): DecisionRequestEventV1 {
  return buildDecisionRequestEvent(request, previous, input);
}

export function transitionDecisionRequest(input: TransitionDecisionInput): { readonly request: DecisionRequestV1; readonly event: DecisionRequestEventV1; readonly current: DecisionRequestCurrentV1 } {
  const root = resolve(input.repo_root);
  const request = validateDecisionRequest(input.request);
  validateCurrentDecisionEngineerBinding(root, request, input.actor);
  const paths = decisionPaths(root, request.decision_id);
  prepareStore(paths.store);
  return withExclusiveDirectoryLock(paths.store.common, paths.lock_relative, () => {
    prepareDecision(paths);
    persistImmutable(root, 'decision-requests', request.request_sha256, canonicalDecisionRequestBytes(request));
    const previous = currentOptional(paths);
    const transitionId = deriveDecisionTransitionId(request.decision_id, input.idempotency_key);
    const target = immutablePath(root, 'decision-event-transitions', transitionId, true);
    let event: DecisionRequestEventV1;
    if (existsSync(target)) {
      event = readImmutable(root, 'decision-event-transitions', transitionId, validateDecisionRequestEvent, canonicalDecisionRequestEventBytes);
      if (deriveDecisionOperationFingerprint(request, input) !== event.operation_fingerprint) fail('verified_context_store_conflict', 'decision idempotency key names different operation bytes');
      if (previous?.current_event_sha256 === event.event_sha256) return Object.freeze({ request, event, current: previous });
      const candidate = buildVerifiedDecisionEvent(request, event.transition === 'open' ? null : previous, input);
      if (candidate.operation_fingerprint !== event.operation_fingerprint || candidate.event_sha256 !== event.event_sha256) fail('verified_context_store_conflict', 'decision idempotency key names different operation bytes');
      persistImmutable(root, 'decision-events', event.event_sha256, canonicalDecisionRequestEventBytes(event));
    } else {
      input.crash_hook?.('before_event');
      event = buildVerifiedDecisionEvent(request, previous, input);
      persistImmutable(root, 'decision-event-transitions', event.transition_id, canonicalDecisionRequestEventBytes(event));
      input.crash_hook?.('after_transition_fsync');
      persistImmutable(root, 'decision-events', event.event_sha256, canonicalDecisionRequestEventBytes(event));
      input.crash_hook?.('after_event_fsync');
    }
    const current = buildDecisionRequestCurrent(event, event.transition === 'open' ? null : previous);
    replaceCurrent(paths, current);
    input.crash_hook?.('after_current_fsync');
    return Object.freeze({ request, event, current });
  }, { reclaimStaleEmptyDirectory: true, reclaimStaleOwner: true });
}

export function readDecisionStatus(repoRoot: string, decisionId: string): { readonly request: DecisionRequestV1; readonly current: DecisionRequestCurrentV1 } {
  const root = resolve(repoRoot);
  const paths = decisionPaths(root, decisionId);
  const current = currentOptional(paths);
  if (current === null) return fail('verified_context_store_not_found', 'decision current is missing');
  const request = readImmutable(root, 'decision-requests', current.request_sha256, validateDecisionRequest, canonicalDecisionRequestBytes);
  const event = readImmutable(root, 'decision-events', current.current_event_sha256, validateDecisionRequestEvent, canonicalDecisionRequestEventBytes);
  if (request.decision_id !== decisionId || event.decision_id !== decisionId || event.event_sha256 !== current.current_event_sha256 || event.next_state !== current.state) fail('verified_context_store_conflict', 'decision request/event/current binding is invalid');
  return Object.freeze({ request, current });
}
