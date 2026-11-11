import { describe, expect, test } from "bun:test";
import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { withTempRepo } from "./helpers/repo-fixture";

import { writeBlob } from "../src/effects/evidence/blob-store";

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
});
