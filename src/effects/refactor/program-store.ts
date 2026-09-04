import { constants, closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, writeSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { execFileSync } from 'child_process';
import {
  buildRefactorProgramEvent,
  canonicalRefactorProgramCurrentBytes,
  canonicalRefactorProgramDefinitionBytes,
  canonicalRefactorProgramEventBytes,
  foldRefactorProgramCurrent,
  validateRefactorProgramDefinition,
  validateRefactorProgramEvent,
  validateRefactorProgramCurrent,
  type RefactorProgramCurrentV1,
  type RefactorProgramDefinitionV1,
  type RefactorProgramEventV1,
  type RefactorProgramOperation,
} from '../../core/refactor/program-state';
import { loadRefactorPolicyAtRevision } from '../../core/refactor/policy';
import { withExclusiveDirectoryLock } from '../locking/exclusive-directory-lock';
import { resolveGitCommonDirectory } from '../git/common-directory';
import { readStoredProgramAuthorization } from '../automation/grant-store';

const ROOT = 'repo-harness/refactor-programs/v1';
const PROGRAM_ID = /^[a-zA-Z0-9_.:-]{1,160}$/u;

export class RefactorProgramStoreError extends Error {
  constructor(readonly code: 'refactor_mode_disabled' | 'refactor_program_not_found' | 'refactor_program_conflict' | 'refactor_program_reconciliation_required' | 'refactor_program_unsafe' | 'refactor_program_authorization_stale' | 'refactor_program_persistence_failed', message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'RefactorProgramStoreError';
  }
}
function fail(code: RefactorProgramStoreError['code'], message: string, cause?: unknown): never { throw new RefactorProgramStoreError(code, message, cause); }
function key(value: string): string { if (!PROGRAM_ID.test(value)) fail('refactor_program_unsafe', 'program id is invalid'); return Buffer.from(value).toString('hex'); }
function paths(repoRoot: string, programId: string) {
  const common = resolveGitCommonDirectory(repoRoot); const root = join(common, ROOT); const program = join(root, 'programs', key(programId));
  return { common, root, program, definition: join(program, 'program.json'), events: join(program, 'events'), transitions: join(program, 'transitions'), current: join(program, 'current.json'), lock: `${ROOT}/locks/${key(programId)}.lock` };
}
function ensure(path: string): void { mkdirSync(path, { recursive: true, mode: 0o700 }); const stat = lstatSync(path); if (!stat.isDirectory() || stat.isSymbolicLink()) fail('refactor_program_unsafe', `unsafe program directory: ${path}`); }
function atomic(path: string, bytes: Buffer): void {
  ensure(dirname(path)); const temp = join(dirname(path), `.${process.pid}.${Date.now()}.tmp`); let fd: number;
  try { fd = openSync(temp, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600); } catch (error) { return fail('refactor_program_persistence_failed', `cannot create ${path}`, error); }
  try { let offset = 0; while (offset < bytes.length) offset += writeSync(fd, bytes, offset, bytes.length - offset); fsyncSync(fd); } finally { closeSync(fd); }
  try { renameSync(temp, path); const dir = openSync(dirname(path), constants.O_RDONLY); try { fsyncSync(dir); } finally { closeSync(dir); } } catch (error) { fail('refactor_program_persistence_failed', `cannot publish ${path}`, error); }
}
function regular(path: string): Buffer { const stat = lstatSync(path); if (!stat.isFile() || stat.isSymbolicLink()) fail('refactor_program_unsafe', `unsafe program file: ${path}`); return readFileSync(path); }
function immutable(path: string, bytes: Buffer): void { if (existsSync(path)) { if (!regular(path).equals(bytes)) fail('refactor_program_conflict', `${path} names different immutable bytes`); return; } atomic(path, bytes); }
function parse<T>(path: string, validate: (value: unknown) => T, canonical: (value: T) => string): T {
  const bytes = regular(path); let value: T; try { value = validate(JSON.parse(bytes.toString('utf8'))); } catch (error) { return fail('refactor_program_conflict', `${path} is invalid`, error); }
  if (!bytes.equals(Buffer.from(`${canonical(value)}\n`))) fail('refactor_program_conflict', `${path} is not canonical`); return value;
}
function eventFiles(path: string): string[] {
  if (!existsSync(path)) return [];
  return readdirSync(path, { withFileTypes: true }).map((entry) => {
    if (!entry.isFile() || !/^\d{8}-[a-f0-9]{64}\.json$/u.test(entry.name)) fail('refactor_program_unsafe', `unexpected event entry: ${entry.name}`);
    return entry.name;
  }).sort();
}
function rebuild(value: ReturnType<typeof paths>, program: RefactorProgramDefinitionV1): { events: RefactorProgramEventV1[]; current: RefactorProgramCurrentV1 | null } {
  const events = eventFiles(value.events).map((name) => {
    const event = parse(join(value.events, name), validateRefactorProgramEvent, canonicalRefactorProgramEventBytes);
    const expected = `${String(event.revision).padStart(8, '0')}-${event.event_sha256.slice(7)}.json`;
    if (name !== expected) fail('refactor_program_conflict', `event filename does not bind its immutable content: ${name}`);
    return event;
  });
  return { events, current: events.length ? foldRefactorProgramCurrent(program, events) : null };
}
function assertCurrentProjection(value: ReturnType<typeof paths>, current: RefactorProgramCurrentV1 | null): void {
  if (!existsSync(value.current)) return;
  try {
    const stored = parse(value.current, validateRefactorProgramCurrent, canonicalRefactorProgramCurrentBytes);
    if (!current || stored.current_sha256 !== current.current_sha256) fail('refactor_program_reconciliation_required', 'current projection does not match durable events');
  } catch (error) {
    if (error instanceof RefactorProgramStoreError && error.code === 'refactor_program_reconciliation_required') throw error;
    fail('refactor_program_reconciliation_required', 'current projection is invalid and must be reconciled from durable events', error);
  }
}
function targetRevision(repoRoot: string, ref: string): string {
  try { return execFileSync('git', ['rev-parse', '--verify', `${ref}^{commit}`], { cwd: repoRoot, encoding: 'utf8' }).trim(); }
  catch (error) { return fail('refactor_program_authorization_stale', `cannot resolve authorized target ref ${ref}`, error); }
}
function assertAuthorityBinding(repoRoot: string, program: RefactorProgramDefinitionV1, env: NodeJS.ProcessEnv) {
  const grant = readStoredProgramAuthorization(repoRoot, program.authorization_sha256, env);
  if (grant.authorization_id !== program.authorization_id || grant.repository_id !== program.repository_id
    || grant.target_ref !== program.target_ref || grant.target_revision !== program.target_revision) fail('refactor_program_authorization_stale', 'program authorization binding is stale');
  return grant;
}

const SHADOW_OPERATIONS = new Set<RefactorProgramOperation>([
  'create', 'begin_scan', 'observe', 'begin_authoring', 'assess', 'begin_route',
  'require_proof', 'require_architecture_approval', 'mark_stale', 'block', 'require_reconciliation', 'stop',
]);

function assertOperationEnabled(repoRoot: string, program: RefactorProgramDefinitionV1, operation: RefactorProgramOperation, env: NodeJS.ProcessEnv, ownedTargetRevision?: string): void {
  const grant = assertAuthorityBinding(repoRoot, program, env);
  if (Date.parse(grant.expires_at) <= Date.now()) fail('refactor_program_authorization_stale', 'program authorization expired');
  const currentTarget = targetRevision(repoRoot, grant.target_ref);
  if (operation !== 'mark_stale' && currentTarget !== grant.target_revision) {
    if (ownedTargetRevision !== currentTarget) fail('refactor_program_authorization_stale', 'authorized target ref moved');
    if (operation === 'begin_plan') {
      let parent: string;
      try { parent = execFileSync('git', ['rev-parse', '--verify', `${currentTarget}^1`], { cwd: repoRoot, encoding: 'utf8' }).trim(); }
      catch (error) { return fail('refactor_program_authorization_stale', 'materialized target has no verifiable parent', error); }
      if (parent !== grant.target_revision) fail('refactor_program_authorization_stale', 'materialized target is not the exact authorized child commit');
    } else if (['begin_merge', 'begin_post_merge_measure', 'begin_resolve', 'complete', 'require_reconciliation'].includes(operation)) {
      try { execFileSync('git', ['merge-base', '--is-ancestor', grant.target_revision, currentTarget], { cwd: repoRoot, stdio: 'ignore' }); }
      catch (error) { return fail('refactor_program_authorization_stale', 'post-merge target is not descended from the authorized revision', error); }
    } else fail('refactor_program_authorization_stale', 'authorized target ref moved');
  }
  const policy = loadRefactorPolicyAtRevision(repoRoot, program.target_revision);
  if (policy.mode === 'off') fail('refactor_mode_disabled', 'refactor mode is off at the authorized target revision');
  if (policy.mode === 'shadow' && !SHADOW_OPERATIONS.has(operation)) fail('refactor_mode_disabled', `${operation} is forbidden while refactor mode is shadow`);
}

export interface AppendRefactorProgramEventInput {
  readonly repo_root: string; readonly program_id: string; readonly expected_current_sha256: string | null;
  readonly idempotency_key: string; readonly operation: RefactorProgramOperation; readonly evidence_refs?: readonly string[];
  readonly observed_at: string; readonly env?: NodeJS.ProcessEnv;
  /** Exact effect-owned target revision for Module 6 materialization or Module 9 post-merge transitions. */
  readonly owned_target_revision?: string;
}

function appendLocked(value: ReturnType<typeof paths>, program: RefactorProgramDefinitionV1, input: AppendRefactorProgramEventInput) {
  assertOperationEnabled(input.repo_root, program, input.operation, input.env ?? process.env, input.owned_target_revision);
  ensure(value.events); ensure(value.transitions); const rebuilt = rebuild(value, program); assertCurrentProjection(value, rebuilt.current); const previous = rebuilt.current;
  const transition = join(value.transitions, `${Buffer.from(input.idempotency_key).toString('hex')}.json`);
  const build = (revision: number, previousState: RefactorProgramCurrentV1 | null, previousEvent: string | null) => buildRefactorProgramEvent({ program_id: program.program_id, revision, idempotency_key: input.idempotency_key, operation: input.operation, previous_state: previousState?.state ?? null, evidence_refs: input.evidence_refs ?? [], observed_at: input.observed_at, previous_event_sha256: previousEvent });
  if (existsSync(transition)) {
    const stored = parse(transition, validateRefactorProgramEvent, canonicalRefactorProgramEventBytes);
    const replayPrevious = stored.revision === 1 ? null : foldRefactorProgramCurrent(program, rebuilt.events.slice(0, stored.revision - 1));
    const sameRequest = stored.program_id === program.program_id && stored.idempotency_key === input.idempotency_key
      && stored.operation === input.operation
      && stored.observed_at === input.observed_at
      && (replayPrevious?.current_sha256 ?? null) === input.expected_current_sha256
      && stored.evidence_refs.length === (input.evidence_refs ?? []).length
      && stored.evidence_refs.every((entry, index) => entry === (input.evidence_refs ?? [])[index]);
    if (!sameRequest) fail('refactor_program_conflict', 'idempotency key names another transition');
    return { event: stored, current: rebuilt.current ?? foldRefactorProgramCurrent(program, [stored]) };
  }
  if ((previous?.current_sha256 ?? null) !== input.expected_current_sha256) fail('refactor_program_conflict', 'program current revision changed');
  const event = build((previous?.revision ?? 0) + 1, previous, previous?.current_event_sha256 ?? null);
  const bytes = Buffer.from(`${canonicalRefactorProgramEventBytes(event)}\n`);
  immutable(join(value.events, `${String(event.revision).padStart(8, '0')}-${event.event_sha256.slice(7)}.json`), bytes);
  immutable(transition, bytes);
  const current = foldRefactorProgramCurrent(program, [...rebuilt.events, event]);
  atomic(value.current, Buffer.from(`${canonicalRefactorProgramCurrentBytes(current)}\n`));
  return { event, current };
}

export function createRefactorProgram(input: { readonly repo_root: string; readonly program: RefactorProgramDefinitionV1; readonly idempotency_key: string; readonly env?: NodeJS.ProcessEnv }) {
  const repoRoot = resolve(input.repo_root); const program = validateRefactorProgramDefinition(input.program); const value = paths(repoRoot, program.program_id); const env = input.env ?? process.env;
  assertOperationEnabled(repoRoot, program, 'create', env);
  return withExclusiveDirectoryLock(value.common, value.lock, () => {
    assertOperationEnabled(repoRoot, program, 'create', env); ensure(value.program); const bytes = Buffer.from(`${canonicalRefactorProgramDefinitionBytes(program)}\n`); immutable(value.definition, bytes);
    const existing = rebuild(value, program);
    if (existing.current) {
      if (existing.events[0]?.idempotency_key !== input.idempotency_key) fail('refactor_program_conflict', 'program was created under another idempotency key');
      return { program, event: existing.events[0]!, current: existing.current };
    }
    const result = appendLocked(value, program, { repo_root: repoRoot, program_id: program.program_id, expected_current_sha256: null, idempotency_key: input.idempotency_key, operation: 'create', observed_at: program.created_at, env });
    return Object.freeze({ program, ...result });
  }, { reclaimStaleEmptyDirectory: true, reclaimStaleOwner: true });
}

export function appendRefactorProgramEvent(input: AppendRefactorProgramEventInput) {
  const repoRoot = resolve(input.repo_root); const value = paths(repoRoot, input.program_id); const env = input.env ?? process.env;
  return withExclusiveDirectoryLock(value.common, value.lock, () => {
    if (!existsSync(value.definition)) fail('refactor_program_not_found', 'refactor program is missing');
    const program = parse(value.definition, validateRefactorProgramDefinition, canonicalRefactorProgramDefinitionBytes);
    return Object.freeze({ program, ...appendLocked(value, program, input) });
  }, { reclaimStaleEmptyDirectory: true, reclaimStaleOwner: true });
}

export function readRefactorProgramStatus(repoRootInput: string, programId: string, env: NodeJS.ProcessEnv = process.env) {
  const repoRoot = resolve(repoRootInput); const value = paths(repoRoot, programId); if (!existsSync(value.definition)) fail('refactor_program_not_found', 'refactor program is missing');
  const program = parse(value.definition, validateRefactorProgramDefinition, canonicalRefactorProgramDefinitionBytes); assertAuthorityBinding(repoRoot, program, env); const rebuilt = rebuild(value, program);
  if (!rebuilt.current) fail('refactor_program_conflict', 'refactor program has no event chain');
  assertCurrentProjection(value, rebuilt.current);
  return Object.freeze({ program, current: rebuilt.current, events: Object.freeze(rebuilt.events) });
}

export function listRefactorPrograms(repoRootInput: string): readonly string[] {
  const root = join(resolveGitCommonDirectory(resolve(repoRootInput)), ROOT, 'programs'); if (!existsSync(root)) return Object.freeze([]);
  return Object.freeze(readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => Buffer.from(entry.name, 'hex').toString('utf8')).filter((entry) => PROGRAM_ID.test(entry)).sort());
}
