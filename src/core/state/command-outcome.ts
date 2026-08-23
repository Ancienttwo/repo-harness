/**
 * Process-neutral result emitted by command projections.
 *
 * CLI adapters own writing the streams and assigning the process exit code;
 * effects only construct this value so they can be shared by non-CLI callers.
 */
export interface CommandOutcome {
  readonly exitCode: 0 | 1 | 2;
  readonly stdout: string;
  readonly stderr: string;
}
