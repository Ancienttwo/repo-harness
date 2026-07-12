import { describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  buildMcpProcessEnvironment,
  McpProcessError,
  McpProcessSessionManager,
  type ProcessCompletionEvent,
  type ProcessPty,
  type ProcessSnapshot,
} from '../../src/cli/mcp/process-sessions';

function withTempRoot<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = mkdtempSync(join(tmpdir(), 'repo-harness-mcp-process-'));
  mkdirSync(join(root, 'nested'));
  return fn(root).finally(() => rmSync(root, { recursive: true, force: true }));
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

async function expectProcessError(action: () => unknown | Promise<unknown>, code: string): Promise<void> {
  try {
    await action();
    throw new Error(`expected McpProcessError ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(McpProcessError);
    expect((error as McpProcessError).code).toBe(code);
  }
}

async function pollUntilComplete(
  manager: McpProcessSessionManager,
  ownership: { ownerId: string; workspaceId?: string; sessionId: number },
  attempts = 20,
): Promise<ProcessSnapshot> {
  let snapshot: ProcessSnapshot | undefined;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    snapshot = await manager.write({ ...ownership, yieldTimeMs: 100 });
    if (!snapshot.running) return snapshot;
  }
  throw new Error(`process did not finish after ${attempts} polls: ${snapshot?.sessionId ?? 'unknown'}`);
}

describe('McpProcessSessionManager', () => {
  test('fails fast instead of hanging when node-pty runs under Bun', async () => {
    if (!process.versions.bun) return;
    await withTempRoot(async (root) => {
      const manager = new McpProcessSessionManager();
      try {
        await expectProcessError(
          () => manager.start({
            ownerId: 'owner-a',
            workspaceId: 'workspace-a',
            command: 'printf pty-ok',
            cwd: root,
            workspaceRoot: root,
            tty: true,
          }),
          'PTY_UNAVAILABLE',
        );
      } finally {
        await manager.shutdown();
      }
    });
  });

  test('runs a bounded pipe command and emits secret-free completion metadata', async () => {
    await withTempRoot(async (root) => {
      writeFileSync(join(root, '.bash_profile'), 'export LOGIN_PROFILE_SECRET=must-not-source\n');
      const completed: ProcessCompletionEvent[] = [];
      const manager = new McpProcessSessionManager({
        baseEnv: {
          PATH: process.env.PATH,
          HOME: root,
          OPENAI_API_KEY: 'must-not-leak',
          MCP_TOKEN: 'must-not-leak',
        },
        configuredEnv: { SAFE_VALUE: 'visible' },
        onComplete: async (event) => {
          completed.push(event);
        },
      });
      try {
        const command = `printf '%s|%s|%s|%s' "\${SAFE_VALUE-}" "\${OPENAI_API_KEY-}" "\${MCP_TOKEN-}" "\${LOGIN_PROFILE_SECRET-}"`;
        const result = await manager.start({
          ownerId: 'owner-a',
          workspaceId: 'workspace-a',
          command,
          cwd: root,
          workspaceRoot: root,
          yieldTimeMs: 2_000,
        });

        expect(result.running).toBe(false);
        expect(result.exitCode).toBe(0);
        expect(result.output).toBe('visible|||');
        expect(result.audit.commandHash).toMatch(/^[a-f0-9]{64}$/);
        await Promise.resolve();
        expect(completed).toHaveLength(1);
        expect(completed[0]?.cwd).toBe(realpathSync(root));
        expect(completed[0]?.workspaceRoot).toBe(realpathSync(root));
        const auditJson = JSON.stringify(completed[0]);
        expect(auditJson).not.toContain(command);
        expect(auditJson).not.toContain('visible||');
        expect(auditJson).not.toContain('must-not-leak');
      } finally {
        await manager.shutdown();
      }
    });
  });

  test('supports background pipe input and output polling', async () => {
    await withTempRoot(async (root) => {
      const manager = new McpProcessSessionManager({ terminationGraceMs: 20 });
      try {
        const started = await manager.start({
          ownerId: 'owner-a',
          workspaceId: 'workspace-a',
          command: 'IFS= read -r line; printf "got:%s\\n" "$line"',
          cwd: root,
          workspaceRoot: root,
          yieldTimeMs: 0,
        });
        expect(started.running).toBe(true);

        let result = await manager.write({
          ownerId: 'owner-a',
          sessionId: started.sessionId,
          chars: 'hello\n',
          yieldTimeMs: 1_000,
        });
        if (result.running) {
          const final = await pollUntilComplete(manager, {
            ownerId: 'owner-a',
            workspaceId: 'workspace-a',
            sessionId: started.sessionId,
          });
          result = { ...final, output: `${result.output}${final.output}` };
        }
        expect(result.running).toBe(false);
        expect(result.output).toContain('got:hello');
      } finally {
        await manager.shutdown();
      }
    });
  });

  test('rejects cross-owner and cross-workspace access without revealing the session', async () => {
    await withTempRoot(async (root) => {
      const manager = new McpProcessSessionManager({ terminationGraceMs: 20 });
      try {
        const started = await manager.start({
          ownerId: 'owner-a',
          workspaceId: 'workspace-a',
          command: 'sleep 10',
          cwd: root,
          workspaceRoot: root,
          yieldTimeMs: 0,
        });

        await expectProcessError(
          () => manager.write({ ownerId: 'owner-b', workspaceId: 'workspace-a', sessionId: started.sessionId }),
          'PROCESS_ACCESS_DENIED',
        );
        await expectProcessError(
          () => manager.write({ ownerId: 'owner-a', workspaceId: 'workspace-b', sessionId: started.sessionId }),
          'PROCESS_ACCESS_DENIED',
        );

        manager.terminateSession({
          ownerId: 'owner-a',
          workspaceId: 'workspace-a',
          sessionId: started.sessionId,
        });
        const stopped = await pollUntilComplete(manager, {
          ownerId: 'owner-a',
          workspaceId: 'workspace-a',
          sessionId: started.sessionId,
        });
        expect(stopped.reason).toBe('terminated');
      } finally {
        await manager.shutdown();
      }
    });
  });

  test('enforces four concurrent processes and cleans up the process tree', async () => {
    await withTempRoot(async (root) => {
      const completed: ProcessCompletionEvent[] = [];
      const marker = join(root, 'escaped-child.txt');
      const manager = new McpProcessSessionManager({
        terminationGraceMs: 20,
        onComplete: (event) => {
          completed.push(event);
        },
      });
      try {
        const sessions: ProcessSnapshot[] = [];
        sessions.push(await manager.start({
          ownerId: 'owner-a',
          workspaceId: 'workspace-a',
          command: `(sleep 0.4; printf leaked > ${shellQuote(marker)}) & wait`,
          cwd: root,
          workspaceRoot: root,
          yieldTimeMs: 0,
        }));
        for (let index = 1; index < 4; index += 1) {
          sessions.push(await manager.start({
            ownerId: 'owner-a',
            workspaceId: 'workspace-a',
            command: 'sleep 10',
            cwd: root,
            workspaceRoot: root,
            yieldTimeMs: 0,
          }));
        }
        expect(manager.runningCount).toBe(4);
        await expectProcessError(
          () => manager.start({
            ownerId: 'owner-a',
            workspaceId: 'workspace-a',
            command: 'sleep 10',
            cwd: root,
            workspaceRoot: root,
            yieldTimeMs: 0,
          }),
          'PROCESS_LIMIT_REACHED',
        );

        expect(manager.terminateOwner('owner-a')).toBe(4);
        await Promise.all(sessions.map((session) => pollUntilComplete(manager, {
          ownerId: 'owner-a',
          workspaceId: 'workspace-a',
          sessionId: session.sessionId,
        })));
        await Bun.sleep(500);
        expect(existsSync(marker)).toBe(false);
        expect(completed).toHaveLength(4);
        expect(completed.every((event) => event.reason === 'owner_cleanup')).toBe(true);
      } finally {
        await manager.shutdown();
      }
    });
  });

  test('times out commands, bounds the ring buffer, and expires completed sessions', async () => {
    await withTempRoot(async (root) => {
      const timeoutManager = new McpProcessSessionManager({
        maxRuntimeMs: 50,
        completedRetentionMs: 30,
        terminationGraceMs: 20,
      });
      try {
        const timedOut = await timeoutManager.start({
          ownerId: 'owner-a',
          workspaceId: 'workspace-a',
          command: 'sleep 10',
          cwd: root,
          workspaceRoot: root,
          yieldTimeMs: 1_000,
        });
        expect(timedOut.running).toBe(false);
        expect(timedOut.reason).toBe('timeout');
        await Bun.sleep(60);
        timeoutManager.reapExpired();
        expect(timeoutManager.retainedCount).toBe(0);
      } finally {
        await timeoutManager.shutdown();
      }

      const outputManager = new McpProcessSessionManager({ ringBytes: 64 });
      try {
        const result = await outputManager.start({
          ownerId: 'owner-a',
          workspaceId: 'workspace-a',
          command: "printf '%0200d' 0",
          cwd: root,
          workspaceRoot: root,
          yieldTimeMs: 2_000,
          maxOutputTokens: 16,
        });
        expect(Buffer.byteLength(result.output)).toBe(64);
        expect(result.outputTruncated).toBe(true);
        expect(result.droppedOutputBytes).toBe(136);
      } finally {
        await outputManager.shutdown();
      }
    });
  });

  test('supports PTY input, resize, and Ctrl-C through an injected PTY factory', async () => {
    await withTempRoot(async (root) => {
      let dataListener: ((data: string) => void) | undefined;
      let exitListener: ((event: { exitCode: number; signal?: number }) => void) | undefined;
      const writes: string[] = [];
      const sizes: Array<[number, number]> = [];
      const fakePty: ProcessPty = {
        pid: 0,
        write(data) {
          writes.push(data);
          if (data === '\u0003') exitListener?.({ exitCode: 130, signal: 2 });
          else dataListener?.(`echo:${data}`);
        },
        resize(columns, rows) {
          sizes.push([columns, rows]);
        },
        kill() {
          exitListener?.({ exitCode: 143, signal: 15 });
        },
        onData(listener) {
          dataListener = listener;
        },
        onExit(listener) {
          exitListener = listener;
        },
      };
      const manager = new McpProcessSessionManager({
        terminationGraceMs: 20,
        ptyFactory: async () => fakePty,
      });
      try {
        const started = await manager.start({
          ownerId: 'owner-a',
          workspaceId: 'workspace-a',
          command: 'interactive-command',
          cwd: root,
          workspaceRoot: root,
          tty: true,
          yieldTimeMs: 0,
        });
        const echoed = await manager.write({
          ownerId: 'owner-a',
          workspaceId: 'workspace-a',
          sessionId: started.sessionId,
          chars: 'hello',
          columns: 120,
          rows: 40,
          yieldTimeMs: 0,
        });
        expect(echoed.output).toBe('echo:hello');
        expect(sizes).toEqual([[120, 40]]);

        const interrupted = await manager.write({
          ownerId: 'owner-a',
          workspaceId: 'workspace-a',
          sessionId: started.sessionId,
          chars: '\u0003',
          yieldTimeMs: 0,
        });
        expect(writes).toEqual(['hello', '\u0003']);
        expect(interrupted.running).toBe(false);
        expect(interrupted.signal).toBe('2');
      } finally {
        await manager.shutdown();
      }
    });
  });

  test('fails closed when PTY is unavailable and rejects unsafe environment keys and cwd escapes', async () => {
    await withTempRoot(async (root) => {
      const outside = mkdtempSync(join(tmpdir(), 'repo-harness-mcp-process-outside-'));
      try {
        expect(() => buildMcpProcessEnvironment({ configuredEnv: { CODEX_TOKEN: 'secret' } })).toThrow();
        const manager = new McpProcessSessionManager({
          ptyFactory: async () => {
            throw new McpProcessError('PTY_UNAVAILABLE', 'test PTY missing');
          },
        });
        try {
          await expectProcessError(
            () => manager.start({
              ownerId: 'owner-a',
              workspaceId: 'workspace-a',
              command: 'true',
              cwd: root,
              workspaceRoot: root,
              tty: true,
            }),
            'PTY_UNAVAILABLE',
          );
          await expectProcessError(
            () => manager.start({
              ownerId: 'owner-a',
              workspaceId: 'workspace-a',
              command: 'true',
              cwd: outside,
              workspaceRoot: root,
            }),
            'WORKING_DIRECTORY_DENIED',
          );
          expect(manager.runningCount).toBe(0);
        } finally {
          await manager.shutdown();
        }
      } finally {
        rmSync(outside, { recursive: true, force: true });
      }
    });
  });

  test('catches async completion callback failures without creating unhandled rejections', async () => {
    await withTempRoot(async (root) => {
      const failures: unknown[] = [];
      const manager = new McpProcessSessionManager({
        onComplete: async () => {
          throw new Error('refresh failed');
        },
        onCompletionError: (error) => failures.push(error),
      });
      try {
        await manager.start({
          ownerId: 'owner-a',
          workspaceId: 'workspace-a',
          command: 'true',
          cwd: root,
          workspaceRoot: root,
          yieldTimeMs: 2_000,
        });
        await Bun.sleep(0);
        expect(failures).toHaveLength(1);
        expect(String(failures[0])).toContain('refresh failed');
      } finally {
        await manager.shutdown();
      }
    });
  });

  test('shutdown terminates running sessions and permanently closes the manager', async () => {
    await withTempRoot(async (root) => {
      const completed: ProcessCompletionEvent[] = [];
      const manager = new McpProcessSessionManager({
        terminationGraceMs: 20,
        onComplete: (event) => {
          completed.push(event);
        },
      });
      const started = await manager.start({
        ownerId: 'owner-a',
        workspaceId: 'workspace-a',
        command: 'sleep 10',
        cwd: root,
        workspaceRoot: root,
        yieldTimeMs: 0,
      });
      expect(started.running).toBe(true);

      await manager.shutdown();
      expect(manager.runningCount).toBe(0);
      expect(manager.retainedCount).toBe(0);
      expect(completed).toHaveLength(1);
      expect(completed[0]?.reason).toBe('shutdown');
      await expectProcessError(
        () => manager.start({
          ownerId: 'owner-a',
          workspaceId: 'workspace-a',
          command: 'true',
          cwd: root,
          workspaceRoot: root,
        }),
        'PROCESS_MANAGER_CLOSED',
      );
    });
  });
});
