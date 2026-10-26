/** Node-safe process identity and durable session artifact I/O.
 * Keep profile and architecture observation in the task admission owner. */
import { constants, closeSync, existsSync, fsyncSync, linkSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';

export function processIdentity(pid: number): string {
  if (!Number.isSafeInteger(pid) || pid < 1) throw new Error('task_agent_invalid_process');
  const identity = execFileSync('ps', ['-p', String(pid), '-o', 'pid=,pgid=,lstart=,comm='], { encoding: 'utf8' }).trim();
  if (!identity) throw new Error('task_agent_process_identity_lost');
  return identity;
}
export function readSessionArtifact<T>(path: string): T {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try { return JSON.parse(readFileSync(fd, 'utf8')) as T; } finally { closeSync(fd); }
}
export function writeSessionArtifact(path: string, value: unknown, immutable = true): void {
  writeSessionBytes(path, `${JSON.stringify(value, null, 2)}\n`, immutable);
}
export function writeSessionBytes(path: string, bytes: string, immutable = true): void {
  const temporary = `${path}.${randomUUID()}.tmp`;
  const fd = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
  try { if (immutable) linkSync(temporary, path); else renameSync(temporary, path); }
  finally { if (existsSync(temporary)) unlinkSync(temporary); }
  const directory = openSync(dirname(path), constants.O_RDONLY);
  try { fsyncSync(directory); } finally { closeSync(directory); }
}
