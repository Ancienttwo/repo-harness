// Reads the hook usage logs of one repository for the setup snapshot. It runs
// in the setup collector's child process, never on a request path. The
// telemetry log is a segmented log and is read through its own reader; the
// failure log is a plain append file, so only its tail is read.

import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs';
import { join } from 'node:path';

import { summarizeHookUsage } from '../../core/setup/hook-usage';
import type { SetupRawRoute } from '../../core/setup/projection';
import type { SetupHookUsage } from '../../core/setup/types';
import { readSegmentedLog } from '../segmented-log';
import { FAILURE_LOG_FILE } from '../state/resolve-effective-state';

/** The failure log is never rotated; the newest denials sit in its last bytes. */
export const FAILURE_LOG_TAIL_BYTES = 256 * 1024;

/** Complete lines in the last `limit` bytes of a regular file; empty when it does not exist. */
export function readTailLines(path: string, limit: number = FAILURE_LOG_TAIL_BYTES): string[] {
  let fd: number;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile()) return [];
    const start = Math.max(0, stat.size - limit);
    const buffer = Buffer.alloc(stat.size - start);
    readSync(fd, buffer, 0, buffer.length, start);
    const lines = buffer.toString('utf8').split('\n');
    // A tail that starts inside a line drops that partial line.
    if (start > 0) lines.shift();
    return lines.filter(line => line.trim() !== '');
  } finally {
    closeSync(fd);
  }
}

/** The hook layer owns the telemetry log: `HOOK_EVENT_TELEMETRY_PATH` (relative to the repository root) and `HOOK_EVENT_TELEMETRY_PROTOCOL`. */
export interface HookTelemetryLog {
  readonly path: string;
  readonly protocol: string;
}

export function readHookUsage(repoRoot: string, telemetry: HookTelemetryLog, routes: readonly SetupRawRoute[], nowMs: number): SetupHookUsage {
  return summarizeHookUsage({
    telemetry_lines: readSegmentedLog(join(repoRoot, telemetry.path), repoRoot) ?? [],
    telemetry_protocol: telemetry.protocol,
    failure_lines: readTailLines(join(repoRoot, FAILURE_LOG_FILE)),
    routes,
    now_ms: nowMs,
  });
}
