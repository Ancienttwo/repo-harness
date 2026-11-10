import { describe, expect, spyOn, test } from 'bun:test';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

import {
  processGroupRegistryDirectory,
  reapOrphanedProcessGroups,
  spawnRegisteredProcessGroup,
} from '../../src/effects/process-group-registry';
import { processGroupExists } from '../../src/effects/process-group-termination';

const SRC = join(import.meta.dir, '../../src');
// `etime` can be above or below the true age by less than one second, which the
// tolerance covers. A clock read after a two-second `ps` adds more than that.
const SLOW_PS_SECONDS = 2;

// Each service starts one detached child through the production code path,
// prints READY, then runs until it is killed. `restart-*` services only start.
const SERVICE_SOURCE = `
const [site, dir] = process.argv.slice(2);
const SRC = ${JSON.stringify(SRC)};
const signal = new AbortController().signal;
if (site === 'setup') {
  const { runSetupProcess } = await import(SRC + '/effects/setup/collector.ts');
  void runSetupProcess(['-e', 'require("child_process").spawnSync("sleep", ["302"])'], { cwd: dir, env: process.env, timeout_ms: 600000, signal });
} else if (site === 'dev-activity') {
  const { runDevActivityProcess } = await import(SRC + '/effects/dev-activity/collector.ts');
  void runDevActivityProcess('git', ['status'], { cwd: dir, env: { ...process.env, PATH: dir + '/bin:' + process.env.PATH }, timeout_ms: 600000, signal });
} else if (site === 'operator' || site === 'restart-operator') {
  const { startOperatorServer } = await import(SRC + '/effects/operator/server.ts');
  const env = site === 'operator' ? { ...process.env, REPO_HARNESS_GH_BIN: dir + '/bin/operator-gh' } : process.env;
  const server = await startOperatorServer({ port: 0, env });
  if (site === 'operator') {
    const { repositories } = await (await fetch(server.url + '/api/v1/repositories')).json();
    void fetch(server.url + '/api/v1/repositories/' + repositories[0].repository_id + '/board?parent=1').catch(() => undefined);
  }
} else {
  throw new Error('unknown site ' + site);
}
process.stdout.write('READY\\n');
setInterval(() => undefined, 1 << 30);
`;

interface ProcessRow { readonly pid: number; readonly ppid: number; readonly pgid: number; readonly command: string }

function processTable(): ProcessRow[] {
  const result = spawnSync('ps', ['-A', '-o', 'pid=,ppid=,pgid=,command='], { encoding: 'utf8' });
  expect(result.status).toBe(0);
  return result.stdout.split('\n').filter(Boolean).map((line) => {
    const [pid, ppid, pgid, ...command] = line.trim().split(/\s+/);
    return { pid: Number(pid), ppid: Number(ppid), pgid: Number(pgid), command: command.join(' ') };
  });
}

function formatRows(rows: readonly ProcessRow[]): string {
  return rows.map((row) => `${row.pid}\t${row.ppid}\t${row.pgid}\t${row.command}`).join('\n');
}

function line(child: ChildProcess, expected: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const reader = createInterface({ input: child.stdout! });
    reader.on('line', (value) => {
      if (value !== expected) return;
      resolve();
      reader.close();
    });
    reader.once('close', () => reject(new Error(`stdout closed before ${expected}`)));
  });
}

function exited(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) resolve();
    else child.once('exit', () => resolve());
  });
}

async function startService(site: string, root: string, home: string, path = process.env.PATH): Promise<ChildProcess> {
  const child = spawn(process.execPath, [join(root, 'service.ts'), site, root], {
    env: { ...process.env, PATH: path, REPO_HARNESS_HOME: home }, stdio: ['ignore', 'pipe', 'inherit'],
  });
  await line(child, 'READY');
  return child;
}

async function killService(child: ChildProcess): Promise<void> {
  const exit = exited(child);
  child.kill('SIGKILL');
  await exit;
}

function deadPid(): Promise<number> {
  const child = spawn('true', [], { stdio: 'ignore' });
  return exited(child).then(() => child.pid!);
}

function registerFixture(root: string, site: string): { home: string; writer: ChildProcess | null; opened: Promise<void> | null } {
  const home = join(root, 'home');
  mkdirSync(home, { recursive: true });
  mkdirSync(join(root, 'bin'), { recursive: true });
  writeFileSync(join(root, 'service.ts'), SERVICE_SOURCE);
  writeFileSync(join(root, 'bin/git'), '#!/bin/sh\nexec sleep 303\n');
  chmodSync(join(root, 'bin/git'), 0o755);
  // The real `ps` output arrives on time; only the return is late.
  const realPs = Bun.which('ps');
  if (!realPs) throw new Error('ps is required for the process-group fixture');
  mkdirSync(join(root, 'slow-ps'));
  writeFileSync(join(root, 'slow-ps/ps'), ['#!/bin/sh', `'${realPs}' "$@"`, 'status=$?', `sleep ${SLOW_PS_SECONDS}`, 'exit $status', ''].join('\n'));
  chmodSync(join(root, 'slow-ps/ps'), 0o755);
  if (site !== 'operator') return { home, writer: null, opened: null };
  // The board child runs `gh repo view` first. Block that call on a FIFO;
  // the writer signals its actual open.
  const gitPath = Bun.which('git');
  if (!gitPath) throw new Error('Git is required for the process-group fixture');
  const realGit = realpathSync(gitPath);
  const repo = join(root, 'repo');
  expect(spawnSync(realGit, ['init', '-q', repo]).status).toBe(0);
  const marker = join(root, 'board-gh-read');
  expect(spawnSync('mkfifo', [marker]).status).toBe(0);
  const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
  const ghWrapper = join(root, 'bin/operator-gh');
  writeFileSync(ghWrapper, ['#!/bin/sh', `cat ${quote(marker)} >/dev/null`, 'exit 1', ''].join('\n'));
  chmodSync(ghWrapper, 0o755);
  const now = '2026-10-25T00:00:00.000Z';
  const id = `repo_${createHash('sha256').update(repo).digest('hex').slice(0, 16)}`;
  writeFileSync(join(home, 'registered-repos.json'), `${JSON.stringify({
    version: 1, authorizationRevision: 1,
    repos: [{ id, path: repo, accessMode: 'read_write', source: 'adopt', registeredAt: now, lastSeenAt: now }],
  })}\n`);
  const writer = spawn('bash', ['-c', 'exec 3>"$1"; echo opened; exec sleep 304', 'bash', marker], { stdio: ['ignore', 'pipe', 'ignore'] });
  return { home, writer, opened: line(writer, 'opened') };
}

describe('detached process group registry', () => {
  test.each(['ESRCH', 'EPERM', 'EINVAL', undefined])('process liveness: owner probe %s controls reaping without hiding errors', code => {
    if (process.platform === 'win32') return;
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'rh-owner-probe-')));
    const env = { REPO_HARNESS_HOME: root }, directory = processGroupRegistryDirectory(env);
    mkdirSync(directory, { recursive: true });
    const record = join(directory, `${process.pid}-${process.pid}.json`);
    writeFileSync(record, '{}');
    const error = Object.assign(new Error('owner probe failed'), { code });
    const probe = spyOn(process, 'kill').mockImplementation(() => { throw error; });
    try {
      if (code === 'ESRCH' || code === 'EPERM') {
        expect(reapOrphanedProcessGroups(env)).toEqual([]);
        expect(existsSync(record)).toBe(code === 'EPERM');
      } else {
        expect(() => reapOrphanedProcessGroups(env)).toThrow(error);
        expect(existsSync(record)).toBe(true);
      }
      expect(probe.mock.calls).toEqual([[process.pid, 0]]);
    } finally { probe.mockRestore(); rmSync(root, { recursive: true, force: true }); }
  });

  for (const [site, restart, slowPs] of [
    ['setup', 'restart-operator', false],
    ['dev-activity', 'restart-operator', false],
    ['operator', 'restart-operator', false],
    ['dev-activity', 'restart-operator', true],
  ] as const) {
    test(`${site}${slowPs ? ' with a slow ps' : ''}: a SIGKILLed service leaves its detached group, and the next start reaps it`, async () => {
      if (process.platform === 'win32') return;
      const root = realpathSync(mkdtempSync(join(tmpdir(), `repo-harness-916-${site}-`)));
      const fixture = registerFixture(root, site);
      const groups = new Set<number>();
      let restarted: ChildProcess | null = null;
      try {
        const service = await startService(site, root, fixture.home);
        if (fixture.opened) await fixture.opened;
        const before = processTable();
        for (const row of before) if (row.ppid === service.pid && row.pgid === row.pid) groups.add(row.pgid);
        expect(groups.size).toBe(1);
        const [pgid] = [...groups];
        const owned = (rows: readonly ProcessRow[]) => rows.filter((row) => row.pgid === pgid || row.pid === service.pid);
        console.log(`[${site}] before SIGKILL of service ${service.pid}\n${formatRows(owned(before))}`);
        const record = join(fixture.home, 'process-groups', `${service.pid}-${pgid}.json`);
        expect(existsSync(record)).toBe(true);

        await killService(service);
        const after = owned(processTable());
        console.log(`[${site}] after SIGKILL\n${formatRows(after)}`);
        expect(after.some((row) => row.pid === service.pid)).toBe(false);
        expect(after.some((row) => row.pid === pgid)).toBe(true);
        expect(processGroupExists(pgid!)).toBe(true);
        expect(existsSync(record)).toBe(true);

        restarted = await startService(restart, root, fixture.home, slowPs ? `${join(root, 'slow-ps')}:${process.env.PATH}` : process.env.PATH);
        console.log(`[${site}] after restart\n${formatRows(processTable().filter((row) => row.pgid === pgid))}`);
        expect(processGroupExists(pgid!)).toBe(false);
        expect(existsSync(record)).toBe(false);
      } finally {
        if (restarted) await killService(restarted);
        for (const pgid of groups) try { process.kill(-pgid, 'SIGKILL'); } catch { /* reaped */ }
        fixture.writer?.kill('SIGKILL');
        rmSync(root, { recursive: true, force: true });
      }
    }, 30_000);
  }

  test('a running owner keeps its records and a closed child removes its record', async () => {
    if (process.platform === 'win32') return;
    const child = spawnRegisteredProcessGroup('test', () => spawn('sleep', ['300'], { detached: true, stdio: 'ignore' }));
    const record = join(processGroupRegistryDirectory(), `${process.pid}-${child.pid}.json`);
    const closed = new Promise<void>((resolve) => child.once('close', () => resolve()));
    try {
      expect(existsSync(record)).toBe(true);
      expect(reapOrphanedProcessGroups().some((group) => group.pgid === child.pid)).toBe(false);
      expect(processGroupExists(child.pid!)).toBe(true);
    } finally {
      process.kill(-child.pid!, 'SIGKILL');
      await closed;
    }
    expect(existsSync(record)).toBe(false);
  });

  test('a dead owner record whose PGID now names a newer group is removed without a signal', async () => {
    if (process.platform === 'win32') return;
    const directory = processGroupRegistryDirectory();
    mkdirSync(directory, { recursive: true });
    const owner = await deadPid();
    const stranger = spawn('sleep', ['300'], { detached: true, stdio: 'ignore' });
    const strangerExit = exited(stranger);
    const reused = join(directory, `${owner}-${stranger.pid}.json`);
    writeFileSync(reused, `${JSON.stringify({
      protocol: 1, kind: 'repo-harness-detached-process-group', hostname: hostname(),
      owner_pid: owner, pgid: stranger.pid, service: 'test', registered_at_ms: Date.now() - 60_000,
    })}\n`);
    const gone = await deadPid();
    const absent = join(directory, `${owner}-${gone}.json`);
    writeFileSync(absent, `${JSON.stringify({
      protocol: 1, kind: 'repo-harness-detached-process-group', hostname: hostname(),
      owner_pid: owner, pgid: gone, service: 'test', registered_at_ms: Date.now(),
    })}\n`);
    try {
      expect(reapOrphanedProcessGroups().some((group) => group.pgid === stranger.pid || group.pgid === gone)).toBe(false);
      expect(processGroupExists(stranger.pid!)).toBe(true);
      expect(readdirSync(directory)).not.toContain(`${owner}-${stranger.pid}.json`);
      expect(readdirSync(directory)).not.toContain(`${owner}-${gone}.json`);
    } finally {
      process.kill(-stranger.pid!, 'SIGKILL');
      await strangerExit;
      rmSync(reused, { force: true });
      rmSync(absent, { force: true });
    }
  });
});
