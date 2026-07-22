/**
 * Low-level durable file primitives for the evidence store. Mirrors the
 * open/write-loop/fsync idiom already used by `src/effects/fs-transaction.ts`
 * (that file's own `writeFileDurably` is a private, unexported helper, so an
 * equivalent is implemented locally here rather than modifying it -- see
 * tasks/notes/20260722-1151-epc-01-evidence-event-store.notes.md).
 */
import { closeSync, constants, fsyncSync, mkdirSync, openSync, writeSync } from "fs";
import { dirname } from "path";

function writeAllSync(fd: number, data: Buffer): void {
  let offset = 0;
  while (offset < data.length) {
    offset += writeSync(fd, data, offset, data.length - offset);
  }
}

function ensureParentDir(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
}

/** Append one line plus a trailing newline; creates the file if missing. Whole-line append + fsync (D5). */
export function appendLineDurably(path: string, line: string, mode = 0o600): void {
  ensureParentDir(path);
  let fd: number | null = null;
  try {
    fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND, mode);
    writeAllSync(fd, Buffer.from(`${line}\n`, "utf-8"));
    fsyncSync(fd);
  } finally {
    if (fd !== null) closeSync(fd);
  }
}

/** Create a brand-new file exclusively; throws with code EEXIST if it already exists (write-once). */
export function createFileExclusiveDurably(path: string, content: Buffer, mode = 0o600): void {
  ensureParentDir(path);
  let fd: number | null = null;
  try {
    fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, mode);
    writeAllSync(fd, content);
    fsyncSync(fd);
  } finally {
    if (fd !== null) closeSync(fd);
  }
}

/** Create or fully replace a file's content (used for quarantine dumps); fsync before returning. */
export function writeFileDurably(path: string, content: string | Buffer, mode = 0o600): void {
  ensureParentDir(path);
  let fd: number | null = null;
  try {
    fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC, mode);
    writeAllSync(fd, Buffer.isBuffer(content) ? content : Buffer.from(content, "utf-8"));
    fsyncSync(fd);
  } finally {
    if (fd !== null) closeSync(fd);
  }
}
