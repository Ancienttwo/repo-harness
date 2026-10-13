import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync } from 'child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readlinkSync, realpathSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { DEFAULT_ARCHIVE_ROOT, readRetentionConfig, runArtifactRetention } from '../../src/effects/artifact-retention';
import { formatRetentionReport } from '../../src/cli/commands/retention';
import { runCliInProcess } from '../helpers/cli-in-process';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 13);

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

/** A consumer repo that commits plans/ and keeps tasks/ and checks out of Git. */
function fixture(gitignore = 'tasks/\n.ai/harness/checks/\n.ai/harness/archive/\n'): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'artifact-retention-')));
  roots.push(root);
  execFileSync('git', ['init', '-q', root]);
  writeFileSync(join(root, '.gitignore'), gitignore);
  return root;
}

/** Writes a file and sets it, and every directory up to the root, to `days` old. */
function seed(root: string, path: string, days: number): void {
  const absolute = join(root, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, `${path}\n`);
  const seconds = (NOW - days * DAY_MS) / 1000;
  for (let current = absolute; current !== root; current = dirname(current)) utimesSync(current, seconds, seconds);
}

/** Commits `paths` with author and committer time `days` before NOW. */
function commitAt(root: string, paths: readonly string[], days: number): void {
  const date = `@${Math.floor((NOW - days * DAY_MS) / 1000)} +0000`;
  execFileSync('git', ['-C', root, 'add', '-f', '--', ...paths]);
  execFileSync('git', ['-C', root, '-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false',
    '-c', 'core.hooksPath=/dev/null', 'commit', '-q', '-m', `seed ${days}d`], {
    env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
  });
}

function git(root: string, args: readonly string[]): string {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' });
}

function policy(root: string, retention: unknown): void {
  mkdirSync(join(root, '.ai/harness'), { recursive: true });
  writeFileSync(join(root, '.ai/harness/policy.json'), JSON.stringify({ version: 1, information_lifecycle: { retention } }));
}

describe('artifact retention selection', () => {
  test('a dry run selects only closed artifacts past the 30-day default and moves nothing', () => {
    const root = fixture();
    seed(root, 'plans/archive/plan-old.md', 45);
    seed(root, 'plans/archive/plan-new.md', 3);
    seed(root, 'plans/plan-open.md', 90);
    seed(root, 'plans/archive/.gitkeep', 90);
    seed(root, 'tasks/archive/.gitkeep', 90);
    seed(root, 'tasks/archive/gate-audit/contracts/a.contract.md', 60);
    seed(root, 'tasks/contracts/open.contract.md', 90);
    seed(root, '.ai/harness/checks/verify.log', 31);
    seed(root, '.ai/harness/checks/verify.latest.json', 90);

    const report = runArtifactRetention({ repoRoot: root, apply: false, now: NOW });

    expect(report.mode).toBe('dry-run');
    expect(report.config).toEqual({ days: 30, archiveRoot: DEFAULT_ARCHIVE_ROOT, keep: [] });
    expect(report.archived.map((entry) => [entry.class, entry.path, entry.ageDays])).toEqual([
      ['closed-plans', 'plans/archive/plan-old.md', 45],
      ['closed-task-records', 'tasks/archive/gate-audit', 60],
      ['check-logs', '.ai/harness/checks/verify.log', 31],
    ]);
    expect(report.skipped.map((entry) => [entry.path, entry.reason])).toEqual([['plans/archive/plan-new.md', 'recent']]);
    expect(existsSync(join(root, 'plans/archive/plan-old.md'))).toBe(true);
    expect(existsSync(join(root, DEFAULT_ARCHIVE_ROOT))).toBe(false);
  });

  test('apply moves each entry to the same relative path under the archive root and a rerun finds nothing', () => {
    const root = fixture();
    seed(root, 'plans/archive/plan-old.md', 45);
    seed(root, 'tasks/archive/gate-audit/contracts/a.contract.md', 60);

    const report = runArtifactRetention({ repoRoot: root, apply: true, now: NOW });

    expect(report.mode).toBe('apply');
    expect(report.failed).toEqual([]);
    expect(report.archived.map((entry) => entry.destination)).toEqual([
      `${DEFAULT_ARCHIVE_ROOT}/plans/archive/plan-old.md`,
      `${DEFAULT_ARCHIVE_ROOT}/tasks/archive/gate-audit`,
    ]);
    expect(existsSync(join(root, 'plans/archive/plan-old.md'))).toBe(false);
    expect(existsSync(join(root, DEFAULT_ARCHIVE_ROOT, 'plans/archive/plan-old.md'))).toBe(true);
    expect(existsSync(join(root, DEFAULT_ARCHIVE_ROOT, 'tasks/archive/gate-audit/contracts/a.contract.md'))).toBe(true);
    expect(readdirSync(join(root, 'tasks/archive'))).toEqual([]);

    const rerun = runArtifactRetention({ repoRoot: root, apply: true, now: NOW });
    expect(rerun.archived).toEqual([]);
    expect(rerun.skipped).toEqual([]);
  });

  test('only run records that nothing reads back leave the runs directory', () => {
    const root = fixture('.ai/harness/runs/\n.ai/harness/archive/\n');
    const runs = '.ai/harness/runs';
    seed(root, `${runs}/verification-vx-0123456789abcdef0123.log`, 60);
    seed(root, `${runs}/heartbeat-20260801T010203-42-heartbeat-triage.json`, 60);
    seed(root, `${runs}/contract-run-20260801T010203-fix/manifest.json`, 60);
    seed(root, `${runs}/contract-run-20260801T010204-crashed/worker.stdout.log`, 60);
    seed(root, `${runs}/verification-vx-0123456789abcdef0123.json`, 60);
    seed(root, `${runs}/plan-a.report.json`, 60);
    seed(root, `${runs}/run-20260801T010203-42.json`, 60);
    seed(root, `${runs}/hook-events.jsonl`, 60);
    seed(root, `${runs}/continuation/attempts.jsonl`, 60);
    seed(root, `${runs}/task-agents/abc/closed.json`, 60);
    seed(root, `${runs}/.gitkeep`, 60);

    const report = runArtifactRetention({ repoRoot: root, apply: true, now: NOW });

    expect(report.archived.map((entry) => [entry.class, entry.path])).toEqual([
      ['run-records', `${runs}/contract-run-20260801T010203-fix`],
      ['run-records', `${runs}/heartbeat-20260801T010203-42-heartbeat-triage.json`],
      ['run-records', `${runs}/verification-vx-0123456789abcdef0123.log`],
    ]);
    expect(report.skipped).toEqual([]);
    expect(existsSync(join(root, DEFAULT_ARCHIVE_ROOT, runs, 'contract-run-20260801T010203-fix/manifest.json'))).toBe(true);
    expect(readdirSync(join(root, runs)).sort()).toEqual([
      '.gitkeep',
      'continuation',
      'contract-run-20260801T010204-crashed',
      'hook-events.jsonl',
      'plan-a.report.json',
      'run-20260801T010203-42.json',
      'task-agents',
      'verification-vx-0123456789abcdef0123.json',
    ]);
  });

  test('a directory entry is as recent as the newest file inside it', () => {
    const root = fixture();
    seed(root, 'tasks/archive/batch/old.md', 90);
    seed(root, 'tasks/archive/batch/recent.md', 2);
    const seconds = (NOW - 90 * DAY_MS) / 1000;
    utimesSync(join(root, 'tasks/archive/batch'), seconds, seconds);

    const report = runArtifactRetention({ repoRoot: root, apply: true, now: NOW });

    expect(report.archived).toEqual([]);
    expect(report.skipped.map((entry) => [entry.path, entry.reason, entry.ageDays])).toEqual([['tasks/archive/batch', 'recent', 2]]);
  });

  test('committed plans stay in Git for the window, counted from the last commit, then leave it unstaged', () => {
    const root = fixture();
    seed(root, 'plans/archive/plan-old.md', 1);
    seed(root, 'plans/archive/plan-recent.md', 90);
    seed(root, 'plans/archive/plan-edited.md', 90);
    commitAt(root, ['plans/archive/plan-old.md', 'plans/archive/plan-edited.md'], 90);
    commitAt(root, ['plans/archive/plan-recent.md'], 5);
    writeFileSync(join(root, 'plans/archive/plan-edited.md'), 'uncommitted edit\n');

    const report = runArtifactRetention({ repoRoot: root, apply: true, now: NOW });

    // File times say the opposite of the commit times; the commit time decides.
    expect(report.archived.map((entry) => [entry.path, entry.ageDays, entry.tracked])).toEqual([['plans/archive/plan-old.md', 90, true]]);
    expect(report.skipped.map((entry) => [entry.path, entry.reason])).toEqual([
      ['plans/archive/plan-edited.md', 'modified'],
      ['plans/archive/plan-recent.md', 'recent'],
    ]);
    expect(existsSync(join(root, DEFAULT_ARCHIVE_ROOT, 'plans/archive/plan-old.md'))).toBe(true);
    expect(git(root, ['diff', '--cached', '--name-only'])).toBe('');
    expect(git(root, ['status', '--porcelain', '--', 'plans']).split('\n').filter(Boolean).sort()).toEqual([
      ' D plans/archive/plan-old.md',
      ' M plans/archive/plan-edited.md',
    ]);
    expect(formatRetentionReport(report)).toContain('1 archived entries are tracked by Git. Retention does not stage or commit; commit their removal.');
  });

  test('task records with a committed file stay in place', () => {
    const root = fixture('.ai/harness/archive/\n');
    seed(root, 'tasks/archive/mixed/tracked.md', 90);
    seed(root, 'tasks/archive/mixed/local.md', 90);
    commitAt(root, ['tasks/archive/mixed/tracked.md'], 90);

    const report = runArtifactRetention({ repoRoot: root, apply: true, now: NOW });

    expect(report.archived).toEqual([]);
    expect(report.skipped.map((entry) => [entry.path, entry.reason])).toEqual([['tasks/archive/mixed', 'tracked']]);
    expect(git(root, ['status', '--porcelain', '--untracked-files=no', '--', 'tasks'])).toBe('');
    expect(existsSync(join(root, 'tasks/archive/mixed/local.md'))).toBe(true);
  });

  test('a scanned directory reached through a symlink is refused before anything moves', () => {
    const root = fixture();
    seed(root, 'plans/live/open.md', 90);
    commitAt(root, ['plans/live/open.md'], 90);
    symlinkSync('live', join(root, 'plans/archive'));

    expect(() => runArtifactRetention({ repoRoot: root, apply: true, now: NOW }))
      .toThrow('retention refuses a path through a symlink: plans/archive');
    expect(existsSync(join(root, 'plans/live/open.md'))).toBe(true);
    expect(git(root, ['status', '--porcelain', '--untracked-files=no'])).toBe('');
  });

  test('a dangling symlink at the destination counts as occupied', () => {
    const root = fixture();
    seed(root, 'tasks/archive/notes-old.md', 90);
    const destination = join(root, DEFAULT_ARCHIVE_ROOT, 'tasks/archive/notes-old.md');
    mkdirSync(dirname(destination), { recursive: true });
    symlinkSync('missing-target', destination);

    const report = runArtifactRetention({ repoRoot: root, apply: true, now: NOW });

    expect(report.archived).toEqual([]);
    expect(report.skipped.map((entry) => [entry.path, entry.reason])).toEqual([['tasks/archive/notes-old.md', 'destination-exists']]);
    expect(lstatSync(destination).isSymbolicLink()).toBe(true);
    expect(readlinkSync(destination)).toBe('missing-target');
    expect(existsSync(join(root, 'tasks/archive/notes-old.md'))).toBe(true);
  });

  test('keep paths, entries that contain one, and occupied destinations are skipped', () => {
    const root = fixture();
    policy(root, { keep: ['plans/archive/plan-pinned.md', 'tasks/archive/pinned/notes.md'] });
    seed(root, 'plans/archive/plan-pinned.md', 90);
    seed(root, 'tasks/archive/pinned/notes.md', 90);
    seed(root, 'plans/archive/plan-taken.md', 90);
    seed(root, `${DEFAULT_ARCHIVE_ROOT}/plans/archive/plan-taken.md`, 1);

    const report = runArtifactRetention({ repoRoot: root, apply: true, now: NOW });

    expect(report.archived).toEqual([]);
    expect(report.skipped.map((entry) => [entry.path, entry.reason])).toEqual([
      ['plans/archive/plan-pinned.md', 'kept'],
      ['plans/archive/plan-taken.md', 'destination-exists'],
      ['tasks/archive/pinned', 'kept'],
    ]);
    expect(existsSync(join(root, 'plans/archive/plan-taken.md'))).toBe(true);
  });

  test('policy overrides the window and the archive root', () => {
    const root = fixture('/local-archive/\n');
    policy(root, { days: 7, archive_root: 'local-archive/' });
    seed(root, 'plans/archive/plan-week.md', 8);

    const report = runArtifactRetention({ repoRoot: root, apply: true, now: NOW });

    expect(report.config).toEqual({ days: 7, archiveRoot: 'local-archive', keep: [] });
    expect(report.archived.map((entry) => entry.destination)).toEqual(['local-archive/plans/archive/plan-week.md']);
    expect(existsSync(join(root, 'local-archive/plans/archive/plan-week.md'))).toBe(true);
  });

  test.each([
    ['no rule', '', 'archive root local-archive is not gitignored'],
    ['a rule that matches only a probe name', '.retention-probe\n', 'archive root local-archive is not gitignored'],
    ['an exception below the root', 'local-archive/*\n!local-archive/plans/\n', 'archive destinations are not gitignored: local-archive/plans/archive/plan-old.md'],
  ])('an archive destination Git would see (%s) is refused before anything moves', (_, gitignore, message) => {
    const root = fixture(gitignore);
    policy(root, { archive_root: 'local-archive' });
    seed(root, 'plans/archive/plan-old.md', 90);

    expect(() => runArtifactRetention({ repoRoot: root, apply: true, now: NOW })).toThrow(message);
    expect(existsSync(join(root, 'plans/archive/plan-old.md'))).toBe(true);
    expect(existsSync(join(root, 'local-archive'))).toBe(false);
  });

  test('an explicit null policy field fails closed instead of taking the default', () => {
    const root = fixture();
    policy(root, { days: null });
    seed(root, 'tasks/archive/notes-old.md', 90);

    expect(() => runArtifactRetention({ repoRoot: root, apply: true, now: NOW })).toThrow('retention.days must be a positive integer');
    expect(existsSync(join(root, 'tasks/archive/notes-old.md'))).toBe(true);
    expect(existsSync(join(root, DEFAULT_ARCHIVE_ROOT))).toBe(false);
  });

  test.each([
    [{ days: 0 }, 'retention.days must be a positive integer'],
    [{ days: '30' }, 'retention.days must be a positive integer'],
    [{ days: null }, 'retention.days must be a positive integer'],
    [{ keep: null }, 'retention.keep must be an array'],
    [{ keep: ['plans/archive/./pinned.md'] }, 'retention.keep[0] must be a canonical path'],
    [{ keep: ['plans//archive/pinned.md'] }, 'retention.keep[0] must be a canonical path'],
    [{ archive_root: 'plans//archive/old' }, 'retention.archive_root must be a canonical path'],
    [{ archive_root: '/var/archive' }, 'absolute paths are not allowed'],
    [{ archive_root: '../outside' }, 'path traversal is not allowed'],
    [{ archive_root: 'plans/archive/old' }, 'overlaps scanned directory plans/archive'],
    [{ archive_root: '.ai/harness/runs/archive' }, 'overlaps scanned directory .ai/harness/runs'],
    [{ keep: 'plans/archive' }, 'retention.keep must be an array'],
    [{ retain: 30 }, 'unknown information_lifecycle.retention key: retain'],
    [[], 'information_lifecycle.retention must be an object'],
  ])('malformed retention policy %j fails closed', (retention, message) => {
    const root = fixture();
    policy(root, retention);
    expect(() => readRetentionConfig(root)).toThrow(message);
  });
});

describe('retention command', () => {
  test('dry-runs by default and moves only with --apply', async () => {
    const root = fixture();
    seed(root, 'plans/archive/plan-old.md', 400);

    const dryRun = await runCliInProcess(['retention', '--repo', root], root, process.env);
    expect(dryRun.status).toBe(0);
    expect(dryRun.stdout).toContain('retention dry-run: would archive 1, skipped 0, failed 0');
    expect(dryRun.stdout).toContain(`would archive: plans/archive/plan-old.md (`);
    expect(existsSync(join(root, 'plans/archive/plan-old.md'))).toBe(true);

    const applied = await runCliInProcess(['retention', '--repo', root, '--apply', '--json'], root, process.env);
    expect(applied.status).toBe(0);
    const report = JSON.parse(applied.stdout) as { mode: string; archived: { path: string }[] };
    expect(report.mode).toBe('apply');
    expect(report.archived.map((entry) => entry.path)).toEqual(['plans/archive/plan-old.md']);
    expect(statSync(join(root, DEFAULT_ARCHIVE_ROOT, 'plans/archive/plan-old.md')).isFile()).toBe(true);
  });
});
