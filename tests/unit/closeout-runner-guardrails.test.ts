import { afterEach, describe, expect, test } from 'bun:test';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';
import {
  helperRequiresExpensiveRunLock,
  helperTimeoutMs,
  runHelper,
} from '../../src/cli/runtime/helper-runner';
import { acquireExpensiveRunLock } from '../../src/effects/expensive-run-lock';
import { acquireExclusiveDirectoryLock } from '../../src/effects/locking/exclusive-directory-lock';
import { runProcess } from '../../src/effects/process-runner';
import {
  runBoundedProviderProcess,
  withHarnessBenchmarkExecutionLock,
} from '../../scripts/run-harness-profile-benchmark';

const ROOT = join(import.meta.dir, '..', '..');
const temporaryRoots: string[] = [];

function temporaryRoot(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  temporaryRoots.push(root);
  return root;
}

function runGit(cwd: string, args: readonly string[]): void {
  const result = spawnSync('git', [...args], { cwd, encoding: 'utf-8' });
  expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
}

function initializeGitRepository(root: string): void {
  runGit(root, ['init', '-b', 'main']);
  runGit(root, ['config', 'user.name', 'Guardrail Fixture']);
  runGit(root, ['config', 'user.email', 'guardrail@example.test']);
  writeFileSync(join(root, 'README.md'), 'fixture\n');
  runGit(root, ['add', 'README.md']);
  runGit(root, ['commit', '-m', 'fixture']);
}

async function waitForPath(path: string, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!existsSync(path)) {
    if (Date.now() >= deadline) throw new Error(`timed out waiting for ${path}`);
    await Bun.sleep(10);
  }
}

function createVerifierRuntime(root: string, body: readonly string[]): string {
  const sourceRoot = join(root, 'fixture-runtime');
  mkdirSync(join(sourceRoot, 'assets'), { recursive: true });
  mkdirSync(join(sourceRoot, 'scripts'), { recursive: true });
  writeFileSync(join(sourceRoot, 'assets', 'workflow-contract.v1.json'), `${JSON.stringify({
    helpers: {
      scripts: ['verify-sprint.sh'],
      descriptions: { 'verify-sprint': 'fixture verifier' },
    },
  })}\n`);
  const helper = join(sourceRoot, 'scripts', 'verify-sprint.sh');
  writeFileSync(helper, ['#!/bin/bash', ...body, ''].join('\n'));
  chmodSync(helper, 0o755);
  return sourceRoot;
}

async function waitForChildProcess(parentPid: number, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = spawnSync('ps', ['-axo', 'ppid='], { encoding: 'utf-8' });
    if (result.status === 0 && result.stdout.split(/\s+/).includes(String(parentPid))) return;
    await Bun.sleep(10);
  }
  throw new Error(`timed out waiting for child of ${parentPid}`);
}

function killIfPresent(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(pid, signal);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
  }
}

function processGroupExists(pid: number): boolean {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('closeout runner guardrails', () => {
  test('one candidate commit has one PR CI lane with cancellation', () => {
    const workflow = readFileSync(join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf-8');
    expect(workflow).toContain('pull_request:');
    expect(workflow).not.toMatch(/push:[\s\S]*codex\/\*\*/);
    expect(workflow).toContain('cancel-in-progress: true');
  });

  test('helper identity selects immutable ordinary, verifier, and closeout budgets', () => {
    expect(helperTimeoutMs('check-task-workflow')).toBe(120_000);
    expect(helperTimeoutMs('verify-contract')).toBe(720_000);
    expect(helperTimeoutMs('verify-sprint')).toBe(720_000);
    expect(helperTimeoutMs('contract-worktree')).toBe(900_000);
    expect(helperTimeoutMs('merge-gate')).toBe(900_000);
    expect(helperTimeoutMs('ship-worktrees')).toBe(900_000);
  });

  test('only canonical expensive helper modes acquire the shared Git lock', () => {
    expect(helperRequiresExpensiveRunLock('verify-contract', [])).toBe(true);
    expect(helperRequiresExpensiveRunLock('verify-sprint', [])).toBe(true);
    expect(helperRequiresExpensiveRunLock('contract-worktree', ['finish'])).toBe(true);
    expect(helperRequiresExpensiveRunLock('contract-worktree', ['start'])).toBe(false);
    expect(helperRequiresExpensiveRunLock('ship-worktrees', ['--pr'])).toBe(true);
    expect(helperRequiresExpensiveRunLock('ship-worktrees', ['--cleanup-merged'])).toBe(false);
    expect(helperRequiresExpensiveRunLock('verify-sprint', ['--help'])).toBe(false);
    expect(helperRequiresExpensiveRunLock('check-task-workflow', [])).toBe(false);
  });

  test('outer timeout terminates descendants that ignore TERM before they can publish a sentinel', async () => {
    if (process.platform === 'win32') return;
    const root = temporaryRoot('repo-harness-outer-group-');
    const sentinel = join(root, 'descendant-survived');
    const result = runProcess(
      'bash',
      ['-c', `trap '' TERM; (trap '' TERM; sleep 1; touch "${sentinel}") & wait`],
      { cwd: root, timeoutMs: 50, processGroup: true },
    );

    expect(result.ok).toBe(false);
    expect(result.timedOut).toBe(true);
    expect(result.error).toContain('process timed out after 50ms');
    await Bun.sleep(1_100);
    expect(existsSync(sentinel)).toBe(false);
  });

  test('leader exit is not completion while its process group still has a descendant', async () => {
    if (process.platform === 'win32') return;
    const root = temporaryRoot('repo-harness-leader-exit-');
    const sentinel = join(root, 'descendant-survived');
    const result = runProcess(
      'bash',
      ['-c', `(trap '' TERM; sleep 1; touch "${sentinel}") & exit 0`],
      { cwd: root, timeoutMs: 50, processGroup: true },
    );

    expect(result.ok).toBe(false);
    expect(result.timedOut).toBe(true);
    await Bun.sleep(1_100);
    expect(existsSync(sentinel)).toBe(false);
  });

  test('repeated supervisor signals cannot interrupt TERM-to-KILL cleanup', async () => {
    if (process.platform === 'win32') return;
    const root = temporaryRoot('repo-harness-double-signal-');
    const started = join(root, 'target-started');
    const sentinel = join(root, 'descendant-survived');
    const receipt = join(root, 'receipt.json');
    const supervisor = Bun.spawn([
      process.execPath,
      join(ROOT, 'src/effects/process-supervisor.ts'),
      '--metadata', receipt,
      '--parent-pid', String(process.pid),
      '--timeout-ms', '5000',
      '--capture-bytes', '1024',
      '--stdio', 'pipe',
      '--', 'bash', '-c', `touch "${started}"; trap '' TERM; sleep 1; touch "${sentinel}"`,
    ], { cwd: root, detached: true, stdout: 'pipe', stderr: 'pipe' });
    await waitForPath(started);
    await Bun.sleep(50);
    process.kill(supervisor.pid, 'SIGTERM');
    await Bun.sleep(50);
    process.kill(supervisor.pid, 'SIGTERM');
    expect(await supervisor.exited).toBe(143);
    expect(JSON.parse(readFileSync(receipt, 'utf-8')).interruptedBy).toBe('SIGTERM');
    await Bun.sleep(1_100);
    expect(existsSync(sentinel)).toBe(false);
  });

  test('supervised spawn failure returns a bounded error instead of hanging on pipe close', () => {
    const startedAt = Date.now();
    const result = runProcess('/repo-harness/definitely-missing-command', [], {
      processGroup: true,
      timeoutMs: 1_000,
    });

    expect(result.ok).toBe(false);
    expect(result.timedOut).toBe(false);
    expect(result.error).not.toBe('');
    expect(Date.now() - startedAt).toBeLessThan(500);
  });

  test('the launcher barrier preserves inherited target stdin and stdout', async () => {
    const root = temporaryRoot('repo-harness-launcher-stdio-');
    const workerPath = join(root, 'stdio-worker.ts');
    writeFileSync(workerPath, [
      `import { runProcess } from ${JSON.stringify(join(ROOT, 'src/effects/process-runner.ts'))};`,
      `const result = runProcess('bash', ['-c', 'IFS= read -r value; printf "target:%s\\n" "$value"'],`,
      `  { cwd: ${JSON.stringify(root)}, timeoutMs: 1_000, processGroup: true, stdio: 'inherit' });`,
      'process.exitCode = result.status;',
      '',
    ].join('\n'));
    const worker = Bun.spawn([process.execPath, workerPath], {
      cwd: root, stdin: 'pipe', stdout: 'pipe', stderr: 'pipe',
    });
    worker.stdin.write('barrier-safe\n');
    worker.stdin.end();

    expect(await worker.exited).toBe(0);
    expect(await new Response(worker.stdout).text()).toContain('target:barrier-safe');
  });

  test('the parent hard timeout returns even when the supervisor event loop is stopped', async () => {
    if (process.platform === 'win32') return;
    const root = temporaryRoot('repo-harness-supervisor-hard-timeout-');
    const supervisorPidPath = join(root, 'supervisor-pid');
    const processGroupPidPath = join(root, 'process-group-pid');
    const resultPath = join(root, 'result.json');
    const workerPath = join(root, 'hard-timeout-worker.ts');
    writeFileSync(workerPath, [
      `import { runProcess } from ${JSON.stringify(join(ROOT, 'src/effects/process-runner.ts'))};`,
      "import { writeFileSync } from 'fs';",
      `const command = ${JSON.stringify(`echo "$PPID" > "${processGroupPidPath}"; supervisor_pid=$(ps -o ppid= -p "$PPID" | tr -d '[:space:]'); echo "$supervisor_pid" > "${supervisorPidPath}"; kill -STOP "$supervisor_pid"; sleep 60`)};`,
      `const result = runProcess('bash', ['-c', command], { cwd: ${JSON.stringify(root)}, timeoutMs: 500, processGroup: true });`,
      `writeFileSync(${JSON.stringify(resultPath)}, JSON.stringify(result));`,
      '',
    ].join('\n'));

    const worker = Bun.spawn([process.execPath, workerPath], {
      cwd: root, detached: true, stdout: 'pipe', stderr: 'pipe',
    });
    await waitForPath(supervisorPidPath);
    await waitForPath(processGroupPidPath);
    const supervisorPid = Number(readFileSync(supervisorPidPath, 'utf-8').trim());
    const processGroupPid = Number(readFileSync(processGroupPidPath, 'utf-8').trim());
    try {
      const exitCode = await Promise.race([
        worker.exited,
        Bun.sleep(4_000).then(() => null),
      ]);
      expect(exitCode).toBe(0);
      const result = JSON.parse(readFileSync(resultPath, 'utf-8')) as {
        ok: boolean;
        timedOut: boolean;
      };
      expect(result.ok).toBe(false);
      expect(result.timedOut).toBe(true);
      expect(JSON.parse(readFileSync(resultPath, 'utf-8')).error).toContain(
        'process supervisor exceeded hard timeout',
      );
      expect(processGroupExists(processGroupPid)).toBe(false);
    } finally {
      killIfPresent(-processGroupPid, 'SIGKILL');
      killIfPresent(supervisorPid, 'SIGKILL');
      killIfPresent(worker.pid, 'SIGKILL');
    }
  }, 6_000);

  test('expensive-lock wait consumes the helper deadline and reports timeout before target start', async () => {
    const root = temporaryRoot('repo-harness-lock-wait-timeout-');
    initializeGitRepository(root);
    const holderStarted = join(root, 'holder-started');
    const targetStarted = join(root, 'target-started');
    const holderWorker = join(root, 'lock-holder.ts');
    const sourceRoot = createVerifierRuntime(root, [`touch "${targetStarted}"`]);
    writeFileSync(holderWorker, [
      `import { acquireExpensiveRunLock } from ${JSON.stringify(join(ROOT, 'src/effects/expensive-run-lock.ts'))};`,
      "import { writeFileSync } from 'fs';",
      `const lock = acquireExpensiveRunLock(${JSON.stringify(root)});`,
      `writeFileSync(${JSON.stringify(holderStarted)}, 'started\\n');`,
      'await Bun.sleep(300);',
      'lock.release();',
      '',
    ].join('\n'));

    const holder = Bun.spawn([process.execPath, holderWorker], {
      cwd: root, stdout: 'pipe', stderr: 'pipe',
    });
    await waitForPath(holderStarted);
    const result = runHelper({
      helper: 'verify-sprint',
      cwd: root,
      env: { REPO_HARNESS_SOURCE_ROOT: sourceRoot },
      stdio: 'pipe',
      timeoutMs: 50,
    });

    expect(await holder.exited).toBe(0);
    expect(result.reason).toBe('timeout');
    expect(existsSync(targetStarted)).toBe(false);
  });

  test('helper timeout releases the shared expensive-run token after group cleanup', async () => {
    if (process.platform === 'win32') return;
    const root = temporaryRoot('repo-harness-helper-lock-');
    initializeGitRepository(root);
    const sentinel = join(root, 'descendant-survived');
    const sourceRoot = createVerifierRuntime(root, [
      "trap '' TERM",
      `(trap '' TERM; sleep 1; touch "${sentinel}") &`,
      'wait',
    ]);

    const result = runHelper({
      helper: 'verify-sprint',
      cwd: root,
      env: { REPO_HARNESS_SOURCE_ROOT: sourceRoot },
      stdio: 'pipe',
      timeoutMs: 50,
    });
    expect(result.reason).toBe('timeout');
    const nextOwner = acquireExpensiveRunLock(root);
    nextOwner.release();
    await Bun.sleep(1_100);
    expect(existsSync(sentinel)).toBe(false);
  });

  test('caller-only SIGTERM makes the supervisor clean its group and release its token', async () => {
    if (process.platform === 'win32') return;
    const root = temporaryRoot('repo-harness-parent-loss-');
    initializeGitRepository(root);
    const started = join(root, 'target-started');
    const sentinel = join(root, 'descendant-survived');
    const sourceRoot = createVerifierRuntime(root, [
      `touch "${started}"`,
      "trap 'exit 0' TERM",
      `(trap '' TERM; sleep 1; touch "${sentinel}") &`,
      'wait',
    ]);
    const worker = join(root, 'helper-entrypoint.ts');
    writeFileSync(worker, [
      `import { runHelper } from ${JSON.stringify(join(ROOT, 'src/cli/runtime/helper-runner.ts'))};`,
      `const result = runHelper({ helper: 'verify-sprint', cwd: ${JSON.stringify(root)},`,
      `  env: { REPO_HARNESS_SOURCE_ROOT: ${JSON.stringify(sourceRoot)} }, stdio: 'pipe', timeoutMs: 10_000 });`,
      'process.exitCode = result.exitCode;',
      '',
    ].join('\n'));
    const entrypoint = Bun.spawn([process.execPath, worker], {
      cwd: root, detached: true, stdout: 'pipe', stderr: 'pipe',
    });
    await waitForPath(started);
    process.kill(entrypoint.pid, 'SIGTERM');
    expect(await entrypoint.exited).not.toBe(0);
    const nextOwner = acquireExpensiveRunLock(root);
    nextOwner.release();
    await Bun.sleep(1_100);
    expect(existsSync(sentinel)).toBe(false);
  }, 10_000);

  test('a caller killed while waiting for the expensive lane can never start its helper', async () => {
    if (process.platform === 'win32') return;
    const root = temporaryRoot('repo-harness-waiting-parent-loss-');
    initializeGitRepository(root);
    const targetStarted = join(root, 'target-started');
    const sourceRoot = createVerifierRuntime(root, [`touch "${targetStarted}"`]);
    const worker = join(root, 'waiting-helper-entrypoint.ts');
    writeFileSync(worker, [
      `import { runHelper } from ${JSON.stringify(join(ROOT, 'src/cli/runtime/helper-runner.ts'))};`,
      `runHelper({ helper: 'verify-sprint', cwd: ${JSON.stringify(root)},`,
      `  env: { REPO_HARNESS_SOURCE_ROOT: ${JSON.stringify(sourceRoot)} }, stdio: 'pipe', timeoutMs: 10_000 });`,
      '',
    ].join('\n'));
    const holder = acquireExpensiveRunLock(root);
    const entrypoint = Bun.spawn([process.execPath, worker], {
      cwd: root, detached: true, stdout: 'pipe', stderr: 'pipe',
    });
    await waitForChildProcess(entrypoint.pid);
    process.kill(entrypoint.pid, 'SIGTERM');
    expect(await entrypoint.exited).not.toBe(0);
    holder.release();
    const nextOwner = acquireExpensiveRunLock(root);
    nextOwner.release();
    await Bun.sleep(200);
    expect(existsSync(targetStarted)).toBe(false);
  }, 10_000);

  test('linked worktrees serialize through one Git common-directory lock', async () => {
    if (process.platform === 'win32') return;
    const root = temporaryRoot('repo-harness-common-lock-');
    initializeGitRepository(root);
    const linked = `${root}-linked`;
    temporaryRoots.push(linked);
    runGit(root, ['worktree', 'add', '-b', 'linked', linked]);

    const holderEntered = join(root, 'holder-entered');
    const contenderEntered = join(root, 'contender-entered');
    const releaseHolder = join(root, 'release-holder');
    const worker = join(root, 'lock-worker.ts');
    writeFileSync(worker, [
      `import { acquireExpensiveRunLock } from ${JSON.stringify(join(ROOT, 'src/effects/expensive-run-lock.ts'))};`,
      "import { existsSync, writeFileSync } from 'fs';",
      'const [cwd, entered, release] = process.argv.slice(2);',
      'const lock = acquireExpensiveRunLock(cwd);',
      "writeFileSync(entered, 'entered\\n');",
      'while (!existsSync(release)) await Bun.sleep(10);',
      'lock.release();',
      '',
    ].join('\n'));

    const holder = Bun.spawn([process.execPath, worker, root, holderEntered, releaseHolder], {
      cwd: root, stdout: 'pipe', stderr: 'pipe',
    });
    await waitForPath(holderEntered);
    const contenderRelease = join(root, 'release-contender');
    writeFileSync(contenderRelease, 'release\n');
    const contender = Bun.spawn([process.execPath, worker, linked, contenderEntered, contenderRelease], {
      cwd: linked, stdout: 'pipe', stderr: 'pipe',
    });
    await Bun.sleep(150);
    expect(existsSync(contenderEntered)).toBe(false);
    writeFileSync(releaseHolder, 'release\n');
    expect(await holder.exited).toBe(0);
    expect(await contender.exited).toBe(0);
    expect(existsSync(contenderEntered)).toBe(true);
  }, 10_000);

  test('Git common-directory lock rejects a symlink ancestor without touching its target', () => {
    const root = temporaryRoot('repo-harness-lock-symlink-');
    initializeGitRepository(root);
    const victim = temporaryRoot('repo-harness-lock-victim-');
    const commonDir = realpathSync(join(root, '.git'));
    symlinkSync(victim, join(commonDir, 'repo-harness'));

    expect(() => acquireExpensiveRunLock(root)).toThrow('unsafe lock ancestor');
    expect(readdirSync(victim)).toEqual([]);
  });

  test('a lock handle revalidates its ancestor identities before protected work starts', () => {
    const root = temporaryRoot('repo-harness-lock-revalidation-');
    const canonicalRoot = realpathSync(root);
    mkdirSync(join(canonicalRoot, 'lane'));
    const lock = acquireExclusiveDirectoryLock(canonicalRoot, 'lane/owner.lock');
    renameSync(join(canonicalRoot, 'lane'), join(canonicalRoot, 'displaced-lane'));
    mkdirSync(join(canonicalRoot, 'lane'));

    expect(() => lock.assertOwned()).toThrow('unsafe lock ancestor');
    lock.release();
  });

  test('an abnormally abandoned expensive token is never auto-reclaimed', () => {
    const root = temporaryRoot('repo-harness-abandoned-expensive-lock-');
    initializeGitRepository(root);
    const lockPath = join(realpathSync(join(root, '.git')), 'repo-harness', 'expensive-run.lock');
    mkdirSync(lockPath, { recursive: true });
    const createdAt = Date.now() - 60_000;
    const token = `999999-${createdAt}-00000000-0000-4000-8000-000000000000`;
    const ownerPath = join(lockPath, `${token}.json`);
    writeFileSync(ownerPath, `${JSON.stringify({ pid: 999999, created_at: createdAt, token })}\n`);

    expect(() => acquireExpensiveRunLock(root)).toThrow('timed out waiting for exclusive lock');
    expect(existsSync(ownerPath)).toBe(true);
  }, 7_000);

  test('benchmark execution lock spans await and releases on success and failure', async () => {
    const root = temporaryRoot('repo-harness-benchmark-lock-');
    initializeGitRepository(root);
    const contenderAttempting = join(root, 'contender-attempting');
    const contenderEntered = join(root, 'contender-entered');
    const worker = join(root, 'benchmark-lock-contender.ts');
    writeFileSync(worker, [
      `import { acquireExpensiveRunLock } from ${JSON.stringify(join(ROOT, 'src/effects/expensive-run-lock.ts'))};`,
      "import { writeFileSync } from 'fs';",
      `writeFileSync(${JSON.stringify(contenderAttempting)}, 'attempting\\n');`,
      `const lock = acquireExpensiveRunLock(${JSON.stringify(root)});`,
      `writeFileSync(${JSON.stringify(contenderEntered)}, 'entered\\n');`,
      'lock.release();',
      '',
    ].join('\n'));
    let contender: ReturnType<typeof Bun.spawn> | undefined;
    const execution = withHarnessBenchmarkExecutionLock(true, root, async () => {
      contender = Bun.spawn([process.execPath, worker], { cwd: ROOT, stdout: 'pipe', stderr: 'pipe' });
      await waitForPath(contenderAttempting);
      await Bun.sleep(50);
      expect(existsSync(contenderEntered)).toBe(false);
      return 'done';
    });
    expect(await execution).toBe('done');
    expect(await contender!.exited).toBe(0);
    expect(existsSync(contenderEntered)).toBe(true);

    await expect(withHarnessBenchmarkExecutionLock(true, root, async () => {
      throw new Error('fixture failure');
    })).rejects.toThrow('fixture failure');
    const nextOwner = acquireExpensiveRunLock(root);
    nextOwner.release();
  }, 10_000);

  test('benchmark async signal cleanup releases its token without running the matrix', async () => {
    if (process.platform === 'win32') return;
    const root = temporaryRoot('repo-harness-benchmark-signal-');
    initializeGitRepository(root);
    const started = join(root, 'benchmark-started');
    const worker = join(root, 'benchmark-signal-worker.ts');
    writeFileSync(worker, [
      `import { installProducerSignalCleanup, withHarnessBenchmarkExecutionLock } from ${JSON.stringify(join(ROOT, 'scripts/run-harness-profile-benchmark.ts'))};`,
      "import { writeFileSync } from 'fs';",
      'installProducerSignalCleanup();',
      `await withHarnessBenchmarkExecutionLock(true, ${JSON.stringify(root)}, async () => {`,
      `  writeFileSync(${JSON.stringify(started)}, 'started\\n');`,
      '  await new Promise(() => {});',
      '});',
      '',
    ].join('\n'));
    const producer = Bun.spawn([process.execPath, worker], {
      cwd: ROOT, detached: true, stdout: 'pipe', stderr: 'pipe',
    });
    await waitForPath(started);
    process.kill(producer.pid, 'SIGTERM');
    expect(await producer.exited).toBe(143);
    const nextOwner = acquireExpensiveRunLock(root);
    nextOwner.release();
  }, 10_000);

  test('benchmark signal cleanup retains its token until a leaderless provider group is drained', async () => {
    if (process.platform === 'win32') return;
    const root = temporaryRoot('repo-harness-benchmark-provider-group-');
    initializeGitRepository(root);
    const providerStarted = join(root, 'provider-started');
    const descendantSentinel = join(root, 'descendant-survived');
    const contenderAttempting = join(root, 'contender-attempting');
    const contenderEntered = join(root, 'contender-entered');
    const producerWorker = join(root, 'benchmark-provider-group-worker.ts');
    const contenderWorker = join(root, 'benchmark-provider-group-contender.ts');
    const providerCommand = [
      "trap 'exit 0' TERM",
      `(trap '' TERM; sleep 1; touch ${JSON.stringify(descendantSentinel)}) >/dev/null 2>&1 &`,
      `touch ${JSON.stringify(providerStarted)}`,
      'wait',
    ].join('\n');
    writeFileSync(producerWorker, [
      `import { installProducerSignalCleanup, runBoundedProviderProcess, withHarnessBenchmarkExecutionLock } from ${JSON.stringify(join(ROOT, 'scripts/run-harness-profile-benchmark.ts'))};`,
      'installProducerSignalCleanup();',
      `await withHarnessBenchmarkExecutionLock(true, ${JSON.stringify(root)}, async () => {`,
      `  await runBoundedProviderProcess(['bash', '-c', ${JSON.stringify(providerCommand)}], ${JSON.stringify(root)}, process.env, Date.now() + 5_000);`,
      '});',
      '',
    ].join('\n'));
    writeFileSync(contenderWorker, [
      `import { acquireExpensiveRunLock } from ${JSON.stringify(join(ROOT, 'src/effects/expensive-run-lock.ts'))};`,
      "import { writeFileSync } from 'fs';",
      `writeFileSync(${JSON.stringify(contenderAttempting)}, 'attempting\\n');`,
      `const lock = acquireExpensiveRunLock(${JSON.stringify(root)});`,
      `writeFileSync(${JSON.stringify(contenderEntered)}, 'entered\\n');`,
      'lock.release();',
      '',
    ].join('\n'));

    const producer = Bun.spawn([process.execPath, producerWorker], {
      cwd: ROOT, detached: true, stdout: 'pipe', stderr: 'pipe',
    });
    await waitForPath(providerStarted);
    process.kill(producer.pid, 'SIGTERM');
    const contender = Bun.spawn([process.execPath, contenderWorker], {
      cwd: ROOT, stdout: 'pipe', stderr: 'pipe',
    });
    await waitForPath(contenderAttempting);
    await Bun.sleep(100);
    expect(existsSync(contenderEntered)).toBe(false);

    expect(await producer.exited).toBe(143);
    expect(await contender.exited).toBe(0);
    expect(existsSync(contenderEntered)).toBe(true);
    await Bun.sleep(600);
    expect(existsSync(descendantSentinel)).toBe(false);
  }, 10_000);

  test('ship delegates sprint verification exclusively to contract-worktree finish', () => {
    const ship = readFileSync(join(ROOT, 'scripts/ship-worktrees.sh'), 'utf-8');
    const finish = readFileSync(join(ROOT, 'scripts/contract-worktree.sh'), 'utf-8');

    expect(ship).not.toContain('run_cmd bash "$helper_dir/verify-sprint.sh"');
    expect(finish.match(/bash "\$helper_dir\/verify-sprint\.sh"/g) ?? []).toHaveLength(1);
  });

  test('source and packaged ship helpers stay byte-identical', () => {
    const source = readFileSync(join(ROOT, 'scripts/ship-worktrees.sh'));
    const packaged = readFileSync(join(ROOT, 'assets/templates/helpers/ship-worktrees.sh'));
    expect(packaged.equals(source)).toBe(true);
  });

  test('ship forwards empty and non-empty child arguments under the system Bash', () => {
    const ship = readFileSync(join(ROOT, 'scripts/ship-worktrees.sh'), 'utf-8');
    expect(ship.match(/\$\{child_args\[@\]\+"\$\{child_args\[@\]\}"\}/g) ?? []).toHaveLength(2);

    const emptyProbe = spawnSync('/bin/bash', [
      '-uc',
      'child_args=(); set -- ${child_args[@]+"${child_args[@]}"}; test "$#" -eq 0',
    ], { encoding: 'utf-8' });
    expect(emptyProbe.status).toBe(0);

    const nonEmptyProbe = spawnSync('/bin/bash', [
      '-uc',
      'child_args=(--ready "two words"); set -- ${child_args[@]+"${child_args[@]}"}; test "$#" -eq 2 && test "$1" = --ready && test "$2" = "two words"',
    ], { encoding: 'utf-8' });
    expect(nonEmptyProbe.status).toBe(0);
  });

  test('the fixed source retains the ordinary default without making it closeout authority', () => {
    const processRunner = readFileSync(join(ROOT, 'src/effects/process-runner.ts'), 'utf-8');
    const helperRunner = readFileSync(join(ROOT, 'src/cli/runtime/helper-runner.ts'), 'utf-8');
    const ship = readFileSync(join(ROOT, 'scripts/ship-worktrees.sh'), 'utf-8');
    const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf-8' });

    expect(result.status).toBe(0);
    expect(processRunner).toContain('DEFAULT_PROCESS_TIMEOUT_MS = 120_000');
    expect(helperRunner).toContain('helperTimeoutMs');
    expect(ship).not.toContain('run_cmd bash "$helper_dir/verify-sprint.sh"');
  });
});
