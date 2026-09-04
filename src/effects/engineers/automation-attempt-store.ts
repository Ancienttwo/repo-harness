import { closeSync, constants, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeSync } from 'fs';
import { randomUUID } from 'crypto';
import { dirname, join } from 'path';
import { attemptIdentity, buildTaskAutomationAttempt, completeTaskAutomationAttempt, projectAttemptCurrent, validateTaskAutomationAttempt, validateTaskAutomationAttemptCurrent, type TaskAutomationAttemptCurrentV1, type TaskAutomationAttemptOutcome, type TaskAutomationAttemptV1 } from '../../core/engineers/automation-attempt';
import type { WorkPackageRetryPolicyV1 } from '../../core/engineers/scheduling';
import { resolveGitCommonDirectory } from '../git/common-directory';
import { withExclusiveDirectoryLock } from '../locking/exclusive-directory-lock';

function safe(value: string, pattern: RegExp, label: string): string { if (!pattern.test(value)) throw new Error(`${label} is unsafe`); return value; }
function root(repoRoot: string, workPackageId: string, revision: string) { const base = join(resolveGitCommonDirectory(repoRoot), 'repo-harness/engineer-attempts/v1', safe(workPackageId, /^[a-z0-9][a-z0-9-]{0,127}$/u, 'work_package_id'), safe(revision, /^sha256:[0-9a-f]{64}$/u, 'work_package_revision').slice(7)); return { base, attempts: join(base, 'attempts'), identities: join(base, 'identities'), current: join(base, 'current.json') }; }
function atomic(path: string, value: unknown): void { mkdirSync(dirname(path), { recursive: true, mode: 0o700 }); const temporary = `${path}.tmp-${process.pid}-${randomUUID()}`; const bytes = Buffer.from(`${JSON.stringify(value)}\n`); const fd = openSync(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600); try { let offset=0; while(offset<bytes.length) offset += writeSync(fd, bytes, offset); fsyncSync(fd); } finally { closeSync(fd); } renameSync(temporary, path); const directory=openSync(dirname(path), constants.O_RDONLY); try { fsyncSync(directory); } finally { closeSync(directory); } }
function parse(path: string): unknown { return JSON.parse(readFileSync(path, 'utf8')); }
function readAttempt(path: string): TaskAutomationAttemptV1 { return validateTaskAutomationAttempt(parse(path)); }
function readCurrent(path: string): TaskAutomationAttemptCurrentV1 { return validateTaskAutomationAttemptCurrent(parse(path)); }
function attemptPath(paths: ReturnType<typeof root>, sequence: number): string { return join(paths.attempts, `${String(sequence).padStart(6, '0')}.json`); }
function listAttempts(paths: ReturnType<typeof root>): TaskAutomationAttemptV1[] { const current = existsSync(paths.current) ? readCurrent(paths.current) : null; if (current === null) return []; const attempts: TaskAutomationAttemptV1[] = []; for (let sequence = 1; sequence <= current.attempt_count; sequence += 1) attempts.push(readAttempt(attemptPath(paths, sequence))); return attempts; }
function lock<T>(repoRoot: string, workPackageId: string, run: () => T): T { return withExclusiveDirectoryLock(resolveGitCommonDirectory(repoRoot), `repo-harness/engineer-attempts/v1/locks/${safe(workPackageId, /^[a-z0-9][a-z0-9-]{0,127}$/u, 'work_package_id')}.lock`, run); }

export interface StartTaskAutomationAttemptInput extends Omit<TaskAutomationAttemptV1, 'protocol' | 'kind' | 'sequence' | 'started_at' | 'ended_at' | 'outcome' | 'runtime_effect_id' | 'evidence_refs' | 'previous_attempt_sha256' | 'attempt_sha256'> {
  readonly repo_root: string; readonly policy: WorkPackageRetryPolicyV1; readonly started_at: string; readonly first_eligible_at: string;
}
export function recordTaskAutomationAttemptStart(input: StartTaskAutomationAttemptInput): { readonly attempt: TaskAutomationAttemptV1; readonly current: TaskAutomationAttemptCurrentV1 } {
  return lock(input.repo_root, input.work_package_id, () => {
    const paths = root(input.repo_root, input.work_package_id, input.work_package_revision); const attempts = listAttempts(paths); const identity = attemptIdentity(input);
    const identityPath = join(paths.identities, `${identity.slice(7)}.json`);
    if (existsSync(identityPath)) { const existing = readAttempt(identityPath); if (!existsSync(paths.current)) throw new Error('automation attempt start requires reconciliation after interrupted persistence'); return Object.freeze({ attempt: existing, current: readCurrent(paths.current) }); }
    const previous = attempts.at(-1) ?? null; if (previous?.outcome === 'started') throw new Error('previous automation attempt requires reconciliation');
    if (attempts.length >= input.policy.max_automated_attempts) throw new Error('automated attempt limit is exhausted');
    const { repo_root: _repoRoot, policy: _policy, first_eligible_at: _firstEligible, ...identityFields } = input;
    const attempt = buildTaskAutomationAttempt({ ...identityFields, sequence: attempts.length + 1, started_at: input.started_at, ended_at: null, outcome: 'started', runtime_effect_id: null, evidence_refs: [], previous_attempt_sha256: previous?.attempt_sha256 ?? null });
    atomic(attemptPath(paths, attempt.sequence), attempt); atomic(identityPath, attempt);
    const current = projectAttemptCurrent({ repository_id: input.repository_id, work_package_id: input.work_package_id, work_package_revision: input.work_package_revision, policy: input.policy, attempts: [...attempts, attempt], first_eligible_at: attempts.length === 0 ? input.first_eligible_at : readCurrent(paths.current).first_eligible_at }); atomic(paths.current, current); return Object.freeze({ attempt, current });
  });
}
export function recordTaskAutomationAttemptOutcome(input: { readonly repo_root: string; readonly work_package_id: string; readonly work_package_revision: string; readonly policy: WorkPackageRetryPolicyV1; readonly identity_sha256: string; readonly outcome: Exclude<TaskAutomationAttemptOutcome, 'started'>; readonly ended_at: string; readonly runtime_effect_id: string | null; readonly evidence_refs: readonly string[] }): { readonly attempt: TaskAutomationAttemptV1; readonly current: TaskAutomationAttemptCurrentV1 } {
  return lock(input.repo_root, input.work_package_id, () => {
    const paths = root(input.repo_root, input.work_package_id, input.work_package_revision); const identityPath = join(paths.identities, `${safe(input.identity_sha256, /^sha256:[0-9a-f]{64}$/u, 'identity_sha256').slice(7)}.json`); if (!existsSync(identityPath)) throw new Error('automation attempt identity is unknown');
    const stored = readAttempt(identityPath); if (stored.outcome !== 'started') { if (stored.outcome !== input.outcome || stored.ended_at !== input.ended_at || stored.runtime_effect_id !== input.runtime_effect_id || JSON.stringify(stored.evidence_refs) !== JSON.stringify(input.evidence_refs)) throw new Error('automation attempt outcome conflicts with its replay'); return Object.freeze({ attempt: stored, current: readCurrent(paths.current) }); }
    const completed = completeTaskAutomationAttempt(stored, input); atomic(attemptPath(paths, stored.sequence), completed); atomic(identityPath, completed);
    const attempts = listAttempts(paths); attempts[stored.sequence - 1] = completed; const previousCurrent = readCurrent(paths.current);
    const current = projectAttemptCurrent({ repository_id: stored.repository_id, work_package_id: stored.work_package_id, work_package_revision: stored.work_package_revision, policy: input.policy, attempts, first_eligible_at: previousCurrent.first_eligible_at }); atomic(paths.current, current); return Object.freeze({ attempt: completed, current });
  });
}
export function readTaskAutomationAttemptCurrent(repoRoot: string, workPackageId: string, revision: string): TaskAutomationAttemptCurrentV1 | null { const paths = root(repoRoot, workPackageId, revision); return existsSync(paths.current) ? readCurrent(paths.current) : null; }
