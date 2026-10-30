import { dlopen, FFIType, toArrayBuffer, type Pointer } from 'bun:ffi';
import { closeSync, constants, fstatSync, openSync, type Stats } from 'node:fs';

export class UnsupportedCleanupPath extends Error {}
export class CleanupDirectoryTooLarge extends Error {}

/** POSIX descriptor-relative reads. No child lookup can follow a substituted ancestor. */
interface Native {
  openat(fd: number, path: Buffer, flags: number): number;
  readlinkat(fd: number, path: Buffer, output: Buffer, size: number): number;
  dup(fd: number): number;
  fdopendir(fd: number): Pointer | null;
  readdir(dir: Pointer): Pointer | null;
  rewinddir(dir: Pointer): void;
  closedir(dir: Pointer): number;
  errno(): Pointer;
}
let library: Native | undefined;
function native(): Native {
  if (library) return library;
  if (!['linux', 'darwin'].includes(process.platform) || !['x64', 'arm64'].includes(process.arch)) throw new Error('cleanup file access unsupported');
  const readdir = process.platform === 'darwin' ? 'readdir$INODE64' : 'readdir';
  const errno = process.platform === 'darwin' ? '__error' : '__errno_location';
  const loaded = dlopen(process.platform === 'darwin' ? '/usr/lib/libSystem.B.dylib' : 'libc.so.6', {
    openat: { args: ['i32', 'ptr', 'i32'], returns: 'i32' },
    readlinkat: { args: ['i32', 'ptr', 'ptr', 'u64'], returns: FFIType.i64_fast },
    dup: { args: ['i32'], returns: 'i32' }, fdopendir: { args: ['i32'], returns: 'ptr' },
    [readdir]: { args: ['ptr'], returns: 'ptr' }, rewinddir: { args: ['ptr'], returns: 'void' },
    closedir: { args: ['ptr'], returns: 'i32' }, [errno]: { args: [], returns: 'ptr' },
  });
  const symbols = loaded.symbols as unknown as Record<string, (...args: any[]) => any>;
  library = { ...symbols, readdir: symbols[readdir]!, errno: symbols[errno]! } as unknown as Native;
  return library;
}
const cName = (name: string) => {
  if (name.includes('\0') || name.includes('/') || name === '..' || name === '') throw new Error('cleanup child name invalid');
  return Buffer.from(name + '\0');
};
const closeOnExec = process.platform === 'darwin' ? 0x01000000 : 0x00080000;
const flags = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK | closeOnExec;

/** Opens each absolute-path segment without following links, including ancestors of the target. */
export function openCleanupDirectory(path: string): number {
  if (!path.startsWith('/') || path.includes('\0')) throw new Error('cleanup root invalid');
  const api = native();
  let fd = openSync('/', flags | constants.O_DIRECTORY);
  try {
    for (const part of path.split('/').filter(Boolean)) {
      const next = api.openat(fd, cName(part), flags | constants.O_DIRECTORY);
      if (next < 0) throw new Error('cleanup root open failed');
      closeSync(fd); fd = next;
    }
    return fd;
  } catch (error) { closeSync(fd); throw error; }
}
export function cleanupDirectoryNames(fd: number, limit = 20_000): string[] {
  const api = native(), duplicate = api.dup(fd);
  if (duplicate < 0) throw new Error('cleanup directory dup failed');
  const dir = api.fdopendir(duplicate);
  if (!dir) { closeSync(duplicate); throw new Error('cleanup directory open failed'); }
  const names: string[] = [], seen = new Set<string>();
  try {
    api.rewinddir(dir);
    const errno = new DataView(toArrayBuffer(api.errno(), 0, 4));
    while (true) {
      errno.setInt32(0, 0, true);
      const pointer = api.readdir(dir);
      if (!pointer) { if (errno.getInt32(0, true) !== 0) throw new Error('cleanup directory read failed'); break; }
      // 64-bit dirent layouts: glibc bits/dirent.h; Apple xnu bsd/sys/dirent.h.
      const nameOffset = process.platform === 'darwin' ? 21 : 19;
      const length = new DataView(toArrayBuffer(pointer, 0, nameOffset)).getUint16(16, true);
      if (length <= nameOffset || length > (process.platform === 'darwin' ? 1056 : 280)) throw new Error('cleanup dirent invalid');
      const bytes = new Uint8Array(toArrayBuffer(pointer, nameOffset, length - nameOffset));
      const end = bytes.indexOf(0); if (end < 0) throw new Error('cleanup dirent name invalid');
      let name: string;
      try { name = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes.subarray(0, end)); }
      catch { throw new UnsupportedCleanupPath('cleanup filename is not UTF-8'); }
      if (!Buffer.from(name, 'utf8').equals(Buffer.from(bytes.subarray(0, end)))) throw new UnsupportedCleanupPath('cleanup filename cannot round trip');
      if (name !== '.' && name !== '..') {
        if (names.length >= limit) throw new CleanupDirectoryTooLarge();
        if (seen.has(name)) throw new UnsupportedCleanupPath('cleanup filename repeated');
        cName(name); names.push(name); seen.add(name);
      }
    }
  } finally { api.closedir(dir); }
  return names.sort();
}
export interface CleanupOpenedFile { readonly fd: number; readonly stat: Stats; readonly link: Buffer | null }
export function openCleanupChild(parent: number, name: string): CleanupOpenedFile {
  const api = native(), encoded = cName(name);
  let fd = api.openat(parent, encoded, flags);
  if (fd >= 0) {
    try { return { fd, stat: fstatSync(fd), link: null }; }
    catch (error) { closeSync(fd); throw error; }
  }
  // O_PATH on Linux and O_SYMLINK on Darwin both have this numeric value.
  // These descriptors identify the link itself. No target file is opened.
  fd = api.openat(parent, encoded, 0x00200000 | (process.platform === 'linux' ? constants.O_NOFOLLOW : 0) | closeOnExec);
  if (fd < 0) throw new Error('cleanup child open failed');
  try {
    const stat = fstatSync(fd); if (!stat.isSymbolicLink()) throw new Error('cleanup child unreadable');
    const output = Buffer.alloc(4096);
    const count = api.readlinkat(process.platform === 'linux' ? fd : parent, process.platform === 'linux' ? Buffer.from([0]) : encoded, output, output.length);
    if (count < 0 || count >= output.length) throw new Error('cleanup link read failed');
    return { fd, stat, link: Buffer.from(output.subarray(0, count)) };
  } catch (error) { closeSync(fd); throw error; }
}
