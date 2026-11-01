import { expect, test } from 'bun:test';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { canonicalize } from '../../src/core/evidence/canonical-json';
import { observeTaskSessionAdmission, collectTaskResult, startTaskAgent, taskSessionDirectory,
  ensureSessionDirectory, writeSessionArtifact, type HerdrTaskBinding, type TaskRequest } from '../../src/effects/terminal/task-session';
import { taskRepository } from '../../src/effects/git/task-repository';
import { seedReviewAdmissionFixture } from '../helpers/review-admission-fixture';
import { tmpWorkspace, initGitRepo, commitAll, run } from '../helpers/repo-fixture';

const claim = { reference: 'https://github.com/acme/widgets/issues/903#issuecomment-1', revision: `sha256:${'c'.repeat(64)}` };
const spec = { task: 'review-fixture', role: 'deep-reasoner', harness_kind: 'codex' };
function fixture() {
  const directory = tmpWorkspace('task-session-admission');
  const root = join(directory, 'owner'), execution = join(directory, 'reviewer'), home = join(directory, 'authority');
  mkdirSync(root); mkdirSync(home, { mode: 0o700 });
  initGitRepo(root);
  writeFileSync(join(root, '.gitignore'), '.ai/\n');
  writeFileSync(join(root, 'source.txt'), 'source\n');
  commitAll(root, 'fixture');
  expect(run('git', ['worktree', 'add', '-b', 'reviewer', execution], root).status).toBe(0);
  const approved = seedReviewAdmissionFixture(root, home);
  return { directory, root, execution, home, approved, authority: { source: approved.source, claim } };
}

function storedRuntime(f: ReturnType<typeof fixture>) {
  // Synthetic transport record: these tests exercise admission/collection, not
  // a live Herdr session or process ownership. No runtime is started or signaled.
  const admission = observeTaskSessionAdmission(f.execution, spec, 'herdr', f.authority);
  const binding: HerdrTaskBinding = { protocol: 2, ...spec, runtime: 'herdr',
    repository_id: taskRepository(f.execution).repository_id, execution_root: f.execution,
    ownership: { disposition: 'attached' }, provider: { pid: 123, identity: 'fixture-process', ownership: { disposition: 'attached' } },
    max_requests: 3, endpoint: { session: 'fixture' }, pane_id: 'pane', terminal_id: 'terminal', workspace_id: 'workspace',
    shell: { pid: 122, identity: 'fixture-shell' }, agent_name: 'fixture-agent', task_admission: admission };
  const dir = taskSessionDirectory(f.execution, spec.task, spec.role);
  ensureSessionDirectory(f.root, dir);
  writeSessionArtifact(join(dir, 'binding.json'), binding);
  const outbox = join(f.execution, '.ai/harness/runs/task-agent-outbox', dir.split('/').pop()!);
  ensureSessionDirectory(f.execution, outbox);
  const request: TaskRequest = { protocol: 2, task: spec.task, role: spec.role, round: 1, request_id: 'fixture-request',
    context_ref: join(outbox, 'context-1.txt'), source_ref: join(f.execution, 'source.txt'),
    context_sha256: `sha256:${'d'.repeat(64)}`, result_ref: join(outbox, 'result-1.json'),
    result_contract: { required_fields: ['request_id', 'context_sha256', 'value'], atomic_write: 'temp_rename' },
    task_admission: admission,
    session_binding_sha256: `sha256:${createHash('sha256').update(canonicalize(JSON.parse(JSON.stringify(binding)))).digest('hex')}` };
  writeSessionArtifact(join(dir, 'request-1.json'), request);
  const result = { request_id: request.request_id, context_sha256: request.context_sha256, value: { result: 'fixture' } };
  writeSessionArtifact(request.result_ref, result);
  return { binding, dir, request, result };
}

test('task admission binds upstream claim and actual linked runtime identity while HEAD stays provenance', () => {
  const f = fixture();
  try {
    const first = observeTaskSessionAdmission(f.execution, spec, 'herdr', f.authority);
    expect(first.identity).toMatchObject({ repository_id: f.approved.admission.repository_id,
      issue_id: f.approved.admission.issue_id, campaign_id: f.approved.admission.campaign_id,
      execution_actor: f.approved.admission.actor_id, claim, source_root: f.root, execution_root: f.execution,
      branch: 'refs/heads/reviewer', runtime: 'herdr', role: spec.role });
    expect(run('git', ['commit', '--allow-empty', '-m', 'provenance only'], f.execution).status).toBe(0);
    const moved = observeTaskSessionAdmission(f.execution, spec, 'herdr', f.authority);
    expect(moved.identity).toEqual(first.identity);
    expect(moved.head_revision).not.toBe(first.head_revision);
    const next = seedReviewAdmissionFixture(f.root, f.home, { allowedPaths: ['src/'] });
    const refreshed = observeTaskSessionAdmission(f.execution, spec, 'herdr', { source: next.source, claim });
    expect(refreshed.identity).toEqual(first.identity);
    expect(refreshed.approval.admission_sha256).not.toBe(first.approval.admission_sha256);
    expect(refreshed.approval.scope_sha256).not.toBe(first.approval.scope_sha256);
  } finally { rmSync(f.directory, { recursive: true, force: true }); }
});

test('collection requires current approval and exact claim/runtime binding and confines same-context reapproval to a new request', async () => {
  const f = fixture();
  try {
    const saved = storedRuntime(f);
    await expect(collectTaskResult(f.execution, spec.task, spec.role, 1)).rejects.toThrow('admission_required');
    await expect(collectTaskResult(f.execution, spec.task, spec.role, 1, undefined,
      { ...f.authority, claim: { ...claim, revision: `sha256:${'b'.repeat(64)}` } })).rejects.toThrow('admission_changed');
    const next = seedReviewAdmissionFixture(f.root, f.home);
    await expect(collectTaskResult(f.execution, spec.task, spec.role, 1, undefined, f.authority)).rejects.toThrow('revoked_or_replaced');
    const authority = { source: next.source, claim };
    await expect(collectTaskResult(f.execution, spec.task, spec.role, 1, undefined, authority)).rejects.toThrow('request_context_changed');
    // A subsequent synthetic transport request uses the new approval, retaining
    // the original runtime binding and monotonically increasing round number.
    const admission = observeTaskSessionAdmission(f.execution, spec, 'herdr', authority);
    expect(admission.identity).toEqual(saved.binding.task_admission!.identity);
    expect(admission.approval.admission_sha256).toBe(saved.request.task_admission!.approval.admission_sha256);
    expect(admission.approval.grant_sha256).not.toBe(saved.request.task_admission!.approval.grant_sha256);
    const request = { ...saved.request, round: 2, request_id: 'fixture-request-2', task_admission: admission,
      context_ref: saved.request.context_ref.replace('context-1.txt', 'context-2.txt'),
      result_ref: saved.request.result_ref.replace('result-1.json', 'result-2.json') };
    writeSessionArtifact(join(saved.dir, 'request-2.json'), request);
    const result = { ...saved.result, request_id: request.request_id };
    writeSessionArtifact(request.result_ref, result);
    expect(await collectTaskResult(f.execution, spec.task, spec.role, 2, undefined, authority)).toEqual(result);
    writeSessionArtifact(join(saved.dir, 'binding.json'), { ...saved.binding, pane_id: 'replacement-pane' }, false);
    await expect(collectTaskResult(f.execution, spec.task, spec.role, 2, undefined, { source: next.source, claim })).rejects.toThrow('request_admission_mismatch');
  } finally { rmSync(f.directory, { recursive: true, force: true }); }
});

test('task launch rejects an invalid claim before runtime effects and collection rejects changed branch or approved context', async () => {
  const f = fixture();
  try {
    let launched = false;
    await expect(startTaskAgent(f.execution, { ...spec, endpoint: { session: 'fixture' }, parent_pane: 'parent', args: [], max_requests: 3 },
      { taskAuthority: { ...f.authority, claim: { ...claim, revision: 'not-a-revision' } }, start: async () => { launched = true; } })).rejects.toThrow('claim_invalid');
    expect(launched).toBe(false);
    storedRuntime(f);
    expect(run('git', ['checkout', '-b', 'other-reviewer'], f.execution).status).toBe(0);
    await expect(collectTaskResult(f.execution, spec.task, spec.role, 1, undefined, f.authority)).rejects.toThrow('admission_changed');
    expect(run('git', ['checkout', 'reviewer'], f.execution).status).toBe(0);
    const next = seedReviewAdmissionFixture(f.root, f.home, { allowedPaths: ['docs/'] });
    await expect(collectTaskResult(f.execution, spec.task, spec.role, 1, undefined, { source: next.source, claim })).rejects.toThrow('request_context_changed');
  } finally { rmSync(f.directory, { recursive: true, force: true }); }
});


test('collection rechecks the complete request approval at the final publication boundary', async () => {
  const f = fixture();
  try {
    const saved = storedRuntime(f);
    let checks = 0;
    await expect(collectTaskResult(f.execution, spec.task, spec.role, 1, () => {
      if (++checks === 3) {
        const next = seedReviewAdmissionFixture(f.root, f.home);
        Object.assign(f.authority.source, next.source);
      }
    }, f.authority)).rejects.toThrow('request_context_changed');
    expect(checks).toBe(3);
    expect(existsSync(join(saved.dir, 'collected-1.json'))).toBe(false);
  } finally { rmSync(f.directory, { recursive: true, force: true }); }
});
