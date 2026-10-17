import { afterEach, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { decodeDevActivitySnapshot } from '../../src/core/dev-activity/decode';
import type { DevActivitySnapshotV2 } from '../../src/core/dev-activity/types';
import { collectDevActivity } from '../../src/effects/dev-activity/collector';
import { readRepoHarnessRegistryStrictSnapshot, repoHarnessRepoIdFor } from '../../src/effects/repo-registry';

const ROOT = join(import.meta.dir, '../..');
const CLI = join(ROOT, 'src/cli/index.ts');
const fixtures: string[] = [];

afterEach(() => {
  for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture(names = ['alpha', 'beta']) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'catch-up-')));
  fixtures.push(root);
  const home = join(root, 'home');
  const harnessHome = join(home, '.repo-harness');
  const bin = join(root, 'bin');
  mkdirSync(harnessHome, { recursive: true });
  mkdirSync(bin);
  const log = join(root, 'argv.jsonl');
  const at = new Date().toISOString();
  const repos = names.map(name => {
    const path = join(root, name);
    mkdirSync(path);
    writeFileSync(join(path, 'fixture.json'), JSON.stringify({ dirty: true, pullRequests: [] }));
    return path;
  });
  const registry = join(harnessHome, 'registered-repos.json');
  writeFileSync(registry, JSON.stringify({ version: 1, authorizationRevision: 1, repos: repos.map(path => ({
    id: repoHarnessRepoIdFor(path), path, accessMode: 'read_only', source: 'manual', registeredAt: at, lastSeenAt: at,
  })) }));
  const script = `#!${process.execPath}
const fs = require('node:fs');
const path = require('node:path');
const argv = process.argv.slice(2);
const command = path.basename(process.argv[1]);
fs.appendFileSync(process.env.CATCH_UP_ARGV_LOG, JSON.stringify({ command, argv, cwd: process.cwd() }) + '\\n');
const config = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'fixture.json'), 'utf8'));
if (command === 'git') {
  if (config.gitFail) process.exit(1);
  if (argv[1] === 'remote') console.log('origin https://github.com/acme/widgets.git (fetch)');
  else if (argv[1] === 'symbolic-ref') console.log('origin/main');
  else if (argv[1] === 'worktree') console.log('worktree ' + process.cwd() + '\\nHEAD ' + 'a'.repeat(40) + '\\nbranch refs/heads/feat/local\\n');
  else if (argv[1] === 'status') console.log('# branch.head feat/local\\n# branch.ab +1 -0\\n' + (config.dirty ? '? dirty.txt' : ''));
  else process.exit(2);
} else {
  if (config.ghFail) { console.error('authentication failed: private details'); process.exit(1); }
  if (argv[0] === 'repo') console.log(JSON.stringify({ nameWithOwner: 'acme/widgets', defaultBranchRef: { name: 'main' } }));
  else if (argv[0] === 'pr') console.log(JSON.stringify(argv[argv.indexOf('--state') + 1] === 'open' ? config.pullRequests : []));
  else process.exit(2);
}
`;
  for (const command of ['git', 'gh']) {
    writeFileSync(join(bin, command), script);
    chmodSync(join(bin, command), 0o755);
  }
  const env = { ...process.env, HOME: home, USERPROFILE: home, REPO_HARNESS_HOME: harnessHome, PATH: `${bin}:${process.env.PATH}`, CATCH_UP_ARGV_LOG: log };
  return { root, repos, registry, env, log };
}

function pullRequest(number = 7, branch = 'feat/local') {
  const at = new Date().toISOString();
  return {
    number, title: 'Add widgets', state: 'OPEN', isDraft: false, headRefName: branch, baseRefName: 'main',
    url: `https://github.com/acme/widgets/pull/${number}`, createdAt: at, updatedAt: at, mergedAt: null, closedAt: null,
    mergeStateStatus: 'CLEAN', reviewDecision: 'APPROVED',
    statusCheckRollup: [{ __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'SUCCESS' }],
  };
}

function run(args: string[], env: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, [CLI, 'catch-up', ...args], { cwd: ROOT, env, encoding: 'utf8', timeout: 20_000 });
}

function withoutObservationTimes(snapshot: DevActivitySnapshotV2) {
  return { ...snapshot, collected_at: null, repositories: snapshot.repositories.map(repo => ({
    ...repo, sources: repo.sources.map(source => ({ ...source, observed_at: null })),
  })) };
}

describe('catch-up CLI', () => {
  test('prints the existing snapshot as one JSON line with no text cap', async () => {
    const f = fixture();
    writeFileSync(join(f.repos[0]!, 'fixture.json'), JSON.stringify({ dirty: true, pullRequests: [pullRequest(), pullRequest(8, 'feat/next')] }));
    const result = run(['--json', '--max-items', '1'], f.env);
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout.trim().split('\n')).toHaveLength(1);
    const actual = decodeDevActivitySnapshot(JSON.parse(result.stdout));
    const expected = await collectDevActivity({ env: f.env });
    expect(withoutObservationTimes(actual)).toEqual(withoutObservationTimes(expected));
    expect(actual.items).toHaveLength(3);
    expect(actual.attention).toHaveLength(2);
    expect(actual.repositories.map(repo => repo.display_name)).toEqual(readRepoHarnessRegistryStrictSnapshot({ env: f.env }).repos.map(repo => basename(repo.path)));
    expect(result.stdout).not.toContain(f.root);
    const calls = readFileSync(f.log, 'utf8').trim().split('\n').map(line => JSON.parse(line) as { command: string; argv: string[] });
    expect(calls.some(call => call.command === 'git' && call.argv.includes('--no-optional-locks'))).toBe(true);
    expect(calls.filter(call => call.command === 'gh' && call.argv[0] === 'pr').every(call => call.argv.includes('@me'))).toBe(true);
  });

  test('prints the default text brief and applies the cap only to item lines', () => {
    const f = fixture(['alpha']);
    writeFileSync(join(f.repos[0]!, 'fixture.json'), JSON.stringify({ dirty: true, pullRequests: [pullRequest(), pullRequest(8, 'feat/next')] }));
    const result = run(['--max-items', '1'], f.env);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe([
      '2 item(s) need you.', '', 'Needs you', 'alpha: PR #7 - ready to merge', 'alpha: PR #8 - ready to merge',
      '', 'alpha (2 active)', '  [open PR #7] feat/local - Add widgets', '  +1 more', '',
    ].join('\n'));
    expect(result.stderr).toBe('');
  });

  test('selects registered roots in registry order and deduplicates repeated selectors', () => {
    const f = fixture(['alpha', 'beta', 'gamma']);
    writeFileSync(join(f.repos[0]!, 'fixture.json'), JSON.stringify({ dirty: false, pullRequests: [pullRequest()] }));
    const result = run(['--json', '--repo', f.repos[2]!, '--repo', `${f.repos[0]!}/.`, '--repo', f.repos[2]!], f.env);
    expect(result.status).toBe(0);
    const data = decodeDevActivitySnapshot(JSON.parse(result.stdout));
    const expected = readRepoHarnessRegistryStrictSnapshot({ env: f.env }).repos.filter(repo => repo.path !== f.repos[1]);
    expect(data.repositories.map(repo => repo.repository_id)).toEqual(expected.map(repo => repo.id));
    expect(data.items.every(item => item.repository_id !== repoHarnessRepoIdFor(f.repos[1]!))).toBe(true);
    expect(data.attention).toHaveLength(1);
    expect(data.unreadable_registrations).toBe(0);
    const text = run(['--repo', f.repos[1]!], f.env);
    expect(text.status).toBe(0);
    expect(text.stdout).toBe('Nothing needs you.\n\nbeta (1 active)\n  [uncommitted feat/local]\n');
  });

  test('rejects unregistered roots and invalid caps before running a collector process', () => {
    const f = fixture();
    const unregistered = run(['--repo', f.root], f.env);
    expect(unregistered.status).not.toBe(0);
    expect(unregistered.stderr).toContain('registered repository root');
    expect(unregistered.stdout).toBe('');
    for (const cap of ['0', '-1', '1.5', '2junk', '9007199254740992']) {
      const result = run(['--max-items', cap], f.env);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('positive integer');
    }
    expect(() => readFileSync(f.log)).toThrow();
  });

  test('reports unauthenticated GitHub and failed Git as source states without stderr leaks', () => {
    const f = fixture(['alpha', 'beta']);
    writeFileSync(join(f.repos[0]!, 'fixture.json'), JSON.stringify({ dirty: true, ghFail: true, pullRequests: [] }));
    writeFileSync(join(f.repos[1]!, 'fixture.json'), JSON.stringify({ gitFail: true, pullRequests: [] }));
    const result = run([], f.env);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('source github unavailable');
    expect(result.stdout).toContain('source git unavailable');
    expect(result.stdout).not.toContain('[in flight');
    expect(result.stdout).not.toContain('[uncommitted');
    expect(result.stdout).not.toContain('private details');
    expect(result.stderr).toBe('');
  });

  test('reports unreadable registrations, empty registries and invalid registries', () => {
    const f = fixture(['alpha']);
    rmSync(f.repos[0]!, { recursive: true });
    const missing = run(['--repo', f.repos[0]!], f.env);
    expect(missing.status).toBe(0);
    expect(missing.stdout).toContain('1 registered repositories unreadable.');
    writeFileSync(f.registry, JSON.stringify({ version: 1, authorizationRevision: 1, repos: [] }));
    const empty = run([], f.env);
    expect(empty.status).toBe(0);
    expect(empty.stdout).toBe('Nothing needs you.\n');
    writeFileSync(f.registry, '{broken');
    const unavailable = run(['--json'], f.env);
    expect(unavailable.status).toBe(1);
    expect(decodeDevActivitySnapshot(JSON.parse(unavailable.stdout)).status).toBe('unavailable');
    expect(unavailable.stderr).toBe('');
  });
});
