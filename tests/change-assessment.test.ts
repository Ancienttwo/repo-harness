import { seedReviewAdmissionFixture } from './helpers/review-admission-fixture';
import { runChangeAssessmentCli } from '../scripts/change-assessment';
import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';

import {
  applyReviewerDisagreement,
  assessChange,
  buildReviewSelectionPacket,
  validateChangeAssessment,
  validateReviewSelectionPacketAgainstAssessment,
  validateReviewSelectionPacket,
  type AssessmentSubject,
  type ChangeAssessment,
  type ChangeAssessmentResult,
} from '../src/core/review/change-assessment';
import { prepareChangeAssessment } from '../src/effects/review/change-assessment';

const tempDirs: string[] = [];
const admissions = new Map<string, ReturnType<typeof seedReviewAdmissionFixture>>();
const authorityFor = (root: string) => admissions.get(root)!.source;
const SOURCE_ROOT = join(import.meta.dir, '..');
afterEach(() => { for (const path of tempDirs.splice(0)) rmSync(path, { recursive: true, force: true }); });

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync('git', args, { cwd, encoding: 'utf-8' });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim();
}

function commit(cwd: string, message: string): void {
  git(cwd, 'add', '-A');
  git(cwd, 'commit', '-m', message);
}

function subject(paths = ['src/example.ts']): AssessmentSubject {
  return {
    status: 'ok',
    target_ref: 'main',
    target_rev: 'a'.repeat(40),
    head_rev: 'b'.repeat(40),
    paths,
    review_subject_sha256: `sha256:${'c'.repeat(64)}`,
  };
}

function readyAssessment(paths = ['src/example.ts']) {
  const result = assessChange({
    subject: subject(paths), workflowProfile: 'routine', strictCategories: [], patternNoveltyPaths: [], declaredOracles: [],
  });
  if (result.status !== 'ready') throw new Error('fixture assessment must be ready');
  return result;
}

function requireReady(value: ChangeAssessmentResult): ChangeAssessment {
  if (value.status === 'degraded') throw new Error(`fixture assessment degraded: ${value.message}`);
  return value;
}

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'repo-harness-change-assessment-'));
  tempDirs.push(root);
  git(root, 'init', '-b', 'main');
  git(root, 'config', 'user.name', 'Change Assessment Test');
  git(root, 'config', 'user.email', 'change-assessment@test.local');
  mkdirSync(join(root, '.ai', 'harness'), { recursive: true });
  writeFileSync(join(root, '.ai', 'harness', 'policy.json'), JSON.stringify({ worktree_strategy: { review_base: 'main' } }));
  writeFileSync(join(root, 'base.ts'), 'export const base = true;\n');
  commit(root, 'base');
  const home = mkdtempSync(join(tmpdir(), 'assessment-authority-')); tempDirs.push(home);
  admissions.set(root, seedReviewAdmissionFixture(root, home));
  return root;
}

describe('ChangeAssessment v1', () => {
  test('is a final-subject pure function with closed, monotonic reason routing', () => {
    const authority = assessChange({
      subject: subject(), workflowProfile: 'high', strictCategories: ['security'], patternNoveltyPaths: [],
      declaredOracles: [{ id: 'deterministic', kind: 'deterministic_test', paths: ['*'] }],
    });
    expect(authority.status).toBe('ready');
    expect(requireReady(authority).reasons.map((entry) => entry.code)).toEqual(['authority_change']);

    const irreversible = assessChange({
      subject: subject(), workflowProfile: 'high', strictCategories: ['migration'], patternNoveltyPaths: [],
      declaredOracles: [{ id: 'runtime', kind: 'runtime_readback', paths: ['*'] }],
    });
    expect(irreversible.status).toBe('ready');
    expect(requireReady(irreversible).reasons.map((entry) => entry.code)).toEqual(['irreversible_effect']);

    const novelty = assessChange({
      subject: subject(), workflowProfile: 'routine', strictCategories: [], patternNoveltyPaths: ['src/example.ts'],
      declaredOracles: [{ id: 'deterministic', kind: 'deterministic_test', paths: ['src/example.ts'] }],
    });
    expect(requireReady(novelty).reasons.map((entry) => entry.code)).toEqual(['pattern_novelty']);

    const oracleGap = assessChange({
      subject: subject(), workflowProfile: 'high', strictCategories: ['auth'], patternNoveltyPaths: [], declaredOracles: [],
    });
    expect(oracleGap.status).toBe('blocked');
    expect(requireReady(oracleGap).reasons.map((entry) => entry.code)).toEqual(['authority_change', 'oracle_gap']);

    const packet = buildReviewSelectionPacket(readyAssessment());
    const disagreement = applyReviewerDisagreement(packet, {
      review_subject_sha256: packet.review_subject_sha256,
      target_revision: packet.target_revision,
      paths: ['src/example.ts'],
      summary: 'independent reviewer found an ambiguous edge case',
    });
    expect(disagreement.reasons.map((entry) => entry.code)).toEqual(['reviewer_disagreement']);
    expect(disagreement.selected_paths).toEqual(['src/example.ts']);
    expect(() => applyReviewerDisagreement(disagreement, {
      review_subject_sha256: packet.review_subject_sha256,
      target_revision: packet.target_revision,
      paths: ['outside.ts'], summary: 'attempt to widen bound subject',
    })).toThrow('subject paths');
    expect(validateReviewSelectionPacket(disagreement).packet_sha256).toBe(disagreement.packet_sha256);
  });

  test('fails closed for a degraded subject and missing policy base', () => {
    const degraded = assessChange({
      subject: { ...subject(), status: 'unknown', reason: 'git observation failed' },
      workflowProfile: 'routine', strictCategories: [], patternNoveltyPaths: [], declaredOracles: [],
    });
    expect(degraded).toMatchObject({ status: 'degraded', code: 'subject_unavailable' });

    const root = fixture();
    writeFileSync(join(root, '.ai', 'harness', 'policy.json'), '{}\n');
    expect(() => prepareChangeAssessment({ repoRoot: root, authority: authorityFor(root) }))
      .toThrow('review base');
  });

  test('requires an allowed oracle kind to cover every path of every risk reason', () => {
    const paths = ['src/left.ts', 'src/right.ts'];
    const partial = assessChange({
      subject: subject(paths), workflowProfile: 'high', strictCategories: ['auth'], patternNoveltyPaths: [],
      declaredOracles: [{ id: 'left-only', kind: 'deterministic_test', paths: ['src/left.ts'] }],
    });
    expect(partial.status).toBe('blocked');
    expect(requireReady(partial).reasons).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'authority_change', paths }),
      expect.objectContaining({ code: 'oracle_gap', paths: ['src/right.ts'] }),
    ]));

    const novelty = assessChange({
      subject: subject(paths), workflowProfile: 'routine', strictCategories: [], patternNoveltyPaths: paths,
      declaredOracles: [{ id: 'left-only', kind: 'deterministic_test', paths: ['src/left.ts'] }],
    });
    expect(novelty.status).toBe('blocked');
    expect(requireReady(novelty).reasons).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'pattern_novelty', paths }),
      expect.objectContaining({ code: 'oracle_gap', paths: ['src/right.ts'] }),
    ]));
  });

  test('characterizes final-subject independence from edit order and hook journal', () => {
    const root = fixture();
    const source = join(root, 'src', 'adapter.ts');
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(source, 'export const provisional = 1;\n');
    writeFileSync(source, 'export interface Adapter { run(): void }\n');
    const first = prepareChangeAssessment({ repoRoot: root, authority: authorityFor(root) });
    expect(first.assessment.status).toBe('ready');
    expect(first.packet).not.toBeNull();

    // The only mutation is a hook journal excluded by buildReviewSubject. The
    // effect has no journal input, so the exact final subject and packet stay
    // byte-identical despite a different observer history.
    writeFileSync(join(root, '.ai', 'harness', 'events.jsonl'), '{"hook":"PostToolUse","sequence":99}\n');
    const second = prepareChangeAssessment({ repoRoot: root, authority: authorityFor(root) });
    expect(second.assessment).toEqual(first.assessment);
    expect(second.packet).toEqual(first.packet);
    expect(second.packet?.reasons.map((entry) => entry.code)).toEqual(['pattern_novelty']);
  });

  test('pins Change Assessment Git observations to an explicit immutable target revision', () => {
    const root = fixture();
    git(root, 'checkout', '-b', 'codex/demo');
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src', 'candidate.ts'), 'export const candidate = true;\n');
    commit(root, 'candidate');
    const frozenTarget = git(root, 'rev-parse', 'main');
    const beforeTargetMoves = prepareChangeAssessment({
      repoRoot: root,
      authority: authorityFor(root),
      targetRevision: frozenTarget,
    });
    expect(beforeTargetMoves.packet?.target_revision).toBe(frozenTarget);

    git(root, 'checkout', 'main');
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src', 'candidate.ts'), 'export const integrationChange = true;\n');
    commit(root, 'advance target with overlap');
    git(root, 'checkout', 'codex/demo');

    const historical = prepareChangeAssessment({
      repoRoot: root,
      authority: authorityFor(root),
      targetRevision: frozenTarget,
    });
    expect(historical).toEqual(beforeTargetMoves);
  });

  test('routes only abstraction-shaped additions relative to the policy base', () => {
    const root = fixture();
    const source = join(root, 'src', 'adapter.ts');
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(source, 'export interface Adapter {\n  run(): void\n}\n');
    commit(root, 'existing interface');
    writeFileSync(source, 'export interface Adapter {\n  run(): void\n  stop(): void\n}\n');
    const edited = prepareChangeAssessment({ repoRoot: root, authority: authorityFor(root) });
    expect(requireReady(edited.assessment).reasons.map((entry) => entry.code)).not.toContain('pattern_novelty');

    writeFileSync(join(root, 'src', 'new-interface.ts'), 'export interface NewAdapter { execute(): void }\n');
    const added = prepareChangeAssessment({ repoRoot: root, authority: authorityFor(root) });
    expect(requireReady(added.assessment).reasons).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'pattern_novelty', paths: ['src/new-interface.ts'] }),
    ]));
  });

  test('does not treat a pure rename as novelty but routes an abstraction added after rename', () => {
    const renamed = fixture();
    mkdirSync(join(renamed, 'src'), { recursive: true });
    writeFileSync(join(renamed, 'src', 'old-adapter.ts'), 'export interface Adapter {\n  run(): void\n}\n');
    commit(renamed, 'existing adapter');
    git(renamed, 'mv', 'src/old-adapter.ts', 'src/renamed-adapter.ts');
    const pureRename = prepareChangeAssessment({ repoRoot: renamed, authority: authorityFor(renamed) });
    expect(requireReady(pureRename.assessment).reasons.map((entry) => entry.code)).not.toContain('pattern_novelty');

    const expanded = fixture();
    mkdirSync(join(expanded, 'src'), { recursive: true });
    writeFileSync(join(expanded, 'src', 'old-adapter.ts'), 'export const run = () => undefined;\n');
    commit(expanded, 'existing implementation');
    git(expanded, 'mv', 'src/old-adapter.ts', 'src/renamed-adapter.ts');
    writeFileSync(join(expanded, 'src', 'renamed-adapter.ts'), 'export const run = () => undefined;\nexport interface AddedAdapter { run(): void }\n');
    const renameWithAddition = prepareChangeAssessment({ repoRoot: expanded, authority: authorityFor(expanded) });
    expect(requireReady(renameWithAddition.assessment).reasons).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'pattern_novelty', paths: ['src/renamed-adapter.ts'] }),
    ]));
  });

  test('routes abstraction additions on non-ASCII subject paths', () => {
    const root = fixture();
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src', '接口.ts'), 'export interface ExternalPort { run(): void }\n');
    const prepared = prepareChangeAssessment({ repoRoot: root, authority: authorityFor(root) });
    expect(requireReady(prepared.assessment).reasons).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'pattern_novelty', paths: ['src/接口.ts'] }),
    ]));
  });

  test('accepts only a base packet plus an append-only disagreement overlay', () => {
    const assessment = readyAssessment();
    const base = buildReviewSelectionPacket(assessment);
    const overlay = applyReviewerDisagreement(base, {
      review_subject_sha256: base.review_subject_sha256,
      target_revision: base.target_revision,
      paths: ['src/example.ts'],
      summary: 'independent reviewer requires explicit review',
    });
    expect(validateChangeAssessment(assessment).assessment_sha256).toBe(assessment.assessment_sha256);
    expect(validateReviewSelectionPacketAgainstAssessment(overlay, assessment).packet_sha256).toBe(overlay.packet_sha256);
    const forged = { ...overlay, selected_paths: [] };
    expect(() => validateReviewSelectionPacketAgainstAssessment(forged, assessment)).toThrow('fingerprint');
  });

  test('CLI prepares and validates the exact policy-bound packet', async () => {
    const root = fixture();
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src', 'adapter.ts'), 'export interface Adapter { run(): void }\n');
    const runCli = async (argv: string[]) => ({ status: await runChangeAssessmentCli(argv, { repoRoot: root, admissionSource: () => authorityFor(root) }), stderr: '' });
    const output = '.ai/harness/checks/change-assessment.fixture.json';
    const prepare = await runCli(['prepare',
      '--output', output,
    ]);
    expect(prepare.status, prepare.stderr).toBe(0);
    const evidence = JSON.parse(readFileSync(join(root, output), 'utf-8'));
    expect(evidence.selection_packet.status).toBe('ready');
    const validate = await runCli(['validate', '--packet', output]);
    expect(validate.status, validate.stderr).toBe(0);

    const escalate = await runCli(['escalate-disagreement',
      '--packet', output, '--paths', 'src/adapter.ts', '--summary', 'independent reviewer requires human review',
    ]);
    expect(escalate.status, escalate.stderr).toBe(0);
    const escalated = JSON.parse(readFileSync(join(root, output), 'utf-8'));
    expect(escalated.selection_packet.reasons.map((entry: { code: string }) => entry.code)).toEqual(['pattern_novelty', 'reviewer_disagreement']);

    // The next prepare is the atomic re-freeze boundary: it recomputes the
    // base from policy/subject, accepts only the monotonic overlay, and emits
    // a fresh envelope for canonical verify-sprint evidence.
    const reprepare = await runCli(['prepare',
      '--packet', output, '--output', output,
    ]);
    expect(reprepare.status, reprepare.stderr).toBe(0);
    const refrozen = JSON.parse(readFileSync(join(root, output), 'utf-8'));
    expect(refrozen.selection_packet.packet_sha256).toBe(escalated.selection_packet.packet_sha256);

    writeFileSync(join(root, 'src', 'adapter.ts'), 'export interface Adapter { run(): void; stop(): void }\n');
    const preserved = readFileSync(join(root, output), 'utf-8');
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const drifted = await runCli(['prepare',
        '--packet', output, '--output', output,
      ]);
      expect(drifted.status).toBe(1);
      expect(readFileSync(join(root, output), 'utf-8')).toBe(preserved);
    }
  });
});
