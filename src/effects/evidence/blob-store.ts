/** Content-addressed, write-once blob store (D6). Name = sha256 hex. */
import { sha256Hex } from "../../core/evidence/sha256";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { resolveBlobsDir } from "./paths";
import { createFileExclusiveDurably } from "../atomic-append";

export interface BlobWriteResult {
  readonly sha256: string;
  readonly bytes: number;
  readonly wasNew: boolean;
  readonly path: string;
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
