import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test';
import * as childProcess from 'node:child_process';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createDocsGraphReader, DocsGraphReadError } from '../../src/effects/operator/docs-graph';

const roots: string[] = [];
afterEach(() => { mock.restore(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const NOW = '2026-10-06T12:00:00Z';
const plan = 'plans/plan-fixture.md', contract = 'tasks/contracts/fixture.contract.md';
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'docs-graph-reader-')); roots.push(root);
  const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', ...args], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const put = (path: string, content: string) => { mkdirSync(join(root, path, '..'), { recursive: true }); writeFileSync(join(root, path), content); };
  git('init', '-q');
  const commit = (time: string) => {
    git('add', '.');
    execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'Fixture'], {
      cwd: root, env: { ...process.env, GIT_AUTHOR_DATE: time, GIT_COMMITTER_DATE: time }, stdio: 'pipe',
    });
    return git('rev-parse', 'HEAD');
  };
  return { root, git, put, commit };
}
function captureGit() {
  const original = childProcess.execFileSync;
  const calls: string[][] = [];
  spyOn(childProcess, 'execFileSync').mockImplementation(((file: string, args: string[], options: unknown) => {
    calls.push([file, ...args]);
    return (original as Function)(file, args, options);
  }) as typeof childProcess.execFileSync);
  return calls;
}
function errorCode(run: () => unknown): string {
  try { run(); } catch (error) { expect(error).toBeInstanceOf(DocsGraphReadError); return (error as DocsGraphReadError).code; }
  throw new Error('Expected a typed read error');
}

describe('Immutable Docs graph reader', () => {
  test('reads committed bytes, stable per-file history, and one cached history pass per HEAD', () => {
    const f = fixture();
    f.put(plan, '# Plan\n> **Status**: Executing\n');
    const first = f.commit('2026-10-03T10:00:00Z');
    f.put(contract, `# Contract\n> **Status**: Active\n> **Plan**: ${plan}\n`);
    const second = f.commit('2026-10-05T10:00:00Z');
    f.put(plan, '# Dirty plan\n> **Status**: Done\n> **Updated**: 2030-01-01\n');
    const calls = captureGit();
    const read = createDocsGraphReader();
    const input = { repositoryRoot: f.root, now: NOW };
    const result = read(input), repeat = read(input);
    expect(repeat).toEqual(result);
    expect(result.commit).toBe(second);
    expect(result.nodes.find(node => node.id === plan)).toMatchObject({ status: 'Executing', updated: '2026-10-03T10:00:00.000Z', updated_source: 'commit', source: { last_commit: { commit: first } } });
    expect(result.nodes.find(node => node.id === contract)?.source.last_commit?.commit).toBe(second);
    expect(calls.filter(args => args.includes('log'))).toHaveLength(1);
    repeat.nodes[0]!.source.last_commit!.time = '2030-01-01T00:00:00Z';
    expect(read(input)).toEqual(result);
    expect(calls.every(args => args[0] === 'git' && ['rev-parse', 'log', 'ls-tree', 'cat-file'].some(verb => args.includes(verb)))).toBe(true);
    expect(readFileSync(join(f.root, plan), 'utf8')).toContain('Dirty plan');
    mock.restore();
    f.put('plans/prds/new.prd.md', '# New PRD\n> **Status**: Approved\n');
    const third = f.commit('2026-10-06T10:00:00Z');
    const nextCalls = captureGit(), next = read(input);
    expect(next.commit).toBe(third);
    expect(next.nodes.find(node => node.id === contract)?.source.last_commit?.commit).toBe(second);
    expect(next.nodes.find(node => node.id === plan)?.status).toBe('Done');
    expect(nextCalls.filter(args => args.includes('log'))).toHaveLength(1);
  });

  test('keeps archives counted but does not read their bodies in active scope', () => {
    const f = fixture();
    f.put(plan, '# Plan\n> **Source PRD**: plans/archive/old.prd.md\n');
    f.put('plans/archive/old.prd.md', '# Old\n> **Status**: Archived\n');
    f.commit('2026-10-05T10:00:00Z');
    const archivedOid = f.git('rev-parse', 'HEAD:plans/archive/old.prd.md');
    const calls = captureGit(), read = createDocsGraphReader();
    const active = read({ repositoryRoot: f.root, now: NOW });
    expect(active.archived_count).toBe(1);
    expect(active.nodes.map(node => node.id)).toEqual([plan]);
    expect(active.issues).toEqual([]);
    expect(calls.some(args => args.includes('cat-file') && args.includes(archivedOid))).toBe(false);
    const all = read({ repositoryRoot: f.root, now: NOW, scope: 'all' });
    expect(all.nodes).toHaveLength(2);
    expect(all.edges).toHaveLength(1);
    expect(calls.some(args => args.includes('cat-file') && args.includes(archivedOid))).toBe(true);
  });


  test('reads the actual archive-writer prefix paths under all scope', () => {
    const f = fixture();
    const paths = ['tasks/archive/contract-20260904-1852-fixture.md', 'tasks/archive/review-20260904-1852-fixture.md', 'tasks/archive/notes-20260904-1852-fixture.md'];
    f.put(paths[0]!, '> **Archived**: 2026-09-04 18:52\n\n# Task Contract\n\n> **Status**: Fulfilled\n'
      + `> **Review File**: ${paths[1]}\n> **Notes File**: ${paths[2]}\n\n## Why\n`);
    f.put(paths[1]!, '# Task Review\n> **Status**: Done\n');
    f.put(paths[2]!, '# Task Notes\n');
    f.commit('2026-10-05T10:00:00Z');
    const read = createDocsGraphReader(), active = read({ repositoryRoot: f.root, now: NOW });
    expect(active).toMatchObject({ archived_count: 3, nodes: [] });
    const all = read({ repositoryRoot: f.root, now: NOW, scope: 'all' });
    expect(all.nodes.map(node => node.kind).sort()).toEqual(['contract', 'notes', 'review']);
    expect(all.nodes.find(node => node.id === paths[0])?.status).toBe('Fulfilled');
    expect(all.edges).toHaveLength(2);
    expect(all.issues).toEqual([]);
  });

  test('does not follow symlinks, traversal, unrelated files, or body examples', () => {
    const f = fixture();
    const outside = mkdtempSync(join(tmpdir(), 'docs-graph-secret-')); roots.push(outside);
    const secretPath = join(outside, 'secret.md'); writeFileSync(secretPath, 'PRIVATE_FIXTURE_SENTINEL');
    f.put(plan, '# Plan\n> **Task Contract**: tasks/contracts/link.contract.md\n> **Notes File**: ../../secret.md\n\n## Example\n> **Source Spec**: docs/not-allowed.md\n');
    f.put('docs/not-allowed.md', 'UNRELATED_PRIVATE_FIXTURE');
    mkdirSync(join(f.root, 'tasks/contracts'), { recursive: true });
    symlinkSync(secretPath, join(f.root, 'tasks/contracts/link.contract.md'));
    f.commit('2026-10-05T10:00:00Z');
    const symlinkOid = f.git('rev-parse', 'HEAD:tasks/contracts/link.contract.md');
    const unrelatedOid = f.git('rev-parse', 'HEAD:docs/not-allowed.md');
    const beforeStatus = f.git('status', '--porcelain');
    const beforeEntries = readdirSync(f.root).sort();
    const calls = captureGit();
    const result = createDocsGraphReader()({ repositoryRoot: f.root, now: NOW });
    expect(result.issues.filter(issue => issue.kind === 'broken_link')).toHaveLength(2);
    expect(result.unknowns).toContainEqual({ node: 'tasks/contracts/link.contract.md', field: 'source', reason: 'unsupported_file_mode' });
    expect(calls.some(args => args.includes('cat-file') && (args.includes(symlinkOid) || args.includes(unrelatedOid)))).toBe(false);
    expect(JSON.stringify(result)).not.toContain(secretPath);
    expect(JSON.stringify(result)).not.toContain('PRIVATE_FIXTURE');
    mock.restore();
    expect(f.git('status', '--porcelain')).toBe(beforeStatus);
    expect(readdirSync(f.root).sort()).toEqual(beforeEntries);
  });

  test('indexes explicit model capability ids and rejects malformed or duplicate capability sources', () => {
    const f = fixture();
    const path = '.archcontext/model/nodes/capability.runtime-harness.docs.yaml';
    const value = 'schemaVersion: archcontext.node/v2\nkind: capability\nid: capability.runtime-harness.docs\n';
    f.put(path, value); f.put(plan, '# Plan\n> **Capability ID**: capability.runtime-harness.docs\n');
    f.commit('2026-10-05T10:00:00Z');
    const read = createDocsGraphReader();
    const result = read({ repositoryRoot: f.root, now: NOW });
    expect(result.nodes.find(node => node.kind === 'capability')).toMatchObject({ id: 'capability.runtime-harness.docs', source: { path } });
    expect(result.issues).toEqual([]);
    f.put('.archcontext/model/nodes/capability.runtime-harness.copy.yaml', value); f.commit('2026-10-05T11:00:00Z');
    expect(errorCode(() => read({ repositoryRoot: f.root, now: NOW }))).toBe('invalid_capability');
    f.put(path, 'id: [broken'); f.commit('2026-10-05T12:00:00Z');
    expect(errorCode(() => read({ repositoryRoot: f.root, now: NOW }))).toBe('invalid_capability');
  });

  test('fails closed on HEAD movement and does not cache complete graph freshness', () => {
    const f = fixture(); f.put(plan, '# Plan\n> **Status**: Executing\n'); f.commit('2026-10-05T10:00:00Z');
    const read = createDocsGraphReader();
    const young = read({ repositoryRoot: f.root, now: '2026-10-05T11:00:00Z' });
    const old = read({ repositoryRoot: f.root, now: '2026-10-08T10:00:00Z' });
    expect(young.issues).toEqual([]);
    expect(old.issues[0]?.severity).toBe('escalated');
    const original = childProcess.execFileSync;
    let heads = 0;
    spyOn(childProcess, 'execFileSync').mockImplementation(((file: string, args: string[], options: unknown) => {
      if (args.includes('HEAD^{commit}') && ++heads === 2) return Buffer.from('f'.repeat(40) + '\n');
      return (original as Function)(file, args, options);
    }) as typeof childProcess.execFileSync);
    expect(errorCode(() => read({ repositoryRoot: f.root, now: NOW }))).toBe('snapshot_changed');
  });


  test('reports missing local history as unavailable and never starts a network fallback', () => {
    const f = fixture(); f.put(plan, '# Plan\n'); f.commit('2026-10-05T10:00:00Z');
    const original = childProcess.execFileSync, commands: string[][] = [];
    spyOn(childProcess, 'execFileSync').mockImplementation(((file: string, args: string[], options: { env: NodeJS.ProcessEnv }) => {
      commands.push(args);
      expect(options.env.GIT_NO_LAZY_FETCH).toBe('1');
      expect(options.env.GIT_OPTIONAL_LOCKS).toBe('0');
      if (args.includes('log')) throw new Error('A required local history object is missing.');
      return (original as Function)(file, args, options);
    }) as typeof childProcess.execFileSync);
    const read = createDocsGraphReader();
    expect(errorCode(() => read({ repositoryRoot: f.root, now: NOW }))).toBe('unavailable');
    expect(errorCode(() => read({ repositoryRoot: f.root, now: NOW }))).toBe('unavailable');
    expect(commands.filter(args => args.includes('log'))).toHaveLength(2);
    expect(commands.some(args => args.includes('fetch') || args.includes('clone'))).toBe(false);
  });


  test('rejects shallow history instead of treating its boundary as the file update', () => {
    const f = fixture();
    f.put(plan, '# Plan\n> **Status**: Executing\n'); f.commit('2026-09-01T10:00:00Z');
    f.put('README.md', '# Unrelated update\n'); f.commit('2026-10-06T10:00:00Z');
    const shallow = mkdtempSync(join(tmpdir(), 'docs-graph-shallow-')); roots.push(shallow);
    execFileSync('git', ['clone', '--quiet', '--depth', '1', `file://${f.root}`, shallow], { stdio: 'pipe' });
    expect(execFileSync('git', ['rev-parse', '--is-shallow-repository'], { cwd: shallow, encoding: 'utf8' }).trim()).toBe('true');
    expect(errorCode(() => createDocsGraphReader()({ repositoryRoot: shallow, now: NOW }))).toBe('unavailable');
    const complete = createDocsGraphReader()({ repositoryRoot: f.root, now: NOW });
    expect(complete.nodes[0]!.updated).toBe('2026-09-01T10:00:00.000Z');
    expect(complete.issues[0]?.severity).toBe('escalated');
  });

  test('rejects unavailable repositories, bad requests, timeouts, and oversized blobs', () => {
    const f = fixture(); f.put(plan, '# Plan\n'); f.commit('2026-10-05T10:00:00Z');
    const read = createDocsGraphReader();
    expect(errorCode(() => read({ repositoryRoot: join(f.root, 'missing'), now: NOW }))).toBe('unavailable');
    expect(errorCode(() => read({ repositoryRoot: f.root, now: 'bad date' }))).toBe('invalid_request');
    expect(errorCode(() => read({ repositoryRoot: f.root, now: NOW, max_nodes: 0 }))).toBe('invalid_request');
    expect(errorCode(() => read({ repositoryRoot: f.root, now: NOW, thresholds: { active_days: 0 } }))).toBe('invalid_request');
    expect(errorCode(() => read({ repositoryRoot: f.root, now: NOW }, { deadline_ms: 0.0001 }))).toBe('timeout');
    f.put(plan, '# Plan\n' + 'x'.repeat(600 * 1024)); f.commit('2026-10-05T11:00:00Z');
    expect(errorCode(() => read({ repositoryRoot: f.root, now: NOW }))).toBe('too_large');
  });
});
