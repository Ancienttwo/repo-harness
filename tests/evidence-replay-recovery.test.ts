import { describe, expect, test } from "bun:test";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { foldAcceptedEvents, findCorruptTail, parseLogLine } from "../src/core/evidence/fold";
import type { EvidenceEventRecord } from "../src/core/evidence/types";
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

function baseInput(overrides: Partial<EvidenceEventInput> = {}): EvidenceEventInput {
  return {
    worktreeId: "epc-01-evidence-event-store",
    eventType: "verification.command_run",
    trustClass: "authoritative_machine",
    producer: "test-harness",
    correlationRunId: "run-replay-0001",
    subjectIdentity: {
      authority_commit: "5228d4ea0d7987cf6fb73be216d5b9cc638817c3",
      base_commit: "5228d4ea0d7987cf6fb73be216d5b9cc638817c3",
      target_commit: "abcdef1234567890abcdef1234567890abcdef12",
      scope_hash: "sha256:" + "a".repeat(64),
      subject_hash: "sha256:" + "b".repeat(64),
      contract_hash: "sha256:" + "c".repeat(64),
      command_hash: "sha256:" + "d".repeat(64),
      env_provider_id: "claude-code/1.0.0/home-abc",
    },
    payload: { kind: "json", value: { note: "hello" } },
    ...overrides,
  };
}

function freshGenesisRepo(repoRoot: string) {
  mkdirSync(repoRoot, { recursive: true });
  appendGenesisRecord(repoRoot, "5228d4ea0d7987cf6fb73be216d5b9cc638817c3", {
    worktreeId: "epc-01-evidence-event-store",
  });
}

function logPathFor(repoRoot: string): string {
  return join(repoRoot, ".ai/harness/evidence/events/log.jsonl");
}

describe("pure fold and corrupt-tail policy", () => {
  test("foldAcceptedEvents is a deterministic pure function of its input array", () => {
    const events: EvidenceEventRecord[] = [
      {
        kind: "evidence_event",
        schema_version: 1,
        worktree_id: "w1",
        event_id: "evt-00000000000000000000000001",
        correlation_run_id: "run-1",
        event_type: "x",
        trust_class: "authoritative_machine",
        producer: "p",
        subject_identity: {
          authority_commit: "a",
          base_commit: "a",
          target_commit: "a",
          scope_hash: "sha256:" + "0".repeat(64),
          subject_hash: "sha256:" + "1".repeat(64),
          contract_hash: "sha256:" + "2".repeat(64),
          command_hash: "sha256:" + "3".repeat(64),
          env_provider_id: "env",
        },
        idempotency_key: "sha256:" + "4".repeat(64),
        payload_hash: "sha256:" + "5".repeat(64),
        payload: { a: 1 },
        created_at: "2026-07-22T00:00:00.000Z",
      },
      {
        kind: "evidence_event",
        schema_version: 1,
        worktree_id: "w1",
        event_id: "evt-00000000000000000000000002",
        correlation_run_id: "run-2",
        event_type: "x",
        trust_class: "authoritative_machine",
        producer: "p",
        subject_identity: {
          authority_commit: "a",
          base_commit: "a",
          target_commit: "a",
          scope_hash: "sha256:" + "0".repeat(64),
          subject_hash: "sha256:" + "1".repeat(64),
          contract_hash: "sha256:" + "2".repeat(64),
          command_hash: "sha256:" + "3".repeat(64),
          env_provider_id: "env",
        },
        idempotency_key: "sha256:" + "6".repeat(64),
        supersedes: ["evt-00000000000000000000000001"],
        payload_hash: "sha256:" + "7".repeat(64),
        payload: { a: 2 },
        created_at: "2026-07-22T00:00:01.000Z",
      },
    ];

    const first = foldAcceptedEvents(events);
    const second = foldAcceptedEvents(events);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.accepted.map((e) => e.event_id)).toEqual(["evt-00000000000000000000000002"]);
  });

  test("parseLogLine rejects malformed JSON without throwing", () => {
    const result = parseLogLine("{not valid json");
    expect(result.ok).toBe(false);
  });

  const validGenesisLine = JSON.stringify({
    kind: "evidence_genesis",
    schema_version: 1,
    worktree_id: "w1",
    ledger_epoch_start_sha: "5228d4ea0d7987cf6fb73be216d5b9cc638817c3",
    created_at: "2026-07-22T00:00:00.000Z",
  });
  const validEventLine = (eventId: string) =>
    JSON.stringify({
      kind: "evidence_event",
      schema_version: 1,
      worktree_id: "w1",
      event_id: eventId,
      correlation_run_id: "run-1",
      event_type: "x",
      trust_class: "authoritative_machine",
      producer: "p",
      subject_identity: {
        authority_commit: "a",
        base_commit: "a",
        target_commit: "a",
        scope_hash: "sha256:" + "0".repeat(64),
        subject_hash: "sha256:" + "1".repeat(64),
        contract_hash: "sha256:" + "2".repeat(64),
        command_hash: "sha256:" + "3".repeat(64),
        env_provider_id: "env",
      },
      idempotency_key: "sha256:" + "4".repeat(64),
      payload_hash: "sha256:" + "5".repeat(64),
      payload: { a: 1 },
      created_at: "2026-07-22T00:00:00.000Z",
    });

  test("findCorruptTail reports no corruption for an all-valid log", () => {
    const lines = [validGenesisLine, validEventLine("evt-1")];
    const result = findCorruptTail(lines.map((line) => parseLogLine(line)));
    expect(result.corruptStartIndex).toBeNull();
    expect(result.validLineCount).toBe(2);
  });

  test("findCorruptTail stops at the first bad record and does not resume after it", () => {
    const parsed = [
      parseLogLine(validGenesisLine),
      parseLogLine(validEventLine("evt-1")),
      parseLogLine("{not valid json"),
      parseLogLine(validEventLine("evt-3")),
    ];
    const result = findCorruptTail(parsed);
    expect(result.corruptStartIndex).toBe(2);
    expect(result.validLineCount).toBe(2);
  });
});

describe("replay determinism across the append-only store", () => {
  test("readAcceptedEvents yields byte-identical accepted sets across two independent reads", () => {
    withTempRepo("evidence-replay-determinism", (repoRoot) => {
      freshGenesisRepo(repoRoot);
      appendEvidenceEvent(repoRoot, baseInput({ payload: { kind: "json", value: { v: 1 } } }));
      const dup = baseInput({ payload: { kind: "json", value: { v: "dup" } } });
      appendEvidenceEvent(repoRoot, dup);
      appendEvidenceEvent(repoRoot, dup);
      appendEvidenceEvent(repoRoot, baseInput({ payload: { kind: "json", value: { v: 3 } } }));

      const firstRead = readAcceptedEvents(repoRoot);
      const secondRead = readAcceptedEvents(repoRoot);
      expect(JSON.stringify(firstRead.accepted)).toBe(JSON.stringify(secondRead.accepted));
      expect(firstRead.accepted.length).toBe(secondRead.accepted.length);
    });
  });
});

describe("corrupt-tail recovery and quarantine", () => {
  test("a truncated final record is quarantined and excluded from the accepted view", () => {
    withTempRepo("evidence-corrupt-tail-end", (repoRoot) => {
      freshGenesisRepo(repoRoot);
      appendEvidenceEvent(repoRoot, baseInput({ payload: { kind: "json", value: { v: 1 } } }));
      appendEvidenceEvent(repoRoot, baseInput({ payload: { kind: "json", value: { v: 2 } } }));

      const path = logPathFor(repoRoot);
      const before = readFileSync(path, "utf-8");
      // Simulate a crash mid-write: append a truncated, unparseable fragment
      // with no trailing newline.
      appendFileSync(path, '{"kind":"evidence_event","event_id":"evt-broke');

      const result = readAcceptedEvents(repoRoot);
      expect(result.accepted.length).toBe(2);
      expect(result.quarantinedPath).not.toBeNull();
      expect(existsSync(result.quarantinedPath!)).toBe(true);
      const quarantined = readFileSync(result.quarantinedPath!, "utf-8");
      expect(quarantined).toContain("evt-broke");

      // The live log is truncated back to the last valid offset so future
      // appends continue cleanly.
      const after = readFileSync(path, "utf-8");
      expect(after).toBe(before);
    });
  });

  test("a corrupt middle record fails closed: later well-formed lines are not resumed past it", () => {
    withTempRepo("evidence-corrupt-tail-middle", (repoRoot) => {
      freshGenesisRepo(repoRoot);
      const first = appendEvidenceEvent(repoRoot, baseInput({ payload: { kind: "json", value: { v: 1 } } }));

      const path = logPathFor(repoRoot);
      // Inject a corrupt middle record directly (bypassing the safe writer),
      // simulating on-disk corruption between two otherwise-valid appends.
      appendFileSync(path, "this line is not json at all\n");

      const third = appendEvidenceEvent(repoRoot, baseInput({ payload: { kind: "json", value: { v: 3 } } }));

      const result = readAcceptedEvents(repoRoot);
      const ids = result.accepted.map((e) => e.event_id);
      expect(ids).toContain(first.event_id);
      expect(ids).not.toContain(third.event_id);
      expect(result.quarantinedPath).not.toBeNull();
      const quarantined = readFileSync(result.quarantinedPath!, "utf-8");
      expect(quarantined).toContain("this line is not json at all");
      // The well-formed record written after the corruption must also be
      // quarantined, not silently accepted by skipping the bad line.
      expect(quarantined).toContain(third.event_id);
    });
  });

  test("quarantine files are named events.corrupt-<ts> and live beside the log", () => {
    withTempRepo("evidence-corrupt-tail-naming", (repoRoot) => {
      freshGenesisRepo(repoRoot);
      appendEvidenceEvent(repoRoot, baseInput());
      const path = logPathFor(repoRoot);
      appendFileSync(path, "garbage\n");

      const result = readAcceptedEvents(repoRoot);
      expect(result.quarantinedPath).not.toBeNull();
      const dir = join(repoRoot, ".ai/harness/evidence/events");
      const entries = readdirSync(dir);
      expect(entries.some((name) => /^events\.corrupt-/.test(name))).toBe(true);
    });
  });
});
