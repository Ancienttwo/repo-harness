import { expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { captureEvalCatalogSource, readEvalCatalogPlan } from '../../src/effects/evidence/eval-catalog';
import { executeCatalogEval, evaluateAdmittedVerification, validateMaterializedVerificationExecutionReport } from '../../src/effects/evidence/verification-execution';
import { readAcceptedEvents } from '../../src/effects/evidence/event-log';
import { seedReviewAdmissionFixture } from '../helpers/review-admission-fixture';
import { tmpWorkspace, initGitRepo, commitAll } from '../helpers/repo-fixture';

function fixture(command = 'printf x >> .ai/harness/runs/counter') {
  const directory = tmpWorkspace('eval-catalog');
  const repoRoot = join(directory, 'candidate');
  const home = join(directory, 'authority');
  mkdirSync(repoRoot); mkdirSync(home, { mode: 0o700 });
  initGitRepo(repoRoot);
  writeFileSync(join(repoRoot, '.gitignore'), '.ai/harness/\n');
  writeFileSync(join(repoRoot, "response's.txt"), 'expected answer\n');
  mkdirSync(join(repoRoot, '.ai/harness/runs'), { recursive: true });
  commitAll(repoRoot, 'eval fixture');
  const entry = { id: 1, slug: 'catalog-check', prompt: 'Respond.', expected_output: 'answer', files: [], expectations: [],
    graders: { commands_succeed: [command], files_exist: ["response's.txt"],
      files_contain: [{ path: "response's.txt", pattern: '^expected answer$' }] },
    anti_graders: { files_not_exist: ['forbidden.txt'], files_not_contain: [{ path: "response's.txt", pattern: 'forbidden' }] } };
  const catalogPath = join(directory, 'evals.json');
  const manifest = { skill_name: 'repo-harness', evals: [entry] };
  writeFileSync(catalogPath, JSON.stringify(manifest));
  const source = captureEvalCatalogSource(catalogPath, entry);
  return { directory, repoRoot, home, entry, manifest, catalogPath, source };
}

test('catalog grading binds source bytes and plan; its exact evidence cannot satisfy review admission', () => {
  const f = fixture();
  try {
    const input = { repoRoot: f.repoRoot, catalog: f.source };
    const report = executeCatalogEval(input);
    expect(report.kind).toBe('eval_execution_report');
    expect(report.passed).toBe(true);
    expect(report.results).toHaveLength(5);
    expect(report.target).toMatchObject({ catalog_sha256: f.source.catalog_sha256,
      eval_id: f.source.eval_id, eval_sha256: f.source.eval_sha256 });
    expect(report.results.every(result => result.execution === 'executed')).toBe(true);
    expect(executeCatalogEval(input).results.every(result => result.execution === 'reused')).toBe(true);
    expect(readFileSync(join(f.repoRoot, '.ai/harness/runs/counter'), 'utf8')).toBe('x');
    const events = readAcceptedEvents(f.repoRoot).accepted;
    expect(events).toHaveLength(5);
    for (const event of events) {
      expect(event.subject_identity).toMatchObject({ authority_kind: 'eval-catalog',
        catalog_sha256: f.source.catalog_sha256, eval_id: f.source.eval_id,
        eval_sha256: f.source.eval_sha256, plan_hash: report.target.plan_hash });
      expect('contract_hash' in event.subject_identity).toBe(false);
    }
    const review = seedReviewAdmissionFixture(f.repoRoot, f.home, { plan: readEvalCatalogPlan(f.repoRoot, f.source) });
    expect(evaluateAdmittedVerification({ repoRoot: f.repoRoot, authority: review.source }).passed).toBe(false);
    expect(() => validateMaterializedVerificationExecutionReport({ repoRoot: f.repoRoot, authority: review.source, report })).toThrow('protocol or kind');
  } finally { rmSync(f.directory, { recursive: true, force: true }); }
}, 30_000);

test('catalog selection rejects ambiguous entries, a mixed selected revision, and candidate-controlled source', () => {
  const f = fixture();
  try {
    expect(() => captureEvalCatalogSource(f.catalogPath, { ...f.entry, prompt: 'Changed prompt' })).toThrow('changed during selection');
    writeFileSync(f.catalogPath, JSON.stringify({ ...f.manifest, evals: [f.entry, f.entry] }));
    expect(() => captureEvalCatalogSource(f.catalogPath, f.entry)).toThrow('unique');
    const inside = join(f.repoRoot, 'evals.json');
    writeFileSync(inside, JSON.stringify(f.manifest));
    const source = captureEvalCatalogSource(inside, f.entry);
    expect(() => executeCatalogEval({ repoRoot: f.repoRoot, catalog: source })).toThrow('outside the candidate workspace');
    expect(readAcceptedEvents(f.repoRoot).accepted).toHaveLength(0);
  } finally { rmSync(f.directory, { recursive: true, force: true }); }
});

test('catalog changes after selection reject grading before executing a command', () => {
  const f = fixture();
  try {
    writeFileSync(f.catalogPath, JSON.stringify({ ...f.manifest, evals: [{ ...f.entry, prompt: 'Changed goal' }] }));
    expect(() => executeCatalogEval({ repoRoot: f.repoRoot, catalog: f.source })).toThrow('eval catalog changed');
    expect(existsSync(join(f.repoRoot, '.ai/harness/runs/counter'))).toBe(false);
  } finally { rmSync(f.directory, { recursive: true, force: true }); }
});

test('catalog changes during a grader cannot publish successful ledger or report evidence', () => {
  const f = fixture('printf " " >> "$EVAL_CATALOG_PATH"');
  try {
    const reportFile = '.ai/harness/runs/report.json';
    expect(() => executeCatalogEval({ repoRoot: f.repoRoot, catalog: f.source, reportFile,
      env: { ...process.env, EVAL_CATALOG_PATH: f.catalogPath } })).toThrow('eval catalog changed');
    expect(existsSync(join(f.repoRoot, reportFile))).toBe(false);
    expect(readAcceptedEvents(f.repoRoot).accepted).toHaveLength(0);
  } finally { rmSync(f.directory, { recursive: true, force: true }); }
}, 30_000);
