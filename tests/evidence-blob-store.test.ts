import { describe, expect, test } from "bun:test";
import { createHash } from "crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { writeBlob, ingestFileAsBlob } from "../src/effects/evidence/blob-store";

function withTempRepo(prefix: string, fn: (repoRoot: string) => void): void {
  const repoRoot = mkdtempSync(join(tmpdir(), `${prefix}-`));
  try {
    fn(repoRoot);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
}

function sha256hex(content: Buffer | string): string {
  return createHash("sha256").update(content).digest("hex");
}

describe("content-addressed blob store", () => {
  test("writeBlob names the blob after its sha256 content hash", () => {
    withTempRepo("evidence-blob-addressing", (repoRoot) => {
      const content = Buffer.from("hello evidence blob store");
      const result = writeBlob(repoRoot, content);
      expect(result.sha256).toBe(sha256hex(content));
      expect(result.bytes).toBe(content.length);
      expect(result.wasNew).toBe(true);
      const blobPath = join(repoRoot, ".ai/harness/evidence/blobs", result.sha256);
      expect(existsSync(blobPath)).toBe(true);
      expect(readFileSync(blobPath)).toEqual(content);
    });
  });

  test("writing identical content twice is a write-once no-op", () => {
    withTempRepo("evidence-blob-write-once", (repoRoot) => {
      const content = Buffer.from("identical content");
      const first = writeBlob(repoRoot, content);
      const second = writeBlob(repoRoot, content);
      expect(first.sha256).toBe(second.sha256);
      expect(first.wasNew).toBe(true);
      expect(second.wasNew).toBe(false);
    });
  });

  test("a corrupted on-disk blob that no longer matches its own filename hash fails closed on rewrite", () => {
    withTempRepo("evidence-blob-mismatch", (repoRoot) => {
      const legitimate = Buffer.from("legitimate content for this hash");
      const digest = sha256hex(legitimate);
      const blobsDir = join(repoRoot, ".ai/harness/evidence/blobs");
      mkdirSync(blobsDir, { recursive: true });
      // Simulate on-disk corruption: a file sits at the content-addressed name
      // but its bytes do not match that name.
      writeFileSync(join(blobsDir, digest), "corrupted bytes, not the real content");

      expect(() => writeBlob(repoRoot, legitimate)).toThrow(/mismatch|different|corrupt/i);
    });
  });

  test("ingestFileAsBlob hashes and stores a regular file's content", () => {
    withTempRepo("evidence-blob-ingest-file", (repoRoot) => {
      mkdirSync(join(repoRoot, "artifacts"), { recursive: true });
      const relativePath = "artifacts/report.txt";
      const content = "report body content\n";
      writeFileSync(join(repoRoot, relativePath), content);

      const result = ingestFileAsBlob(repoRoot, relativePath);
      expect(result.kind).toBe("file");
      if (result.kind !== "file") throw new Error("expected file result");
      expect(result.sha256).toBe(sha256hex(content));
      expect(result.wasNew).toBe(true);

      const second = ingestFileAsBlob(repoRoot, relativePath);
      if (second.kind !== "file") throw new Error("expected file result");
      expect(second.wasNew).toBe(false);
      expect(second.sha256).toBe(result.sha256);
    });
  });

  test("ingestFileAsBlob never dereferences a symlink to hash or store its target content", () => {
    withTempRepo("evidence-blob-symlink-safety", (repoRoot) => {
      mkdirSync(join(repoRoot, "artifacts"), { recursive: true });
      const targetContent = "TARGET-CONTENT-that-must-never-be-read";
      const targetRelative = "artifacts/real-target.txt";
      const linkRelative = "artifacts/link-to-target.txt";
      writeFileSync(join(repoRoot, targetRelative), targetContent);
      symlinkSync(join(repoRoot, targetRelative), join(repoRoot, linkRelative));

      const result = ingestFileAsBlob(repoRoot, linkRelative);
      expect(result.kind).toBe("symlink");
      if (result.kind !== "symlink") throw new Error("expected symlink result");
      expect(result.linkTarget).toBe(join(repoRoot, targetRelative));
      // The symlink's own hash must be over the link target string, not the
      // dereferenced file content.
      expect(result.sha256).toBe(sha256hex(result.linkTarget));
      expect(result.sha256).not.toBe(sha256hex(targetContent));

      // The blob store must never have ingested the target file's actual bytes
      // as a side effect of resolving the symlink.
      const targetContentBlobPath = join(
        repoRoot,
        ".ai/harness/evidence/blobs",
        sha256hex(targetContent),
      );
      expect(existsSync(targetContentBlobPath)).toBe(false);
    });
  });

  test("ingestFileAsBlob rejects absolute and escaping paths fail-closed", () => {
    withTempRepo("evidence-blob-ingest-path-safety", (repoRoot) => {
      expect(() => ingestFileAsBlob(repoRoot, "/etc/passwd")).toThrow(/absolute|repo-relative/i);
      expect(() => ingestFileAsBlob(repoRoot, "../outside.txt")).toThrow(/traversal|escap/i);
    });
  });
});
