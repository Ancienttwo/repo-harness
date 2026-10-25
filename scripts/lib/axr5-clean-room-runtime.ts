import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

export function cleanRoomEnvironment(workspace: string, inherited: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env = { ...inherited };
  delete env.ARCHCONTEXT_LOCAL_STORE_PATH;
  return {
    ...env,
    HOME: join(workspace, 'host-home'),
    ARCHCONTEXT_STATE_DIR: join(workspace, 'runtime-state'),
    NPM_CONFIG_REGISTRY: 'http://127.0.0.1:9',
    BUN_CONFIG_REGISTRY: 'http://127.0.0.1:9',
  };
}

type Result = { status: number | null; stdout: string | Buffer | null; error?: Error };
export type DaemonCommand = (binary: string, args: string[], options: {
  cwd: string; env: NodeJS.ProcessEnv; encoding: 'utf8'; timeout: number; maxBuffer: number;
}) => Result;

/** Arm before any operation that may start a daemon, including snapshot. */
export class CleanRoomDaemon {
  private target?: { binary: string; root: string; env: NodeJS.ProcessEnv };
  constructor(private readonly command: DaemonCommand = spawnSync,
    private readonly pause: () => void = () => { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25); }) {}

  arm(binary: string, root: string, env: NodeJS.ProcessEnv): void {
    if (this.target) throw new Error('clean-room daemon is already armed');
    this.target = { binary, root, env: { ...env } };
  }

  stop(): void {
    if (!this.target) return;
    const { binary, root, env } = this.target;
    const invoke = (operation: string): Record<string, unknown> => {
      const result = this.command(binary, ['daemon', operation], {
        cwd: root, env, encoding: 'utf8', timeout: 5_000, maxBuffer: 1024 * 1024,
      });
      // Do not print control-file tokens or arbitrary subprocess output.
      if (result.error || result.status !== 0) throw new Error(`clean-room daemon ${operation} failed; preserve workspace`);
      let envelope: any;
      try { envelope = JSON.parse(String(result.stdout)); } catch { throw new Error(`clean-room daemon ${operation} returned invalid JSON; preserve workspace`); }
      if (envelope?.schemaVersion !== 'archcontext.envelope/v1' || envelope.ok !== true || !envelope.data || typeof envelope.data !== 'object') {
        throw new Error(`clean-room daemon ${operation} did not confirm success; preserve workspace`);
      }
      return envelope.data;
    };
    invoke('stop');
    for (let attempt = 0; attempt < 10; attempt++) {
      const status = invoke('status');
      if (status.running === false && status.lockOwnerPid === undefined && status.versionUnsupported === undefined) {
        this.target = undefined;
        return;
      }
      if (attempt < 9) this.pause();
    }
    throw new Error('clean-room daemon stop was not confirmed; preserve workspace');
  }
}

export function finishCleanRoom(input: {
  daemon: Pick<CleanRoomDaemon, 'stop'>;
  cleanup: () => void;
  failure?: { error: unknown };
}): void {
  try { input.daemon.stop(); } catch (error) {
    if (input.failure) throw new AggregateError([input.failure.error, error], 'clean-room operation and daemon cleanup failed; workspace preserved');
    throw error;
  }
  input.cleanup();
}
