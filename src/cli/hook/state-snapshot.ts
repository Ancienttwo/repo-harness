import { buildStateSnapshot } from '../../effects/state/resolve-effective-state';

export type { StateSnapshot } from '../../core/state/types';

export interface StateSnapshotCliResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export function runStateSnapshotCli(
  argv = process.argv.slice(2),
  cwd = process.cwd(),
): StateSnapshotCliResult {
  if (argv.length !== 1 || argv[0] !== '--json') {
    return {
      exitCode: 2,
      stdout: '',
      stderr: 'repo-harness-hook state-snapshot: usage: repo-harness-hook state-snapshot --json\n',
    };
  }
  return {
    exitCode: 0,
    stdout: `${JSON.stringify(buildStateSnapshot(cwd))}\n`,
    stderr: '',
  };
}
