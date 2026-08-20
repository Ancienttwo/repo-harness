import { describe, expect, test } from 'bun:test';
import { createHash } from 'crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { guardedWriteFile } from '../../src/cli/mcp/guarded-write';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function withDir<T>(fn: (root: string) => T): T {
  const root = mkdtempSync(join(tmpdir(), 'repo-harness-guarded-write-'));
  try {
    return fn(root);
  } finally {
    try {
      chmodSync(root, 0o700);
    } catch (_error) {
      // The directory may already be writable; cleanup below is what matters.
    }
    rmSync(root, { recursive: true, force: true });
  }
}

function tempResidue(root: string): string[] {
  return readdirSync(root).filter((entry) => entry.endsWith('.tmp'));
}

describe('guardedWriteFile', () => {
  test('creates an absent target when no precondition is supplied', () => {
    withDir((root) => {
      const target = join(root, 'nested', 'created.md');
      const outcome = guardedWriteFile(target, 'nested/created.md', '# Created\n', undefined);

      expect(outcome).toEqual({ ok: true, sha256: sha256('# Created\n'), previousSha256: null });
      expect(readFileSync(target, 'utf-8')).toBe('# Created\n');
      expect(tempResidue(join(root, 'nested'))).toEqual([]);
    });
  });

  test('refuses to clobber an existing target when no precondition is supplied', () => {
    withDir((root) => {
      const target = join(root, 'existing.md');
      writeFileSync(target, '# Original\n');

      const outcome = guardedWriteFile(target, 'existing.md', '# Replacement\n', undefined);

      expect(outcome.ok).toBe(false);
      if (outcome.ok) throw new Error('unreachable');
      expect(outcome.code).toBe('WOULD_OVERWRITE');
      expect(readFileSync(target, 'utf-8')).toBe('# Original\n');
      // A conflict must never hand back the current hash: that turns a guard into
      // a blind write -> lift-hash -> rewrite loop.
      expect(JSON.stringify(outcome)).not.toContain(sha256('# Original\n'));
    });
  });

  test('replaces an existing target when the precondition matches and reports both hashes', () => {
    withDir((root) => {
      const target = join(root, 'guarded.md');
      writeFileSync(target, '# Original\n');

      const outcome = guardedWriteFile(target, 'guarded.md', '# Replacement\n', sha256('# Original\n'));

      expect(outcome).toEqual({
        ok: true,
        sha256: sha256('# Replacement\n'),
        previousSha256: sha256('# Original\n'),
      });
      expect(readFileSync(target, 'utf-8')).toBe('# Replacement\n');
      expect(tempResidue(root)).toEqual([]);
    });
  });

  test('rejects a stale precondition without leaking the current hash and leaves the file unchanged', () => {
    withDir((root) => {
      const target = join(root, 'stale.md');
      writeFileSync(target, '# Current\n');

      const outcome = guardedWriteFile(target, 'stale.md', '# Loser\n', sha256('# Whatever the caller last read\n'));

      expect(outcome.ok).toBe(false);
      if (outcome.ok) throw new Error('unreachable');
      expect(outcome.code).toBe('REVISION_CONFLICT');
      expect(readFileSync(target, 'utf-8')).toBe('# Current\n');
      expect(JSON.stringify(outcome)).not.toContain(sha256('# Current\n'));
      expect(tempResidue(root)).toEqual([]);
    });
  });

  test('reports target_absent when a precondition is supplied for a file that does not exist', () => {
    withDir((root) => {
      const outcome = guardedWriteFile(join(root, 'missing.md'), 'missing.md', '# Body\n', sha256('# Body\n'));

      expect(outcome.ok).toBe(false);
      if (outcome.ok) throw new Error('unreachable');
      expect(outcome.code).toBe('REVISION_CONFLICT');
      expect(outcome.details).toMatchObject({ reason: 'target_absent' });
      expect(existsSync(join(root, 'missing.md'))).toBe(false);
    });
  });

  test('refuses a symlinked target and leaves the link target untouched', () => {
    withDir((root) => {
      const linkTarget = join(root, 'spec.md');
      const link = join(root, 'plan.md');
      writeFileSync(linkTarget, '# Protected\n');
      symlinkSync(linkTarget, link);

      const outcome = guardedWriteFile(link, 'plan.md', '# Clobber\n', undefined);

      expect(outcome.ok).toBe(false);
      if (outcome.ok) throw new Error('unreachable');
      expect(outcome.code).toBe('SYMLINK_ESCAPE');
      expect(readFileSync(linkTarget, 'utf-8')).toBe('# Protected\n');
    });
  });

  test('refuses a directory target', () => {
    withDir((root) => {
      mkdirSync(join(root, 'a-directory'));

      const outcome = guardedWriteFile(join(root, 'a-directory'), 'a-directory', '# Body\n', undefined);

      expect(outcome.ok).toBe(false);
      if (outcome.ok) throw new Error('unreachable');
      expect(outcome.code).toBe('NOT_A_REGULAR_FILE');
    });
  });

  test('a failed write leaves the original intact and no .tmp residue', () => {
    withDir((root) => {
      const target = join(root, 'durable.md');
      writeFileSync(target, '# Original\n');
      // Inject a commit failure: a read-execute-only parent directory fails the
      // temp-file creation that the durable commit depends on.
      chmodSync(root, 0o500);

      const outcome = guardedWriteFile(target, 'durable.md', '# Replacement\n', sha256('# Original\n'));

      chmodSync(root, 0o700);
      expect(outcome.ok).toBe(false);
      if (outcome.ok) throw new Error('unreachable');
      expect(outcome.code).toBe('WRITE_FAILED');
      expect(readFileSync(target, 'utf-8')).toBe('# Original\n');
      expect(tempResidue(root)).toEqual([]);
    });
  });

  test('preserves the mode of a replaced file', () => {
    withDir((root) => {
      const target = join(root, 'moded.md');
      writeFileSync(target, '# Original\n');
      chmodSync(target, 0o640);

      const outcome = guardedWriteFile(target, 'moded.md', '# Replacement\n', sha256('# Original\n'));

      expect(outcome.ok).toBe(true);
      expect(readFileSync(target, 'utf-8')).toBe('# Replacement\n');
      expect(statSync(target).mode & 0o777).toBe(0o640);
    });
  });
});
