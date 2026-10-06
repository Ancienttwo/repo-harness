import { afterEach, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { sha256 } from '../../src/core/review/module-review-prompt';
import { MODULE_ID, fixtureCommit, fixtureGit, fixtureWrite, moduleRepository } from '../helpers/module-repository';

const cli = new URL('../../src/cli/index.ts', import.meta.url).pathname;
const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));
function repo(): string { const root = moduleRepository(); roots.push(root); return root; }
function run(root: string, args: string[], env: NodeJS.ProcessEnv = process.env) {
  return spawnSync(process.execPath, [cli, 'module', ...args], { cwd: root, env, encoding: 'utf8', timeout: 20_000 });
}
function snapshot(root: string, path = ''): Record<string, string> {
  const result: Record<string, string> = {};
  for (const name of readdirSync(join(root, path))) {
    const file = path ? `${path}/${name}` : name;
    if (statSync(join(root, file)).isDirectory()) Object.assign(result, snapshot(root, file));
    else result[file] = sha256(readFileSync(join(root, file)));
  }
  return result;
}

test('CLI JSON is deterministic and exports the recorded schema and shard fields without writes', () => {
  const root = repo(), before = snapshot(root);
  const list = run(root, ['list', '--json']); expect(list.status).toBe(0);
  expect(JSON.parse(list.stdout)).toMatchObject({ schema_version: 'repo-harness.architecture-modules.v1', modules: [{ id: MODULE_ID, state: { model_valid: 'valid' } }] });
  const first = run(root, ['review-prompt', MODULE_ID, '--json']), second = run(root, ['review-prompt', MODULE_ID, '--json']);
  expect(first.status).toBe(0); expect(first.stderr).toBe(''); expect(second.stdout).toBe(first.stdout);
  const packet = JSON.parse(first.stdout);
  expect(packet.schema_version).toBe('repo-harness.module-review-prompt.v1'); expect(packet.digest).toMatch(/^[0-9a-f]{64}$/);
  const text = run(root, ['review-prompt', MODULE_ID]); expect(text.status).toBe(0); expect(text.stdout).toBe(packet.prompt + '\n');
  expect(snapshot(root)).toEqual(before);
});

test('CLI returns error exit codes and rejects request values used as git options', () => {
  const root = repo(), output = join(root, 'injection-output');
  for (const args of [ ['--base', 'HEAD'], ['--head', 'HEAD'], ['--base', 'HEAD', `--head=--output=${output}`], ['--base=--ext-diff', '--head', 'HEAD'], ['--shard', '0'], ['--shard', '99999999'] ]) {
    const result = run(root, ['review-prompt', MODULE_ID, '--json', ...args]);
    expect(result.status).not.toBe(0); expect(JSON.parse(result.stdout).error.code).toBeString();
  }
  expect(existsSync(output)).toBe(false);
  const missing = run(root, ['review-prompt', 'capability.test.absent', '--json']); expect(missing.status).toBe(1); expect(JSON.parse(missing.stdout).error.code).toBe('capability_not_found');
});

test('CLI digest tracks same-path dirty contents and diff contains only committed module source paths', () => {
  const root = repo(), base = JSON.parse(run(root, ['review-prompt', MODULE_ID, '--json']).stdout).commit;
  fixtureWrite(root, 'src/module/read.ts', 'export const read = () => 2;\n'); fixtureWrite(root, 'unrelated.ts', 'OUTSIDE DIFF\n'); const head = fixtureCommit(root);
  const diff = run(root, ['review-prompt', MODULE_ID, '--json', '--base', base, '--head', head]); expect(diff.status).toBe(0);
  expect(JSON.parse(diff.stdout).prompt).toContain('export const read = () => 2;'); expect(JSON.parse(diff.stdout).prompt).not.toContain('OUTSIDE DIFF');
  const clean = JSON.parse(run(root, ['review-prompt', MODULE_ID, '--json']).stdout);
  fixtureWrite(root, 'src/module/read.ts', 'dirty source one'); const dirty = JSON.parse(run(root, ['review-prompt', MODULE_ID, '--json']).stdout);
  fixtureWrite(root, 'src/module/read.ts', 'dirty source two'); const next = JSON.parse(run(root, ['review-prompt', MODULE_ID, '--json']).stdout);
  expect(dirty.worktree_dirty_paths).toEqual(['src/module/read.ts']); expect(dirty.dirty_content_sha256).not.toBeNull(); expect(dirty.digest).not.toBe(clean.digest); expect(next.digest).not.toBe(dirty.digest);
  expect(dirty.prompt).not.toContain('dirty source one');
});

test('CLI read boundary never runs configured fsmonitor, diff or textconv helpers', () => {
  const root = repo(), helper = '.git/read-helper', marker = join(root, '.git/helper-called');
  fixtureWrite(root, helper, '#!/bin/sh\nprintf called >> "' + marker + '"\n');
  Bun.spawnSync(['chmod', '+x', join(root, helper)]);
  fixtureWrite(root, '.gitattributes', 'src/module/*.ts diff=fixture\n');
  const base = fixtureCommit(root);
  fixtureWrite(root, 'src/module/read.ts', 'export const read = () => 2;\n');
  const head = fixtureCommit(root);
  fixtureGit(root, ['config', 'core.fsmonitor', join(root, helper)]);
  fixtureGit(root, ['config', 'diff.external', join(root, helper)]);
  fixtureGit(root, ['config', 'diff.fixture.textconv', join(root, helper)]);
  const before = snapshot(root);
  const result = run(root, ['review-prompt', MODULE_ID, '--json', '--base', base, '--head', head]);
  expect(result.status).toBe(0); expect(result.stderr).toBe('');
  expect(existsSync(marker)).toBe(false);
  expect(JSON.parse(result.stdout).prompt).toContain('export const read = () => 2;');
  expect(snapshot(root)).toEqual(before);
});

test('real git argv stay within the read whitelist and concurrent content changes retry once then fail closed', () => {
  const root = repo();
  const scratch = join(root, '.test-git'); mkdirSync(scratch);
  const realGit = spawnSync('which', ['git'], { encoding: 'utf8' }).stdout.trim();
  const wrapper = `#!/usr/bin/env bun\nimport {execFileSync} from 'node:child_process';\nimport {appendFileSync,existsSync,readFileSync,writeFileSync} from 'node:fs';\nconst args=process.argv.slice(2);\nappendFileSync(process.env.ARGV_LOG, JSON.stringify(args)+'\\n');\nconst bytes=execFileSync(${JSON.stringify(realGit)}, args);\nif(args[5]==='status'){\n const count=existsSync(process.env.COUNT_FILE)?Number(readFileSync(process.env.COUNT_FILE,'utf8'))+1:1;\n writeFileSync(process.env.COUNT_FILE,String(count));\n if(count===2 || (count%2===0 && process.env.KEEP_CHANGING==='1'))writeFileSync(process.env.CHANGE_PATH,'dirty version '+count);\n}\nprocess.stdout.write(bytes);\n`;
  fixtureWrite(root, '.test-git/git', wrapper); Bun.spawnSync(['chmod', '+x', join(scratch, 'git')]);
  const log = join(scratch, 'argv.jsonl'), count = join(scratch, 'count');
  fixtureWrite(root, 'src/module/read.ts', 'dirty initial');
  const env = { ...process.env, PATH: `${scratch}:${process.env.PATH}`, ARGV_LOG: log, COUNT_FILE: count, CHANGE_PATH: join(root, 'src/module/read.ts') };
  const retry = run(root, ['review-prompt', MODULE_ID, '--json', '--base', 'HEAD', '--head', 'HEAD'], env);
  expect(retry.status).toBe(0); expect(Number(readFileSync(count, 'utf8'))).toBe(4);
  rmSync(count);
  fixtureWrite(root, 'src/module/read.ts', 'dirty reset');
  const fail = run(root, ['review-prompt', MODULE_ID, '--json'], { ...env, KEEP_CHANGING: '1' });
  expect(fail.status).toBe(1); expect(JSON.parse(fail.stdout).error.code).toBe('worktree_changed_during_read');
  const calls = readFileSync(log, 'utf8').trim().split('\n').map(line => JSON.parse(line) as string[]);
  expect(calls.length).toBeGreaterThan(0);
  for (const call of calls) {
    expect(call.slice(0, 5)).toEqual(['--no-optional-locks', '-c', 'core.fsmonitor=false', '-c', 'diff.submodule=short']);
    const args = [call[0], ...call.slice(5)];
    switch (args[1]) {
      case 'rev-parse':
        expect(args.length === 3 && args[2] === '--show-toplevel' || args.length === 6 && args.slice(2, 5).join(' ') === '--verify --quiet --end-of-options' && args[5].endsWith('^{commit}')).toBe(true); break;
      case 'cat-file': expect(args).toHaveLength(4); expect(args[2]).toBe('-p'); expect(args[3]).toMatch(/^[0-9a-f]{40}:/); break;
      case 'diff': expect(args.slice(2, 4)).toEqual(['--no-ext-diff', '--no-textconv']); expect(args[4]).toMatch(/^[0-9a-f]{40}$/); expect(args[5]).toMatch(/^[0-9a-f]{40}$/); expect(args[6]).toBe('--'); break;
      case 'status': expect(args.slice(2, 7)).toEqual(['--porcelain=v2', '-z', '--untracked-files=all', '--ignore-submodules=dirty', '--']); break;
      default: throw new Error(`unapproved git command: ${args.join(' ')}`);
    }
  }
});
