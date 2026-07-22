import { describe, expect, test, afterEach } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { generateEventId, encodeUlid } from "../src/core/evidence/ulid";
import { canonicalize } from "../src/core/evidence/canonical-json";
import { computeIdempotencyKey } from "../src/core/evidence/idempotency";
import type { SubjectIdentity } from "../src/core/evidence/types";
import {
  appendEvidenceEvent,
  appendGenesisRecord,
  readAcceptedEvents,
  type EvidenceEventInput,
} from "../src/effects/evidence/event-log";

function withTempRepo(prefix: string, fn: (repoRoot: string) => void): void {
  const repoRoot = mkdtempSync(join(tmpdir(), `${prefix}-`));
  try {
    fn(repoRoot);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
}

function subjectIdentity(overrides: Partial<SubjectIdentity> = {}): SubjectIdentity {
  return {
    authority_commit: "5228d4ea0d7987cf6fb73be216d5b9cc638817c3",
    base_commit: "5228d4ea0d7987cf6fb73be216d5b9cc638817c3",
    target_commit: "abcdef1234567890abcdef1234567890abcdef12",
    scope_hash: "sha256:" + "a".repeat(64),
    subject_hash: "sha256:" + "b".repeat(64),
    contract_hash: "sha256:" + "c".repeat(64),
    command_hash: "sha256:" + "d".repeat(64),
    env_provider_id: "claude-code/1.0.0/home-abc",
    ...overrides,
  };
}

function baseInput(overrides: Partial<EvidenceEventInput> = {}): EvidenceEventInput {
  return {
    worktreeId: "epc-01-evidence-event-store",
    eventType: "verification.command_run",
    trustClass: "authoritative_machine",
    producer: "test-harness",
    correlationRunId: "run-test-0001",
    subjectIdentity: subjectIdentity(),
    payload: { kind: "json", value: { note: "hello world" } },
    ...overrides,
  };
}

function freshGenesisRepo(repoRoot: string, ledgerEpochStartSha = "5228d4ea0d7987cf6fb73be216d5b9cc638817c3") {
  mkdirSync(repoRoot, { recursive: true });
  appendGenesisRecord(repoRoot, ledgerEpochStartSha, { worktreeId: "epc-01-evidence-event-store" });
}

describe("evidence event schema and identity", () => {
  test("event_id is evt-<ULID>, lexicographically sortable and time-embedding", () => {
    const first = generateEventId();
    expect(first).toMatch(/^evt-[0-9A-HJKMNP-TV-Z]{26}$/);
    const earlier = encodeUlid(1_000, new Uint8Array(10));
    const later = encodeUlid(2_000, new Uint8Array(10));
    expect(earlier < later).toBe(true);
    // Same millisecond, different randomness must not collide for reasonable inputs.
    const a = encodeUlid(5_000, new Uint8Array(10).fill(1));
    const b = encodeUlid(5_000, new Uint8Array(10).fill(2));
    expect(a).not.toBe(b);
    expect(a.slice(0, 10)).toBe(b.slice(0, 10));
  });

  test("encodeUlid rejects timestamps outside the 48-bit range", () => {
    expect(() => encodeUlid(-1, new Uint8Array(10))).toThrow();
    expect(() => encodeUlid(2 ** 48, new Uint8Array(10))).toThrow();
  });

  test("canonicalize produces identical bytes regardless of key insertion order", () => {
    const left = canonicalize({ b: 1, a: { d: 2, c: 3 } });
    const right = canonicalize({ a: { c: 3, d: 2 }, b: 1 });
    expect(left).toBe(right);
    expect(left).toBe('{"a":{"c":3,"d":2},"b":1}');
  });

  test("canonicalize preserves array order (arrays are not sorted)", () => {
    expect(canonicalize([3, 1, 2])).toBe("[3,1,2]");
  });

  test("computeIdempotencyKey is deterministic and sensitive to every input field", () => {
    const base = {
      subjectIdentity: subjectIdentity(),
      eventType: "verification.command_run",
      trustClass: "authoritative_machine" as const,
      payloadHash: "sha256:" + "e".repeat(64),
      producer: "test-harness",
    };
    const keyA = computeIdempotencyKey(base);
    const keyB = computeIdempotencyKey(base);
    expect(keyA).toBe(keyB);
    expect(keyA).toMatch(/^sha256:[0-9a-f]{64}$/);

    const changedProducer = computeIdempotencyKey({ ...base, producer: "other-producer" });
    expect(changedProducer).not.toBe(keyA);

    const changedTrust = computeIdempotencyKey({ ...base, trustClass: "observed" });
    expect(changedTrust).not.toBe(keyA);
  });
});

describe("append-only event store", () => {
  test("genesis-before-append is enforced fail-closed", () => {
    withTempRepo("evidence-genesis-gate", (repoRoot) => {
      mkdirSync(repoRoot, { recursive: true });
      expect(() => appendEvidenceEvent(repoRoot, baseInput())).toThrow(/genesis/i);

      appendGenesisRecord(repoRoot, "5228d4ea0d7987cf6fb73be216d5b9cc638817c3", {
        worktreeId: "epc-01-evidence-event-store",
      });
      const record = appendEvidenceEvent(repoRoot, baseInput());
      expect(record.event_id).toMatch(/^evt-/);
    });
  });

  test("genesis is idempotent for the same epoch sha and fails closed on a conflicting epoch", () => {
    withTempRepo("evidence-genesis-idempotent", (repoRoot) => {
      mkdirSync(repoRoot, { recursive: true });
      const first = appendGenesisRecord(repoRoot, "5228d4ea0d7987cf6fb73be216d5b9cc638817c3", {
        worktreeId: "epc-01-evidence-event-store",
      });
      const second = appendGenesisRecord(repoRoot, "5228d4ea0d7987cf6fb73be216d5b9cc638817c3", {
        worktreeId: "epc-01-evidence-event-store",
      });
      expect(second).toEqual(first);

      expect(() =>
        appendGenesisRecord(repoRoot, "0000000000000000000000000000000000000000", {
          worktreeId: "epc-01-evidence-event-store",
        }),
      ).toThrow(/epoch/i);
    });
  });

  test("many sequential appends land as whole, well-formed JSON lines (append atomicity)", () => {
    withTempRepo("evidence-append-atomicity", (repoRoot) => {
      freshGenesisRepo(repoRoot);
      const total = 50;
      for (let i = 0; i < total; i++) {
        appendEvidenceEvent(
          repoRoot,
          baseInput({ payload: { kind: "json", value: { i, note: `event-${i}` } } }),
        );
      }
      const logPath = join(repoRoot, ".ai/harness/evidence/events/log.jsonl");
      const raw = readFileSync(logPath, "utf-8");
      expect(raw.endsWith("\n")).toBe(true);
      const lines = raw.split("\n").filter((line) => line.length > 0);
      // genesis + total events
      expect(lines.length).toBe(total + 1);
      for (const line of lines) {
        expect(() => JSON.parse(line)).not.toThrow();
      }
    });
  });

  test("duplicate-import with an identical idempotency key is a no-op", () => {
    withTempRepo("evidence-dedup", (repoRoot) => {
      freshGenesisRepo(repoRoot);
      const input = baseInput({ correlationRunId: "run-dup-1" });
      const first = appendEvidenceEvent(repoRoot, input);
      const second = appendEvidenceEvent(repoRoot, { ...input, correlationRunId: "run-dup-2" });
      // Same subject/event_type/trust_class/payload/producer -> identical idempotency key.
      expect(first.idempotency_key).toBe(second.idempotency_key);

      const { accepted } = readAcceptedEvents(repoRoot);
      expect(accepted.length).toBe(1);
      expect(accepted[0]!.event_id).toBe(first.event_id);
    });
  });

  test("supersedes excludes the superseded event from the accepted set", () => {
    withTempRepo("evidence-supersedes", (repoRoot) => {
      freshGenesisRepo(repoRoot);
      const original = appendEvidenceEvent(
        repoRoot,
        baseInput({ payload: { kind: "json", value: { version: 1 } } }),
      );
      const replacement = appendEvidenceEvent(
        repoRoot,
        baseInput({
          payload: { kind: "json", value: { version: 2 } },
          supersedes: [original.event_id],
        }),
      );

      const { accepted } = readAcceptedEvents(repoRoot);
      const ids = accepted.map((event) => event.event_id);
      expect(ids).not.toContain(original.event_id);
      expect(ids).toContain(replacement.event_id);
      expect(accepted.length).toBe(1);
    });
  });
});

describe("D6 construction-invariant safety", () => {
  const originalEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test("known secret env values are never stored raw; replaced with sha256:<hash>", () => {
    withTempRepo("evidence-redaction-denylist", (repoRoot) => {
      freshGenesisRepo(repoRoot);
      const secret = "ghp_abcdefghijklmnopqrstuvwxyz0123456789AB";
      process.env.GH_TOKEN = secret;
      const record = appendEvidenceEvent(
        repoRoot,
        baseInput({ payload: { kind: "json", value: { log_excerpt: `token=${secret} end` } } }),
      );

      const logPath = join(repoRoot, ".ai/harness/evidence/events/log.jsonl");
      const raw = readFileSync(logPath, "utf-8");
      expect(raw.includes(secret)).toBe(false);
      expect(raw).toContain("sha256:");
      expect(JSON.stringify(record).includes(secret)).toBe(false);
    });
  });

  test("high-entropy token runs are redacted even when not on the fixed denylist", () => {
    withTempRepo("evidence-redaction-entropy", (repoRoot) => {
      freshGenesisRepo(repoRoot);
      const token = "Zx9Qk3mP7vRt2Nw8Ly5Ju1Hb6Fg4Ds0Ac";
      expect(token.length).toBeGreaterThanOrEqual(32);
      const record = appendEvidenceEvent(
        repoRoot,
        baseInput({ payload: { kind: "json", value: { detail: `secret=${token}` } } }),
      );
      const logPath = join(repoRoot, ".ai/harness/evidence/events/log.jsonl");
      const raw = readFileSync(logPath, "utf-8");
      expect(raw.includes(token)).toBe(false);
      expect(JSON.stringify(record).includes(token)).toBe(false);
    });
  });

  test("absolute paths in payload path fields are rejected fail-closed", () => {
    withTempRepo("evidence-path-absolute", (repoRoot) => {
      freshGenesisRepo(repoRoot);
      expect(() =>
        appendEvidenceEvent(
          repoRoot,
          baseInput({ payload: { kind: "json", value: { file_path: "/etc/passwd" } } }),
        ),
      ).toThrow(/absolute|repo-relative/i);
    });
  });

  test("path escapes (..) in payload path fields are rejected fail-closed", () => {
    withTempRepo("evidence-path-escape", (repoRoot) => {
      freshGenesisRepo(repoRoot);
      expect(() =>
        appendEvidenceEvent(
          repoRoot,
          baseInput({ payload: { kind: "json", value: { path: "../../etc/passwd" } } }),
        ),
      ).toThrow(/traversal|escap/i);
    });
  });

  test("repo-relative payload path fields are accepted", () => {
    withTempRepo("evidence-path-ok", (repoRoot) => {
      freshGenesisRepo(repoRoot);
      const record = appendEvidenceEvent(
        repoRoot,
        baseInput({ payload: { kind: "json", value: { artifact_path: "tasks/notes/example.md" } } }),
      );
      expect(record.payload).toBeDefined();
    });
  });

  test("inline payload cap overflows to a content-addressed blob", () => {
    withTempRepo("evidence-inline-cap", (repoRoot) => {
      freshGenesisRepo(repoRoot);
      // Space-separated so no single run reaches the 32-char high-entropy
      // threshold; this must overflow on size alone, not get redacted first.
      const big = "word ".repeat(2000);
      const record = appendEvidenceEvent(
        repoRoot,
        baseInput({ payload: { kind: "json", value: { blob_like: big } } }),
      );
      expect(record.payload).toBeUndefined();
      expect(record.blob_sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(record.blob_bytes).toBeGreaterThan(8192 - 1);
      const blobPath = join(repoRoot, ".ai/harness/evidence/blobs", record.blob_sha256!);
      expect(existsSync(blobPath)).toBe(true);
    });
  });

  test("binary payloads are always offloaded to a blob, never inline", () => {
    withTempRepo("evidence-binary-blob", (repoRoot) => {
      freshGenesisRepo(repoRoot);
      const content = Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
      const record = appendEvidenceEvent(
        repoRoot,
        baseInput({ payload: { kind: "binary", content, contentType: "application/octet-stream" } }),
      );
      expect(record.payload).toBeUndefined();
      expect(record.blob_sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(record.content_type).toBe("application/octet-stream");
      const blobPath = join(repoRoot, ".ai/harness/evidence/blobs", record.blob_sha256!);
      expect(existsSync(blobPath)).toBe(true);
      expect(readFileSync(blobPath)).toEqual(content);
    });
  });
});
