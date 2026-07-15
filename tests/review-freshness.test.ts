import { describe, expect, test } from 'bun:test';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';
import {
  REVIEW_SUBJECT_SCOPE,
  buildReviewSubject,
  splitNul,
} from '../src/effects/review/diff-fingerprint';
import { runReviewSubjectCli } from '../src/cli/hook/review-subject';

function tmpRepo(prefix: string): string {
  const cwd = mkdtempSync(join(tmpdir(), `${prefix}-`));
  runGit(cwd, ['init']);
  runGit(cwd, ['config', 'user.name', 'Review Freshness Test']);
  runGit(cwd, ['config', 'user.email', 'review-freshness@test.local']);
  writeFileSync(join(cwd, 'README.md'), '# Demo\n');
  runGit(cwd, ['add', 'README.md']);
  runGit(cwd, ['commit', '-m', 'init']);
  return cwd;
}

function runGit(cwd: string, args: readonly string[]): void {
  const res = spawnSync('git', args, { cwd, encoding: 'utf-8' });
  expect(res.status).toBe(0);
}

// A repo with an explicit `main` target and a checked-out `feature` branch, for
// exercising target metadata without binding the content subject to ancestry.
function tmpFeatureRepo(prefix: string): string {
  const cwd = mkdtempSync(join(tmpdir(), `${prefix}-`));
  runGit(cwd, ['init', '-b', 'main']);
  runGit(cwd, ['config', 'user.name', 'Review Freshness Test']);
  runGit(cwd, ['config', 'user.email', 'review-freshness@test.local']);
  writeFileSync(join(cwd, 'README.md'), '# Demo\n');
  runGit(cwd, ['add', 'README.md']);
  runGit(cwd, ['commit', '-m', 'init']);
  runGit(cwd, ['checkout', '-b', 'feature']);
  return cwd;
}

describe('review subject', () => {
  test('is stable across checkout roots for the same repository diff', () => {
    const source = tmpRepo('repo-harness-review-freshness-source');
    const cloneParent = mkdtempSync(join(tmpdir(), 'repo-harness-review-freshness-clone-parent-'));
    const clone = join(cloneParent, 'clone');
    try {
      runGit(cloneParent, ['clone', source, clone]);

      for (const cwd of [source, clone]) {
        writeFileSync(join(cwd, 'README.md'), '# Demo\n\nchanged\n');
        mkdirSync(join(cwd, 'src'), { recursive: true });
        writeFileSync(join(cwd, 'src/new.ts'), 'export const demo = true;\n');
      }

      const first = buildReviewSubject(source);
      const second = buildReviewSubject(clone);

      expect(first.status).toBe('ok');
      expect(first.scope).toBe(REVIEW_SUBJECT_SCOPE);
      expect(first.paths).toEqual(['README.md', 'src/new.ts']);
      expect(second.paths).toEqual(first.paths);
      expect(second.review_subject_sha256).toBe(first.review_subject_sha256);
    } finally {
      rmSync(source, { recursive: true, force: true });
      rmSync(cloneParent, { recursive: true, force: true });
    }
  });

  test('excludes review and check artifacts from the review subject', () => {
    const cwd = tmpRepo('repo-harness-review-freshness-exclude');
    try {
      const clean = buildReviewSubject(cwd);

      mkdirSync(join(cwd, 'tasks/reviews'), { recursive: true });
      mkdirSync(join(cwd, '.ai/harness/checks'), { recursive: true });
      mkdirSync(join(cwd, '.ai/harness/failures'), { recursive: true });
      mkdirSync(join(cwd, '.ai/harness/handoff'), { recursive: true });
      mkdirSync(join(cwd, '.ai/harness/state'), { recursive: true });
      writeFileSync(join(cwd, 'tasks/reviews/demo.review.md'), '> **Recommendation**: pass\n');
      writeFileSync(join(cwd, '.ai/harness/active-plan'), 'plans/plan-demo.md\n');
      writeFileSync(join(cwd, '.ai/harness/checks/latest.json'), '{"status":"pass"}\n');
      writeFileSync(join(cwd, '.ai/harness/failures/latest.jsonl'), '{"guard":"demo"}\n');
      writeFileSync(join(cwd, '.ai/harness/handoff/current.md'), '# Handoff\n');
      writeFileSync(join(cwd, '.ai/harness/state/effective.json'), '{}\n');

      const operationalOnly = buildReviewSubject(cwd);
      expect(operationalOnly.excluded_paths).toEqual([
        '.ai/harness/active-plan',
        '.ai/harness/checks/latest.json',
        '.ai/harness/failures/latest.jsonl',
        '.ai/harness/handoff/current.md',
        '.ai/harness/state/effective.json',
        'tasks/reviews/demo.review.md',
      ]);
      expect(operationalOnly.paths).toEqual([]);
      expect(operationalOnly.review_subject_sha256).toBe(clean.review_subject_sha256);

      writeFileSync(join(cwd, 'README.md'), '# Demo\n\nimplementation change\n');
      const implementationChange = buildReviewSubject(cwd);
      expect(implementationChange.paths).toEqual(['README.md']);
      expect(implementationChange.review_subject_sha256).not.toBe(clean.review_subject_sha256);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('excludes regenerated authoritative harness reports from review freshness', () => {
    const repo = tmpRepo('repo-harness-review-freshness-report');
    try {
      mkdirSync(join(repo, 'evals', 'harness', 'reports'), { recursive: true });
      writeFileSync(join(repo, 'evals', 'harness', 'reports', 'profile-comparison.json'), '{"run":1}\n');
      writeFileSync(join(repo, 'evals', 'harness', 'reports', 'profile-comparison.md'), '# Run 1\n');
      writeFileSync(join(repo, 'evals', 'harness', 'reports', 'profile-comparison.sha256.json'), '{"binding":1}\n');
      const before = buildReviewSubject(repo, { targetRef: 'HEAD' });

      writeFileSync(join(repo, 'evals', 'harness', 'reports', 'profile-comparison.json'), '{"run":2}\n');
      writeFileSync(join(repo, 'evals', 'harness', 'reports', 'profile-comparison.md'), '# Run 2\n');
      writeFileSync(join(repo, 'evals', 'harness', 'reports', 'profile-comparison.sha256.json'), '{"binding":2}\n');
      const after = buildReviewSubject(repo, { targetRef: 'HEAD' });

      expect(after.review_subject_sha256).toBe(before.review_subject_sha256);
      expect(after.excluded_paths).toEqual([
        'evals/harness/reports/profile-comparison.json',
        'evals/harness/reports/profile-comparison.md',
        'evals/harness/reports/profile-comparison.sha256.json',
      ]);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test('includes untracked file content in the subject', () => {
    const cwd = tmpRepo('repo-harness-review-freshness-untracked');
    try {
      mkdirSync(join(cwd, 'src'), { recursive: true });
      writeFileSync(join(cwd, 'src/new.ts'), 'export const value = 1;\n');
      const first = buildReviewSubject(cwd);

      writeFileSync(join(cwd, 'src/new.ts'), 'export const value = 2;\n');
      const second = buildReviewSubject(cwd);

      expect(first.paths).toEqual(['src/new.ts']);
      expect(second.paths).toEqual(['src/new.ts']);
      expect(second.review_subject_sha256).not.toBe(first.review_subject_sha256);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('keeps the content subject stable when the target advances on unrelated paths', () => {
    const cwd = tmpFeatureRepo('repo-harness-review-freshness-target');
    try {
      writeFileSync(join(cwd, 'impl.ts'), 'export const a = 1;\n');
      runGit(cwd, ['add', 'impl.ts']);
      runGit(cwd, ['commit', '-m', 'feature work']);

      const beforeTarget = buildReviewSubject(cwd, { targetRef: 'main' });
      const beforeHead = buildReviewSubject(cwd); // unbound HEAD default

      // Advance the target branch without touching the feature branch.
      runGit(cwd, ['checkout', 'main']);
      writeFileSync(join(cwd, 'unrelated.ts'), 'export const b = 2;\n');
      runGit(cwd, ['add', 'unrelated.ts']);
      runGit(cwd, ['commit', '-m', 'target advance']);
      runGit(cwd, ['checkout', 'feature']);

      const afterTarget = buildReviewSubject(cwd, { targetRef: 'main' });
      const afterHead = buildReviewSubject(cwd);

      expect(beforeTarget.status).toBe('ok');
      expect(afterTarget.review_subject_sha256).toBe(beforeTarget.review_subject_sha256);
      expect(afterTarget.target_rev).not.toBe(beforeTarget.target_rev);
      expect(afterTarget.target_overlap_count).toBe(0);
      expect(afterHead.review_subject_sha256).toBe(beforeHead.review_subject_sha256);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('reports target overlap without folding target revision into the content subject', () => {
    const cwd = tmpFeatureRepo('repo-harness-review-freshness-overlap');
    try {
      writeFileSync(join(cwd, 'impl.ts'), 'export const value = "feature";\n');
      runGit(cwd, ['add', 'impl.ts']);
      runGit(cwd, ['commit', '-m', 'feature work']);
      const before = buildReviewSubject(cwd, { targetRef: 'main' });

      runGit(cwd, ['checkout', 'main']);
      writeFileSync(join(cwd, 'impl.ts'), 'export const value = "target";\n');
      runGit(cwd, ['add', 'impl.ts']);
      runGit(cwd, ['commit', '-m', 'overlapping target work']);
      runGit(cwd, ['checkout', 'feature']);

      const after = buildReviewSubject(cwd, { targetRef: 'main' });
      expect(after.review_subject_sha256).toBe(before.review_subject_sha256);
      expect(after.target_overlap_paths).toEqual(['impl.ts']);
      expect(after.target_overlap_count).toBe(1);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('represents deletion as normalized final content', () => {
    const cwd = tmpFeatureRepo('repo-harness-review-freshness-delete');
    try {
      runGit(cwd, ['checkout', 'main']);
      writeFileSync(join(cwd, 'remove.ts'), 'export const removed = true;\n');
      runGit(cwd, ['add', 'remove.ts']);
      runGit(cwd, ['commit', '-m', 'add removable file']);
      runGit(cwd, ['checkout', '-B', 'feature', 'main']);
      const before = buildReviewSubject(cwd, { targetRef: 'main' });
      rmSync(join(cwd, 'remove.ts'));
      const after = buildReviewSubject(cwd, { targetRef: 'main' });
      expect(after.paths).toEqual(['remove.ts']);
      expect(after.review_subject_sha256).not.toBe(before.review_subject_sha256);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('hashes untracked file content above the legacy 1 MiB cap', () => {
    const cwd = tmpFeatureRepo('repo-harness-review-freshness-large');
    try {
      mkdirSync(join(cwd, 'src'), { recursive: true });
      const big = join(cwd, 'src/big.bin');
      writeFileSync(big, Buffer.alloc(2 * 1024 * 1024, 0x41));
      const first = buildReviewSubject(cwd, { targetRef: 'main' });
      // Same size, different content: the old metadata-only path was blind to this.
      writeFileSync(big, Buffer.alloc(2 * 1024 * 1024, 0x42));
      const second = buildReviewSubject(cwd, { targetRef: 'main' });
      expect(first.status).toBe('ok');
      expect(second.review_subject_sha256).not.toBe(first.review_subject_sha256);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('observes untracked files with non-ASCII pathnames', () => {
    const cwd = tmpFeatureRepo('repo-harness-review-freshness-unicode');
    try {
      mkdirSync(join(cwd, 'src'), { recursive: true });
      const unicodePath = join(cwd, 'src/变更.ts');
      writeFileSync(unicodePath, 'AAAA');
      const first = buildReviewSubject(cwd, { targetRef: 'main' });
      writeFileSync(unicodePath, 'BBBB'); // same length, different content
      const second = buildReviewSubject(cwd, { targetRef: 'main' });
      expect(first.status).toBe('ok');
      expect(first.paths).toContain('src/变更.ts');
      expect(second.review_subject_sha256).not.toBe(first.review_subject_sha256);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('fails closed with status unknown when git state is unreadable', () => {
    const nonRepo = mkdtempSync(join(tmpdir(), 'repo-harness-review-freshness-nonrepo-'));
    try {
      const fp = buildReviewSubject(nonRepo, { targetRef: 'main' });
      expect(fp.status).toBe('unknown');
      expect(fp.review_subject_sha256).toBe('unknown');
    } finally {
      rmSync(nonRepo, { recursive: true, force: true });
    }
  });

  test('is stable across an operational-only commit', () => {
    const cwd = tmpFeatureRepo('repo-harness-review-freshness-opcommit');
    try {
      writeFileSync(join(cwd, 'impl.ts'), 'export const a = 1;\n');
      runGit(cwd, ['add', 'impl.ts']);
      runGit(cwd, ['commit', '-m', 'feature work']);
      const before = buildReviewSubject(cwd, { targetRef: 'main' });

      mkdirSync(join(cwd, 'tasks/reviews'), { recursive: true });
      writeFileSync(join(cwd, 'tasks/reviews/demo.review.md'), '> **Recommendation**: pass\n');
      runGit(cwd, ['add', 'tasks/reviews/demo.review.md']);
      runGit(cwd, ['commit', '-m', 'record review evidence']);
      const after = buildReviewSubject(cwd, { targetRef: 'main' });

      expect(before.status).toBe('ok');
      expect(after.review_subject_sha256).toBe(before.review_subject_sha256);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('detects content changes in untracked files whose names use git pathspec magic', () => {
    const cwd = tmpFeatureRepo('repo-harness-review-freshness-pathspec');
    try {
      // A leading `:(...)` is valid git pathspec magic, not a literal path. When
      // the discovered name is fed back to git without --literal-pathspecs it is
      // re-interpreted as a (case-insensitive) match for `noop.ts`, which matches
      // nothing, so the file's content was silently excluded from the hash.
      const magicPath = join(cwd, ':(icase)noop.ts');
      writeFileSync(magicPath, 'v1');
      const first = buildReviewSubject(cwd, { targetRef: 'main' });
      writeFileSync(magicPath, 'v2-changed');
      const second = buildReviewSubject(cwd, { targetRef: 'main' });
      expect(first.status).toBe('ok');
      expect(first.paths).toContain(':(icase)noop.ts');
      expect(second.review_subject_sha256).not.toBe(first.review_subject_sha256);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('detects an untracked symlink retargeted to a same-content file', () => {
    const cwd = tmpFeatureRepo('repo-harness-review-freshness-symlink');
    try {
      // Two tracked files with identical content; the implementation diff is the
      // untracked symlink. statSync would follow the link to the (unchanged)
      // content and miss the retarget — the link target must be in the hash.
      writeFileSync(join(cwd, 'a.txt'), 'SAME\n');
      writeFileSync(join(cwd, 'b.txt'), 'SAME\n');
      runGit(cwd, ['add', 'a.txt', 'b.txt']);
      runGit(cwd, ['commit', '-m', 'targets']);
      symlinkSync('a.txt', join(cwd, 'link'));
      const first = buildReviewSubject(cwd, { targetRef: 'main' });
      rmSync(join(cwd, 'link'));
      symlinkSync('b.txt', join(cwd, 'link'));
      const second = buildReviewSubject(cwd, { targetRef: 'main' });
      expect(first.status).toBe('ok');
      expect(first.paths).toContain('link');
      expect(second.review_subject_sha256).not.toBe(first.review_subject_sha256);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('hashes raw symlink target bytes so a non-utf-8 retarget is observed', () => {
    const cwd = tmpFeatureRepo('repo-harness-review-freshness-symlink-bytes');
    try {
      // Two distinct non-utf-8 targets that both decode to the SAME utf-8
      // replacement string ("ta�"). A utf-8 readlink would collapse them to
      // one value (a fingerprint collision); the raw-byte hash must keep them
      // distinct. (The link name stays ascii, so only the target is non-utf-8.)
      symlinkSync(Buffer.from([0x74, 0x61, 0xff]), join(cwd, 'link'));
      const first = buildReviewSubject(cwd, { targetRef: 'main' });
      rmSync(join(cwd, 'link'));
      symlinkSync(Buffer.from([0x74, 0x61, 0xfe]), join(cwd, 'link'));
      const second = buildReviewSubject(cwd, { targetRef: 'main' });
      expect(first.status).toBe('ok');
      expect(first.paths).toContain('link');
      expect(second.review_subject_sha256).not.toBe(first.review_subject_sha256);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('detects an untracked executable-bit flip with no content change', () => {
    const cwd = tmpFeatureRepo('repo-harness-review-freshness-mode');
    try {
      const script = join(cwd, 'script.sh');
      writeFileSync(script, '#!/bin/sh\necho hi\n');
      chmodSync(script, 0o644);
      const first = buildReviewSubject(cwd, { targetRef: 'main' });
      // The executable bit becomes the committed blob mode (100755 vs 100644),
      // so a chmod with no content change is a real implementation diff.
      chmodSync(script, 0o755);
      const second = buildReviewSubject(cwd, { targetRef: 'main' });
      expect(first.status).toBe('ok');
      expect(second.review_subject_sha256).not.toBe(first.review_subject_sha256);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('splitNul fails closed when a git pathname does not round-trip through utf-8', () => {
    // macOS/APFS rejects non-utf-8 filenames, so this Linux-reproducible case is
    // unit-tested against the parser directly: a lossy decode must mark the
    // computation degraded rather than risk a silent path collision.
    const ctx = { degraded: false };
    const tokens = splitNul(Buffer.from([0x62, 0x61, 0x64, 0xff, 0xfe, 0x2e, 0x74, 0x73, 0x00]), ctx);
    expect(tokens.length).toBe(1);
    expect(ctx.degraded).toBe(true);

    const clean = { degraded: false };
    splitNul(Buffer.from('src/ok.ts ', 'utf-8'), clean);
    expect(clean.degraded).toBe(false);
  });

  test('CLI is fail-open for malformed arguments', () => {
    const result = runReviewSubjectCli(['--format', 'text']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('repo-harness-hook review-subject');
  });
});
