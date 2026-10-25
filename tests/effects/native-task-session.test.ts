import { afterEach, expect, test } from 'bun:test';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bindNativeTaskSession } from '../../src/effects/terminal/native-task-session';
import { bindTaskRuntimeFixture } from '../helpers/engineer-runtime-fixture';
import { tmpWorkspace, initGitRepo, commitAll, run } from '../helpers/repo-fixture';
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
async function fixture() {
  const root = tmpWorkspace('native-task-session'); roots.push(root); initGitRepo(root);
  run('git', ['remote', 'add', 'origin', 'https://github.com/acme/widgets.git'], root);
  writeFileSync(join(root, 'README.md'), 'fixture'); commitAll(root, 'initial');
  const home = join(root, 'authority-home'); mkdirSync(home);
  const bound = await bindTaskRuntimeFixture(root, { authorityHome: home, repositoryId: '123456', issueId: '987654' });
  const ready = join(root, 'controlled-ready.json');
  const publish = (session_id: string, pid = bound.binding.provider.pid, fixture = false) => writeFileSync(ready, JSON.stringify({ pid, session_id, fixture }));
  publish('native-provider-thread');
  const input = { repo_root: root, binding: bound.binding, ready_path: ready };
  return { root, bound, publish, input };
}
test('controlled native identity binds the exact public-lifecycle session and cannot be reassigned', async () => {
  const f = await fixture(), first = bindNativeTaskSession(f.input);
  const path = join(f.bound.dir, 'native-session.json'), bytes = readFileSync(path, 'utf8');
  expect(first).toMatchObject({ host: 'codex', native_session_id: 'native-provider-thread', task: f.bound.binding.task, role: f.bound.binding.role });
  expect(first.session_binding_sha256).toMatch(/^sha256:[a-f0-9]{64}$/);
  expect(bindNativeTaskSession(f.input)).toEqual(first); expect(readFileSync(path, 'utf8')).toBe(bytes);
  f.publish('different-native-thread');
  expect(() => bindNativeTaskSession(f.input)).toThrow('native_task_session_identity_changed');
  expect(readFileSync(path, 'utf8')).toBe(bytes);
});
test('foreign process, scripted identity, changed binding and closed session cannot supply native attribution', async () => {
  const f = await fixture();
  f.publish('native-provider-thread', f.bound.binding.provider.pid + 1);
  expect(() => bindNativeTaskSession(f.input)).toThrow('native_task_session_host_mismatch');
  f.publish('native-provider-thread', f.bound.binding.provider.pid, true);
  expect(() => bindNativeTaskSession(f.input)).toThrow('native_task_session_host_mismatch');
  f.publish('native-provider-thread');
  expect(() => bindNativeTaskSession({ ...f.input, binding: { ...f.bound.binding, max_requests: 2 } })).toThrow('native_task_session_binding_changed');
  writeFileSync(join(f.bound.dir, 'closed.json'), '{}');
  expect(() => bindNativeTaskSession(f.input)).toThrow();
});
