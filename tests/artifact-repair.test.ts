import { expect, test } from 'bun:test';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { buildReviewSubject } from '../src/effects/review/diff-fingerprint';
import { resolveEffectiveState } from '../src/effects/state/resolve-effective-state';
import { recordArtifactRepair } from '../src/effects/state/artifact-repair-store';
import { artifactRepairPath } from '../src/core/state/artifact-repair';
import { createStateInputCollector } from '../src/effects/loop/state-input-collector';
import { runMutationGuard } from '../src/cli/hook/mutation-guard';
import { CONTRACT, PLAN, withRepo, writeFixture, runStateCli, commitFixture } from './state/effective-state-fixture';

const CHECKS = '.ai/harness/checks/latest.json';
function failed(cwd: string, failureClass = 'missing_artifact') {
  const plan = readFileSync(join(cwd, PLAN), 'utf8');
  if (plan.includes('- [ ]')) {
    writeFixture(cwd, PLAN, plan.replaceAll('- [ ]', '- [x]'));
    commitFixture(cwd, 'ready work package');
  }
  const subject = buildReviewSubject(cwd, { targetRef: 'main' });
  if (subject.status !== 'ok') throw new Error('fixture subject unavailable');
  const checks = JSON.stringify({status:'fail',active_plan:PLAN,review_subject_sha256:subject.review_subject_sha256,failure_class:failureClass});
  writeFixture(cwd, CHECKS, checks);
  return checks;
}
function readiness(cwd: string, targetPaths = [CONTRACT]) {
  const state = resolveEffectiveState(cwd, Date.now(), {targetPaths,operationKind:'edit',explicitOverride:'routine'});
  if (!state.readiness?.ok) throw new Error('fixture readiness unavailable');
  return state.readiness;
}

test('real CLI audits an immutable repair receipt without granting edit or Stop permission', () => withRepo(cwd => {
  failed(cwd);
  expect(readiness(cwd).allowedToEdit.decision).toBe('allow');
  const before = resolveEffectiveState(cwd, Date.now(), {targetPaths:[],operationKind:'inspect'});
  const next = runStateCli(cwd, ['state','next','--json']);
  expect(next.status).toBe(0);
  expect(JSON.parse(next.stdout).reason).toBe('artifact_repair_receipt_required');
  const result = runStateCli(cwd, ['state','repair-artifact','--reason','Correct broken exit criteria','--json']);
  expect(result.status, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout).contract_path).toBe(CONTRACT);
  expect(readiness(cwd).allowedToEdit.decision).toBe('allow');
  const guard = (path: string) => runMutationGuard({
    input: JSON.stringify({tool_input:{file_path:path}}), env: {},
    collector: createStateInputCollector({
      event:'PreToolUse', repoRoot:cwd, resolveSessionEffectiveState:()=>null,
      resolvePreEditEffectiveState:(targetPaths: readonly string[])=>resolveEffectiveState(cwd, Date.now(), {targetPaths,operationKind:'edit',explicitOverride:'routine'}),
    }),
  });
  expect(guard(CONTRACT).exitCode).toBe(0);
  expect(guard('src/fix.ts').exitCode).toBe(0);
  for (const path of ['../outside', '_ops/private.env', '_ref/upstream.ts']) expect(guard(path).exitCode).toBe(2);

  expect(readiness(cwd).allowedToStop.decision).toBe('allow');
  expect(readiness(cwd).readyToShip.decision).toBe('block');
  expect(readiness(cwd, ['src/fix.ts']).allowedToEdit.decision).toBe('allow');
  expect(readiness(cwd, [CONTRACT, 'src/fix.ts']).allowedToEdit.decision).toBe('allow');
  const after = resolveEffectiveState(cwd, Date.now(), {targetPaths:[],operationKind:'inspect'});
  expect(after.blockers).toEqual(['checks_artifact_invalid']);
  expect(after.progress_token).not.toBe(before.progress_token);
  expect(recordArtifactRepair(cwd, 'Correct broken exit criteria')).toEqual(JSON.parse(result.stdout));
  expect(() => recordArtifactRepair(cwd, 'different reason')).toThrow('conflicts');
  expect(readdirSync(join(cwd, '.ai/harness/state/artifact-repairs'))).toHaveLength(1);
  expect(JSON.parse(runStateCli(cwd, ['state','next','--json']).stdout).reason).toBe('repair_active_contract_then_reverify');
}), 30_000);

test('changed contract, checks, or target context cannot reuse an earlier receipt', () => withRepo(cwd => {
  const checks = failed(cwd);
  recordArtifactRepair(cwd, 'repair');
  const original = readFileSync(join(cwd, CONTRACT), 'utf8');
  writeFixture(cwd, CONTRACT, `${original}\nrepair changed contract\n`);
  expect(resolveEffectiveState(cwd, Date.now(), {targetPaths:[],operationKind:'inspect'}).checks.artifact_repair).toBe('required');
  writeFixture(cwd, CONTRACT, original);
  writeFixture(cwd, CHECKS, `${checks}\n`);
  expect(resolveEffectiveState(cwd, Date.now(), {targetPaths:[],operationKind:'inspect'}).checks.artifact_repair).toBe('required');
  writeFixture(cwd, CHECKS, checks);
  const path = artifactRepairPath(checks)!;
  const receipt = JSON.parse(readFileSync(join(cwd, path), 'utf8'));
  writeFixture(cwd, path, JSON.stringify({...receipt, subject_revision:'sha256:stale'}));
  expect(resolveEffectiveState(cwd, Date.now(), {targetPaths:[],operationKind:'inspect'}).checks.artifact_repair).toBe('required');
  writeFixture(cwd, path, '{bad json');
  expect(resolveEffectiveState(cwd, Date.now(), {targetPaths:[],operationKind:'inspect'}).checks.artifact_repair).toBe('required');
}), 30_000);

test('test failures, unknown classes, stale checks, and blank reasons cannot issue artifact permission', () => withRepo(cwd => {
  for (const cls of ['contract_failure','verification_budget','future_class']) {
    failed(cwd, cls);
    expect(resolveEffectiveState(cwd, Date.now(), {targetPaths:[],operationKind:'inspect'}).blockers).toEqual(['checks_failed']);
    expect(() => recordArtifactRepair(cwd, 'repair')).toThrow('fresh missing_artifact');
  }
  failed(cwd);
  expect(() => recordArtifactRepair(cwd, '  ')).toThrow('nonblank');
  writeFixture(cwd, CHECKS, JSON.stringify({status:'fail',active_plan:PLAN,review_subject_sha256:'stale',failure_class:'missing_artifact'}));
  expect(() => recordArtifactRepair(cwd, 'repair')).toThrow('fresh missing_artifact');
}), 30_000);
