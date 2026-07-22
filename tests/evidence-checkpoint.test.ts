import { describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";

import type { EvidenceEventRecord, SubjectIdentity, TrustClass } from "../src/core/evidence/types";
import { appendEvidenceEvent, appendGenesisRecord, readAcceptedEvents } from "../src/effects/evidence/event-log";
import { LEDGER_EPOCH_START_SHA } from "../src/effects/evidence/epoch";
import { buildCheckpointProjection, renderCheckpointMarkdown } from "../src/core/evidence/checkpoint";
import {
  CHECKPOINT_HUMAN_FILENAME,
  CHECKPOINT_MACHINE_FILENAME,
  CHECKPOINTS_DIR_RELATIVE,
  CheckpointResolutionError,
  publishCheckpoint,
  publishCheckpointFromLedger,
  resolveCheckpointMarkerPath,
  resolveCheckpointsDir,
  resolveLastPublishedCheckpoint,
} from "../src/effects/evidence/checkpoint-store";

const REPO_ROOT = join(import.meta.dir, "..");
const SUBJECT_A = `sha256:${"a".repeat(64)}`;
const SUBJECT_B = `sha256:${"b".repeat(64)}`;
const FIXED_NOW = () => new Date("2026-07-22T22:00:00.000Z");

function withTempRepo(prefix: string, fn: (repoRoot: string) => void): void {
  const repoRoot = mkdtempSync(join(tmpdir(), `${prefix}-`));
  try {
    fn(repoRoot);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
}

function baseIdentity(overrides: Partial<SubjectIdentity> = {}): SubjectIdentity {
  return {
    authority_commit: "a".repeat(40),
    base_commit: "b".repeat(40),
    target_commit: "c".repeat(40),
    scope_hash: `sha256:${"d".repeat(64)}`,
    subject_hash: SUBJECT_A,
    contract_hash: `sha256:${"f".repeat(64)}`,
    command_hash: `sha256:${"0".repeat(64)}`,
    env_provider_id: "repo-harness/0.0.0/ws-test",
    ...overrides,
  };
}

function seedGenesis(repoRoot: string, worktreeId = "fixture"): void {
  appendGenesisRecord(repoRoot, LEDGER_EPOCH_START_SHA, { worktreeId });
}

/**
 * Directly appends a real event via the EPC-01 writer (read-only import),
 * mirroring `tests/evidence-checks-materializer.test.ts`'s own low-level
 * ledger fixture style so this file holds precise, independent control over
 * worktree_id / event_type / trust_class / subject_hash / supersedes.
 */
function seedEvent(
  repoRoot: string,
  opts: {
    readonly worktreeId?: string;
    readonly eventType?: string;
    readonly trustClass?: TrustClass;
    readonly subjectHash?: string;
    readonly supersedes?: readonly string[];
    readonly marker?: string;
  } = {},
): EvidenceEventRecord {
  return appendEvidenceEvent(repoRoot, {
    worktreeId: opts.worktreeId ?? "fixture",
    eventType: opts.eventType ?? "verify_sprint.result",
    trustClass: opts.trustClass ?? "authoritative_machine",
    producer: "verify-sprint",
    correlationRunId: `run-${Math.random().toString(36).slice(2)}`,
    subjectIdentity: baseIdentity({ subject_hash: opts.subjectHash ?? SUBJECT_A }),
    supersedes: opts.supersedes,
    payload: { kind: "json", value: { marker: opts.marker ?? "default" } },
  });
}

describe("checkpoint: pure projection determinism", () => {
  test("two independent folds of the same accepted set produce byte-identical machine JSON and human view", () => {
    withTempRepo("checkpoint-determinism", (repoRoot) => {
      seedGenesis(repoRoot);
      seedEvent(repoRoot, { marker: "one" });
      seedEvent(repoRoot, { eventType: "post_bash.result", trustClass: "observed", marker: "two" });

      const first = readAcceptedEvents(repoRoot);
      const second = readAcceptedEvents(repoRoot);
      expect(first.accepted).toEqual(second.accepted);

      const projectionA = buildCheckpointProjection({ worktreeId: "fixture", now: FIXED_NOW }, first.accepted);
      const projectionB = buildCheckpointProjection({ worktreeId: "fixture", now: FIXED_NOW }, second.accepted);

      expect(JSON.stringify(projectionA)).toBe(JSON.stringify(projectionB));
      expect(renderCheckpointMarkdown(projectionA)).toBe(renderCheckpointMarkdown(projectionB));
      expect(projectionA.checkpoint_id).toBe(projectionB.checkpoint_id);
    });
  });

  test("a different accepted set produces a different content-addressed checkpoint_id", () => {
    withTempRepo("checkpoint-content-addressing", (repoRoot) => {
      seedGenesis(repoRoot);
      const { accepted: emptySet } = readAcceptedEvents(repoRoot);
      const emptyProjection = buildCheckpointProjection({ worktreeId: "fixture", now: FIXED_NOW }, emptySet);

      seedEvent(repoRoot, { marker: "changes-the-set" });
      const { accepted: nonEmptySet } = readAcceptedEvents(repoRoot);
      const nonEmptyProjection = buildCheckpointProjection({ worktreeId: "fixture", now: FIXED_NOW }, nonEmptySet);

      expect(emptyProjection.checkpoint_id).not.toBe(nonEmptyProjection.checkpoint_id);
      expect(emptyProjection.covered_event_count).toBe(0);
      expect(emptyProjection.covered_events).toEqual([]);
    });
  });

  test("provenance carries the complete frozen D8 field list, self-consistent and self-referential", () => {
    withTempRepo("checkpoint-provenance", (repoRoot) => {
      seedGenesis(repoRoot, "fixture-worktree");
      const event = seedEvent(repoRoot, { marker: "provenance-check" });
      const { accepted } = readAcceptedEvents(repoRoot);

      const projection = buildCheckpointProjection({ worktreeId: "fixture-worktree", now: FIXED_NOW }, accepted);
      const { provenance } = projection;

      expect(provenance.schema_version).toBe(1);
      expect(provenance.generated_at).toBe("2026-07-22T22:00:00.000Z");
      expect(typeof provenance.materializer_version).toBe("string");
      expect(provenance.materializer_version.length).toBeGreaterThan(0);
      expect(provenance.source_event_ids).toEqual([event.event_id]);
      // Self-referential: a checkpoint's own provenance points at itself,
      // never a prior checkpoint (this row never chains checkpoints).
      expect(provenance.source_checkpoint_id).toBe(projection.checkpoint_id);
      // Whole-ledger snapshot, not filtered to one subject/contract (see
      // src/core/evidence/checkpoint.ts module doc).
      expect(provenance.subject_hash).toBeNull();
      expect(provenance.contract_id).toBeNull();
      expect(provenance.worktree_id).toBe("fixture-worktree");
      expect(provenance.content_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(projection.checkpoint_id).toBe(`chk-${provenance.content_hash.slice("sha256:".length)}`);
    });
  });

  test("supersedes exclusion is honored: a superseded event is not covered by the checkpoint", () => {
    withTempRepo("checkpoint-supersedes", (repoRoot) => {
      seedGenesis(repoRoot);
      const superseded = seedEvent(repoRoot, { marker: "superseded" });
      const winner = seedEvent(repoRoot, { marker: "superseding", supersedes: [superseded.event_id] });

      const { accepted } = readAcceptedEvents(repoRoot);
      const projection = buildCheckpointProjection({ worktreeId: "fixture", now: FIXED_NOW }, accepted);

      const coveredIds = projection.covered_events.map((entry) => entry.event_id);
      expect(coveredIds).toEqual([winner.event_id]);
      expect(coveredIds).not.toContain(superseded.event_id);
      expect(projection.provenance.source_event_ids).toEqual([winner.event_id]);
    });
  });

  test("latest_by_event_type keeps only the most recent accepted event per type, sorted by event_type", () => {
    withTempRepo("checkpoint-latest-by-type", (repoRoot) => {
      seedGenesis(repoRoot);
      seedEvent(repoRoot, { eventType: "verify_sprint.result", marker: "verify-v1" });
      const verifyLatest = seedEvent(repoRoot, { eventType: "verify_sprint.result", marker: "verify-v2" });
      const bashLatest = seedEvent(repoRoot, { eventType: "post_bash.result", trustClass: "observed", marker: "bash-v1" });

      const { accepted } = readAcceptedEvents(repoRoot);
      const projection = buildCheckpointProjection({ worktreeId: "fixture", now: FIXED_NOW }, accepted);

      expect(projection.latest_by_event_type).toEqual([
        {
          event_type: "post_bash.result",
          event_id: bashLatest.event_id,
          trust_class: "observed",
          subject_hash: SUBJECT_A,
          created_at: bashLatest.created_at,
        },
        {
          event_type: "verify_sprint.result",
          event_id: verifyLatest.event_id,
          trust_class: "authoritative_machine",
          subject_hash: SUBJECT_A,
          created_at: verifyLatest.created_at,
        },
      ]);
    });
  });
});

describe("checkpoint-store: staged-install atomicity", () => {
  test("a corrupt (unparseable) stage is rejected, the marker is unmoved, and the prior checkpoint stays resolvable", () => {
    withTempRepo("checkpoint-atomicity-unparseable", (repoRoot) => {
      seedGenesis(repoRoot);
      seedEvent(repoRoot, { marker: "prior" });
      const priorResult = publishCheckpointFromLedger(repoRoot, FIXED_NOW);
      expect(priorResult.status).toBe("published");
      if (priorResult.status !== "published") return;
      const markerBefore = readFileSync(resolveCheckpointMarkerPath(repoRoot), "utf-8");

      const rejected = publishCheckpoint({
        repoRoot,
        checkpointId: "chk-deadbeef",
        machineJson: "{ not valid json",
        humanMarkdown: "irrelevant",
      });
      expect(rejected.status).toBe("rejected");
      if (rejected.status !== "rejected") return;
      expect(rejected.reason).toBe("machine-json-unparseable");

      const markerAfter = readFileSync(resolveCheckpointMarkerPath(repoRoot), "utf-8");
      expect(markerAfter).toBe(markerBefore);
      const resolved = resolveLastPublishedCheckpoint(repoRoot);
      expect(resolved.found).toBe(true);
      if (!resolved.found) return;
      expect(resolved.resolved.checkpointId).toBe(priorResult.checkpointId);
      expect(existsSync(join(resolveCheckpointsDir(repoRoot), "chk-deadbeef"))).toBe(false);
    });
  });

  test("a schema-incomplete stage (missing provenance) is rejected without touching the marker", () => {
    withTempRepo("checkpoint-atomicity-schema", (repoRoot) => {
      seedGenesis(repoRoot);
      seedEvent(repoRoot, { marker: "prior" });
      const prior = publishCheckpointFromLedger(repoRoot, FIXED_NOW);
      expect(prior.status).toBe("published");
      if (prior.status !== "published") return;

      const rejected = publishCheckpoint({
        repoRoot,
        checkpointId: "chk-incomplete",
        machineJson: JSON.stringify({ schema: "repo-harness-checkpoint.v1", checkpoint_id: "chk-incomplete" }),
        humanMarkdown: "irrelevant",
      });
      expect(rejected).toEqual({ status: "rejected", reason: "schema-incomplete", detail: expect.any(String) });

      const resolved = resolveLastPublishedCheckpoint(repoRoot);
      expect(resolved.found && resolved.resolved.checkpointId).toBe(prior.checkpointId);
    });
  });

  test("a content_hash mismatch (tampered body) is rejected without touching the marker", () => {
    withTempRepo("checkpoint-atomicity-hash", (repoRoot) => {
      seedGenesis(repoRoot);
      const event = seedEvent(repoRoot, { marker: "prior" });
      const { accepted } = readAcceptedEvents(repoRoot);
      const projection = buildCheckpointProjection({ worktreeId: "fixture", now: FIXED_NOW }, accepted);
      const prior = publishCheckpoint({
        repoRoot,
        checkpointId: projection.checkpoint_id,
        machineJson: `${JSON.stringify(projection, null, 2)}\n`,
        humanMarkdown: renderCheckpointMarkdown(projection),
      });
      expect(prior.status).toBe("published");

      const tampered = { ...projection, covered_event_count: 999 };
      const rejected = publishCheckpoint({
        repoRoot,
        checkpointId: projection.checkpoint_id,
        machineJson: `${JSON.stringify(tampered, null, 2)}\n`,
        humanMarkdown: renderCheckpointMarkdown(projection),
      });
      expect(rejected.status).toBe("rejected");
      if (rejected.status !== "rejected") return;
      expect(["content-hash-mismatch", "checkpoint-id-mismatch"]).toContain(rejected.reason);

      const resolved = resolveLastPublishedCheckpoint(repoRoot);
      expect(resolved.found && resolved.resolved.projection.covered_event_count).toBe(1);
      void event;
    });
  });

  test("a human-view mismatch (does not re-derive byte-identically) is rejected without touching the marker", () => {
    withTempRepo("checkpoint-atomicity-human-view", (repoRoot) => {
      seedGenesis(repoRoot);
      seedEvent(repoRoot, { marker: "prior" });
      const { accepted } = readAcceptedEvents(repoRoot);
      const projection = buildCheckpointProjection({ worktreeId: "fixture", now: FIXED_NOW }, accepted);

      const rejected = publishCheckpoint({
        repoRoot,
        checkpointId: projection.checkpoint_id,
        machineJson: `${JSON.stringify(projection, null, 2)}\n`,
        humanMarkdown: "# not the real derived view\n",
      });
      expect(rejected).toEqual({ status: "rejected", reason: "human-view-mismatch", detail: expect.any(String) });
      expect(resolveLastPublishedCheckpoint(repoRoot)).toEqual({ found: false });
      expect(existsSync(resolveCheckpointsDir(repoRoot))).toBe(true);
      expect(readdirSync(resolveCheckpointsDir(repoRoot)).filter((name) => name !== ".staging")).toEqual([]);
    });
  });
});

describe("checkpoint-store: simulated crash sequences", () => {
  test("stage-only debris (crash before validation/rename) leaves the prior published checkpoint resolvable", () => {
    withTempRepo("checkpoint-crash-stage-only", (repoRoot) => {
      seedGenesis(repoRoot);
      seedEvent(repoRoot, { marker: "prior" });
      const prior = publishCheckpointFromLedger(repoRoot, FIXED_NOW);
      expect(prior.status).toBe("published");
      if (prior.status !== "published") return;

      // Simulate a crash that only completed the "write bytes into staging"
      // step -- never validated, never renamed, never touched the marker.
      const staging = join(resolveCheckpointsDir(repoRoot), ".staging", "stage-crashed");
      mkdirSync(staging, { recursive: true });
      writeFileSync(join(staging, CHECKPOINT_MACHINE_FILENAME), "{ incomplete");
      writeFileSync(join(staging, CHECKPOINT_HUMAN_FILENAME), "# incomplete\n");

      const resolved = resolveLastPublishedCheckpoint(repoRoot);
      expect(resolved.found).toBe(true);
      if (!resolved.found) return;
      expect(resolved.resolved.checkpointId).toBe(prior.checkpointId);
    });
  });

  test("a fully renamed-into-place checkpoint whose marker update never ran has zero effect on resolution", () => {
    withTempRepo("checkpoint-crash-renamed-no-marker", (repoRoot) => {
      seedGenesis(repoRoot);
      seedEvent(repoRoot, { marker: "prior" });
      const prior = publishCheckpointFromLedger(repoRoot, FIXED_NOW);
      expect(prior.status).toBe("published");
      if (prior.status !== "published") return;

      // Simulate a crash strictly between "rename checkpoint content into
      // place" and "update the marker": construct a second, fully valid,
      // fully-in-place checkpoint directory directly (never going through
      // `publishCheckpoint`, so the marker is never touched).
      seedEvent(repoRoot, { marker: "never-marked" });
      const { accepted } = readAcceptedEvents(repoRoot);
      const neverMarked = buildCheckpointProjection({ worktreeId: "fixture", now: FIXED_NOW }, accepted);
      expect(neverMarked.checkpoint_id).not.toBe(prior.checkpointId);
      const neverMarkedDir = join(resolveCheckpointsDir(repoRoot), neverMarked.checkpoint_id);
      mkdirSync(neverMarkedDir, { recursive: true });
      writeFileSync(join(neverMarkedDir, CHECKPOINT_MACHINE_FILENAME), `${JSON.stringify(neverMarked, null, 2)}\n`);
      writeFileSync(join(neverMarkedDir, CHECKPOINT_HUMAN_FILENAME), renderCheckpointMarkdown(neverMarked));

      // The marker is the sole authority -- a fully-formed, unlinked
      // checkpoint directory must never be picked up by a directory scan.
      const resolved = resolveLastPublishedCheckpoint(repoRoot);
      expect(resolved.found).toBe(true);
      if (!resolved.found) return;
      expect(resolved.resolved.checkpointId).toBe(prior.checkpointId);
      expect(resolved.resolved.checkpointId).not.toBe(neverMarked.checkpoint_id);
    });
  });
});

describe("checkpoint-store: human view is never authoritative", () => {
  test("a hand-edited published human view is fully overwritten by the next publish of the same accepted set", () => {
    withTempRepo("checkpoint-hand-edit-overwrite", (repoRoot) => {
      seedGenesis(repoRoot);
      seedEvent(repoRoot, { marker: "stable" });
      const first = publishCheckpointFromLedger(repoRoot, FIXED_NOW);
      expect(first.status).toBe("published");
      if (first.status !== "published") return;

      const resolvedFirst = resolveLastPublishedCheckpoint(repoRoot);
      expect(resolvedFirst.found).toBe(true);
      if (!resolvedFirst.found) return;
      const humanPath = join(repoRoot, resolvedFirst.resolved.humanPath);
      writeFileSync(humanPath, "# hand-edited -- do not trust me\n");
      expect(readFileSync(humanPath, "utf-8")).toContain("do not trust me");

      // Republish the exact same accepted set (same checkpoint_id): the
      // store must detect the tampered human view (it no longer re-derives
      // byte-identically) and fully replace it.
      const second = publishCheckpointFromLedger(repoRoot, FIXED_NOW);
      expect(second.status).toBe("published");
      if (second.status !== "published") return;
      expect(second.checkpointId).toBe(first.checkpointId);

      const afterRepublish = readFileSync(humanPath, "utf-8");
      expect(afterRepublish).not.toContain("do not trust me");
      const resolvedSecond = resolveLastPublishedCheckpoint(repoRoot);
      expect(resolvedSecond.found).toBe(true);
      if (!resolvedSecond.found) return;
      expect(resolvedSecond.resolved.humanView).toBe(afterRepublish);
      expect(resolvedSecond.resolved.humanView).toBe(renderCheckpointMarkdown(resolvedSecond.resolved.projection));
    });
  });
});

describe("checkpoint-store: marker fail-closed", () => {
  test("no marker at all is a benign not-found, never an error", () => {
    withTempRepo("checkpoint-marker-absent", (repoRoot) => {
      expect(resolveLastPublishedCheckpoint(repoRoot)).toEqual({ found: false });
    });
  });

  test("a marker pointing at a missing checkpoint fails closed with a typed error", () => {
    withTempRepo("checkpoint-marker-dangling", (repoRoot) => {
      seedGenesis(repoRoot);
      seedEvent(repoRoot, { marker: "will-be-deleted" });
      const published = publishCheckpointFromLedger(repoRoot, FIXED_NOW);
      expect(published.status).toBe("published");
      if (published.status !== "published") return;

      rmSync(join(resolveCheckpointsDir(repoRoot), published.checkpointId), { recursive: true, force: true });

      expect(() => resolveLastPublishedCheckpoint(repoRoot)).toThrow(CheckpointResolutionError);
      try {
        resolveLastPublishedCheckpoint(repoRoot);
        throw new Error("expected resolveLastPublishedCheckpoint to throw");
      } catch (error) {
        expect(error).toBeInstanceOf(CheckpointResolutionError);
        expect((error as InstanceType<typeof CheckpointResolutionError>).reason).toBe("checkpoint-missing");
      }
    });
  });

  test("a malformed marker JSON fails closed with a typed error", () => {
    withTempRepo("checkpoint-marker-malformed", (repoRoot) => {
      const markerPath = resolveCheckpointMarkerPath(repoRoot);
      mkdirSync(dirname(markerPath), { recursive: true });
      writeFileSync(markerPath, "{ not json");
      expect(() => resolveLastPublishedCheckpoint(repoRoot)).toThrow(CheckpointResolutionError);
      try {
        resolveLastPublishedCheckpoint(repoRoot);
      } catch (error) {
        expect((error as InstanceType<typeof CheckpointResolutionError>).reason).toBe("marker-malformed");
      }
    });
  });
});

describe("checkpoint-store: cannot-bind discipline", () => {
  test("a worktree with no ledger (no genesis) is skipped quietly -- nothing is written", () => {
    withTempRepo("checkpoint-no-ledger", (repoRoot) => {
      const result = publishCheckpointFromLedger(repoRoot, FIXED_NOW);
      expect(result).toEqual({ status: "skipped", reason: "no-ledger" });
      expect(existsSync(join(repoRoot, CHECKPOINTS_DIR_RELATIVE))).toBe(false);
    });
  });

  test("a genesis with zero accepted events still publishes a valid, empty checkpoint", () => {
    withTempRepo("checkpoint-empty-accepted-set", (repoRoot) => {
      seedGenesis(repoRoot);
      const result = publishCheckpointFromLedger(repoRoot, FIXED_NOW);
      expect(result.status).toBe("published");
      const resolved = resolveLastPublishedCheckpoint(repoRoot);
      expect(resolved.found).toBe(true);
      if (!resolved.found) return;
      expect(resolved.resolved.projection.covered_event_count).toBe(0);
      expect(resolved.resolved.projection.covered_events).toEqual([]);
      expect(resolved.resolved.projection.provenance.source_event_ids).toEqual([]);
    });
  });
});

describe("checkpoint-store: live-ish integration (EPC-01 fixture ledger -> publish -> read back)", () => {
  test("a fixture ledger built through the real EPC-01 API publishes a checkpoint whose provenance resolves to the accepted events", () => {
    withTempRepo("checkpoint-live-integration", (repoRoot) => {
      seedGenesis(repoRoot, "live-fixture");
      const eventOne = seedEvent(repoRoot, { subjectHash: SUBJECT_A, marker: "first" });
      const eventTwo = seedEvent(repoRoot, { subjectHash: SUBJECT_B, eventType: "post_bash.result", trustClass: "observed", marker: "second" });

      const publishResult = publishCheckpointFromLedger(repoRoot);
      expect(publishResult.status).toBe("published");
      if (publishResult.status !== "published") return;

      const resolved = resolveLastPublishedCheckpoint(repoRoot);
      expect(resolved.found).toBe(true);
      if (!resolved.found) return;

      expect(resolved.resolved.checkpointId).toBe(publishResult.checkpointId);
      const { projection } = resolved.resolved;
      expect([...projection.provenance.source_event_ids].sort()).toEqual([eventOne.event_id, eventTwo.event_id].sort());
      expect(projection.covered_event_count).toBe(2);
      const coveredIds = projection.covered_events.map((entry) => entry.event_id).sort();
      expect(coveredIds).toEqual([eventOne.event_id, eventTwo.event_id].sort());
      expect(projection.provenance.worktree_id).toBe("live-fixture");

      // Every source_event_id the checkpoint claims must resolve to a real,
      // still-accepted ledger event (the live-readback proof point).
      const { accepted } = readAcceptedEvents(repoRoot);
      const acceptedIds = new Set(accepted.map((event) => event.event_id));
      for (const id of projection.provenance.source_event_ids) {
        expect(acceptedIds.has(id)).toBe(true);
      }
    });
  });

  test("re-running Stop's own publish call twice in a row is idempotent for an unchanged ledger", () => {
    withTempRepo("checkpoint-idempotent-republish", (repoRoot) => {
      seedGenesis(repoRoot);
      seedEvent(repoRoot, { marker: "stable" });

      const first = publishCheckpointFromLedger(repoRoot, FIXED_NOW);
      const second = publishCheckpointFromLedger(repoRoot, FIXED_NOW);
      expect(first.status).toBe("published");
      expect(second.status).toBe("published");
      if (first.status !== "published" || second.status !== "published") return;
      expect(second.checkpointId).toBe(first.checkpointId);
      expect(second.idempotent).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Never-read-back sweep: the human-view filename must never be referenced by
// any reader outside this store's own write path.
// ---------------------------------------------------------------------------
describe("checkpoint-store: human view filename is never read back", () => {
  const STORE_MODULE = "src/effects/evidence/checkpoint-store.ts";

  function listFiles(dir: string, exts: readonly string[]): string[] {
    const out: string[] = [];
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return out;
    }
    for (const entry of entries) {
      const abs = join(dir, entry);
      const stat = statSync(abs);
      if (stat.isDirectory()) out.push(...listFiles(abs, exts));
      else if (exts.some((ext) => entry.endsWith(ext))) out.push(abs);
    }
    return out;
  }

  test("no file under src/ or scripts/ (outside the store's own write path) references the human-view filename", () => {
    const roots = [
      { dir: join(REPO_ROOT, "src"), exts: [".ts"] },
      { dir: join(REPO_ROOT, "scripts"), exts: [".ts", ".sh"] },
    ];
    const offenders: string[] = [];
    for (const root of roots) {
      for (const absPath of listFiles(root.dir, root.exts)) {
        const relPath = absPath.slice(REPO_ROOT.length + 1);
        if (relPath === STORE_MODULE) continue;
        const content = readFileSync(absPath, "utf-8");
        if (content.includes(CHECKPOINT_HUMAN_FILENAME)) offenders.push(relPath);
      }
    }
    expect(offenders).toEqual([]);
  });
});
