import { constants, closeSync, fstatSync, lstatSync, openSync, readSync, realpathSync, renameSync, unlinkSync, writeFileSync, type Stats } from 'node:fs';
import { dirname, isAbsolute, join, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { decodeRuntimeCaptureSnapshot, type RuntimeCaptureSnapshot } from '../../core/operator/runtime-capture';

function sameFile(a: Stats, b: Stats): boolean { return a.dev === b.dev && a.ino === b.ino && a.uid === b.uid; }
/** Refuse shared or replaced storage. This writer never changes directory permissions. */
export class RuntimeCaptureWriter {
  private readonly parent: string;
  private readonly target: string;
  private readonly directoryIdentity: Stats;
  private fileIdentity: Stats;
  private previous: RuntimeCaptureSnapshot;
  private failed = false;
  constructor(path: string, initial: RuntimeCaptureSnapshot) {
    if (!isAbsolute(path) || path.includes('\0') || typeof process.getuid !== 'function') throw new Error('runtime_capture_output_path');
    const uid = process.getuid();
    const directory = lstatSync(dirname(path));
    if (!directory.isDirectory() || directory.isSymbolicLink() || directory.uid !== uid || (directory.mode & 0o022) !== 0) throw new Error('runtime_capture_output_directory');
    this.parent = realpathSync(dirname(path)); this.target = join(this.parent, basename(path));
    this.directoryIdentity = directory; this.previous = decodeRuntimeCaptureSnapshot(initial);
    const fd = openSync(this.target, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    try { this.fileIdentity = fstatSync(fd); writeFileSync(fd, JSON.stringify(this.previous)); }
    finally { closeSync(fd); }
  }
  write(value: RuntimeCaptureSnapshot): void {
    if (this.failed) throw new Error('runtime_capture_writer_unavailable');
    let temporary: string | null = null, temporaryIdentity: Stats | null = null;
    try {
      const next = decodeRuntimeCaptureSnapshot(value);
      if (next.source_id !== this.previous.source_id || next.generation !== this.previous.generation || next.provider !== this.previous.provider || next.format !== this.previous.format || next.sequence <= this.previous.sequence) throw new Error('runtime_capture_writer_generation');
      this.verify();
      temporary = join(this.parent, `.runtime-capture-${randomUUID()}.tmp`);
      const fd = openSync(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
      try { temporaryIdentity = fstatSync(fd); writeFileSync(fd, JSON.stringify(next)); }
      finally { closeSync(fd); }
      this.verify();
      renameSync(temporary, this.target); temporary = null;
      this.fileIdentity = temporaryIdentity;
      this.previous = next;
    } catch {
      this.failed = true;
      if (temporary && temporaryIdentity) {
        try { if (sameFile(lstatSync(temporary), temporaryIdentity)) unlinkSync(temporary); } catch { /* Preserve a replacement owned by someone else. */ }
      }
      throw new Error('runtime_capture_snapshot_unavailable');
    }
  }
  private verify(): void {
    const directory = lstatSync(this.parent);
    if (!sameFile(directory, this.directoryIdentity) || !directory.isDirectory() || directory.isSymbolicLink() || (directory.mode & 0o022) !== 0) throw new Error('runtime_capture_directory_replaced');
    const fd = openSync(this.target, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const identity = fstatSync(fd);
      if (!sameFile(identity, this.fileIdentity) || !identity.isFile() || (identity.mode & 0o077) !== 0 || identity.size > 256 * 1024) throw new Error('runtime_capture_file_replaced');
      const bytes = Buffer.alloc(256 * 1024 + 1);
      let length = 0, count: number;
      while (length < bytes.length && (count = readSync(fd, bytes, length, bytes.length - length, null)) > 0) length += count;
      if (length > 256 * 1024) throw new Error('runtime_capture_file_limit');
      const current = decodeRuntimeCaptureSnapshot(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, length))));
      if (current.source_id !== this.previous.source_id || current.generation !== this.previous.generation || current.sequence !== this.previous.sequence || JSON.stringify(current) !== JSON.stringify(this.previous)) throw new Error('runtime_capture_owner_changed');
    } finally { closeSync(fd); }
  }
}
