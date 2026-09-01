import { describe, expect, test } from 'bun:test';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseFleetCollectorRequest } from '../../src/effects/operator/fleet-collector-process';

const ROOT = join(import.meta.dir, '../..');
const testWindows = process.platform === 'win32' ? test : test.skip;

function nextJsonLine(child: ChildProcessWithoutNullStreams): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let buffered = '';
    let stderr = '';
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`timed out waiting for child JSON response${stderr ? `: ${stderr.trim()}` : ''}`));
    }, 5_000);
    const cleanup = (): void => {
      clearTimeout(timer);
      child.stdout.removeListener('data', onData);
      child.stderr.removeListener('data', onStderr);
      child.removeListener('error', onError);
      child.removeListener('close', onClose);
    };
    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };
    const onClose = (code: number | null): void => {
      cleanup();
      reject(new Error(`child closed before JSON response (code=${String(code)})${stderr ? `: ${stderr.trim()}` : ''}`));
    };
    const onStderr = (chunk: Buffer | string): void => {
      stderr += String(chunk);
    };
    const onData = (chunk: Buffer | string): void => {
      buffered += String(chunk);
      const newline = buffered.indexOf('\n');
      if (newline < 0) return;
      cleanup();
      try { resolve(JSON.parse(buffered.slice(0, newline)) as Record<string, unknown>); }
      catch (error) { reject(error); }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onStderr);
    child.once('error', onError);
    child.once('close', onClose);
  });
}

async function waitForProcessAbsence(pid: number): Promise<boolean> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    try { process.kill(pid, 0); } catch { return true; }
    await Bun.sleep(10);
  }
  try { process.kill(pid, 0); return false; } catch { return true; }
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe('Fleet collector supervision protocol', () => {
  test('keeps the collector inert until a complete start payload arrives', () => {
    expect(parseFleetCollectorRequest({ type: 'cancel' })).toEqual({ type: 'cancel' });
    expect(parseFleetCollectorRequest({ type: 'start', sequence: 1, max_concurrency: 1 })).toBeNull();
    expect(parseFleetCollectorRequest({
      type: 'start',
      sequence: 1,
      max_concurrency: 1,
      timeout_ms: 1_000,
      env: { REPO_HARNESS_HOME: '/tmp/collector' },
    })).toEqual({
      type: 'start',
      sequence: 1,
      max_concurrency: 1,
      timeout_ms: 1_000,
      env: { REPO_HARNESS_HOME: '/tmp/collector' },
    });
    expect(parseFleetCollectorRequest({
      type: 'start', sequence: 1, max_concurrency: 1, timeout_ms: 1_000, env: { PATH: 42 },
    })).toBeNull();
  });

  test('collector exits through the cooperative cancel protocol before it is started', async () => {
    const collector = spawn(process.execPath, [join(ROOT, 'src/effects/operator/fleet-collector-process.ts')], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    try {
      const response = nextJsonLine(collector);
      collector.stdin.write('{"type":"cancel"}\n');
      expect(await response).toEqual({ ok: false, cancelled: true });
      await new Promise<void>((resolve) => collector.once('close', () => resolve()));
    } finally {
      collector.stdin.end();
    }
  });

  test('Windows controller creates and assigns its own exact collector handle before accepting work', () => {
    const controller = readFileSync(join(ROOT, 'assets/operator/fleet-windows-job-controller.ps1'), 'utf-8');
    expect(controller).toContain('CreateJobObject');
    expect(controller).toContain('ConfigureKillOnClose');
    expect(controller).toContain('JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE');
    expect(controller).toContain('AssignProcessToJobObject');
    expect(controller).toContain('$collector.Handle');
    expect(controller).toContain('$collector.HasExited');
    expect(controller).toContain('[RepoHarnessFleetJob]::BeginForwarding($collector)');
    expect(controller).toContain('function Stop-ExactCollector');
    expect(controller).toContain('$process.WaitForExit(10)');
    expect(controller).toContain("$request.type -ne 'launch'");
    expect(controller).not.toContain('OpenProcess');
    expect(controller).not.toContain('collector_pid');
    expect(controller.indexOf('$collector.HasExited')).toBeLessThan(controller.indexOf('AssignProcessToJobObject($job, $collector.Handle)'));
    expect(controller.indexOf('AssignProcessToJobObject')).toBeLessThan(controller.indexOf("Write-Response 'assigned'"));
    const assignmentFailure = controller.slice(
      controller.indexOf('if (-not [RepoHarnessFleetJob]::AssignProcessToJobObject'),
      controller.indexOf("Write-Response 'cleanup_failed'", controller.indexOf('if (-not [RepoHarnessFleetJob]::AssignProcessToJobObject')),
    );
    expect(assignmentFailure.indexOf('Stop-ExactCollector')).toBeGreaterThan(-1);
    expect(controller).toContain('TerminateJobObject');
    expect(controller.indexOf('TotalPageFaultCount')).toBeLessThan(controller.indexOf('ActiveProcesses'));
    expect(controller).toContain('ActiveProcesses');
    expect(controller.indexOf('ActiveProcesses')).toBeLessThan(controller.indexOf("Write-Response 'cleanup_ack'"));
    expect(controller).not.toContain('taskkill');
  });

  test('Windows server delegates collector creation to the Job owner and gates start on its assignment proof', () => {
    const server = readFileSync(join(ROOT, 'src/effects/operator/server.ts'), 'utf-8').replaceAll('\r\n', '\n');
    expect(server).toContain("const collector = process.platform === 'win32'\n      ? null");
    expect(server).toContain("? spawn('powershell.exe'");
    expect(server).toContain("type: 'launch'");
    const assignmentBranch = server.slice(
      server.indexOf("if (response.type === 'assigned')"),
      server.indexOf("if (response.type === 'cleanup_ack')"),
    );
    expect(assignmentBranch).toContain("type: 'start',");
    expect(assignmentBranch.indexOf("if (controllerAssigned")).toBeLessThan(assignmentBranch.indexOf("type: 'start',"));
    expect(server).toContain("requestWindowsCleanup(true)");
    expect(server).toContain("'cleanup_ack'");
    const fleetBoundary = server.slice(
      server.indexOf('type OperatorFleetCollectorResponse'),
      server.indexOf('type WorkerTaskMessageErrorCode'),
    );
    expect(fleetBoundary).not.toContain('taskkill');
    expect(fleetBoundary).not.toContain('collector_pid');
    expect(fleetBoundary).toContain("controller.kill('SIGKILL')");
    expect(fleetBoundary).toContain('controllerCleanupAcknowledged && controllerClosed');
  });

  testWindows('Windows Job controller terminates its own collector and inherited descendant before cleanup acknowledgement', async () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'repo-harness-windows-job-'));
    const fixture = join(fixtureRoot, 'collector.js');
    writeFileSync(fixture, [
      "const { createInterface } = require('node:readline');",
      "const { spawn } = require('node:child_process');",
      "let descendant = null;",
      "createInterface({ input: process.stdin }).on('line', (line) => {",
      '  const request = JSON.parse(line);',
      "  if (request.type === 'start' && descendant === null) {",
      "    descendant = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });",
      "    process.stdout.write(JSON.stringify({ collector_pid: process.pid, descendant_pid: descendant.pid }) + '\\n');",
      '  }',
      '});',
    ].join('\n'));
    const controller = spawn('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File',
      join(ROOT, 'assets/operator/fleet-windows-job-controller.ps1'),
    ], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let collectorPid = 0;
    let descendantPid = 0;
    try {
      const assigned = nextJsonLine(controller);
      controller.stdin.write(`${JSON.stringify({ type: 'launch', executable: process.execPath, collector_path: fixture })}\n`);
      expect(await assigned).toEqual({ type: 'assigned' });

      const started = nextJsonLine(controller);
      controller.stdin.write('{"type":"start","sequence":1,"max_concurrency":1,"timeout_ms":1000}\n');
      const identities = await started;
      collectorPid = Number(identities.collector_pid);
      descendantPid = Number(identities.descendant_pid);
      if (!Number.isSafeInteger(collectorPid) || collectorPid < 1 || !Number.isSafeInteger(descendantPid) || descendantPid < 1) {
        throw new Error(`invalid collector identities: ${JSON.stringify(identities)}`);
      }

      const acknowledged = nextJsonLine(controller);
      controller.stdin.write('{"type":"cancel"}\n');
      controller.stdin.write('{"type":"terminate"}\n');
      expect(await acknowledged).toEqual({ type: 'cleanup_ack' });
      await new Promise<void>((resolve) => controller.once('close', () => resolve()));
      expect(await waitForProcessAbsence(collectorPid)).toBe(true);
      expect(await waitForProcessAbsence(descendantPid)).toBe(true);
    } finally {
      controller.stdin.end();
      controller.kill('SIGKILL');
      if (collectorPid > 0) {
        try { process.kill(collectorPid, 'SIGKILL'); } catch { /* Job cleanup already removed it */ }
      }
      if (descendantPid > 0) {
        try { process.kill(descendantPid, 'SIGKILL'); } catch { /* Job cleanup already removed it */ }
      }
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  }, 10_000);

  testWindows('a bare PID is rejected and cannot redirect Job cleanup to an unrelated process identity', async () => {
    const controller = spawn('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File',
      join(ROOT, 'assets/operator/fleet-windows-job-controller.ps1'),
    ], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    const unrelated = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore', windowsHide: true });
    try {
      const failed = nextJsonLine(controller);
      controller.stdin.write(`${JSON.stringify({
        type: 'assign',
        collector_pid: unrelated.pid,
      })}\n`);
      expect(await failed).toEqual({ type: 'cleanup_failed' });
      await new Promise<void>((resolve) => controller.once('close', () => resolve()));
      expect(processIsAlive(unrelated.pid!)).toBe(true);
    } finally {
      controller.stdin.end();
      controller.kill('SIGKILL');
      unrelated.kill('SIGKILL');
    }
  }, 10_000);
});
