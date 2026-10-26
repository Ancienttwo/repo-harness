import { afterEach, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { DevActivitySnapshotV2 } from '../../src/core/dev-activity/types';
import type { DevActivityProcessRunner } from '../../src/effects/dev-activity/collector';
import { startTestsCollector, testsArtifactRoot, type TestsCollectorHandle } from '../../src/effects/operator/tests-collector';
import { repoHarnessRepoIdFor } from '../../src/effects/repo-registry';

const cleanup: string[] = [];
const collectors: TestsCollectorHandle[] = [];
afterEach(async () => {
  for (const collector of collectors.splice(0)) await collector.close();
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true });
});

const SHA = 'b'.repeat(40);
const REPORT = (file: string, name: string) => `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="bun test" tests="1" failures="1" time="0.2">
  <testsuite name="${file}" file="${file}" tests="1" failures="1" time="0.2">
    <properties><property name="ci" value="https://github.com/owner/repo/actions/runs/100" /></properties>
    <testcase name="${name}" classname="" time="0.1" file="${file}" line="1">
      <failure type="AssertionError">stack at /home/runner/work/repo/${file}:1 token-secret</failure>
    </testcase>
  </testsuite>
</testsuites>
`;
const PROJECTION = JSON.stringify({ schemaVersion: 'repo-harness.test-capability-projection/v1', declared: [], missing: [], tests: [
  { file: 'tests/a.test.ts', sources: ['src/a.ts'], capabilities: [{ id: 'capability.a', via: ['import'] }] },
  { file: 'tests/b.test.ts', sources: [], capabilities: [] },
] });

function fixture() {
  const parent = realpathSync(mkdtempSync(join(tmpdir(), 'tests-collector-'))); cleanup.push(parent);
  const repo = join(parent, 'repo'), home = join(parent, 'home');
  mkdirSync(repo); mkdirSync(home);
  const id = repoHarnessRepoIdFor(repo);
  const at = '2026-10-27T00:00:00.000Z';
  writeFileSync(join(home, 'registered-repos.json'), JSON.stringify({ version: 1, authorizationRevision: 1, repos: [
    { id, path: repo, accessMode: 'read_only', source: 'adopt', registeredAt: at, lastSeenAt: at },
  ] }));
  return { repo, home, id, env: { ...process.env, REPO_HARNESS_HOME: home } };
}

function activity(id: string, github: string | null = 'owner/repo', branch: string | null = 'main', collectedAt: string | null = '2026-10-27T00:00:00.000Z'): DevActivitySnapshotV2 {
  return {
    projection_version: 'repo-harness.dev-activity.v2', status: collectedAt === null ? 'unavailable' : 'ready', collected_at: collectedAt,
    repositories: collectedAt === null ? [] : [{ repository_id: id, display_name: 'repo', github, default_branch: branch, sources: [] }],
    unreadable_registrations: 0, items: [], attention: [],
  } as unknown as DevActivitySnapshotV2;
}

/** A fake gh: GitHub state is plain data; `run download` writes the artifact into -D like gh does. */
function github() {
  const state = {
    runs: [{ id: 100, run_attempt: 2, head_sha: SHA, created_at: '2026-10-25T21:35:21Z', conclusion: 'failure' }] as Record<string, unknown>[],
    artifacts: [
      { name: 'junit-daily-1', size_in_bytes: 10, expired: false },
      { name: 'junit-daily-2', size_in_bytes: 10, expired: false },
      { name: 'test-projection-2', size_in_bytes: 10, expired: false },
    ] as Record<string, unknown>[],
    issues: [
      { number: 7, title: '[CI repair] tests failed @ abc', html_url: 'https://github.com/owner/repo/issues/7', body: '<!-- ci-repair:run-100 -->\n\nevidence', is_pull_request: false },
      { number: 8, title: 'A PR that quotes the marker', html_url: 'https://github.com/owner/repo/pull/8', body: '<!-- ci-repair:run-100 -->', is_pull_request: true },
      { number: 9, title: 'Unrelated', html_url: 'https://github.com/owner/repo/issues/9', body: 'no marker', is_pull_request: false },
      { number: 3, title: '[CI repair] daily full run incomplete in /Users/someone/x', html_url: 'https://github.com/owner/repo/issues/3', body: '<!-- ci-daily-missing:2026-10-24 -->', is_pull_request: false },
    ] as Record<string, unknown>[],
    fail: null as RegExp | null,
  };
  const calls: { argv: string; cwd: string }[] = [];
  const run: DevActivityProcessRunner = async (command, argv, options) => {
    const line = `${command} ${argv.join(' ')}`;
    calls.push({ argv: line, cwd: options.cwd });
    if (state.fail?.test(line)) return { ok: false, code: 'failed' };
    if (argv[0] === 'api' && argv[1]!.includes('/actions/workflows/ci.yml/runs?')) return { ok: true, stdout: JSON.stringify({ workflow_runs: state.runs }) };
    if (argv[0] === 'api' && /\/actions\/runs\/\d+\/artifacts/u.test(argv[1]!)) return { ok: true, stdout: JSON.stringify({ artifacts: state.artifacts }) };
    if (argv[0] === 'api' && argv[1] === '--paginate') return { ok: true, stdout: state.issues.map(issue => JSON.stringify(issue)).join('\n') + '\n' };
    if (argv[0] === 'run' && argv[1] === 'download') {
      const name = argv[argv.indexOf('-n') + 1]!, dir = argv[argv.indexOf('-D') + 1]!;
      mkdirSync(join(dir, '20261025T220000Z-1'), { recursive: true });
      if (name.startsWith('junit-daily-')) {
        writeFileSync(join(dir, '20261025T220000Z-1', 'tests__a.test.ts.xml'), REPORT('tests/a.test.ts', `attempt ${name}`));
      } else writeFileSync(join(dir, 'test-capability-projection.json'), PROJECTION);
      return { ok: true, stdout: '' };
    }
    return { ok: false, code: 'failed' };
  };
  return { state, calls, run };
}

function collect(f: ReturnType<typeof fixture>, gh: ReturnType<typeof github>, read: () => DevActivitySnapshotV2, interval_ms = 60_000): TestsCollectorHandle {
  const handle = startTestsCollector({ env: f.env, read_dev_activity: read, run_process: gh.run, interval_ms, now: () => new Date('2026-10-27T01:00:00.000Z') });
  collectors.push(handle);
  return handle;
}

test('serves the newest daily run of the GitHub default branch: highest attempt, names and results only, open repairs', async () => {
  const f = fixture(), gh = github();
  const tests = collect(f, gh, () => activity(f.id));
  expect(tests.read(f.id)).toEqual({ state: 'unavailable', reason: 'tests_pending' });
  await tests.settled();
  const cache = tests.read(f.id);
  if (cache.state !== 'ready') throw new Error(`not ready: ${cache.reason}`);
  expect(cache.snapshot).toEqual({
    protocol: 1, kind: 'operator_tests', repository_id: f.id, collected_at: '2026-10-27T01:00:00.000Z',
    run: { id: 100, attempt: 2, head_sha: SHA, created_at: '2026-10-25T21:35:21Z', conclusion: 'failure', channel: 'daily_full' },
    projection: { state: 'ok', files: [
      { file: 'tests/a.test.ts', capabilities: [{ id: 'capability.a', via: ['import'] }], command: 'bun run test:files tests/a.test.ts --timeout 60000 --max-concurrency 1' },
      { file: 'tests/b.test.ts', capabilities: [], command: 'bun run test:files tests/b.test.ts --timeout 60000 --max-concurrency 1' },
    ] },
    // tests/b.test.ts has no report: the page shows it with no result.
    results: { state: 'ok', files: [{ file: 'tests/a.test.ts', duration_ms: 200, cases: [{ suite: null, name: 'attempt junit-daily-2', result: 'failed', duration_ms: 100 }] }] },
    repairs: { state: 'ok', issues: [
      { number: 3, title: '[CI repair] daily full run incomplete in [private path]', url: 'https://github.com/owner/repo/issues/3' },
      { number: 7, title: '[CI repair] tests failed @ abc', url: 'https://github.com/owner/repo/issues/7' },
    ] },
  });
  const text = JSON.stringify(cache.snapshot);
  for (const hidden of ['token-secret', '/home/runner', 'actions/runs', f.repo, f.home]) expect(text).not.toContain(hidden);

  // Read-only gh argv only, the branch from Dev Activity, and the highest attempt's artifacts.
  expect(gh.calls.map(call => call.argv)).toEqual([
    'gh api repos/owner/repo/actions/workflows/ci.yml/runs?event=schedule&status=completed&per_page=1&branch=main',
    'gh api repos/owner/repo/actions/runs/100/artifacts?per_page=100',
    `gh run download 100 -R owner/repo -n junit-daily-2 -D ${join(testsArtifactRoot(f.env, f.id), '100-2', 'junit')}`,
    `gh run download 100 -R owner/repo -n test-projection-2 -D ${join(testsArtifactRoot(f.env, f.id), '100-2', 'projection')}`,
    'gh api --paginate repos/owner/repo/issues?state=open&per_page=100 --jq .[] | {number, title, html_url, body, is_pull_request: (.pull_request != null)}',
  ]);
  // Downloads live under the repo-harness home; gh never runs in, or writes to, the user's repository.
  for (const call of gh.calls) expect(call.cwd.startsWith(f.home)).toBe(true);
  expect(readdirSync(f.repo)).toEqual([]);
  expect(tests.read('repo_unknown')).toEqual({ state: 'unavailable', reason: 'repository_not_found' });
});

test('the same run is not downloaded again; a newer run replaces the old download', async () => {
  const f = fixture(), gh = github();
  const tests = collect(f, gh, () => activity(f.id), 30);
  await tests.settled();
  const downloads = () => gh.calls.filter(call => call.argv.startsWith('gh run download')).length;
  expect(downloads()).toBe(2);
  const repairs = () => gh.calls.filter(call => call.argv.includes('--paginate')).length;
  for (let attempt = 0; attempt < 200 && repairs() < 2; attempt++) await Bun.sleep(10);
  expect(downloads()).toBe(2);

  gh.state.runs = [{ id: 101, run_attempt: 1, head_sha: SHA, created_at: '2026-10-26T21:35:21Z', conclusion: 'success' }];
  gh.state.artifacts = [{ name: 'junit-daily-1', size_in_bytes: 10, expired: false }, { name: 'test-projection-1', size_in_bytes: 10, expired: false }];
  for (let attempt = 0; attempt < 200 && (tests.read(f.id) as { snapshot?: { run: { id: number } } }).snapshot?.run.id !== 101; attempt++) await Bun.sleep(10);
  await tests.settled();
  expect(downloads()).toBe(4);
  expect(readdirSync(testsArtifactRoot(f.env, f.id))).toEqual(['101-1']);
});

test('a missing projection or JUnit artifact is that section unavailable; with neither the repository is unavailable', async () => {
  const f = fixture();
  const cases: [Record<string, unknown>[], unknown][] = [
    [[{ name: 'junit-daily-2', size_in_bytes: 10, expired: false }], { projection: { state: 'unavailable', reason: 'projection_missing' }, results: { state: 'ok' } }],
    [[{ name: 'test-projection-2', size_in_bytes: 10, expired: false }], { projection: { state: 'ok' }, results: { state: 'unavailable', reason: 'junit_missing' } }],
  ];
  for (const [artifacts, expected] of cases) {
    const gh = github();
    gh.state.artifacts = artifacts;
    const tests = collect(f, gh, () => activity(f.id));
    await tests.settled();
    const cache = tests.read(f.id);
    if (cache.state !== 'ready') throw new Error('not ready');
    expect(cache.snapshot).toMatchObject(expected as object);
  }
  for (const [artifacts, reason] of [
    [[{ name: 'junit-daily-1', size_in_bytes: 10, expired: false }], 'artifacts_missing'],
    [[{ name: 'junit-daily-2', size_in_bytes: 10, expired: true }], 'artifacts_expired'],
    [[{ name: 'junit-daily-2', size_in_bytes: 512 * 1024 * 1024, expired: false }], 'artifact_too_large'],
  ] as const) {
    const gh = github();
    gh.state.artifacts = [...artifacts];
    const tests = collect(f, gh, () => activity(f.id));
    await tests.settled();
    expect(tests.read(f.id)).toEqual({ state: 'unavailable', reason });
  }
  // A run with nothing to download leaves no cache directory.
  rmSync(testsArtifactRoot(f.env, f.id), { recursive: true, force: true });
  const gh = github();
  gh.state.artifacts = [];
  const none = collect(f, gh, () => activity(f.id));
  await none.settled();
  expect(none.read(f.id)).toEqual({ state: 'unavailable', reason: 'artifacts_missing' });
  expect(existsSync(testsArtifactRoot(f.env, f.id))).toBe(false);
});

test('no daily run, a GitHub failure, an unnamed branch and a broken report are unavailable with reasons, never empty', async () => {
  const f = fixture();
  const run = async (setup: (gh: ReturnType<typeof github>) => void, read = () => activity(f.id)) => {
    const gh = github();
    setup(gh);
    const tests = collect(f, gh, read);
    await tests.settled();
    return { cache: tests.read(f.id), gh };
  };
  expect((await run(gh => { gh.state.runs = []; })).cache).toEqual({ state: 'unavailable', reason: 'no_daily_run' });
  expect((await run(gh => { gh.state.fail = /workflows\/ci\.yml/u; })).cache).toEqual({ state: 'unavailable', reason: 'github_unavailable' });
  expect((await run(gh => { gh.state.fail = /run download/u; })).cache).toEqual({ state: 'unavailable', reason: 'artifact_download_failed' });
  const noBranch = await run(() => {}, () => activity(f.id, 'owner/repo', null));
  expect(noBranch.cache).toEqual({ state: 'unavailable', reason: 'default_branch_unknown' });
  expect(noBranch.gh.calls).toEqual([]);
  expect((await run(() => {}, () => activity(f.id, null, 'main'))).cache).toEqual({ state: 'unavailable', reason: 'default_branch_unknown' });

  const repairsDown = await run(gh => { gh.state.fail = /--paginate/u; });
  expect(repairsDown.cache.state === 'ready' && repairsDown.cache.snapshot.repairs).toEqual({ state: 'unavailable', reason: 'repairs_unavailable' });

  const broken = github();
  const original = broken.run;
  broken.run = async (command, argv, options) => {
    const result = await original(command, argv, options);
    if (argv[0] === 'run' && argv.includes('junit-daily-2')) writeFileSync(join(argv[argv.indexOf('-D') + 1]!, 'bad.xml'), '<testsuites><testsuite');
    return result;
  };
  const tests = collect(f, broken, () => activity(f.id));
  await tests.settled();
  const cache = tests.read(f.id);
  expect(cache.state === 'ready' && cache.snapshot.results).toEqual({ state: 'unavailable', reason: 'junit_invalid' });
});

test('the tests follow the first Dev Activity cycle, and an invalid registry is unavailable', async () => {
  const f = fixture(), gh = github();
  let snapshot = activity(f.id, 'owner/repo', 'main', null);
  const tests = collect(f, gh, () => snapshot);
  await tests.settled();
  expect(tests.read(f.id)).toEqual({ state: 'unavailable', reason: 'tests_pending' });
  expect(gh.calls).toEqual([]);
  snapshot = activity(f.id);
  for (let attempt = 0; attempt < 800 && tests.read(f.id).state !== 'ready'; attempt++) await Bun.sleep(10);
  expect(tests.read(f.id).state).toBe('ready');

  writeFileSync(join(f.home, 'registered-repos.json'), '{"version":1}');
  const broken = collect(f, github(), () => activity(f.id));
  await broken.settled();
  expect(broken.read(f.id)).toEqual({ state: 'unavailable', reason: 'registry_unavailable' });
});

test('close aborts a running gh and leaves no later call', async () => {
  const f = fixture();
  let aborted = false;
  let calls = 0;
  const tests = startTestsCollector({ env: f.env, read_dev_activity: () => activity(f.id), run_process: (_command, _argv, options) => {
    calls++;
    return new Promise(resolve => options.signal.addEventListener('abort', () => { aborted = true; resolve({ ok: false, code: 'aborted' }); }, { once: true }));
  } });
  for (let attempt = 0; attempt < 100 && calls === 0; attempt++) await Bun.sleep(5);
  await tests.close();
  expect(aborted).toBe(true);
  expect(calls).toBe(1);
  expect(existsSync(join(testsArtifactRoot(f.env, f.id), '100-2'))).toBe(false);
});
