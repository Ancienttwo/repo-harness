import { describe, expect, test } from 'bun:test';
import { chmodSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { tmpWorkspace } from '../helpers/repo-fixture';
import { resolveGitCommonDirectory } from '../../src/effects/git/common-directory';
import { runGit } from '../../src/effects/git/run-git';
import {
  DEFAULT_GIT_TIMEOUT_MS,
  gitExecFileSync,
  gitSpawnSync,
  resolveGitExecutable,
  resolveGitTimeout,
} from '../../src/effects/git/runner';

const ROOT = join(import.meta.dir, '..', '..');
const SRC = join(ROOT, 'src');

function writeGit(dir: string, body: string): string {
  const bin = join(dir, 'git');
  writeFileSync(bin, body, { mode: 0o755 });
  chmodSync(bin, 0o755);
  return bin;
}

function withGitBin(bin: string, run: () => void): void {
  const previous = process.env.REPO_HARNESS_GIT_BIN;
  process.env.REPO_HARNESS_GIT_BIN = bin;
  try {
    run();
  } finally {
    if (previous === undefined) delete process.env.REPO_HARNESS_GIT_BIN;
    else process.env.REPO_HARNESS_GIT_BIN = previous;
  }
}

describe('git runner', () => {
  test('REPO_HARNESS_GIT_BIN is the executable for every runner entry', () => {
    const root = tmpWorkspace('git-runner-bin');
    try {
      const record = join(root, 'args');
      const bin = writeGit(root, `#!/bin/sh\nprintf '%s\\n' "$*" > ${JSON.stringify(record)}\nprintf 'ok\\n'\n`);
      const gitDir = join(root, 'common');
      mkdirSync(gitDir);
      mkdirSync(join(root, 'common-bin'));
      const commonGit = writeGit(join(root, 'common-bin'), `#!/bin/sh\nprintf '%s\\n' ${JSON.stringify(gitDir)}\n`);
      expect(gitExecFileSync(['status', '--porcelain'], {
        encoding: 'utf8',
        env: { ...process.env, REPO_HARNESS_GIT_BIN: bin },
      }).trim()).toBe('ok');
      expect(readFileSync(record, 'utf8')).toBe('status --porcelain\n');
      const spawned = gitSpawnSync(['diff'], {
        encoding: 'utf8',
        env: { ...process.env, REPO_HARNESS_GIT_BIN: bin },
      });
      expect(spawned.status).toBe(0);
      expect(readFileSync(record, 'utf8')).toBe('diff\n');
      const ran = runGit(['rev-parse'], {
        env: { ...process.env, REPO_HARNESS_GIT_BIN: bin },
        timeoutMs: 5_000,
      });
      expect(ran.status).toBe(0);
      expect(ran.stdout.trim()).toBe('ok');
      withGitBin(commonGit, () => {
        expect(resolveGitCommonDirectory(root)).toBe(gitDir);
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('an explicit git path wins over REPO_HARNESS_GIT_BIN', () => {
    const root = tmpWorkspace('git-runner-explicit');
    try {
      const record = join(root, 'which');
      const ignored = writeGit(root, `#!/bin/sh\nprintf 'env\\n' > ${JSON.stringify(record)}\n`);
      mkdirSync(join(root, 'chosen'));
      const pinned = writeGit(join(root, 'chosen'), `#!/bin/sh\nprintf 'pinned\\n' > ${JSON.stringify(record)}\nprintf 'ok\\n'\n`);
      expect(gitExecFileSync(['status'], {
        encoding: 'utf8',
        gitBin: pinned,
        env: { ...process.env, REPO_HARNESS_GIT_BIN: ignored },
      }).trim()).toBe('ok');
      expect(readFileSync(record, 'utf8')).toBe('pinned\n');
      expect(resolveGitExecutable('git', { REPO_HARNESS_GIT_BIN: pinned }, {})).toBe(pinned);
      expect(resolveGitExecutable(pinned, { REPO_HARNESS_GIT_BIN: ignored }, {})).toBe(pinned);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('a hung git stops at the runner timeout', () => {
    const root = tmpWorkspace('git-runner-hang');
    try {
      const bin = writeGit(root, '#!/bin/sh\nsleep 30\n');
      const started = Date.now();
      const result = gitSpawnSync(['sleep'], { gitBin: bin, timeout: 300 });
      expect(Date.now() - started).toBeLessThan(5_000);
      expect((result.error as NodeJS.ErrnoException | undefined)?.code).toBe('ETIMEDOUT');
      expect(resolveGitTimeout(undefined)).toBe(DEFAULT_GIT_TIMEOUT_MS);
      expect(DEFAULT_GIT_TIMEOUT_MS).toBe(120_000);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('src starts git only through the runner', () => {
    const patterns = [
      /\b(?:execFileSync|spawnSync|spawn|execFile|observationExecFileSync|observationSpawnSync|runProcess|runBoundedProcess)\(\s*['"]git['"]/g,
      /\b(?:execFileSync|spawnSync)\(\s*(?:(?:gitBin|input\.gitBin|opts\.gitBin)\b|(?:gitBinary|configuredGitBinary)\s*\()/g,
      /\brunBoundedProcess\(\s*runtime\?\.gitBin/g,
    ];
    for (const source of [
      "execFileSync(configuredGitBinary(), ['status'])",
      "spawnSync(gitBinary(), ['status'])",
      "execFileSync(gitBin, ['status'])",
      "spawnSync(input.gitBin, ['status'])",
      "spawnSync(opts.gitBin, ['status'])",
    ]) {
      expect(patterns.some(pattern => {
        pattern.lastIndex = 0;
        return pattern.test(source);
      }), source).toBe(true);
    }
    const violations: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(path);
          continue;
        }
        if (!entry.isFile() || !entry.name.endsWith('.ts')) continue;
        const relativePath = relative(ROOT, path);
        if (relativePath === 'src/effects/git/runner.ts' || relativePath === 'src/effects/git/run-git.ts') continue;
        const text = readFileSync(path, 'utf8');
        for (const pattern of patterns) {
          pattern.lastIndex = 0;
          if (pattern.test(text)) violations.push(relativePath);
        }
      }
    };
    walk(SRC);
    expect(violations).toEqual([]);
    const collector = readFileSync(join(SRC, 'effects/dev-activity/collector.ts'), 'utf8');
    expect(collector).toContain("command === 'git' ? spawnGit");
  });
});
