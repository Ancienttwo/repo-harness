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

/** A consumer repo whose scanned roots stay out of Git. */
function fixture(gitignore = '.ai/harness/checks/\n.ai/harness/archive/\n'): string {
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
  test('a dry run selects only finished check logs past the 30-day default and moves nothing', () => {
    const root = fixture();
    seed(root, '.ai/harness/checks/old.log', 45);
    seed(root, '.ai/harness/checks/new.log', 3);
    seed(root, '.ai/harness/checks/latest.json', 90);

    const report = runArtifactRetention({ repoRoot: root, apply: false, now: NOW });

    expect(report.mode).toBe('dry-run');
    expect(report.config).toEqual({ days: 30, archiveDays: 90, archiveRoot: DEFAULT_ARCHIVE_ROOT, keep: [] });
    expect(report.archived.map((entry) => [entry.class, entry.path, entry.ageDays])).toEqual([
      ['check-logs', '.ai/harness/checks/old.log', 45],
    ]);
    expect(report.skipped.map((entry) => [entry.path, entry.reason])).toEqual([['.ai/harness/checks/new.log', 'recent']]);
    expect(existsSync(join(root, '.ai/harness/checks/old.log'))).toBe(true);
    expect(existsSync(join(root, DEFAULT_ARCHIVE_ROOT))).toBe(false);
  });

  test('apply moves each entry to the same relative path under the archive root and a rerun finds nothing', () => {
    const root = fixture();
    seed(root, '.ai/harness/checks/old.log', 45);

    const report = runArtifactRetention({ repoRoot: root, apply: true, now: NOW });

    expect(report.mode).toBe('apply');
    expect(report.failed).toEqual([]);
    expect(report.archived.map((entry) => entry.destination)).toEqual([
      `${DEFAULT_ARCHIVE_ROOT}/.ai/harness/checks/old.log`,
    ]);
    expect(existsSync(join(root, '.ai/harness/checks/old.log'))).toBe(false);
    expect(existsSync(join(root, DEFAULT_ARCHIVE_ROOT, '.ai/harness/checks/old.log'))).toBe(true);

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

  test('fs-transaction backups past the window leave for the archive root and recent ones stay', () => {
    const root = fixture('.ai/harness/backups/\n.ai/harness/archive/\n');
    const backups = '.ai/harness/backups/fs-transaction';
    seed(root, `${backups}/1700000000000-42-1/manifest.json`, 45);
    seed(root, `${backups}/AGENTS.md.1700000000000-42-1.bak`, 45);
    seed(root, `${backups}/1790000000000-43-1/manifest.json`, 2);

    const report = runArtifactRetention({ repoRoot: root, apply: true, now: NOW });

    expect(report.archived.map((entry) => [entry.class, entry.path])).toEqual([
      ['transaction-backups', `${backups}/1700000000000-42-1`],
      ['transaction-backups', `${backups}/AGENTS.md.1700000000000-42-1.bak`],
    ]);
    expect(report.skipped.map((entry) => [entry.path, entry.reason])).toEqual([[`${backups}/1790000000000-43-1`, 'recent']]);
    expect(existsSync(join(root, DEFAULT_ARCHIVE_ROOT, backups, '1700000000000-42-1/manifest.json'))).toBe(true);
    expect(readdirSync(join(root, backups))).toEqual(['1790000000000-43-1']);
  });

  test('archived entries past the archive window are deleted and the rest of the archive stays', () => {
    const root = fixture();
    const archive = DEFAULT_ARCHIVE_ROOT;
    seed(root, `${archive}/.ai/harness/checks/expired.log`, 91);
    seed(root, `${archive}/.ai/harness/checks/recent.log`, 89);
    seed(root, `${archive}/notes.md`, 400);

    const dryRun = runArtifactRetention({ repoRoot: root, apply: false, now: NOW });
    expect(dryRun.purged.map((entry) => [entry.class, entry.path, entry.ageDays])).toEqual([
      ['check-logs', `${archive}/.ai/harness/checks/expired.log`, 91],
    ]);
    expect(existsSync(join(root, archive, '.ai/harness/checks/expired.log'))).toBe(true);

    const report = runArtifactRetention({ repoRoot: root, apply: true, now: NOW });

    expect(report.purged).toEqual(dryRun.purged);
    expect(report.purgeFailed).toEqual([]);
    expect(existsSync(join(root, archive, '.ai/harness/checks/expired.log'))).toBe(false);
    expect(existsSync(join(root, archive, '.ai/harness/checks/recent.log'))).toBe(true);
    expect(existsSync(join(root, archive, 'notes.md'))).toBe(true);
    expect(formatRetentionReport(report)).toContain(`deleted: ${archive}/.ai/harness/checks/expired.log (91d)`);
  });

  test('an archived entry Git would see is refused before anything is deleted', () => {
    const root = fixture('local-archive/*\n!local-archive/.ai/\n');
    policy(root, { archive_root: 'local-archive' });
    seed(root, 'local-archive/.ai/harness/checks/expired.log', 400);

    expect(() => runArtifactRetention({ repoRoot: root, apply: true, now: NOW }))
      .toThrow('archived entries are not gitignored: local-archive/.ai/harness/checks/expired.log');
    expect(existsSync(join(root, 'local-archive/.ai/harness/checks/expired.log'))).toBe(true);
  });

  test('a directory entry is as recent as the newest file inside it', () => {
    const root = fixture('.ai/harness/runs/\n.ai/harness/archive/\n');
    seed(root, '.ai/harness/runs/contract-run-20260801T010203-fix/old.log', 90);
    seed(root, '.ai/harness/runs/contract-run-20260801T010203-fix/recent.log', 2);
    seed(root, '.ai/harness/runs/contract-run-20260801T010203-fix/manifest.json', 90);
    const seconds = (NOW - 90 * DAY_MS) / 1000;
    utimesSync(join(root, '.ai/harness/runs/contract-run-20260801T010203-fix'), seconds, seconds);

    const report = runArtifactRetention({ repoRoot: root, apply: true, now: NOW });

    expect(report.archived).toEqual([]);
    expect(report.skipped.map((entry) => [entry.path, entry.reason, entry.ageDays])).toEqual([
      ['.ai/harness/runs/contract-run-20260801T010203-fix', 'recent', 2],
    ]);
  });

  test('an entry with a committed file is skipped and stays in Git', () => {
    const root = fixture();
    seed(root, '.ai/harness/checks/tracked.log', 90);
    commitAt(root, ['.ai/harness/checks/tracked.log'], 90);

    const report = runArtifactRetention({ repoRoot: root, apply: true, now: NOW });

    expect(report.archived).toEqual([]);
    expect(report.skipped.map((entry) => [entry.path, entry.reason])).toEqual([
      ['.ai/harness/checks/tracked.log', 'tracked'],
    ]);
    expect(git(root, ['status', '--porcelain', '--untracked-files=no'])).toBe('');
  });

  test('a scanned directory reached through a symlink is refused before anything moves', () => {
    const root = fixture();
    seed(root, '.ai/harness/live/open.log', 90);
    symlinkSync('live', join(root, '.ai/harness/checks'));

    expect(() => runArtifactRetention({ repoRoot: root, apply: true, now: NOW }))
      .toThrow('retention refuses a path through a symlink: .ai/harness/checks');
    expect(existsSync(join(root, '.ai/harness/live/open.log'))).toBe(true);
    expect(git(root, ['status', '--porcelain', '--untracked-files=no'])).toBe('');
  });

  test('a dangling symlink at the destination counts as occupied', () => {
    const root = fixture();
    seed(root, '.ai/harness/checks/old.log', 90);
    const destination = join(root, DEFAULT_ARCHIVE_ROOT, '.ai/harness/checks/old.log');
    mkdirSync(dirname(destination), { recursive: true });
    symlinkSync('missing-target', destination);

    const report = runArtifactRetention({ repoRoot: root, apply: true, now: NOW });

    expect(report.archived).toEqual([]);
    expect(report.skipped.map((entry) => [entry.path, entry.reason])).toEqual([
      ['.ai/harness/checks/old.log', 'destination-exists'],
    ]);
    expect(lstatSync(destination).isSymbolicLink()).toBe(true);
    expect(readlinkSync(destination)).toBe('missing-target');
    expect(existsSync(join(root, '.ai/harness/checks/old.log'))).toBe(true);
  });

  test('keep paths and occupied destinations are skipped', () => {
    const root = fixture();
    policy(root, { keep: ['.ai/harness/checks/pinned.log'] });
    seed(root, '.ai/harness/checks/pinned.log', 90);
    seed(root, '.ai/harness/checks/taken.log', 90);
    seed(root, `${DEFAULT_ARCHIVE_ROOT}/.ai/harness/checks/taken.log`, 1);

    const report = runArtifactRetention({ repoRoot: root, apply: true, now: NOW });

    expect(report.archived).toEqual([]);
    expect(report.skipped.map((entry) => [entry.path, entry.reason])).toEqual([
      ['.ai/harness/checks/pinned.log', 'kept'],
      ['.ai/harness/checks/taken.log', 'destination-exists'],
    ]);
    expect(existsSync(join(root, '.ai/harness/checks/taken.log'))).toBe(true);
  });

  test('policy overrides the window and the archive root', () => {
    const root = fixture('/local-archive/\n');
    policy(root, { days: 7, archive_root: 'local-archive/' });
    seed(root, '.ai/harness/checks/week.log', 8);

    const report = runArtifactRetention({ repoRoot: root, apply: true, now: NOW });

    expect(report.config).toEqual({ days: 7, archiveDays: 67, archiveRoot: 'local-archive', keep: [] });
    expect(report.archived.map((entry) => entry.destination)).toEqual(['local-archive/.ai/harness/checks/week.log']);
    expect(existsSync(join(root, 'local-archive/.ai/harness/checks/week.log'))).toBe(true);
  });

  test.each([
    ['no rule', '', 'archive root local-archive is not gitignored'],
    ['a rule that matches only a probe name', '.retention-probe\n', 'archive root local-archive is not gitignored'],
    ['an exception below the root', 'local-archive/*\n!local-archive/.ai/\n', 'archive destinations are not gitignored: local-archive/.ai/harness/checks/old.log'],
  ])('an archive destination Git would see (%s) is refused before anything moves', (_, gitignore, message) => {
    const root = fixture(gitignore);
    policy(root, { archive_root: 'local-archive' });
    seed(root, '.ai/harness/checks/old.log', 90);

    expect(() => runArtifactRetention({ repoRoot: root, apply: true, now: NOW })).toThrow(message);
    expect(existsSync(join(root, '.ai/harness/checks/old.log'))).toBe(true);
    expect(existsSync(join(root, 'local-archive'))).toBe(false);
  });

  test('an explicit null policy field fails closed instead of taking the default', () => {
    const root = fixture();
    policy(root, { days: null });
    seed(root, '.ai/harness/checks/old.log', 90);

    expect(() => runArtifactRetention({ repoRoot: root, apply: true, now: NOW })).toThrow('retention.days must be a positive integer');
    expect(existsSync(join(root, '.ai/harness/checks/old.log'))).toBe(true);
    expect(existsSync(join(root, DEFAULT_ARCHIVE_ROOT))).toBe(false);
  });

  test.each([
    [{ days: 0 }, 'retention.days must be a positive integer'],
    [{ days: '30' }, 'retention.days must be a positive integer'],
    [{ days: null }, 'retention.days must be a positive integer'],
    [{ keep: null }, 'retention.keep must be an array'],
    [{ keep: ['.ai/harness/checks/./pinned.log'] }, 'retention.keep[0] must be a canonical path'],
    [{ keep: ['.ai/harness//checks/pinned.log'] }, 'retention.keep[0] must be a canonical path'],
    [{ archive_root: '.ai/harness//checks/old' }, 'retention.archive_root must be a canonical path'],
    [{ archive_root: '/var/archive' }, 'absolute paths are not allowed'],
    [{ archive_root: '../outside' }, 'path traversal is not allowed'],
    [{ archive_root: '.ai/harness/checks/old' }, 'overlaps scanned directory .ai/harness/checks'],
    [{ archive_root: '.ai/harness/runs/archive' }, 'overlaps scanned directory .ai/harness/runs'],
    [{ keep: '.ai/harness/checks' }, 'retention.keep must be an array'],
    [{ archive_days: 30 }, 'retention.archive_days must be an integer greater than days'],
    [{ days: 60, archive_days: 45 }, 'retention.archive_days must be an integer greater than days'],
    [{ archive_days: '90' }, 'retention.archive_days must be an integer greater than days'],
    [{ archive_days: null }, 'retention.archive_days must be an integer greater than days'],
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
    seed(root, '.ai/harness/checks/old.log', 400);

    const dryRun = await runCliInProcess(['retention', '--repo', root], root, process.env);
    expect(dryRun.status).toBe(0);
    expect(dryRun.stdout).toContain('retention dry-run: would archive 1, skipped 0, failed 0');
    expect(dryRun.stdout).toContain('would archive: .ai/harness/checks/old.log (');
    expect(existsSync(join(root, '.ai/harness/checks/old.log'))).toBe(true);

    const applied = await runCliInProcess(['retention', '--repo', root, '--apply', '--json'], root, process.env);
    expect(applied.status).toBe(0);
    const report = JSON.parse(applied.stdout) as { mode: string; archived: { path: string }[] };
    expect(report.mode).toBe('apply');
    expect(report.archived.map((entry) => entry.path)).toEqual(['.ai/harness/checks/old.log']);
    expect(statSync(join(root, DEFAULT_ARCHIVE_ROOT, '.ai/harness/checks/old.log')).isFile()).toBe(true);
  });

  test('--json lists every harness storage root with its retention rule', async () => {
    const root = fixture();
    const result = await runCliInProcess(['retention', '--repo', root, '--json'], root, process.env);
    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout) as { roots: { path: string; rule: string; detail: string }[] };
    expect(report.roots.map((entry) => [entry.path, entry.rule])).toEqual([
      ['.ai/harness/checks', 'archive'],
      ['.ai/harness/runs', 'archive'],
      ['.ai/harness/backups/fs-transaction', 'archive'],
      [DEFAULT_ARCHIVE_ROOT, 'delete'],
      ['.ai/harness/runs/hook-events.jsonl', 'rotate'],
      ['.ai/harness/mcp/index-events.jsonl', 'rotate'],
      ['.ai/harness/mcp/metrics.jsonl', 'rotate'],
      ['.ai/harness/mcp/trace.jsonl', 'rotate'],
      ['.ai/harness/mcp/audit.log', 'rotate'],
      ['~/.repo-harness/packages', 'rotate'],
      ['~/.repo-harness/upgrade-cleanup.log.jsonl', 'rotate'],
      ['.ai/harness/runs/task-agents', 'keep'],
      ['.ai/harness/runs/task-workspaces', 'keep'],
      ['{common}/repo-harness/task-inbox/v2', 'keep'],
      ['{common}/repo-harness/feedback/v1', 'keep'],
      ['{common}/repo-harness/integration/v1', 'keep'],
      ['{common}/repo-harness/integration/v2', 'keep'],
      ['{common}/repo-harness/agent-runtime-effects/admitted-v2', 'keep'],
    ]);
    expect(report.roots.find((entry) => entry.rule === 'delete')?.detail).toBe('archived entries are deleted 90 days after their newest write');
    expect(report.roots[0]?.detail).toBe(`check-logs move to ${DEFAULT_ARCHIVE_ROOT} after 30 days`);
  });
});
