import { execFileSync } from 'child_process';
import { createHash, randomUUID } from 'crypto';
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
  readdirSync,
  renameSync,
  unlinkSync,
  writeSync,
} from 'fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'path';

import {
  InterfaceChangeError,
  buildInterfaceChangeCurrent,
  buildInterfaceChangeEvent,
  buildInterfaceWorkPackageProjection,
  canonicalInterfaceChangeCurrentBytes,
  canonicalInterfaceChangeEventBytes,
  canonicalInterfaceChangeRequestBytes,
  canonicalInterfaceWorkPackageProjectionBytes,
  deriveInterfaceChangeOperationFingerprint,
  deriveInterfaceChangeTransitionId,
  validateInterfaceChangeCurrent,
  validateInterfaceChangeEvent,
  validateInterfaceChangeRequest,
  validateInterfaceChangeTransitionActor,
  validateInterfaceWorkPackageProjection,
  type InterfaceChangeActorV1,
  type InterfaceChangeCurrentV1,
  type InterfaceChangeEventV1,
  type InterfaceChangeRequestV1,
  type InterfaceChangeTransition,
  type InterfaceChangeTransitionInput,
  type InterfaceMaterializedWorkPackageRefV1,
  type InterfaceWorkPackageProjectionV1,
} from '../../core/engineers/interface-change';
import { EngineerProfileBindingError } from '../../core/engineers/profile-binding';
import {
  projectWorkGraph,
  schedulingCarrierPath,
  validateWorkGraph,
  type ProjectedWorkGraphV1,
  type WorkPackageDefinitionV1,
} from '../../core/engineers/scheduling';
import { projectCanonicalTasks } from '../../core/state/coordination-identity';
import { resolveGitCommonDirectory } from '../git/common-directory';
import { withExclusiveDirectoryLock } from '../locking/exclusive-directory-lock';
import { repoHarnessRepoIdFor } from '../repo-registry';
import { resolveRepoIdentity } from '../state/coordination-canonical-source';
import { readEngineerBindingStatus, withEngineerBindingLock } from './binding-store';
import { loadEngineerProfile } from './profile-store';

const STORE_RELATIVE_ROOT = 'repo-harness/interface-changes/v1';
type ImmutableKind = 'requests' | 'events' | 'transitions' | 'projections';

export type InterfaceChangeStoreErrorCode =
  | 'interface_change_store_not_found'
  | 'interface_change_store_conflict'
  | 'interface_change_store_unsafe_path'
  | 'interface_change_store_persistence_failed'
  | 'interface_change_materialization_invalid';

export class InterfaceChangeStoreError extends Error {
  constructor(readonly code: InterfaceChangeStoreErrorCode, message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'InterfaceChangeStoreError';
  }
}

export interface InterfacePlanningProjectionInput {
  readonly sprint_ref: string;
  readonly expected_work_graph_revision: string | null;
  readonly proposed_work_package: WorkPackageDefinitionV1;
}

export interface TransitionInterfaceChangeRequestInput {
  readonly repo_root: string;
  readonly request: InterfaceChangeRequestV1;
  readonly idempotency_key: string;
  readonly transition: InterfaceChangeTransition;
  readonly expected_current_digest: string | null;
  readonly actor: InterfaceChangeActorV1;
  readonly planning_projection: InterfacePlanningProjectionInput | null;
  readonly materialization_commit: string | null;
  readonly evidence_sha256: string | null;
  readonly crash_hook?: (boundary: 'before_event' | 'after_event_fsync' | 'after_current_fsync') => void;
}

interface StorePaths {
  readonly common: string;
  readonly root: string;
  readonly request_root: string;
  readonly current: string;
  readonly lock_relative: string;
}

function fail(code: InterfaceChangeStoreErrorCode, message: string, cause?: unknown): never {
  throw new InterfaceChangeStoreError(code, message, cause);
}

function digestHex(digest: string, label: string): string {
  if (!/^sha256:[0-9a-f]{64}$/u.test(digest)) fail('interface_change_store_unsafe_path', `${label} is invalid`);
  return digest.slice('sha256:'.length);
}

function requestKey(requestId: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(requestId)) fail('interface_change_store_unsafe_path', 'request_id is invalid');
  return createHash('sha256').update(requestId, 'utf8').digest('hex');
}

function storePaths(repoRoot: string, requestId: string): StorePaths {
  const common = resolveGitCommonDirectory(repoRoot);
  const root = resolve(common, STORE_RELATIVE_ROOT);
  const key = requestKey(requestId);
  const requestRoot = join(root, 'state', key);
  return { common, root, request_root: requestRoot, current: join(requestRoot, 'current.json'), lock_relative: `${STORE_RELATIVE_ROOT}/locks/${key}.lock` };
}

export function interfaceChangeStoreRoot(repoRoot: string): string {
  return resolve(resolveGitCommonDirectory(repoRoot), STORE_RELATIVE_ROOT);
}

function fsyncDirectory(path: string): void {
  const fd = openSync(path, constants.O_RDONLY);
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

function ensureDirectoryChain(root: string, target: string): void {
  const scoped = relative(root, target);
  if (!scoped || scoped === '..' || scoped.startsWith(`..${sep}`) || isAbsolute(scoped)) fail('interface_change_store_unsafe_path', 'store path escapes Git common dir');
  let current = root;
  for (const segment of scoped.split(sep)) {
    current = join(current, segment);
    try {
      const stat = lstatSync(current);
      if (!stat.isDirectory() || stat.isSymbolicLink()) fail('interface_change_store_unsafe_path', `unsafe store directory: ${current}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      try { mkdirSync(current, { mode: 0o700 }); } catch (mkdirError) {
        if ((mkdirError as NodeJS.ErrnoException).code !== 'EEXIST') throw mkdirError;
      }
      const stat = lstatSync(current);
      if (!stat.isDirectory() || stat.isSymbolicLink()) fail('interface_change_store_unsafe_path', `unsafe store directory: ${current}`);
      fsyncDirectory(dirname(current));
    }
  }
}

function prepareStore(paths: StorePaths): void {
  ensureDirectoryChain(paths.common, paths.root);
  ensureDirectoryChain(paths.common, join(paths.root, 'requests'));
  ensureDirectoryChain(paths.common, join(paths.root, 'events'));
  ensureDirectoryChain(paths.common, join(paths.root, 'transitions'));
  ensureDirectoryChain(paths.common, join(paths.root, 'projections'));
  ensureDirectoryChain(paths.common, join(paths.root, 'state'));
  ensureDirectoryChain(paths.common, paths.request_root);
}

function regularBytes(path: string, label: string): Buffer {
  let stat;
  try { stat = lstatSync(path); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fail('interface_change_store_not_found', `${label} is missing`);
    throw error;
  }
  if (!stat.isFile() || stat.isSymbolicLink()) fail('interface_change_store_unsafe_path', `${label} is not a regular file`);
  return readFileSync(path);
}

function immutablePath(paths: StorePaths, kind: ImmutableKind, digest: string): string {
  return join(paths.root, kind, `${digestHex(digest, `${kind} digest`)}.json`);
}

function writeAll(fd: number, bytes: Buffer): void {
  let offset = 0;
  while (offset < bytes.length) offset += writeSync(fd, bytes, offset, bytes.length - offset);
}

function persistImmutable(paths: StorePaths, kind: ImmutableKind, digest: string, canonical: string): void {
  prepareStore(paths);
  const target = immutablePath(paths, kind, digest);
  const bytes = Buffer.from(`${canonical}\n`, 'utf8');
  if (existsSync(target)) {
    if (!regularBytes(target, `${kind} evidence`).equals(bytes)) fail('interface_change_store_conflict', `${kind} digest already names different bytes`);
    return;
  }
  const temporary = join(dirname(target), `.${process.pid}.${randomUUID()}.tmp`);
  let fd: number | null = null;
  try {
    fd = openSync(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    writeAll(fd, bytes);
    fsyncSync(fd);
  } finally { if (fd !== null) closeSync(fd); }
  try {
    linkSync(temporary, target);
    fsyncDirectory(dirname(target));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') fail('interface_change_store_persistence_failed', `cannot persist ${kind}`, error);
    if (!regularBytes(target, `${kind} evidence`).equals(bytes)) fail('interface_change_store_conflict', `${kind} digest already names different bytes`);
  } finally {
    try { unlinkSync(temporary); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
}

function readImmutable<T>(
  paths: StorePaths,
  kind: ImmutableKind,
  digest: string,
  validate: (value: unknown) => T,
  canonical: (value: T) => string,
): T {
  const raw = regularBytes(immutablePath(paths, kind, digest), `${kind} evidence`);
  let parsed: unknown;
  try { parsed = JSON.parse(raw.toString('utf8')); } catch (error) { return fail('interface_change_store_conflict', `${kind} evidence is not JSON`, error); }
  let value: T;
  try { value = validate(parsed); } catch (error) { return fail('interface_change_store_conflict', `${kind} evidence is invalid`, error); }
  if (!raw.equals(Buffer.from(`${canonical(value)}\n`, 'utf8'))) fail('interface_change_store_conflict', `${kind} evidence is not canonical`);
  return value;
}

function currentOptional(paths: StorePaths): InterfaceChangeCurrentV1 | null {
  if (!existsSync(paths.current)) return null;
  const raw = regularBytes(paths.current, 'interface current');
  let current: InterfaceChangeCurrentV1;
  try { current = validateInterfaceChangeCurrent(JSON.parse(raw.toString('utf8'))); } catch (error) { return fail('interface_change_store_conflict', 'interface current is invalid', error); }
  if (!raw.equals(Buffer.from(`${canonicalInterfaceChangeCurrentBytes(current)}\n`, 'utf8'))) fail('interface_change_store_conflict', 'interface current is not canonical');
  return current;
}

function replaceCurrent(paths: StorePaths, current: InterfaceChangeCurrentV1): void {
  prepareStore(paths);
  const bytes = Buffer.from(`${canonicalInterfaceChangeCurrentBytes(current)}\n`, 'utf8');
  const temporary = join(paths.request_root, `.${process.pid}.${randomUUID()}.tmp`);
  let fd: number | null = null;
  try {
    fd = openSync(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    writeAll(fd, bytes);
    fsyncSync(fd);
  } finally { if (fd !== null) closeSync(fd); }
  try { renameSync(temporary, paths.current); fsyncDirectory(paths.request_root); } catch (error) {
    fail('interface_change_store_persistence_failed', 'cannot publish interface current', error);
  } finally { try { unlinkSync(temporary); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; } }
}

function validateEngineerActor(repoRoot: string, actor: InterfaceChangeActorV1, expectedCapability: string): void {
  if (actor.kind !== 'engineer') return;
  const principal = actor.principal;
  const profile = loadEngineerProfile(repoRoot, principal.engineer_id);
  if (profile.profile.capability_id !== expectedCapability) fail('interface_change_store_conflict', 'Engineer actor does not own required capability');
  const status = readEngineerBindingStatus(repoRoot, principal.engineer_id, principal.engineer_contract_revision);
  const binding = status.binding;
  if (!binding || status.current.state !== 'active' || binding.state !== 'active'
    || binding.binding_id !== principal.binding_id
    || binding.binding_generation !== principal.binding_generation
    || binding.engineer_contract_revision !== principal.engineer_contract_revision) {
    fail('interface_change_store_conflict', 'Engineer actor does not match exact current Binding');
  }
}

function actorCapability(request: InterfaceChangeRequestV1, transition: InterfaceChangeTransition): string | null {
  if (transition === 'propose' || transition === 'submit' || transition === 'cancel') return request.source_capability_id;
  if (transition === 'materialize' || transition === 'implemented') return request.target_capability_id;
  return null;
}

function exactCommit(repoRoot: string, revision: string): string {
  if (!/^[0-9a-f]{40,64}$/u.test(revision)) fail('interface_change_materialization_invalid', 'materialization commit is invalid');
  try {
    const exact = execFileSync('git', ['rev-parse', '--verify', `${revision}^{commit}`], { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    if (exact !== revision) fail('interface_change_materialization_invalid', 'materialization commit must be an exact object ID');
    return exact;
  } catch (error) {
    if (error instanceof InterfaceChangeStoreError) throw error;
    return fail('interface_change_materialization_invalid', 'materialization commit cannot be resolved', error);
  }
}

function gitText(repoRoot: string, commit: string, path: string): string | null {
  try { return execFileSync('git', ['show', `${commit}:${path}`], { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (error) {
    const stderr = String((error as { stderr?: unknown }).stderr ?? '');
    if (/does not exist|exists on disk, but not in|Path .* does not exist/u.test(stderr)) return null;
    return fail('interface_change_materialization_invalid', `cannot read ${path} at ${commit}`, error);
  }
}

function projectedGraphAt(repoRoot: string, repositoryId: string, sprintRef: string, commit: string): ProjectedWorkGraphV1 | null {
  const sprint = gitText(repoRoot, commit, sprintRef);
  if (sprint === null) fail('interface_change_materialization_invalid', 'tracked Sprint is absent at materialization commit');
  const carrier = gitText(repoRoot, commit, schedulingCarrierPath(sprintRef));
  if (carrier === null) return null;
  let graphValue: unknown;
  try { graphValue = JSON.parse(carrier); } catch (error) { return fail('interface_change_materialization_invalid', 'tracked Work Graph is invalid JSON', error); }
  let graph;
  try { graph = validateWorkGraph(graphValue); } catch (error) { return fail('interface_change_materialization_invalid', 'tracked Work Graph is invalid', error); }
  if (graph.repository_id !== repositoryId || graph.sprint_path !== sprintRef) fail('interface_change_materialization_invalid', 'tracked Work Graph identity does not match request projection');
  const tasks = projectCanonicalTasks({ repoIdentity: resolveRepoIdentity(repoRoot), sprintPath: sprintRef, sprintText: sprint }).map((task, index) => Object.freeze({ task_id: task.task_id, task_revision: task.task_revision, task_ref: task.row.task, status: task.row.status, row_order: index + 1 }));
  try { return projectWorkGraph(graph, tasks); } catch (error) { return fail('interface_change_materialization_invalid', 'tracked Work Graph cannot be projected through ME-1A', error); }
}

function firstParent(repoRoot: string, commit: string): string | null {
  try { return execFileSync('git', ['rev-parse', '--verify', `${commit}^`], { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
  catch { return null; }
}

function verifyMaterialization(
  repoRoot: string,
  request: InterfaceChangeRequestV1,
  projection: InterfaceWorkPackageProjectionV1,
  commitInput: string,
): InterfaceMaterializedWorkPackageRefV1 {
  const commit = exactCommit(repoRoot, commitInput);
  const parent = firstParent(repoRoot, commit);
  if (projection.expected_work_graph_revision !== null) {
    if (parent === null) fail('interface_change_materialization_invalid', 'materialization commit lacks parent for expected Work Graph fence');
    const previous = projectedGraphAt(repoRoot, request.repository_id, projection.sprint_ref, parent);
    if (previous?.work_graph_revision !== projection.expected_work_graph_revision) fail('interface_change_materialization_invalid', 'materialization parent Work Graph revision is stale');
  } else if (parent !== null && projectedGraphAt(repoRoot, request.repository_id, projection.sprint_ref, parent) !== null) {
    fail('interface_change_materialization_invalid', 'materialization expected no prior Work Graph');
  }
  const projected = projectedGraphAt(repoRoot, request.repository_id, projection.sprint_ref, commit);
  if (projected === null) fail('interface_change_materialization_invalid', 'materialized Work Graph is absent');
  const matches = projected.work_packages.filter((item) => item.work_package_id === projection.proposed_work_package.work_package_id);
  if (matches.length !== 1) fail('interface_change_materialization_invalid', 'materialized Work Package identity is absent or ambiguous');
  const item = matches[0];
  if (item.work_package_revision !== projection.proposed_work_package_revision || item.primary_capability !== request.target_capability_id) fail('interface_change_materialization_invalid', 'materialized Work Package bytes differ from accepted projection');
  return Object.freeze({
    repository_id: request.repository_id,
    sprint_ref: projection.sprint_ref,
    work_graph_revision: projected.work_graph_revision,
    work_package_id: item.work_package_id,
    work_package_revision: item.work_package_revision,
    materialized_commit: commit,
  });
}

function semanticTransitionInput(
  repoRoot: string,
  request: InterfaceChangeRequestV1,
  previous: InterfaceChangeCurrentV1 | null,
  input: TransitionInterfaceChangeRequestInput,
  paths: StorePaths,
): InterfaceChangeTransitionInput {
  let projection: InterfaceWorkPackageProjectionV1 | null = null;
  if (input.transition === 'accept') {
    if (!input.planning_projection || input.expected_current_digest === null) throw new InterfaceChangeError('interface_change_invalid', 'accept requires planning_projection and expected current');
    projection = buildInterfaceWorkPackageProjection({ request, accepted_from_current_digest: input.expected_current_digest, ...input.planning_projection });
  } else if (input.planning_projection !== null) throw new InterfaceChangeError('interface_change_invalid', 'only accept may include planning_projection');

  let materialization: InterfaceMaterializedWorkPackageRefV1 | null = null;
  if (input.transition === 'materialize') {
    if (input.materialization_commit === null || previous?.accepted_projection_sha256 === null || previous?.accepted_projection_sha256 === undefined) throw new InterfaceChangeError('interface_change_invalid', 'materialize requires exact commit and accepted projection');
    const accepted = readImmutable(paths, 'projections', previous.accepted_projection_sha256, validateInterfaceWorkPackageProjection, canonicalInterfaceWorkPackageProjectionBytes);
    materialization = verifyMaterialization(repoRoot, request, accepted, input.materialization_commit);
  } else if (input.materialization_commit !== null) throw new InterfaceChangeError('interface_change_invalid', 'only materialize may include materialization_commit');

  return {
    idempotency_key: input.idempotency_key,
    transition: input.transition,
    expected_current_digest: input.expected_current_digest,
    actor: input.actor,
    accepted_projection: projection,
    materialized_work_package_ref: materialization,
    evidence_sha256: input.evidence_sha256,
  };
}

export function transitionInterfaceChangeRequest(input: TransitionInterfaceChangeRequestInput): { readonly request: InterfaceChangeRequestV1; readonly event: InterfaceChangeEventV1; readonly current: InterfaceChangeCurrentV1 } {
  const repoRoot = resolve(input.repo_root);
  const request = validateInterfaceChangeRequest(input.request);
  if (repoHarnessRepoIdFor(repoRoot) !== request.repository_id) fail('interface_change_store_conflict', 'request repository_id does not match current repository');
  const actor = validateInterfaceChangeTransitionActor(request, input.transition, input.actor);
  const paths = storePaths(repoRoot, request.request_id);

  const transitionUnderRequestLock = () => {
    prepareStore(paths);
    return withExclusiveDirectoryLock(paths.common, paths.lock_relative, () => {
      prepareStore(paths);
      const previous = currentOptional(paths);
      const semantic = semanticTransitionInput(repoRoot, request, previous, input, paths);
      const transitionId = deriveInterfaceChangeTransitionId(request.request_id, input.idempotency_key);
      const transitionPath = immutablePath(paths, 'transitions', transitionId);
      let event: InterfaceChangeEventV1;
      if (existsSync(transitionPath)) {
        event = readImmutable(paths, 'transitions', transitionId, validateInterfaceChangeEvent, canonicalInterfaceChangeEventBytes);
        if (event.operation_fingerprint !== deriveInterfaceChangeOperationFingerprint(request, semantic)) fail('interface_change_store_conflict', 'idempotency key names different operation bytes');
        if (previous?.current_event_sha256 === event.event_sha256) return Object.freeze({ request, event, current: previous });
        const candidate = buildInterfaceChangeEvent(request, previous, semantic);
        if (candidate.event_sha256 !== event.event_sha256) fail('interface_change_store_conflict', 'stored transition does not match recoverable event bytes');
        persistImmutable(paths, 'events', event.event_sha256, canonicalInterfaceChangeEventBytes(event));
      } else {
        event = buildInterfaceChangeEvent(request, previous, semantic);
        persistImmutable(paths, 'requests', request.request_sha256, canonicalInterfaceChangeRequestBytes(request));
        if (semantic.accepted_projection !== null) {
          persistImmutable(paths, 'projections', semantic.accepted_projection.projection_sha256, canonicalInterfaceWorkPackageProjectionBytes(semantic.accepted_projection));
        }
        input.crash_hook?.('before_event');
        persistImmutable(paths, 'transitions', event.transition_id, canonicalInterfaceChangeEventBytes(event));
        persistImmutable(paths, 'events', event.event_sha256, canonicalInterfaceChangeEventBytes(event));
        input.crash_hook?.('after_event_fsync');
      }
      const current = buildInterfaceChangeCurrent(event, previous);
      replaceCurrent(paths, current);
      input.crash_hook?.('after_current_fsync');
      return Object.freeze({ request, event, current });
    }, { reclaimStaleEmptyDirectory: true, reclaimStaleOwner: true });
  };

  if (actor.kind === 'human') return transitionUnderRequestLock();
  const capability = actorCapability(request, input.transition);
  if (capability === null) throw new InterfaceChangeError('interface_change_invalid', `${input.transition} does not admit an Engineer actor`);
  try {
    return withEngineerBindingLock(repoRoot, actor.principal.engineer_id, () => {
      validateEngineerActor(repoRoot, actor, capability);
      return transitionUnderRequestLock();
    });
  } catch (error) {
    if (error instanceof EngineerProfileBindingError) return fail('interface_change_store_conflict', 'Engineer Binding changed before interface mutation', error);
    throw error;
  }
}

export function readInterfaceChangeStatus(repoRootInput: string, requestId: string): { readonly request: InterfaceChangeRequestV1; readonly current: InterfaceChangeCurrentV1 } {
  const repoRoot = resolve(repoRootInput);
  const paths = storePaths(repoRoot, requestId);
  const current = currentOptional(paths);
  if (current === null) return fail('interface_change_store_not_found', 'interface current is missing');
  const request = readImmutable(paths, 'requests', current.request_sha256, validateInterfaceChangeRequest, canonicalInterfaceChangeRequestBytes);
  const event = readImmutable(paths, 'events', current.current_event_sha256, validateInterfaceChangeEvent, canonicalInterfaceChangeEventBytes);
  if (request.request_id !== requestId
    || event.request_id !== requestId
    || event.request_sha256 !== request.request_sha256
    || event.request_revision !== current.request_revision
    || event.expected_current_digest !== current.previous_current_digest
    || event.next_state !== current.state) {
    fail('interface_change_store_conflict', 'request/event/current binding is invalid');
  }
  return Object.freeze({ request, current });
}

export function readInterfaceWorkPackageProjection(repoRootInput: string, digest: string): InterfaceWorkPackageProjectionV1 {
  const repoRoot = resolve(repoRootInput);
  const paths = storePaths(repoRoot, '00000000-0000-4000-8000-000000000000');
  return readImmutable(paths, 'projections', digest, validateInterfaceWorkPackageProjection, canonicalInterfaceWorkPackageProjectionBytes);
}

export interface InterfaceChangeReverseLookupV1 {
  readonly request_id: string;
  readonly request_sha256: string;
  readonly request_revision: number;
  readonly state: InterfaceChangeCurrentV1['state'];
  readonly accepted_projection_sha256: string;
  readonly materialized_work_package_ref: InterfaceMaterializedWorkPackageRefV1;
}

export function findInterfaceChangesByWorkPackage(
  repoRootInput: string,
  repositoryId: string,
  workPackageId: string,
  workPackageRevision: string,
): readonly InterfaceChangeReverseLookupV1[] {
  if (!/^repo_[0-9a-f]{16}$/u.test(repositoryId)
    || !/^[a-z0-9][a-z0-9-]{0,127}$/u.test(workPackageId)
    || !/^sha256:[0-9a-f]{64}$/u.test(workPackageRevision)) {
    return fail('interface_change_store_unsafe_path', 'reverse lookup identity is invalid');
  }
  const repoRoot = resolve(repoRootInput);
  const root = interfaceChangeStoreRoot(repoRoot);
  const stateRoot = join(root, 'state');
  if (!existsSync(stateRoot)) return Object.freeze([]);
  const stat = lstatSync(stateRoot);
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail('interface_change_store_unsafe_path', 'interface state root is unsafe');
  const results: InterfaceChangeReverseLookupV1[] = [];
  for (const entry of readdirSync(stateRoot, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory() || entry.isSymbolicLink() || !/^[0-9a-f]{64}$/u.test(entry.name)) continue;
    const currentPath = join(stateRoot, entry.name, 'current.json');
    if (!existsSync(currentPath)) continue;
    const raw = regularBytes(currentPath, 'interface current');
    let current: InterfaceChangeCurrentV1;
    try { current = validateInterfaceChangeCurrent(JSON.parse(raw.toString('utf8'))); } catch (error) { return fail('interface_change_store_conflict', 'interface current is invalid', error); }
    if (!raw.equals(Buffer.from(`${canonicalInterfaceChangeCurrentBytes(current)}\n`, 'utf8'))) fail('interface_change_store_conflict', 'interface current is not canonical');
    if (requestKey(current.request_id) !== entry.name) fail('interface_change_store_conflict', 'interface current is stored under the wrong request key');
    if (current.accepted_projection_sha256 === null || current.materialized_work_package_ref === null) continue;
    const paths = storePaths(repoRoot, current.request_id);
    const projection = readImmutable(paths, 'projections', current.accepted_projection_sha256, validateInterfaceWorkPackageProjection, canonicalInterfaceWorkPackageProjectionBytes);
    if (projection.proposed_work_package.work_package_id !== workPackageId || projection.proposed_work_package_revision !== workPackageRevision) continue;
    const materialized = current.materialized_work_package_ref;
    if (materialized.repository_id !== repositoryId || materialized.work_package_id !== workPackageId || materialized.work_package_revision !== workPackageRevision) continue;
    const { request } = readInterfaceChangeStatus(repoRoot, current.request_id);
    if (request.repository_id !== repositoryId) continue;
    results.push(Object.freeze({ request_id: request.request_id, request_sha256: request.request_sha256, request_revision: current.request_revision, state: current.state, accepted_projection_sha256: current.accepted_projection_sha256, materialized_work_package_ref: materialized }));
  }
  return Object.freeze(results.sort((a, b) => a.request_id.localeCompare(b.request_id)));
}
