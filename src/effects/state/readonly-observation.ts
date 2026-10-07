import { AsyncLocalStorage } from 'node:async_hooks';
import * as fs from 'node:fs';
import * as child from 'node:child_process';

/** An opt-in IO capability. Ordinary owners retain their original defaults. */
export interface ReadonlyObservationIO {
  readFile(path: string): Buffer;
  readDirectory(path: string): string[];
  validatePath(path: string): void;
  exec(file: string, args: string[], options: child.ExecFileSyncOptions): Buffer;
}
export class ObservationViolation extends Error {}
interface Scope { io: ReadonlyObservationIO; failure?: ObservationViolation }
const scopes = new AsyncLocalStorage<Scope>();
export function currentReadonlyObservation(): ReadonlyObservationIO | undefined { return scopes.getStore()?.io; }
function checked<T>(call: () => T): T {
  try { return call(); }
  catch (error) {
    if (error instanceof ObservationViolation) { const scope = scopes.getStore(); if (scope) scope.failure ??= error; }
    throw error;
  }
}
export function withReadonlyObservation<T>(io: ReadonlyObservationIO, call: () => T): T {
  const scope: Scope = { io };
  return scopes.run(scope, () => {
    const result = call();
    if (scope.failure) throw scope.failure;
    return result;
  });
}
export function assertObservationPath(path: string): void {
  const io = currentReadonlyObservation(); if (io) checked(() => io.validatePath(path));
}
export function rejectObservation(reason: string): never { return checked(() => { throw new ObservationViolation(reason); }); }
function encoding(options: unknown): BufferEncoding | undefined {
  return typeof options === 'string' ? options as BufferEncoding
    : options && typeof options === 'object' ? (options as { encoding?: BufferEncoding }).encoding ?? undefined : undefined;
}
export const observationReadFileSync: typeof fs.readFileSync = ((path: fs.PathOrFileDescriptor, options?: unknown) => {
  const io = currentReadonlyObservation();
  if (!io) return fs.readFileSync(path, options as BufferEncoding);
  if (typeof path !== 'string') return rejectObservation('Observation requires a named source file');
  const bytes = checked(() => io.readFile(path)); const enc = encoding(options);
  return enc ? bytes.toString(enc) : bytes;
}) as typeof fs.readFileSync;
export const observationReaddirSync: typeof fs.readdirSync = ((path: fs.PathLike, options?: unknown) => {
  const io = currentReadonlyObservation();
  if (!io) return fs.readdirSync(path, options as BufferEncoding);
  if (typeof path !== 'string' || options) return rejectObservation('Unsupported observation directory options');
  return checked(() => io.readDirectory(path));
}) as typeof fs.readdirSync;
export const observationExecFileSync: typeof child.execFileSync = ((file: string, args: string[], options: child.ExecFileSyncOptions = {}) => {
  const io = currentReadonlyObservation(); if (!io) return child.execFileSync(file, args, options);
  const bytes = checked(() => io.exec(file, args, options)); const enc = encoding(options);
  return enc && String(enc) !== 'buffer' ? bytes.toString(enc) : bytes;
}) as typeof child.execFileSync;
export const observationSpawnSync: typeof child.spawnSync = ((file: string, args: string[], options: child.SpawnSyncOptions = {}) => {
  if (!currentReadonlyObservation()) return child.spawnSync(file, args, options);
  try {
    const stdout = observationExecFileSync(file, args, options as child.ExecFileSyncOptions);
    return { pid: 0, status: 0, signal: null, output: [null, stdout, ''], stdout, stderr: '' };
  } catch (error) {
    if (error instanceof ObservationViolation) throw error;
    const failed = error as { status?: number; stdout?: Buffer; stderr?: Buffer };
    const enc = encoding(options);
    const decode = (value?: Buffer) => enc ? (value ?? Buffer.alloc(0)).toString(enc) : value ?? Buffer.alloc(0);
    return { pid: 0, status: failed.status ?? 1, signal: null, output: [], stdout: decode(failed.stdout), stderr: decode(failed.stderr), error };
  }
}) as typeof child.spawnSync;
