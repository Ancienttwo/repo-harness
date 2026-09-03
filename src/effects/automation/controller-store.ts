import { createHash, randomUUID } from 'crypto';
import { closeSync, constants, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, writeSync } from 'fs';
import { dirname, join, resolve } from 'path';

import {
  buildAutomationControllerEvent,
  canonicalAutomationControllerCurrentBytes,
  canonicalAutomationControllerEventBytes,
  canonicalAutomationControllerRunBytes,
  foldAutomationControllerCurrent,
  validateAutomationControllerCurrent,
  validateAutomationControllerEvent,
  validateAutomationControllerRun,
  type AutomationControllerAttentionOwner,
  type AutomationControllerCurrentV1,
  type AutomationControllerEventV1,
  type AutomationControllerOperation,
  type AutomationControllerRunV1,
  type AutomationControllerStepReceiptV1,
} from '../../core/automation/controller';
import { resolveGitCommonDirectory } from '../git/common-directory';
import { withExclusiveDirectoryLock } from '../locking/exclusive-directory-lock';

const ROOT = 'repo-harness/automation-controllers/v1';
const RUN_ID = /^sha256:[0-9a-f]{64}$/u;

export class AutomationControllerStoreError extends Error {
  constructor(readonly code: 'automation_controller_not_found' | 'automation_controller_conflict' | 'automation_controller_unsafe_path' | 'automation_controller_persistence_failed', message: string, readonly cause?: unknown) {
    super(message); this.name = 'AutomationControllerStoreError';
  }
}

function fail(code: AutomationControllerStoreError['code'], message: string, cause?: unknown): never { throw new AutomationControllerStoreError(code, message, cause); }
function safeRunId(value: string): string { if (!RUN_ID.test(value)) fail('automation_controller_unsafe_path', 'controller run_id is invalid'); return value; }
function fileKey(value: string): string { return createHash('sha256').update(value, 'utf8').digest('hex'); }
function shaName(value: string): string { if (!/^sha256:[0-9a-f]{64}$/u.test(value)) fail('automation_controller_unsafe_path', 'digest is invalid'); return value.slice(7); }
function paths(repoRoot: string, runId: string) {
  const common = resolveGitCommonDirectory(repoRoot); const root = join(common, ROOT); const name = safeRunId(runId).slice(7); const run = join(root, 'runs', name);
  return { common, root, run, definition: join(run, 'run.json'), current: join(run, 'current.json'), lock: `${ROOT}/locks/runs/${name}.lock` };
}
function ensure(path: string): void { mkdirSync(path, { recursive: true, mode: 0o700 }); const stat = lstatSync(path); if (!stat.isDirectory() || stat.isSymbolicLink()) fail('automation_controller_unsafe_path', `unsafe controller directory: ${path}`); }
function prepare(value: ReturnType<typeof paths>): void { for (const path of [value.root, join(value.root, 'runs'), join(value.root, 'events'), join(value.root, 'transitions'), join(value.root, 'engineers'), value.run]) ensure(path); }
function regular(path: string): Buffer { const stat = lstatSync(path); if (!stat.isFile() || stat.isSymbolicLink()) fail('automation_controller_unsafe_path', `unsafe controller file: ${path}`); return readFileSync(path); }
function atomic(path: string, bytes: Buffer): void {
  ensure(dirname(path)); const temp = join(dirname(path), `.${process.pid}.${randomUUID()}.tmp`); let fd: number;
  try { fd = openSync(temp, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600); } catch (error) { return fail('automation_controller_persistence_failed', `cannot create controller temporary for ${path}`, error); }
  try { let offset = 0; while (offset < bytes.length) offset += writeSync(fd, bytes, offset, bytes.length - offset); fsyncSync(fd); } finally { closeSync(fd); }
  try { renameSync(temp, path); const directory = openSync(dirname(path), constants.O_RDONLY); try { fsyncSync(directory); } finally { closeSync(directory); } } catch (error) { fail('automation_controller_persistence_failed', `cannot publish controller file ${path}`, error); }
}
function immutable(path: string, bytes: Buffer): void { if (existsSync(path)) { if (!regular(path).equals(bytes)) fail('automation_controller_conflict', `${path} names different immutable bytes`); return; } atomic(path, bytes); }
function parse<T>(path: string, validate: (value: unknown) => T, canonical: (value: T) => string): T {
  const raw = regular(path); let value: T; try { value = validate(JSON.parse(raw.toString('utf8'))); } catch (error) { return fail('automation_controller_conflict', `${path} is invalid`, error); }
  if (!raw.equals(Buffer.from(`${canonical(value)}\n`, 'utf8'))) fail('automation_controller_conflict', `${path} is not canonical`); return value;
}
function current(value: ReturnType<typeof paths>): AutomationControllerCurrentV1 | null { return existsSync(value.current) ? parse(value.current, validateAutomationControllerCurrent, canonicalAutomationControllerCurrentBytes) : null; }

export interface AppendAutomationControllerEventInput {
  readonly repo_root: string;
  readonly run_id: string;
  readonly expected_current_sha256: string | null;
  readonly idempotency_key: string;
  readonly operation: AutomationControllerOperation;
  readonly attention_owner: AutomationControllerAttentionOwner;
  readonly blocker: string | null;
  readonly retry_at: string | null;
  readonly receipt: AutomationControllerStepReceiptV1;
  readonly observed_at: string;
  readonly crash_hook?: (boundary: 'after_event_fsync' | 'after_current_fsync') => void;
}

function appendLocked(value: ReturnType<typeof paths>, run: AutomationControllerRunV1, input: AppendAutomationControllerEventInput): { readonly event: AutomationControllerEventV1; readonly current: AutomationControllerCurrentV1 } {
  prepare(value); const previous = current(value); const transitionPath = join(value.root, 'transitions', `${fileKey(`${run.run_id}\0${input.idempotency_key}`)}.json`);
  if (existsSync(transitionPath)) {
    const stored = parse(transitionPath, validateAutomationControllerEvent, canonicalAutomationControllerEventBytes);
    const candidate = buildAutomationControllerEvent({ run_id: run.run_id, revision: stored.revision, idempotency_key: input.idempotency_key, operation: input.operation, previous_state: stored.previous_state, attention_owner: input.attention_owner, blocker: input.blocker, retry_at: input.retry_at, receipt: input.receipt, observed_at: input.observed_at, previous_event_sha256: stored.previous_event_sha256 });
    if (candidate.event_sha256 !== stored.event_sha256) fail('automation_controller_conflict', 'controller idempotency key names another operation');
    if (previous?.current_event_sha256 === stored.event_sha256) return Object.freeze({ event: stored, current: previous });
    if ((previous?.current_sha256 ?? null) === input.expected_current_sha256
      && stored.previous_event_sha256 === (previous?.current_event_sha256 ?? null)) {
      const repaired = foldAutomationControllerCurrent(run, previous, stored);
      atomic(value.current, Buffer.from(`${canonicalAutomationControllerCurrentBytes(repaired)}\n`, 'utf8'));
      return Object.freeze({ event: stored, current: repaired });
    }
    fail('automation_controller_conflict', 'persisted controller event is not the current chain head');
  }
  const expected = previous?.current_sha256 ?? null;
  if (input.expected_current_sha256 !== expected) fail('automation_controller_conflict', `controller current changed: expected ${input.expected_current_sha256 ?? 'absent'}, found ${expected ?? 'absent'}`);
  const event = buildAutomationControllerEvent({ run_id: run.run_id, revision: (previous?.revision ?? 0) + 1, idempotency_key: input.idempotency_key, operation: input.operation, previous_state: previous?.state ?? null, attention_owner: input.attention_owner, blocker: input.blocker, retry_at: input.retry_at, receipt: input.receipt, observed_at: input.observed_at, previous_event_sha256: previous?.current_event_sha256 ?? null });
  const bytes = Buffer.from(`${canonicalAutomationControllerEventBytes(event)}\n`, 'utf8'); immutable(join(value.root, 'events', `${shaName(event.event_sha256)}.json`), bytes); immutable(transitionPath, bytes); input.crash_hook?.('after_event_fsync');
  const next = foldAutomationControllerCurrent(run, previous, event); atomic(value.current, Buffer.from(`${canonicalAutomationControllerCurrentBytes(next)}\n`, 'utf8')); input.crash_hook?.('after_current_fsync'); return Object.freeze({ event, current: next });
}

export function startAutomationControllerRun(input: { readonly repo_root: string; readonly run: AutomationControllerRunV1; readonly idempotency_key: string; readonly observed_at: string; readonly crash_hook?: AppendAutomationControllerEventInput['crash_hook'] }): { readonly run: AutomationControllerRunV1; readonly event: AutomationControllerEventV1; readonly current: AutomationControllerCurrentV1 } {
  const repoRoot = resolve(input.repo_root); const run = validateAutomationControllerRun(input.run); const value = paths(repoRoot, run.run_id);
  return withExclusiveDirectoryLock(value.common, `${ROOT}/locks/engineers/${fileKey(run.principal.engineer_id)}.lock`, () => withExclusiveDirectoryLock(value.common, value.lock, () => {
    prepare(value); const bytes = Buffer.from(`${canonicalAutomationControllerRunBytes(run)}\n`, 'utf8'); immutable(value.definition, bytes);
    const pointer = join(value.root, 'engineers', `${fileKey(run.principal.engineer_id)}.json`);
    if (existsSync(pointer)) { const active = regular(pointer).toString('utf8').trim(); if (active !== run.run_id) fail('automation_controller_conflict', `Engineer already has controller run ${active}`); } else atomic(pointer, Buffer.from(`${run.run_id}\n`, 'utf8'));
    const result = appendLocked(value, run, { repo_root: repoRoot, run_id: run.run_id, expected_current_sha256: null, idempotency_key: input.idempotency_key, operation: 'start', attention_owner: 'none', blocker: null, retry_at: null, receipt: { operation: 'start', outcome: 'created', work_package_id: null, task_id: null, claim_id: null, lease_generation: null, work_envelope_sha256: null, dispatch_id: null, runtime_effect_id: null, evidence_refs: [] }, observed_at: input.observed_at, crash_hook: input.crash_hook });
    return Object.freeze({ run, ...result });
  }, { reclaimStaleEmptyDirectory: true, reclaimStaleOwner: true }), { reclaimStaleEmptyDirectory: true, reclaimStaleOwner: true });
}

export function appendAutomationControllerEvent(input: AppendAutomationControllerEventInput): { readonly run: AutomationControllerRunV1; readonly event: AutomationControllerEventV1; readonly current: AutomationControllerCurrentV1 } {
  const repoRoot = resolve(input.repo_root); const value = paths(repoRoot, input.run_id);
  return withExclusiveDirectoryLock(value.common, value.lock, () => { if (!existsSync(value.definition)) fail('automation_controller_not_found', 'controller run is missing'); const run = parse(value.definition, validateAutomationControllerRun, canonicalAutomationControllerRunBytes); return Object.freeze({ run, ...appendLocked(value, run, input) }); }, { reclaimStaleEmptyDirectory: true, reclaimStaleOwner: true });
}

export function readAutomationControllerStatus(repoRootInput: string, runId: string): { readonly run: AutomationControllerRunV1; readonly current: AutomationControllerCurrentV1 } {
  const value = paths(resolve(repoRootInput), runId); if (!existsSync(value.definition) || !existsSync(value.current)) fail('automation_controller_not_found', 'controller run is missing'); return Object.freeze({ run: parse(value.definition, validateAutomationControllerRun, canonicalAutomationControllerRunBytes), current: current(value)! });
}

export function listAutomationControllerRuns(repoRootInput: string): readonly ReturnType<typeof readAutomationControllerStatus>[] {
  const repoRoot = resolve(repoRootInput); const root = join(resolveGitCommonDirectory(repoRoot), ROOT, 'runs'); if (!existsSync(root)) return Object.freeze([]);
  return Object.freeze(readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory() && /^[0-9a-f]{64}$/u.test(entry.name)).map((entry) => readAutomationControllerStatus(repoRoot, `sha256:${entry.name}`)).sort((left, right) => left.run.created_at.localeCompare(right.run.created_at) || left.run.run_id.localeCompare(right.run.run_id)));
}
