import { describe, expect, test } from "bun:test";
import { spawnSync } from "child_process";
import { appendFileSync, closeSync, existsSync, ftruncateSync, mkdirSync, openSync, readFileSync, readdirSync, rmSync, writeFileSync, writeSync } from "fs";
import { join } from "path";
import { tmpWorkspace, withTempRepo } from "./helpers/repo-fixture";

import { findCorruptTail, foldAcceptedEvents, parseLogLine } from "../src/core/evidence/fold";
import type { EvidenceEventRecord } from "../src/core/evidence/types";
import {
  appendEvidenceEvent,
  appendGenesisRecord,
  readAcceptedEvents,
  readGenesisRecord,
  type EvidenceEventInput,
} from "../src/effects/evidence/event-log";

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
  test("an unterminated genesis cannot authorize an append and can be recovered", () => {
    withTempRepo("evidence-genesis-newline", (repoRoot) => {
      freshGenesisRepo(repoRoot);
      const path = logPathFor(repoRoot);
      const raw = readFileSync(path, "utf-8");
      const fd = openSync(path, "r+");
      try { ftruncateSync(fd, Buffer.byteLength(raw) - 1); } finally { closeSync(fd); }
      expect(readGenesisRecord(repoRoot)).toBeNull();
      expect(() => appendEvidenceEvent(repoRoot, baseInput()))
        .toThrow(/cannot append: .* ends with an unterminated record; run a recovery read first/);
      expect(() => freshGenesisRepo(repoRoot))
        .toThrow(/cannot write genesis record: .* ends with an unterminated record; run a recovery read first/);
      expect(readFileSync(path, "utf-8")).toBe(raw.slice(0, -1));
      const recovery = readAcceptedEvents(repoRoot);
      expect(recovery.genesis).toBeNull();
      expect(readFileSync(recovery.quarantinedPath!, "utf-8")).toBe(raw.slice(0, -1));
      freshGenesisRepo(repoRoot);
      const next = appendEvidenceEvent(repoRoot, baseInput());
      expect(readAcceptedEvents(repoRoot).accepted.map(event => event.event_id)).toEqual([next.event_id]);
    });
  });

  test("a complete JSON record without its newline is quarantined before the next append", () => {
    withTempRepo("evidence-missing-newline", (repoRoot) => {
      freshGenesisRepo(repoRoot);
      const path = logPathFor(repoRoot);
      const prefix = readFileSync(path, "utf-8");
      const first = appendEvidenceEvent(repoRoot, baseInput({ payload: { kind: "json", value: { v: 1 } } }));
      const before = readFileSync(path, "utf-8");
      const fd = openSync(path, "r+");
      try { ftruncateSync(fd, Buffer.byteLength(before) - 1); } finally { closeSync(fd); }
      const result = readAcceptedEvents(repoRoot);
      expect(result.accepted).toEqual([]);
      expect(result.quarantinedPath).not.toBeNull();
      expect(readFileSync(result.quarantinedPath!, "utf-8")).toBe(before.slice(prefix.length, -1));
      expect(readFileSync(path, "utf-8")).toBe(prefix);
      const next = appendEvidenceEvent(repoRoot, baseInput({ payload: { kind: "json", value: { v: 2 } } }));
      expect(readAcceptedEvents(repoRoot).accepted.map(event => event.event_id)).toEqual([next.event_id]);
      expect(next.event_id).not.toBe(first.event_id);
    });
  });

  test("an append onto an unterminated event record fails closed and leaves the log bytes unchanged", () => {
    withTempRepo("evidence-append-unterminated-tail", (repoRoot) => {
      freshGenesisRepo(repoRoot);
      appendEvidenceEvent(repoRoot, baseInput({ payload: { kind: "json", value: { v: 1 } } }));
      const path = logPathFor(repoRoot);
      const terminated = readFileSync(path);
      const fd = openSync(path, "r+");
      try { ftruncateSync(fd, terminated.length - 1); } finally { closeSync(fd); }
      const unterminated = readFileSync(path);
      expect(() => appendEvidenceEvent(repoRoot, baseInput({ payload: { kind: "json", value: { v: 2 } } })))
        .toThrow(/cannot append: .* ends with an unterminated record; run a recovery read first/);
      expect(() => freshGenesisRepo(repoRoot))
        .toThrow(/cannot write genesis record: .* ends with an unterminated record; run a recovery read first/);
      expect(readFileSync(path).equals(unterminated)).toBe(true);
    });
  });

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
      const beforeCorruption = readFileSync(path);
      const third = appendEvidenceEvent(repoRoot, baseInput({ payload: { kind: "json", value: { v: 3 } } }));
      // Inject a corrupt middle record directly (bypassing the safe writer),
      // simulating on-disk corruption between two otherwise-valid appends.
      // An append cannot follow a corrupt record (#880), so the third record
      // is written first and the corrupt line is placed in front of it.
      writeFileSync(path, Buffer.concat([
        beforeCorruption,
        Buffer.from("this line is not json at all\n"),
        readFileSync(path).subarray(beforeCorruption.length),
      ]));

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

  for (const position of ["last", "middle"] as const) {
    test(`an append after a terminated corrupt ${position} line fails closed and leaves the log bytes unchanged`, () => {
      withTempRepo(`evidence-append-corrupt-${position}`, (repoRoot) => {
        freshGenesisRepo(repoRoot);
        const kept = appendEvidenceEvent(repoRoot, baseInput({ payload: { kind: "json", value: { v: 1 } } }));
        const path = logPathFor(repoRoot);
        const prefix = readFileSync(path);
        appendEvidenceEvent(repoRoot, baseInput({ payload: { kind: "json", value: { v: 2 } } }));
        appendEvidenceEvent(repoRoot, baseInput({ payload: { kind: "json", value: { v: 3 } } }));
        if (position === "middle") appendEvidenceEvent(repoRoot, baseInput({ payload: { kind: "json", value: { v: 4 } } }));
        // #862 joined two records on one terminated line: {e2}{e3}\n.
        const written = readFileSync(path);
        const joinAt = written.indexOf(0x0a, prefix.length);
        writeFileSync(path, Buffer.concat([written.subarray(0, joinAt), written.subarray(joinAt + 1)]));
        const corrupt = readFileSync(path);

        expect(() => appendEvidenceEvent(repoRoot, baseInput({ payload: { kind: "json", value: { v: 5 } } })))
          .toThrow(/cannot append: .* has a corrupt record at line 3; run a recovery read first/);
        expect(() => freshGenesisRepo(repoRoot))
          .toThrow(/cannot write genesis record: .* has a corrupt record at line 3; run a recovery read first/);
        expect(readFileSync(path).equals(corrupt)).toBe(true);

        const recovery = readAcceptedEvents(repoRoot);
        expect(recovery.accepted.map((event) => event.event_id)).toEqual([kept.event_id]);
        expect(readFileSync(recovery.quarantinedPath!).equals(corrupt.subarray(prefix.length))).toBe(true);
        expect(readFileSync(path).equals(prefix)).toBe(true);
        const next = appendEvidenceEvent(repoRoot, baseInput({ payload: { kind: "json", value: { v: 6 } } }));
        expect(readAcceptedEvents(repoRoot).accepted.map((event) => event.event_id)).toEqual([kept.event_id, next.event_id]);
      });
    });
  }

  test("a repair after invalid UTF-8 in the valid prefix truncates at the record's byte boundary", () => {
    withTempRepo("evidence-repair-invalid-utf8-prefix", (repoRoot) => {
      freshGenesisRepo(repoRoot);
      const kept = appendEvidenceEvent(repoRoot, baseInput({ payload: { kind: "json", value: { note: "hello" } } }));
      const path = logPathFor(repoRoot);
      const written = readFileSync(path);
      // Disk damage puts one invalid UTF-8 byte inside a JSON string. The line still parses.
      const at = written.indexOf("hello") + 2;
      const prefix = Buffer.concat([written.subarray(0, at), Buffer.from([0xff]), written.subarray(at)]);
      const tail = Buffer.from("garbage\n");
      writeFileSync(path, Buffer.concat([prefix, tail]));

      const result = readAcceptedEvents(repoRoot);
      expect(result.accepted.map((event) => event.event_id)).toEqual([kept.event_id]);
      expect(readFileSync(path).equals(prefix)).toBe(true);
      expect(readFileSync(result.quarantinedPath!).equals(tail)).toBe(true);
    });
  });

  test("a repair quarantines the exact bytes of a torn multi-byte character in the tail", () => {
    withTempRepo("evidence-repair-torn-utf8-tail", (repoRoot) => {
      freshGenesisRepo(repoRoot);
      const kept = appendEvidenceEvent(repoRoot, baseInput());
      const path = logPathFor(repoRoot);
      const prefix = readFileSync(path);
      // A crash tore the 3-byte character U+4E2D after its first two bytes.
      const tail = Buffer.concat([Buffer.from('{"kind":"evidence_event","note":"'), Buffer.from([0xe4, 0xb8])]);
      writeFileSync(path, Buffer.concat([prefix, tail]));

      const result = readAcceptedEvents(repoRoot);
      expect(result.accepted.map((event) => event.event_id)).toEqual([kept.event_id]);
      expect(readFileSync(path).equals(prefix)).toBe(true);
      expect(readFileSync(result.quarantinedPath!).equals(tail)).toBe(true);
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

async function readUntil(reader: ReadableStreamDefaultReader<Uint8Array>, marker: string, seen = ""): Promise<string> {
  const decoder = new TextDecoder();
  let text = seen;
  while (!text.includes(marker)) {
    const chunk = await reader.read();
    if (chunk.done) return text;
    text += decoder.decode(chunk.value);
  }
  return text;
}

describe("concurrent recovery and append", () => {
  test("a repair paused between its read and its truncation cannot delete an acknowledged append", async () => {
    const repoRoot = tmpWorkspace("evidence-repair-append-race");
    try {
      freshGenesisRepo(repoRoot);
      const kept = appendEvidenceEvent(repoRoot, baseInput({ payload: { kind: "json", value: { v: "kept" } } }));
      // A crash during an earlier append left a partial final line.
      appendFileSync(logPathFor(repoRoot), '{"kind":"evidence_event","event_id":"evt-crashed');
      const release = join(repoRoot, "repair-release.fifo");
      expect(spawnSync("mkfifo", [release]).status).toBe(0);
      const eventLog = join(import.meta.dir, "../src/effects/evidence/event-log.ts");

      // The event log reads the clock only to name the quarantine file, after
      // the repair has read the log and before it truncates. The repair process
      // reports that point on stdout, then blocks on the FIFO until released.
      const repair = Bun.spawn([process.execPath, "-e", `
        import { readFileSync, writeSync } from "fs";
        import { readAcceptedEvents } from ${JSON.stringify(eventLog)};
        const now = Date.now;
        let held = false;
        Date.now = () => {
          const caller = new Error().stack?.split("\\n").find((frame) => frame.includes("/src/"));
          if (!held && caller?.includes("/src/effects/evidence/event-log.ts")) {
            held = true;
            writeSync(1, "held\\n");
            readFileSync(${JSON.stringify(release)});
          }
          return now();
        };
        const result = readAcceptedEvents(${JSON.stringify(repoRoot)});
        writeSync(1, JSON.stringify({ accepted: result.accepted.map((event) => event.event_id) }) + "\\n");
      `], { stdout: "pipe", stderr: "pipe" });
      const repairOutput = repair.stdout.getReader();
      let repairText = await readUntil(repairOutput, "held\n");
      expect(repairText).toBe("held\n");

      const appender = Bun.spawn([process.execPath, "-e", `
        import { writeSync } from "fs";
        import { appendEvidenceEvent } from ${JSON.stringify(eventLog)};
        try {
          const record = appendEvidenceEvent(${JSON.stringify(repoRoot)}, ${JSON.stringify(baseInput({ payload: { kind: "json", value: { v: "appended" } } }))});
          writeSync(1, JSON.stringify({ ok: true, event_id: record.event_id }));
        } catch (error) {
          writeSync(1, JSON.stringify({ ok: false, error: String(error) }));
        }
      `], { stdout: "pipe", stderr: "pipe" });
      expect(await appender.exited).toBe(0);
      const appended = JSON.parse(await new Response(appender.stdout).text()) as
        { readonly ok: true; readonly event_id: string } | { readonly ok: false; readonly error: string };

      const writer = openSync(release, "w");
      writeSync(writer, "release\n");
      closeSync(writer);
      repairText = await readUntil(repairOutput, "]}\n", repairText);
      expect(await repair.exited).toBe(0);
      expect(JSON.parse(repairText.slice("held\n".length)).accepted).toEqual([kept.event_id]);

      const accepted = readAcceptedEvents(repoRoot).accepted.map((event) => event.event_id);
      const eventsDir = join(repoRoot, ".ai/harness/evidence/events");
      const quarantined = readdirSync(eventsDir)
        .filter((name) => name.startsWith("events.corrupt-"))
        .map((name) => readFileSync(join(eventsDir, name), "utf-8"))
        .join("");
      expect(quarantined).toContain("evt-crashed");
      expect(accepted).toContain(kept.event_id);
      if (appended.ok) {
        // An acknowledged append must stay accepted or stay in quarantine.
        expect(`${accepted.join("\n")}\n${quarantined}`).toContain(appended.event_id);
      } else {
        expect(appended.error).toContain("timed out waiting for exclusive lock");
      }

      const retried = appendEvidenceEvent(repoRoot, baseInput({ payload: { kind: "json", value: { v: "retried" } } }));
      expect(readAcceptedEvents(repoRoot).accepted.map((event) => event.event_id)).toEqual([kept.event_id, retried.event_id]);
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  }, 30_000);
});
