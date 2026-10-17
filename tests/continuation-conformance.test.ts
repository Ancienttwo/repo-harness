import { describe, expect, test } from 'bun:test';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { buildReviewSubject } from '../src/effects/review/diff-fingerprint';

const ROOT = join(import.meta.dir, '..');
const LEDGER = '.ai/harness/runs/continuation/attempts.jsonl';


// Ambient authority vars would let the helpers repoint themselves at the real
// repository; bun runs test files in one process, so a leaked value from a
// concurrent file must not reach a fixture subprocess.
const AUTHORITY_ENV_KEYS = [
  'REPO_HARNESS_TARGET_REPO_ROOT',
  'REPO_HARNESS_HELPER_SOURCE',
  'REPO_HARNESS_HELPER_SOURCE_PATH',
  'REPO_HARNESS_SOURCE_ROOT',
  'REPO_HARNESS_GIT_BIN',
] as const;

function isolatedEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const base = { ...process.env };
  for (const key of AUTHORITY_ENV_KEYS) delete base[key];
  return { ...base, ...extra };
}

interface Run {
  readonly status: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
}

function run(command: string, args: readonly string[], cwd: string, env: NodeJS.ProcessEnv = {}): Run {
  const result = spawnSync(command, args as string[], { cwd, encoding: 'utf-8', env: isolatedEnv(env) });
  return {
    status: result.status,
    signal: result.signal,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function git(cwd: string, args: readonly string[]): Run {
  return run('git', args, cwd);
}

function withTempDir<T>(prefix: string, fn: (dir: string) => T): T {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), `${prefix}-`)));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('attempt receipts are invisible to progress_token by two independent mechanisms', () => {
  // Arm 1, against the real repository: the shipped ignore rule covers the
  // ledger, so it never reaches the Git scan that builds the review subject.
  test('the shipped .gitignore covers the attempt ledger path', () => {
    const ignored = git(ROOT, ['check-ignore', '-q', LEDGER]);
    expect(ignored.status, `git check-ignore did not cover ${LEDGER}`).toBe(0);
  }, 30_000);

  // Arm 2, in a repository with no ignore rule at all: the review-subject
  // classifier alone excludes the ledger. `isOperationalReviewPath` is module
  // private, so this asserts through its only exported consumer -- the same
  // predicate that decides `paths` vs `excluded_paths`.
  test('the review-subject classifier excludes the ledger even when it is not ignored', () => {
    withTempDir('continuation-classifier', (cwd) => {
      expect(git(cwd, ['init', '-q', '-b', 'main', '.']).status).toBe(0);
      expect(git(cwd, ['config', 'user.email', 'conformance@test.local']).status).toBe(0);
      expect(git(cwd, ['config', 'user.name', 'Conformance Test']).status).toBe(0);
      writeFileSync(join(cwd, 'README.md'), 'fixture\n');
      expect(git(cwd, ['add', '-A']).status).toBe(0);
      expect(git(cwd, ['commit', '-qm', 'fixture']).status).toBe(0);

      // No .gitignore in this repository: the ledger is a plain untracked file.
      mkdirSync(join(cwd, '.ai/harness/runs/continuation'), { recursive: true });
      writeFileSync(join(cwd, LEDGER), '{"protocol":1}\n');
      expect(existsSync(join(cwd, '.gitignore'))).toBe(false);
      expect(git(cwd, ['check-ignore', '-q', LEDGER]).status).not.toBe(0);

      const subject = buildReviewSubject(cwd);
      expect(subject.status).toBe('ok');
      expect(subject.excluded_paths).toContain(LEDGER);
      expect(subject.paths).not.toContain(LEDGER);
    });
  }, 30_000);
});
