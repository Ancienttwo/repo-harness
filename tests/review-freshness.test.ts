import { describe, expect, test } from 'bun:test';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';
import {
  IMPLEMENTATION_FINGERPRINT_SCOPE,
  buildImplementationDiffFingerprint,
  runReviewFingerprintCli,
  splitNul,
} from '../src/cli/hook/diff-fingerprint';

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
// exercising target-bound fingerprint behaviour.
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

describe('review freshness fingerprint', () => {
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

      const first = buildImplementationDiffFingerprint(source);
      const second = buildImplementationDiffFingerprint(clone);

      expect(first.status).toBe('ok');
      expect(first.scope).toBe(IMPLEMENTATION_FINGERPRINT_SCOPE);
      expect(first.paths).toEqual(['README.md', 'src/new.ts']);
      expect(second.paths).toEqual(first.paths);
      expect(second.fingerprint).toBe(first.fingerprint);
    } finally {
      rmSync(source, { recursive: true, force: true });
      rmSync(cloneParent, { recursive: true, force: true });
    }
  });

  test('excludes review and check artifacts from the implementation fingerprint', () => {
    const cwd = tmpRepo('repo-harness-review-freshness-exclude');
    try {
      const clean = buildImplementationDiffFingerprint(cwd);

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

      const operationalOnly = buildImplementationDiffFingerprint(cwd);
      expect(operationalOnly.excluded_paths).toEqual([
        '.ai/harness/active-plan',
        '.ai/harness/checks/latest.json',
        '.ai/harness/failures/latest.jsonl',
        '.ai/harness/handoff/current.md',
        '.ai/harness/state/effective.json',
        'tasks/reviews/demo.review.md',
      ]);
      expect(operationalOnly.paths).toEqual([]);
      expect(operationalOnly.fingerprint).toBe(clean.fingerprint);

      writeFileSync(join(cwd, 'README.md'), '# Demo\n\nimplementation change\n');
      const implementationChange = buildImplementationDiffFingerprint(cwd);
      expect(implementationChange.paths).toEqual(['README.md']);
      expect(implementationChange.fingerprint).not.toBe(clean.fingerprint);
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
      const before = buildImplementationDiffFingerprint(repo, { baseRef: 'HEAD' });

      writeFileSync(join(repo, 'evals', 'harness', 'reports', 'profile-comparison.json'), '{"run":2}\n');
      writeFileSync(join(repo, 'evals', 'harness', 'reports', 'profile-comparison.md'), '# Run 2\n');
      const after = buildImplementationDiffFingerprint(repo, { baseRef: 'HEAD' });

      expect(after.fingerprint).toBe(before.fingerprint);
      expect(after.excluded_paths).toEqual([
        'evals/harness/reports/profile-comparison.json',
        'evals/harness/reports/profile-comparison.md',
      ]);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test('includes untracked file content in the fingerprint', () => {
    const cwd = tmpRepo('repo-harness-review-freshness-untracked');
    try {
      mkdirSync(join(cwd, 'src'), { recursive: true });
      writeFileSync(join(cwd, 'src/new.ts'), 'export const value = 1;\n');
      const first = buildImplementationDiffFingerprint(cwd);

      writeFileSync(join(cwd, 'src/new.ts'), 'export const value = 2;\n');
      const second = buildImplementationDiffFingerprint(cwd);

      expect(first.paths).toEqual(['src/new.ts']);
      expect(second.paths).toEqual(['src/new.ts']);
      expect(second.fingerprint).not.toBe(first.fingerprint);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('stays fresh across an unrelated target advance and a subsequent no-overlap rebase', () => {
    const cwd = tmpFeatureRepo('repo-harness-review-freshness-target-advance');
    try {
      writeFileSync(join(cwd, 'impl.ts'), 'export const a = 1;\n');
      runGit(cwd, ['add', 'impl.ts']);
      runGit(cwd, ['commit', '-m', 'feature work']);

      const beforeTarget = buildImplementationDiffFingerprint(cwd, { baseRef: 'main' });
      expect(beforeTarget.status).toBe('ok');

      // Advance the target branch with a commit that never touches the
      // feature branch's files.
      runGit(cwd, ['checkout', 'main']);
      writeFileSync(join(cwd, 'unrelated.ts'), 'export const b = 2;\n');
      runGit(cwd, ['add', 'unrelated.ts']);
      runGit(cwd, ['commit', '-m', 'target advance']);
      runGit(cwd, ['checkout', 'feature']);

      const afterAdvance = buildImplementationDiffFingerprint(cwd, { baseRef: 'main' });
      // An unrelated target advance alone must not restale the review: the
      // merge-base (and so branch_diff_hash) is unaffected until feature
      // actually rebases onto it.
      expect(afterAdvance.fingerprint).toBe(beforeTarget.fingerprint);

      // Rebase feature onto the advanced target. No file overlap, so the
      // net diff content is unchanged even though HEAD's and main's
      // resolved revs both moved.
      runGit(cwd, ['rebase', 'main']);
      const afterRebase = buildImplementationDiffFingerprint(cwd, { baseRef: 'main' });
      expect(afterRebase.fingerprint).toBe(beforeTarget.fingerprint);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('stales the target-bound fingerprint on real implementation content, path, or deletion changes', () => {
    const cwd = tmpFeatureRepo('repo-harness-review-freshness-target-real-change');
    try {
      writeFileSync(join(cwd, 'impl.ts'), 'export const a = 1;\n');
      writeFileSync(join(cwd, 'other.ts'), 'export const b = 1;\n');
      runGit(cwd, ['add', 'impl.ts', 'other.ts']);
      runGit(cwd, ['commit', '-m', 'feature work']);
      const base = buildImplementationDiffFingerprint(cwd, { baseRef: 'main' });
      expect(base.status).toBe('ok');

      // Real implementation content change.
      writeFileSync(join(cwd, 'impl.ts'), 'export const a = 2;\n');
      runGit(cwd, ['add', 'impl.ts']);
      runGit(cwd, ['commit', '-m', 'content change']);
      const afterContentChange = buildImplementationDiffFingerprint(cwd, { baseRef: 'main' });
      expect(afterContentChange.fingerprint).not.toBe(base.fingerprint);

      // Path change: a new implementation file joins the diff.
      writeFileSync(join(cwd, 'new-module.ts'), 'export const c = 1;\n');
      runGit(cwd, ['add', 'new-module.ts']);
      runGit(cwd, ['commit', '-m', 'add module']);
      const afterPathChange = buildImplementationDiffFingerprint(cwd, { baseRef: 'main' });
      expect(afterPathChange.paths).toContain('new-module.ts');
      expect(afterPathChange.fingerprint).not.toBe(afterContentChange.fingerprint);

      // Deletion status change: a previously tracked implementation file
      // disappears from the diff.
      runGit(cwd, ['rm', 'other.ts']);
      runGit(cwd, ['commit', '-m', 'remove other']);
      const afterDeletion = buildImplementationDiffFingerprint(cwd, { baseRef: 'main' });
      expect(afterDeletion.fingerprint).not.toBe(afterPathChange.fingerprint);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('stales the review when a same-file target change shifts the patch hash after rebase', () => {
    // Built manually (not via tmpFeatureRepo) so impl.ts's shared base
    // content commits on `main` before `feature` branches off it.
    const cwd = mkdtempSync(join(tmpdir(), 'repo-harness-review-freshness-samefile-rebase-'));
    try {
      runGit(cwd, ['init', '-b', 'main']);
      runGit(cwd, ['config', 'user.name', 'Review Freshness Test']);
      runGit(cwd, ['config', 'user.email', 'review-freshness@test.local']);

      const lines = Array.from({ length: 10 }, (_, index) => `l${index}`);
      writeFileSync(join(cwd, 'impl.ts'), `${lines.join('\n')}\n`);
      runGit(cwd, ['add', 'impl.ts']);
      runGit(cwd, ['commit', '-m', 'base content']);
      runGit(cwd, ['checkout', '-b', 'feature']);

      // Feature changes line 5; default diff context (3 lines) reaches
      // lines 2-4 and 6-8.
      const featureLines = [...lines];
      featureLines[5] = 'l5-feature';
      writeFileSync(join(cwd, 'impl.ts'), `${featureLines.join('\n')}\n`);
      runGit(cwd, ['add', 'impl.ts']);
      runGit(cwd, ['commit', '-m', 'feature edit']);

      const beforeTarget = buildImplementationDiffFingerprint(cwd, { baseRef: 'main' });
      expect(beforeTarget.status).toBe('ok');

      // Target changes line 7 of the SAME file — 2 lines from feature's
      // line-5 change, which lands inside the default 3-line diff context
      // window but leaves a 1-line unchanged gap (line 6) so the rebase's
      // 3-way merge does not treat the two edits as the same conflicting
      // hunk.
      runGit(cwd, ['checkout', 'main']);
      const targetLines = [...lines];
      targetLines[7] = 'l7-target';
      writeFileSync(join(cwd, 'impl.ts'), `${targetLines.join('\n')}\n`);
      runGit(cwd, ['add', 'impl.ts']);
      runGit(cwd, ['commit', '-m', 'target edit same file']);
      runGit(cwd, ['checkout', 'feature']);

      runGit(cwd, ['rebase', 'main']);
      const afterRebase = buildImplementationDiffFingerprint(cwd, { baseRef: 'main' });
      // The merge-base moved onto target's new tip, so feature's own hunk
      // around line 5 now carries target's line-7 context — a genuine
      // patch hash change, not a base_ref/base_rev artifact.
      expect(afterRebase.fingerprint).not.toBe(beforeTarget.fingerprint);
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
      const first = buildImplementationDiffFingerprint(cwd, { baseRef: 'main' });
      // Same size, different content: the old metadata-only path was blind to this.
      writeFileSync(big, Buffer.alloc(2 * 1024 * 1024, 0x42));
      const second = buildImplementationDiffFingerprint(cwd, { baseRef: 'main' });
      expect(first.status).toBe('ok');
      expect(second.fingerprint).not.toBe(first.fingerprint);
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
      const first = buildImplementationDiffFingerprint(cwd, { baseRef: 'main' });
      writeFileSync(unicodePath, 'BBBB'); // same length, different content
      const second = buildImplementationDiffFingerprint(cwd, { baseRef: 'main' });
      expect(first.status).toBe('ok');
      expect(first.paths).toContain('src/变更.ts');
      expect(second.fingerprint).not.toBe(first.fingerprint);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('fails closed with status unknown when git state is unreadable', () => {
    const nonRepo = mkdtempSync(join(tmpdir(), 'repo-harness-review-freshness-nonrepo-'));
    try {
      const fp = buildImplementationDiffFingerprint(nonRepo, { baseRef: 'main' });
      expect(fp.status).toBe('unknown');
      expect(fp.fingerprint).toBe('unknown');
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
      const before = buildImplementationDiffFingerprint(cwd, { baseRef: 'main' });

      mkdirSync(join(cwd, 'tasks/reviews'), { recursive: true });
      writeFileSync(join(cwd, 'tasks/reviews/demo.review.md'), '> **Recommendation**: pass\n');
      runGit(cwd, ['add', 'tasks/reviews/demo.review.md']);
      runGit(cwd, ['commit', '-m', 'record review evidence']);
      const after = buildImplementationDiffFingerprint(cwd, { baseRef: 'main' });

      expect(before.status).toBe('ok');
      expect(after.fingerprint).toBe(before.fingerprint);
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
      const first = buildImplementationDiffFingerprint(cwd, { baseRef: 'main' });
      writeFileSync(magicPath, 'v2-changed');
      const second = buildImplementationDiffFingerprint(cwd, { baseRef: 'main' });
      expect(first.status).toBe('ok');
      expect(first.paths).toContain(':(icase)noop.ts');
      expect(second.fingerprint).not.toBe(first.fingerprint);
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
      const first = buildImplementationDiffFingerprint(cwd, { baseRef: 'main' });
      rmSync(join(cwd, 'link'));
      symlinkSync('b.txt', join(cwd, 'link'));
      const second = buildImplementationDiffFingerprint(cwd, { baseRef: 'main' });
      expect(first.status).toBe('ok');
      expect(first.paths).toContain('link');
      expect(second.fingerprint).not.toBe(first.fingerprint);
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
      const first = buildImplementationDiffFingerprint(cwd, { baseRef: 'main' });
      rmSync(join(cwd, 'link'));
      symlinkSync(Buffer.from([0x74, 0x61, 0xfe]), join(cwd, 'link'));
      const second = buildImplementationDiffFingerprint(cwd, { baseRef: 'main' });
      expect(first.status).toBe('ok');
      expect(first.paths).toContain('link');
      expect(second.fingerprint).not.toBe(first.fingerprint);
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
      const first = buildImplementationDiffFingerprint(cwd, { baseRef: 'main' });
      // The executable bit becomes the committed blob mode (100755 vs 100644),
      // so a chmod with no content change is a real implementation diff.
      chmodSync(script, 0o755);
      const second = buildImplementationDiffFingerprint(cwd, { baseRef: 'main' });
      expect(first.status).toBe('ok');
      expect(second.fingerprint).not.toBe(first.fingerprint);
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
    const result = runReviewFingerprintCli(['--format', 'text']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('repo-harness-hook review-fingerprint');
  });
});
