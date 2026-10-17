import { expect, test } from 'bun:test';
import { execFileSync, spawn, spawnSync } from 'child_process';
import { constants, closeSync, openSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const runners = ['scripts'];
for (const runner of runners) {
  for (const target of ['stdout', 'stderr']) for (const expired of [false, true]) {
    test(`${runner}: rejects ${target} FIFO with expired=${expired} without spawning`, () => {
      const root = mkdtempSync(join(tmpdir(), 'supervisor-fifo-'));
      try {
        const stdout = join(root, 'stdout'); const stderr = join(root, 'stderr');
        execFileSync('mkfifo', [target === 'stdout' ? stdout : stderr]);
        const result = spawnSync(process.execPath, [join(import.meta.dir, '..', runner, 'run-bounded-verifier-command.ts'),
          '--deadline-ms', String(expired ? 1 : Date.now() + 300), '--log', stdout, '--stderr-log', stderr,
          '--result', join(root, 'result'), '--', process.execPath, '-e', `require('fs').writeFileSync(${JSON.stringify(join(root, 'started'))}, 'yes')`],
          { timeout: 1500, encoding: 'utf8' });
        expect((result.error as NodeJS.ErrnoException | undefined)?.code).not.toBe('ETIMEDOUT');
        expect(result.status).not.toBe(0);
        expect(existsSync(join(root, 'started'))).toBe(false);
      } finally { rmSync(root, { recursive: true, force: true }); }
    });
  }
  test(`${runner}: validates the opened FIFO descriptor even with a reader`, () => {
    const root = mkdtempSync(join(tmpdir(), 'supervisor-open-fifo-'));
    const fifo = join(root, 'fifo'); execFileSync('mkfifo', [fifo]);
    const reader = openSync(fifo, constants.O_RDWR | constants.O_NONBLOCK);
    try {
      const run = spawnSync(process.execPath, [join(import.meta.dir, '..', runner, 'run-bounded-verifier-command.ts'),
        '--deadline-ms', String(Date.now() + 1000), '--log', fifo, '--result', join(root, 'result'), '--', '/bin/sh', '-c', 'exit 0'],
        { timeout: 2000, encoding: 'utf8' });
      expect(run.status).toBe(1);
      expect(JSON.parse(readFileSync(join(root, 'result'), 'utf8'))).toMatchObject({ started: false, termination_cause: 'output_error', output_complete: false });
    } finally { closeSync(reader); rmSync(root, { recursive: true, force: true }); }
  });
  for (const leaderAlive of [false, true]) test(`${runner}: cancellation bounds inherited pipes, leaderAlive=${leaderAlive}`, async () => {
    const root = mkdtempSync(join(tmpdir(), 'supervisor-cancel-'));
    const pidPath = join(root, 'descendant');
    writeFileSync(join(root, 'worker.ts'), `import {spawn} from 'child_process'; import {writeFileSync} from 'fs';
const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:['ignore',1,2]});
writeFileSync(${JSON.stringify(pidPath)},String(child.pid)); child.unref(); ${leaderAlive ? 'setInterval(()=>{},1000);' : 'process.exit(0);'}`);
    const wrapper = spawn(process.execPath, [join(import.meta.dir, '..', runner, 'run-bounded-verifier-command.ts'),
      '--deadline-ms', String(Date.now() + 15000), '--log', join(root, 'stdout'), '--stderr-log', join(root, 'stderr'),
      '--result', join(root, 'result'), '--', process.execPath, join(root, 'worker.ts')], { stdio: 'ignore' });
    const exit = new Promise<number | null>(resolve => wrapper.once('exit', resolve));
    const watchdog = setTimeout(() => wrapper.kill('SIGKILL'), 3500);
    try {
      const readyDeadline = Date.now() + 1000;
      while (!existsSync(pidPath) && Date.now() < readyDeadline) await Bun.sleep(10);
      expect(existsSync(pidPath)).toBe(true);
      await Bun.sleep(100);
      wrapper.kill('SIGTERM');
      expect(await exit).toBe(143);
      const result = JSON.parse(readFileSync(join(root, 'result'), 'utf8'));
      expect(result.termination_cause).toBe('cancelled');
      expect(result.output_complete).toBe(false);
    } finally {
      clearTimeout(watchdog); wrapper.kill('SIGKILL');
      if (existsSync(pidPath)) { try { process.kill(Number(readFileSync(pidPath, 'utf8')), 'SIGKILL'); } catch {} }
      rmSync(root, { recursive: true, force: true });
    }
  }, 5000);
}
