/**
 * Content-addressed, write-once blob store (D6). Name = sha256 hex.
 * Symlinks are never dereferenced when ingesting a path into the store --
 * a symlink's own target string is hashed and returned as metadata; its
 * target's content is never read.
 */
import { createHash } from "crypto";
import { existsSync, lstatSync, readFileSync, readlinkSync } from "fs";
import { join } from "path";
import { resolveInsideRepo } from "../path-safety";
import { resolveBlobsDir } from "./paths";
import { createFileExclusiveDurably } from "./atomic-append";

export interface BlobWriteResult {
  readonly sha256: string;
  readonly bytes: number;
  readonly wasNew: boolean;
  readonly path: string;
}

function sha256Hex(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

function mismatchError(digest: string): Error {
  return new Error(
    `blob content mismatch for ${digest}: on-disk bytes differ from the requested write `
    + "(refusing to overwrite a different content at the same content-addressed name)",
  );
}

/** Write-once: identical content at the same name is a no-op; different content at the same name is an error. */
export function writeBlob(repoRoot: string, content: Buffer): BlobWriteResult {
  const digest = sha256Hex(content);
  const blobsDir = resolveBlobsDir(repoRoot);
  const blobPath = join(blobsDir, digest);

  if (existsSync(blobPath)) {
    if (!readFileSync(blobPath).equals(content)) throw mismatchError(digest);
    return { sha256: digest, bytes: content.length, wasNew: false, path: blobPath };
  }

  try {
    createFileExclusiveDurably(blobPath, content);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      // Lost a create race against another writer for the same digest.
      if (!readFileSync(blobPath).equals(content)) throw mismatchError(digest);
      return { sha256: digest, bytes: content.length, wasNew: false, path: blobPath };
    }
    throw error;
  }
  return { sha256: digest, bytes: content.length, wasNew: true, path: blobPath };
}

export type FileBlobIngestResult =
  | { readonly kind: "file"; readonly sha256: string; readonly bytes: number; readonly wasNew: boolean; readonly path: string }
  | { readonly kind: "symlink"; readonly linkTarget: string; readonly sha256: string };

/** Ingest a repo-relative path. A symlink is recorded as metadata (D6); its target is never dereferenced. */
export function ingestFileAsBlob(repoRoot: string, relativePath: string): FileBlobIngestResult {
  const target = resolveInsideRepo(repoRoot, relativePath);
  if (!target.ok || !target.path) throw new Error(target.error ?? "invalid path");

  const stat = lstatSync(target.path);
  if (stat.isSymbolicLink()) {
    const linkTarget = readlinkSync(target.path);
    return { kind: "symlink", linkTarget, sha256: sha256Hex(Buffer.from(linkTarget, "utf-8")) };
  }

  const content = readFileSync(target.path);
  const write = writeBlob(repoRoot, content);
  return { kind: "file", sha256: write.sha256, bytes: write.bytes, wasNew: write.wasNew, path: write.path };
}
