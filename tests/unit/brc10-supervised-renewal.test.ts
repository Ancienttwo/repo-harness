import { afterEach, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, symlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { fileURLToPath } from 'url';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const runner = fileURLToPath(new URL('../../scripts/run-bounded-verifier-command.ts', import.meta.url));
const sourceRoot = fileURLToPath(new URL('../../src/', import.meta.url));

test('supervisor reports only its observed process-group scope after descendants finish', async () => {
  const root = mkdtempSync(join(tmpdir(), 'brc10-supervisor-')); roots.push(root);
  const result = join(root, 'result.json'); const marker = join(root, 'descendant-finished');
  const descendant = `await Bun.sleep(500); await Bun.write(${JSON.stringify(marker)}, 'done');`;
  const script = `Bun.spawn([process.execPath, '-e', ${JSON.stringify(descendant)}], { stdin: 'ignore', stdout: 'inherit', stderr: 'inherit' }); process.exit(0);`;
  const child = Bun.spawn([process.execPath, runner, '--deadline-ms', String(Date.now() + 5000), '--log', join(root, 'log'), '--result', result, '--', process.execPath, '-e', script], { stdout: 'ignore', stderr: 'pipe' });
  const stderr = new Response(child.stderr).text();
  expect(await child.exited, await stderr).toBe(0);
  const receipt = JSON.parse(readFileSync(result, 'utf8'));
  if (process.platform === 'win32') {
    expect(receipt.process_group_quiescence).toEqual({ scope: 'unsupported', state: 'unknown' });
    await Bun.sleep(700);
  } else {
    expect(existsSync(marker)).toBe(true);
    expect(receipt.duration_ms).toBeGreaterThanOrEqual(500);
    expect(receipt.process_group_quiescence).toEqual({ scope: 'posix_process_group', state: 'quiescent' });
  }
}, 10_000);

test('forced termination reports observed scope without claiming remote provider inactivity', async () => {
  const root = mkdtempSync(join(tmpdir(), 'brc10-timeout-')); roots.push(root);
  const result = join(root, 'result.json');
  const child = Bun.spawn([process.execPath, runner, '--deadline-ms', String(Date.now() + 300), '--log', join(root, 'log'), '--result', result,
    '--', process.execPath, '-e', "process.on('SIGTERM', () => {}); await Bun.sleep(10000);"], { stdout: 'ignore', stderr: 'pipe' });
  const stderr = new Response(child.stderr).text();
  expect(await child.exited, await stderr).toBe(124);
  const receipt = JSON.parse(readFileSync(result, 'utf8'));
  expect(receipt.timed_out).toBe(true);
  expect(receipt).not.toHaveProperty('runtime_effect_inactive');
  expect(receipt.process_group_quiescence).toEqual(process.platform === 'win32'
    ? { scope: 'unsupported', state: 'unknown' } : { scope: 'posix_process_group', state: 'quiescent' });
}, 10_000);

test('expired deadline refuses command admission before any side effect', async () => {
  const root = mkdtempSync(join(tmpdir(), 'brc-expired-')); roots.push(root);
  const marker = join(root, 'ran'); const result = join(root, 'result.json');
  const child = Bun.spawn([process.execPath, runner, '--deadline-ms', '1', '--log', join(root, 'log'), '--result', result,
    '--', '/bin/sh', '-c', 'printf ran > "$1"', 'sh', marker], { stdout: 'ignore', stderr: 'pipe' });
  expect(await child.exited).toBe(124);
  expect(existsSync(marker)).toBe(false);
  expect(JSON.parse(readFileSync(result, 'utf8'))).toMatchObject({ termination_cause: 'deadline', started: false });
});

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
  test(`supervisor preserves ${signal} cancellation during command startup`, async () => {
    const root = mkdtempSync(join(tmpdir(), 'brc-startup-cancel-')); roots.push(root);
    const ready = join(root, 'ready'); const result = join(root, 'result.json');
    const gatedRunner = join(root, 'gated-runner.ts');
    // The gated copy runs outside scripts/, so its repository imports must stay absolute.
    const source = readFileSync(runner, 'utf8').replaceAll("from '../src/", `from '${sourceRoot}`);
    const gateAnchor = "const stdoutHash = createHash('sha256');";
    expect(source.split(gateAnchor)).toHaveLength(2);
    // Hold the real supervisor after spawn so cancellation reaches the startup window.
    const gate = "process.stdout.write('spawned\\n'); await new Promise<void>(resolve => process.stdin.once('data', () => resolve()));\n";
    writeFileSync(gatedRunner, source.replace(gateAnchor, gate + gateAnchor));
    const code = `process.on('SIGTERM', () => { process.stdout.write('done'); process.exit(0); }); await Bun.write(${JSON.stringify(ready)}, String(process.pid)); await Bun.sleep(15000);`;
    const child = Bun.spawn([process.execPath, gatedRunner, '--deadline-ms', String(Date.now() + 5000), '--log', join(root, 'out'), '--stderr-log', join(root, 'err'), '--result', result,
      '--', process.execPath, '-e', code], { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' });
    const stderr = new Response(child.stderr).text();
    try {
      const reader = child.stdout.getReader();
      const startup = await reader.read();
      reader.releaseLock();
      expect(new TextDecoder().decode(startup.value)).toBe('spawned\n');
      const limit = Date.now() + 3000;
      while (!existsSync(ready) && Date.now() < limit && child.exitCode === null) await Bun.sleep(10);
      expect(existsSync(ready)).toBe(true);
      child.kill(signal);
      child.stdin.write('continue');
      child.stdin.end();
      expect(await child.exited, await stderr).toBe({ SIGINT: 130, SIGTERM: 143, SIGHUP: 129 }[signal]);
      expect(JSON.parse(readFileSync(result, 'utf8'))).toMatchObject({
        termination_cause: 'cancelled', signal, timed_out: false, output_complete: true,
        process_group_quiescence: process.platform === 'win32'
          ? { scope: 'unsupported', state: 'unknown' } : { scope: 'posix_process_group', state: 'quiescent' },
      });
    } finally {
      if (child.exitCode === null) { child.kill('SIGKILL'); await child.exited; }
      if (existsSync(ready)) {
        const pid = Number(readFileSync(ready, 'utf8'));
        try { process.kill(process.platform === 'win32' ? pid : -pid, 'SIGKILL'); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
      }
    }
  }, 10000);

  test(`supervisor preserves ${signal} cancellation when child exits successfully`, async () => {
    const root = mkdtempSync(join(tmpdir(), 'brc-cancel-')); roots.push(root);
    const ready = join(root, 'ready'); const result = join(root, 'result.json');
    const code = `process.on('SIGTERM', () => { process.stdout.write('done'); process.exit(0); }); await Bun.write(${JSON.stringify(ready)}, 'ready'); await Bun.sleep(15000);`;
    const child = Bun.spawn([process.execPath, runner, '--deadline-ms', String(Date.now() + 5000), '--log', join(root, 'out'), '--stderr-log', join(root, 'err'), '--result', result,
      '--', process.execPath, '-e', code], { stdout: 'ignore', stderr: 'pipe' });
    try {
      const limit = Date.now() + 3000;
      while (!existsSync(ready) && Date.now() < limit && child.exitCode === null) await Bun.sleep(10);
      expect(existsSync(ready)).toBe(true);
      child.kill(signal);
      expect(await child.exited).not.toBe(0);
      expect(JSON.parse(readFileSync(result, 'utf8'))).toMatchObject({ termination_cause: 'cancelled', signal, timed_out: false, output_complete: true });
    } finally { if (child.exitCode === null) { child.kill('SIGKILL'); await child.exited; } }
  }, 10000);
}

test('supervisor refuses result and log symlinks without overwriting their targets', async () => {
  const root = mkdtempSync(join(tmpdir(), 'brc-result-path-')); roots.push(root);
  const victim = join(root, 'victim'); writeFileSync(victim, 'preserve');
  const result = join(root, 'result'); symlinkSync(victim, result);
  const child = Bun.spawn([process.execPath, runner, '--deadline-ms', String(Date.now() + 2000), '--log', join(root, 'log'), '--result', result,
    '--', '/bin/sh', '-c', 'exit 0'], { stdout: 'ignore', stderr: 'ignore' });
  expect(await child.exited).not.toBe(0); expect(readFileSync(victim, 'utf8')).toBe('preserve');
  const log = join(root, 'linked-log'); symlinkSync(victim, log);
  const refused = Bun.spawn([process.execPath, runner, '--deadline-ms', '1', '--log', log, '--result', join(root, 'result2'), '--', '/bin/true'], { stdout: 'ignore', stderr: 'ignore' });
  expect(await refused.exited).not.toBe(0); expect(readFileSync(victim, 'utf8')).toBe('preserve');
});
