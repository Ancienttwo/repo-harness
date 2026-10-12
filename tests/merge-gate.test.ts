import { afterEach, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveTrustedGhExecutable } from '../src/effects/runtime/protected-helper-platform';
const ROOT = join(import.meta.dir, '..');
const SCRIPT = join(ROOT, 'scripts/merge-gate.ts');
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function git(root: string, ...args: string[]) {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr); return r.stdout.trim();
}
function fixture(disabled = false) {
  const root = mkdtempSync(join(tmpdir(), 'automatic-merge-gate-')); roots.push(root);
  git(root, 'init', '-b', 'main'); git(root, 'config', 'user.name', 'Gate Test'); git(root, 'config', 'user.email', 'gate@example.invalid');
  mkdirSync(join(root, '.ai/harness'), { recursive: true });
  writeFileSync(join(root, '.ai/harness/policy.json'), JSON.stringify({ merge_gate: { enabled: !disabled } }));
  writeFileSync(join(root, 'base.txt'), 'base'); git(root, 'add', '-A'); git(root, 'commit', '-m', 'base');
  git(root, 'switch', '-c', 'codex/test'); writeFileSync(join(root, 'feature.txt'), 'feature');
  git(root, 'add', '-A'); git(root, 'commit', '-m', 'candidate');
  return root;
}
function invoke(root: string, command: string, rest: string[] = []) {
  return spawnSync(process.execPath, [SCRIPT, command, '--base', 'main', ...rest], { cwd: root, encoding: 'utf8', timeout: 10000 });
}
function providerFixture(root: string, mode = 'ready') {
  const tools = mkdtempSync(join(tmpdir(), 'merge-gate-provider-')); roots.push(tools);
  const home = join(tools, 'authority-home'); mkdirSync(home, { mode: 0o700 });
  const cli = join(tools, 'trusted-gh');
  const log = join(tools, 'calls.jsonl');
  const decoy = join(tools, 'gh'); const marker = join(tools, 'caller-gh-ran');
  writeFileSync(decoy, `#!${process.execPath}\nimport {writeFileSync} from 'fs'; writeFileSync(${JSON.stringify(marker)}, 'unsafe'); process.exit(99);\n`, { mode: 0o755 });
  const head = git(root, 'rev-parse', 'HEAD'); const base = git(root, 'rev-parse', 'main');
  const pr = { number: 7, url: 'https://github.com/example/repo/pull/7', state: 'OPEN', isDraft: false,
    headRefOid: head, headRefName: 'codex/test', baseRefOid: base, baseRefName: 'main', body: '', reviewDecision: null, mergeable: 'MERGEABLE' };
  const graph = { data: { node: { id: 'R_fixture', pullRequest: { number: 7, headRefOid: head, baseRefOid: base, reviewDecision: null,
    latestOpinionatedReviews: { pageInfo: { hasNextPage: false }, nodes: [] }, reviewThreads: { pageInfo: { hasNextPage: false }, nodes: [] } } } } };
  const run = { path: '.github/workflows/ci.yml', event: 'pull_request', head_sha: head, status: 'completed', conclusion: 'success',
    pull_requests: [{ number: 7, head: { sha: head }, base: { sha: base } }] };
  writeFileSync(cli, `#!${process.execPath}
import {appendFileSync} from 'fs';
const args = process.argv.slice(2);
appendFileSync(${JSON.stringify(log)}, JSON.stringify({args, ghRepo: process.env.GH_REPO ?? null}) + '\\n');
let value, status = 0;
if (${JSON.stringify(mode)} === 'failed') { console.error('fixture provider failed'); process.exit(73); }
if (args[0] === 'repo') value = {id:'R_fixture', nameWithOwner:'example/repo'};
else if (args[0] === 'pr' && args[1] === 'view') value = ${JSON.stringify(mode === 'malformed' ? { number: 'not-a-number' } : pr)};
else if (args[0] === 'pr' && args[1] === 'checks') value = [{name:'Required / CI',bucket:${JSON.stringify(mode === 'pending' ? 'pending' : 'pass')},link:'https://github.com/example/repo/actions/runs/1/job/2'}];
else if (args[0] === 'api' && args[1] === 'graphql') value = ${JSON.stringify(graph)};
else if (args[0] === 'api' && args[1].includes('/actions/runs/')) value = ${JSON.stringify(run)};
else if (args[0] === 'api' && args[1].includes('/contents/')) {value={status:'404'};status=1;}
else {console.error('unexpected fixture args');process.exit(98);}
console.log(JSON.stringify(value)); process.exit(status);
`, { mode: 0o755 });
  const module = join(ROOT, 'src/effects/runtime/protected-helper-platform.ts');
  // Only the fixed-host discovery effect is replaced in a disposable child.
  // The real executable subprocesses, readiness protocol, leak scan and seal run.
  const code = `import {mock} from 'bun:test';
const actual = await import(${JSON.stringify(module)});
mock.module(${JSON.stringify(module)}, () => ({...actual, resolveTrustedGhExecutable: () => ${mode === 'missing' ? 'undefined' : JSON.stringify(cli)}}));
const {runMergeGateCli} = await import(${JSON.stringify(SCRIPT)});
await runMergeGateCli(['run','--base','main'], ${JSON.stringify(home)});`;
  const result = spawnSync(process.execPath, ['-e', code], { cwd: root, encoding: 'utf8', timeout: 10000,
    env: { ...process.env, PATH: tools, GH_REPO: 'attacker/redirect', REPO_HARNESS_GH_BIN: decoy } });
  return { result, home, log, marker, head, base };
}
function seals(home: string): string[] {
  const gates = join(home, '.repo-harness/gates');
  return existsSync(gates) ? readdirSync(gates).map(id => join(gates, id, 'merge-seal.latest.json')).filter(existsSync) : [];
}
describe('fixed host gh selection', () => {
  test('resolves the existing Homebrew symlink and checks the real executable', () => {
    const root = mkdtempSync(join(tmpdir(), 'trusted-gh-selection-')); roots.push(root);
    const binary = join(root, 'actual-gh');
    writeFileSync(binary, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    const link = join(root, 'public-gh'); symlinkSync(binary, link);
    const observed: string[] = [];
    const selected = resolveTrustedGhExecutable({
      exists: path => { observed.push(path); return path === '/opt/homebrew/bin/gh'; },
      realpath: () => realpathSync(link), lstat: lstatSync,
    }, { platform: 'darwin' });
    expect(selected).toBe(realpathSync(binary));
    expect(observed).toEqual(['/opt/homebrew/bin/gh']);
  });
  test('missing, directory and non-executable candidates are refused', () => {
    const root = mkdtempSync(join(tmpdir(), 'trusted-gh-invalid-')); roots.push(root);
    const binary = join(root, 'non-executable'); writeFileSync(binary, 'data', { mode: 0o600 });
    for (const target of [root, binary]) {
      expect(resolveTrustedGhExecutable({ exists: () => true, realpath: () => target, lstat: lstatSync }, { platform: 'darwin' })).toBeUndefined();
    }
    expect(resolveTrustedGhExecutable({ exists: () => false, realpath: () => { throw Error('unexpected read'); }, lstat: lstatSync }, { platform: 'darwin' })).toBeUndefined();
    expect(() => resolveTrustedGhExecutable({ exists: () => true, realpath: () => { throw Error('unreadable executable'); }, lstat: lstatSync }, { platform: 'darwin' })).toThrow('unreadable executable');
  });
});
describe('main automatic check boundary', () => {
  test('old policy switch cannot disable main checks and ordinary fingerprint needs no plan or receipt', () => {
    const root = fixture(true);
    const observed = invoke(root, 'fingerprint', ['--format', 'required']);
    expect(observed.status).toBe(0); expect(observed.stdout.trim()).toBe('true');
    const refused = providerFixture(root, 'failed');
    expect(refused.result.status).not.toBe(0);
    expect(refused.result.stderr).toContain('GitHub PR readback unavailable');
    expect(existsSync(refused.log)).toBe(true);
    expect(seals(refused.home)).toEqual([]);
    expect(existsSync(join(root, 'tasks'))).toBe(false);
  });
  test('trusted absolute gh succeeds with a restricted PATH and caller override decoy', () => {
    const f = providerFixture(fixture());
    expect(f.result.status, f.result.stderr).toBe(0);
    expect(existsSync(f.marker)).toBe(false);
    const calls = readFileSync(f.log, 'utf8').trim().split('\n').map(line => JSON.parse(line));
    expect(calls[0].args).toEqual(['pr', 'view', '--json', 'number']);
    expect(calls.every(call => call.ghRepo === null), 'all provider reads must use the protected environment').toBe(true);
    expect(calls.some(call => call.args[0] === 'pr' && call.args[1] === 'checks')).toBe(true);
    expect(calls.some(call => call.args[0] === 'api' && call.args[1] === 'graphql')).toBe(true);
    expect(seals(f.home)).toHaveLength(1);
    expect(JSON.parse(readFileSync(seals(f.home)[0]!, 'utf8'))).toMatchObject({ head_sha: f.head, base_sha: f.base, pr_number: 7 });
  });
  test('missing trusted gh refuses both enabled and disabled old policy without caller fallback', () => {
    for (const disabled of [false, true]) {
      const f = providerFixture(fixture(disabled), 'missing');
      expect(f.result.status).not.toBe(0);
      expect(f.result.stderr).toContain('trusted GitHub CLI executable unavailable');
      expect(existsSync(f.marker)).toBe(false);
      expect(existsSync(f.log)).toBe(false);
      expect(seals(f.home)).toEqual([]);
    }
  });
  test('failed or malformed provider readback and pending CI do not create a seal', () => {
    for (const mode of ['failed', 'malformed', 'pending']) {
      const f = providerFixture(fixture(), mode);
      expect(f.result.status, mode).not.toBe(0);
      expect(f.result.stderr).toContain(mode === 'failed' ? 'GitHub PR readback unavailable'
        : mode === 'malformed' ? 'invalid GitHub PR identity' : 'checks_pending');
      expect(existsSync(f.log)).toBe(true);
      expect(existsSync(f.marker)).toBe(false);
      expect(seals(f.home)).toEqual([]);
    }
  });
  test('credential scan rejects before push and never prints matched bytes', () => {
    const root = fixture(); const secret = ['ghp_', 'A'.repeat(36)].join('');
    writeFileSync(join(root, 'feature.txt'), secret); git(root, 'add', '-A'); git(root, 'commit', '-m', 'unsafe candidate');
    const r = invoke(root, 'fingerprint');
    expect(r.status).not.toBe(0); expect(r.stderr).toContain('github-personal-token');
    expect(r.stderr).not.toContain(secret); expect(r.stdout).not.toContain(secret);
  });
  test('dirty candidate is refused before provider readback without erasing work', () => {
    const root = fixture(); writeFileSync(join(root, 'work.txt'), 'keep');
    const r = invoke(root, 'run');
    expect(r.status).not.toBe(0); expect(r.stderr).toContain('candidate worktree is dirty');
    expect(existsSync(join(root, 'work.txt'))).toBe(true);
  });
  test('post-freeze lifecycle exceptions are not a second authority', () => {
    const r = invoke(fixture(), 'run', ['--allow-post-freeze', 'tasks/current.md']);
    expect(r.status).not.toBe(0); expect(r.stderr).toContain('unknown argument');
  });
  test('candidate-owned helper cannot authorize its own merge', () => {
    const root = fixture(); mkdirSync(join(root, 'scripts'));
    copyFileSync(SCRIPT, join(root, 'scripts/merge-gate.ts'));
    copyFileSync(join(ROOT, 'scripts/acceptance-receipt.ts'), join(root, 'scripts/acceptance-receipt.ts'));
    symlinkSync(join(ROOT, 'src'), join(root, 'src'), 'dir');
    symlinkSync(join(ROOT, 'node_modules'), join(root, 'node_modules'), 'dir');
    git(root, 'add', '-A'); git(root, 'commit', '-m', 'candidate helper');
    const r = spawnSync(process.execPath, [join(root, 'scripts/merge-gate.ts'), 'run', '--base', 'main'], { cwd: root, encoding: 'utf8', timeout: 10000 });
    expect(r.status).not.toBe(0); expect(r.stderr).toContain('installed repo-harness helper runtime');
  });
});
