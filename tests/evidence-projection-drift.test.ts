/**
 * EPC-09 Program closeout, Goal 1: cross-package projection-drift check.
 *
 * Every EPC-05/06/07/08 canonical projection (materialized checks/latest,
 * the EPC-06 checkpoint machine/human views, the EPC-07 recovery views,
 * tracked tasks/current.md) claims to be a deterministic recomputation from
 * declared sources (the evidence ledger, or -- for tasks/current.md -- the
 * repo's own tracked workflow artifacts). This suite recomputes each
 * projection independently, through the SAME public pure builders/readers
 * those packages already export (read-only imports; nothing here edits an
 * EPC-01..08 module), and byte/hash-compares the recomputation against the
 * published artifact. Green here means zero drift; any failure is a defect
 * of the EARLIER package's surface (R5), reported for a follow-up there,
 * never silently patched in this package.
 */
import { describe, expect, test } from "bun:test";
import { createHash } from "crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";

import type { JsonValue, SubjectIdentity, TrustClass } from "../src/core/evidence/types";
import { appendEvidenceEvent, appendGenesisRecord, readAcceptedEvents } from "../src/effects/evidence/event-log";
import { LEDGER_EPOCH_START_SHA } from "../src/effects/evidence/epoch";
import { buildCheckpointProjection, renderCheckpointMarkdown } from "../src/core/evidence/checkpoint";
import {
  CHECKPOINTS_DIR_RELATIVE,
  publishCheckpointFromLedger,
  resolveLastPublishedCheckpoint,
} from "../src/effects/evidence/checkpoint-store";
import { materializeRecoveryViews } from "../src/effects/evidence/recovery-materializer";
import { buildChecksLatestProjection, type MaterializeChecksLatestInput } from "../src/effects/evidence/checks-materializer";
import { canonicalize } from "../src/core/evidence/canonical-json";

const REPO_ROOT = join(import.meta.dir, "..");
const SUBJECT_A = `sha256:${"a".repeat(64)}`;
const FIXED_NOW = () => new Date("2026-07-23T02:00:00.000Z");

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

function seedGenesis(repoRoot: string, worktreeId = "drift-fixture"): void {
  appendGenesisRecord(repoRoot, LEDGER_EPOCH_START_SHA, { worktreeId });
}

function seedEvent(
  repoRoot: string,
  opts: {
    readonly worktreeId?: string;
    readonly contractPath?: string;
    readonly eventType?: string;
    readonly trustClass?: TrustClass;
    readonly subjectHash?: string;
    readonly contractHash?: string;
    readonly runTraceMarker?: string;
    readonly marker?: string;
  } = {},
) {
  return appendEvidenceEvent(repoRoot, {
    worktreeId: opts.worktreeId ?? "drift-fixture",
    eventType: opts.eventType ?? "verify_sprint.result",
    trustClass: opts.trustClass ?? "authoritative_machine",
    producer: "verify-sprint",
    correlationRunId: `run-${Math.random().toString(36).slice(2)}`,
    subjectIdentity: baseIdentity({
      subject_hash: opts.subjectHash ?? SUBJECT_A,
      contract_hash: opts.contractHash ?? `sha256:${"f".repeat(64)}`,
    }),
    payload: {
      kind: "json",
      value: {
        status: "pass",
        counts: {},
        run_snapshot_id: "run-drift-fixture",
        run_trace: {
          schema: "repo-harness-run-trace.v1",
          status: "pass",
          contract: { file: opts.contractPath ?? "tasks/contracts/drift-fixture.contract.md", status: "pass" },
          marker: opts.runTraceMarker ?? opts.marker ?? "default",
        },
      },
    },
  });
}

function run(cmd: string, args: string[], cwd: string) {
  return spawnSync(cmd, args, { cwd, encoding: "utf-8" });
}

function contentHashOf(consumerFacing: Record<string, unknown>): string {
  return `sha256:${createHash("sha256").update(canonicalize(consumerFacing as any)).digest("hex")}`;
}

// ---------------------------------------------------------------------------
// Checkpoint machine/human views (EPC-06)
// ---------------------------------------------------------------------------
describe("projection drift: checkpoint machine/human views", () => {
  test("fixture ledger: re-folding the accepted set and re-rendering reproduces the published checkpoint byte-for-byte via the store reader", () => {
    withTempRepo("drift-checkpoint-fixture", (repoRoot) => {
      seedGenesis(repoRoot);
      seedEvent(repoRoot, { marker: "one" });
      seedEvent(repoRoot, { eventType: "post_bash.result", trustClass: "observed", marker: "two" });

      const published = publishCheckpointFromLedger(repoRoot, FIXED_NOW);
      expect(published.status).toBe("published");
      if (published.status !== "published") return;

      const resolved = resolveLastPublishedCheckpoint(repoRoot);
      expect(resolved.found).toBe(true);
      if (!resolved.found) return;

      // Recompute independently from the SAME declared source (the ledger's
      // own accepted-event fold), never from the resolved/published bytes.
      const { accepted } = readAcceptedEvents(repoRoot);
      const recomputed = buildCheckpointProjection({ worktreeId: "drift-fixture", now: FIXED_NOW }, accepted);
      const recomputedMarkdown = renderCheckpointMarkdown(recomputed);

      expect(recomputed.checkpoint_id).toBe(resolved.resolved.checkpointId);
      expect(JSON.stringify(recomputed)).toBe(JSON.stringify(resolved.resolved.projection));
      expect(recomputedMarkdown).toBe(resolved.resolved.humanView);
    });
  });

  test("this worktree's own live checkpoint, when one has been published, recomputes byte-identically from its own declared source events", () => {
    const markerPath = join(REPO_ROOT, CHECKPOINTS_DIR_RELATIVE, "last-published.json");
    if (!existsSync(markerPath)) {
      // No checkpoint has been published in THIS worktree yet (e.g. no Stop
      // has run this session) -- the fixture test above already proves the
      // recompute-vs-store-reader property; nothing live to compare here.
      // Confirm the resolver itself agrees nothing is published (never a
      // fabricated claim), rather than skipping silently.
      expect(resolveLastPublishedCheckpoint(REPO_ROOT)).toEqual({ found: false });
      return;
    }

    const resolved = resolveLastPublishedCheckpoint(REPO_ROOT);
    expect(resolved.found).toBe(true);
    if (!resolved.found) return;
    const { projection, humanView, checkpointId } = resolved.resolved;

    // The live ledger may have grown since this checkpoint was published
    // (new events appended before the next Stop republishes) -- that is
    // normal staleness, not drift. Drift means: given EXACTLY the event set
    // this checkpoint declares it covered (its own source_event_ids), does
    // re-running the pure builder reproduce the exact published bytes.
    const coveredIds = new Set(projection.provenance.source_event_ids);
    const { accepted: currentAccepted } = readAcceptedEvents(REPO_ROOT);
    const historicalAccepted = currentAccepted.filter((event) => coveredIds.has(event.event_id));
    expect(historicalAccepted.length).toBe(projection.covered_event_count);

    const recomputed = buildCheckpointProjection(
      { worktreeId: projection.worktree_id, now: () => new Date(projection.provenance.generated_at) },
      historicalAccepted,
    );
    expect(recomputed.checkpoint_id).toBe(checkpointId);
    expect(JSON.stringify(recomputed)).toBe(JSON.stringify(projection));
    expect(renderCheckpointMarkdown(recomputed)).toBe(humanView);
  });
});

// ---------------------------------------------------------------------------
// Recovery views (EPC-07): handoff + resume, single hop from the checkpoint
// ---------------------------------------------------------------------------
describe("projection drift: recovery views (checkpoint -> handoff/resume)", () => {
  test("fixture ledger: re-materializing from the same published checkpoint and the same context inputs reproduces byte-identical handoff/resume, and the rendered evidence resolves to the real checkpoint", () => {
    withTempRepo("drift-recovery-fixture", (repoRoot) => {
      mkdirSync(join(repoRoot, ".ai/harness"), { recursive: true });
      writeFileSync(join(repoRoot, ".ai/harness/policy.json"), "{}\n");
      seedGenesis(repoRoot);
      const event = seedEvent(repoRoot, { marker: "recovery-drift" });
      const published = publishCheckpointFromLedger(repoRoot, FIXED_NOW);
      expect(published.status).toBe("published");
      if (published.status !== "published") return;

      const env = { HOOK_RUN_ID: "drift-fixed-run" };
      const resultA = materializeRecoveryViews(repoRoot, null, env, { reason: "drift-check", now: FIXED_NOW });
      const resultB = materializeRecoveryViews(repoRoot, null, env, { reason: "drift-check", now: FIXED_NOW });

      expect(resultA.handoff).toBe(resultB.handoff);
      expect(resultA.resume).toBe(resultB.resume);

      // The rendered claim must resolve to the REAL checkpoint just
      // published, not a fabricated or stale evidence block.
      expect(resultA.evidence.available).toBe(true);
      if (!resultA.evidence.available) return;
      expect(resultA.evidence.checkpointId).toBe(published.checkpointId);
      expect(resultA.evidence.sourceEventIds).toEqual([event.event_id]);
      expect(resultA.handoff).toContain(`- Checkpoint: ${published.checkpointId}`);
      expect(resultA.handoff).toContain(`verify_sprint.result: ${event.event_id}`);
      expect(resultA.resume).toContain("<!-- generated-by: repo-harness codex-handoff-resume v1 -->");
    });
  });

  test("no checkpoint published yet recomputes to the same typed unavailable state on every call -- never a fabricated evidence claim", () => {
    withTempRepo("drift-recovery-no-checkpoint", (repoRoot) => {
      mkdirSync(join(repoRoot, ".ai/harness"), { recursive: true });
      writeFileSync(join(repoRoot, ".ai/harness/policy.json"), "{}\n");
      const env = {};
      const resultA = materializeRecoveryViews(repoRoot, null, env, { reason: "drift-check", now: FIXED_NOW });
      const resultB = materializeRecoveryViews(repoRoot, null, env, { reason: "drift-check", now: FIXED_NOW });
      expect(resultA.evidence).toEqual({ available: false, reason: "no-checkpoint" });
      expect(resultA.handoff).toBe(resultB.handoff);
      expect(resultA.resume).toBe(resultB.resume);
    });
  });
});

// ---------------------------------------------------------------------------
// Materialized checks/latest (EPC-05)
// ---------------------------------------------------------------------------
describe("projection drift: materialized checks/latest", () => {
  test("fixture ledger: re-selecting via the pure builder from the same accepted set reproduces byte-identical output, and provenance.content_hash is self-consistent", () => {
    withTempRepo("drift-checks-latest-fixture", (repoRoot) => {
      mkdirSync(join(repoRoot, "tasks/contracts"), { recursive: true });
      const contractPath = "tasks/contracts/drift-fixture.contract.md";
      const contractText = "# Task Contract: fixture\n";
      writeFileSync(join(repoRoot, contractPath), contractText);
      seedGenesis(repoRoot);
      seedEvent(repoRoot, {
        contractHash: `sha256:${createHash("sha256").update(contractText).digest("hex")}`,
        runTraceMarker: "checks-latest-drift",
      });

      const input: MaterializeChecksLatestInput = {
        repoRoot,
        contractPath,
        worktreeId: "drift-fixture",
        subjectHash: SUBJECT_A,
        now: FIXED_NOW,
      };

      const { accepted: acceptedA } = readAcceptedEvents(repoRoot);
      const projectionA = buildChecksLatestProjection(input, acceptedA, contractText);
      const { accepted: acceptedB } = readAcceptedEvents(repoRoot);
      const projectionB = buildChecksLatestProjection(input, acceptedB, contractText);

      expect(JSON.stringify(projectionA)).toBe(JSON.stringify(projectionB));

      const { provenance, ...consumerFacing } = projectionA;
      expect(contentHashOf(consumerFacing)).toBe(provenance.content_hash);
    });
  });

  test("this worktree's own live checks/latest.json, when it carries a real materialized projection, is provenance.content_hash self-consistent", () => {
    const checksPath = join(REPO_ROOT, ".ai/harness/checks/latest.json");
    if (!existsSync(checksPath)) return;
    const raw = readFileSync(checksPath, "utf-8");
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    if (parsed === null || typeof parsed !== "object" || !("provenance" in parsed)) {
      // A guarded only-if-absent `{}` seed (EPC-05 Finding 3, a non-ledger
      // first-writer, accepted intermediate state) or otherwise non-
      // materialized content -- not a projection this drift check applies
      // to; nothing to recompute against.
      return;
    }
    const { provenance, ...consumerFacing } = parsed as { provenance: { content_hash: string } };
    expect(contentHashOf(consumerFacing)).toBe(provenance.content_hash);
  });

  // -------------------------------------------------------------------------
  // Regression: verify-sprint's post-acceptance finalize overlay re-ingests a
  // materialized projection as if it were a run trace. `provenance` is
  // materializer-owned derived metadata; when it rides along in the payload,
  // the next materialization records `content_hash = sha256(run trace INCLUDING
  // the previous provenance)` while publishing a file whose consumer-facing
  // content excludes it, and the live check above goes red. The shipped
  // overlay must therefore hand the materializer a provenance-free run trace.
  // -------------------------------------------------------------------------
  const VERIFY_SPRINT_PATH = join(REPO_ROOT, "scripts/verify-sprint.sh");

  /**
   * Extracts the exact jq program `finalize_prepared_acceptance()` runs, so the
   * test below exercises the shipped filter instead of a copy of it that could
   * silently drift. Bounded by the overlay's own unique invocation tail, in the
   * same read-the-real-source style as the no-independent-authoring test in
   * tests/evidence-checks-materializer.test.ts. The packaged
   * assets/templates/helpers/verify-sprint.sh mirror is covered by the helper
   * projection check (`bun scripts/sync-helper-sources.ts --check`).
   */
  function readFinalizeOverlayProgram(): string {
    const source = readFileSync(VERIFY_SPRINT_PATH, "utf-8");
    const tail = source.indexOf(`' "$prepared_run_file" > "$finalized_checks"`);
    expect(tail).toBeGreaterThan(-1);
    const head = source.slice(0, tail);
    const open = head.lastIndexOf("\n    '\n");
    expect(open).toBeGreaterThan(-1);
    return head.slice(open + "\n    '\n".length);
  }

  const OVERLAY_ARGS = {
    reviewer: "Claude",
    source: "claude-review",
    disposition: "external_pass",
    message: "recorded",
  } as const;

  /** A run trace shaped like the one --prepare-acceptance freezes: the overlay
   * rewrites `.guards[]`, so the fixture has to carry a real guard list. */
  function preparedRunTrace(contractPath: string): Record<string, JsonValue> {
    return {
      schema: "repo-harness-run-trace.v1",
      source: "verify-sprint",
      status: "pass",
      exit_code: 0,
      review_subject_sha256: SUBJECT_A,
      lifecycle: { snapshot: ".ai/harness/runs/run-drift-overlay.json" },
      contract: { file: contractPath, status: "pass" },
      commands: [{
        name: "bun test real-server-longpoll-stall-dedup",
        command: "bun test real-server-longpoll-stall-dedup",
        status: "pass",
        exit_code: 0,
      }],
      guards: [
        { name: "acceptance_receipt", status: "unsatisfied" },
        { name: "allowed_paths_check", status: "pass" },
      ],
      next_step: "record acceptance",
    };
  }

  function seedRunTraceEvent(repoRoot: string, contractHash: string, runTrace: JsonValue) {
    return appendEvidenceEvent(repoRoot, {
      worktreeId: "drift-fixture",
      eventType: "verify_sprint.result",
      trustClass: "authoritative_machine",
      producer: "verify-sprint",
      correlationRunId: `run-${Math.random().toString(36).slice(2)}`,
      subjectIdentity: baseIdentity({ subject_hash: SUBJECT_A, contract_hash: contractHash }),
      payload: {
        kind: "json",
        value: { status: "pass", counts: {}, run_snapshot_id: "run-drift-overlay", run_trace: runTrace },
      },
    });
  }

  test("the shipped finalizer replays the immutable run snapshot and skips an already-finalized receipt", () => {
    const source = readFileSync(VERIFY_SPRINT_PATH, "utf-8");
    const program = readFinalizeOverlayProgram();
    expect(source).toContain('prepared_run_file="$(jq -r \'.run_file // empty\' "$checks_file")"');
    expect(source).toContain('Sprint acceptance already finalized for the receipt-bound evidence');
    expect(source).toContain('immutable prepared run snapshot does not match the receipt-bound evidence');
    expect(source).toContain(`' "$prepared_run_file" > "$finalized_checks"`);
    expect(program).toContain("del(.provenance)");
    // The strip must run on the whole document, before the acceptance fields
    // are layered on -- not on some sub-object after the fact.
    expect(program.indexOf("del(.provenance)")).toBeLessThan(program.indexOf(".acceptance_receipt ="));
  });

  test("running the shipped finalize overlay through the materializer yields a content_hash self-consistent projection", () => {
    const jqProbe = run("jq", ["--version"], REPO_ROOT);
    if (jqProbe.error !== undefined || jqProbe.status !== 0) {
      // jq is an optional prerequisite for this repo (README), and the
      // overlay itself refuses to run without it. The source-binding test
      // above still guards the fix on a jq-less machine.
      return;
    }

    withTempRepo("drift-checks-latest-finalize-overlay", (repoRoot) => {
      mkdirSync(join(repoRoot, "tasks/contracts"), { recursive: true });
      const contractPath = "tasks/contracts/drift-overlay.contract.md";
      const contractText = "# Task Contract: overlay fixture\n";
      writeFileSync(join(repoRoot, contractPath), contractText);
      const contractHash = `sha256:${createHash("sha256").update(contractText).digest("hex")}`;
      seedGenesis(repoRoot);
      const rawPrepared = preparedRunTrace(contractPath);
      seedRunTraceEvent(repoRoot, contractHash, rawPrepared);
      const rawPreparedPath = join(repoRoot, ".ai/harness/runs/run-drift-overlay.json");
      mkdirSync(join(repoRoot, ".ai/harness/runs"), { recursive: true });
      writeFileSync(rawPreparedPath, `${JSON.stringify(rawPrepared, null, 2)}\n`);

      const input: MaterializeChecksLatestInput = {
        repoRoot,
        contractPath,
        worktreeId: "drift-fixture",
        subjectHash: SUBJECT_A,
        now: FIXED_NOW,
      };

      // 1. What `--prepare-acceptance` leaves on disk: a real materialized
      //    projection, provenance block and all.
      const { accepted: acceptedPrepared } = readAcceptedEvents(repoRoot);
      const prepared = buildChecksLatestProjection(input, acceptedPrepared, contractText);
      const preparedPath = join(repoRoot, "prepared-checks.json");
      writeFileSync(preparedPath, `${JSON.stringify(prepared, null, 2)}\n`);

      // 2. The finalize path's own jq overlay, run verbatim from the script
      //    against the immutable raw snapshot rather than the materialized
      //    projection that already contains redaction output.
      const overlayed = run(
        "jq",
        [
          "--arg", "reviewer", OVERLAY_ARGS.reviewer,
          "--arg", "source", OVERLAY_ARGS.source,
          "--arg", "disposition", OVERLAY_ARGS.disposition,
          "--arg", "message", OVERLAY_ARGS.message,
          readFinalizeOverlayProgram(),
          rawPreparedPath,
        ],
        repoRoot,
      );
      expect(overlayed.stderr).toBe("");
      expect(overlayed.status).toBe(0);
      const finalizedRunTrace = JSON.parse(overlayed.stdout) as Record<string, JsonValue>;

      // The overlay really applied ...
      expect(finalizedRunTrace.acceptance_receipt).toEqual({
        status: "pass",
        disposition: OVERLAY_ARGS.disposition,
        reviewer: OVERLAY_ARGS.reviewer,
        source: OVERLAY_ARGS.source,
        message: OVERLAY_ARGS.message,
      });
      expect(finalizedRunTrace.guards).toEqual([
        { name: "acceptance_receipt", status: "pass" },
        { name: "allowed_paths_check", status: "pass" },
      ]);
      // ... and it hands back a run trace, not a projection.
      expect("provenance" in finalizedRunTrace).toBe(false);

      // 3. Emit that run trace and re-materialize, exactly as the finalize
      //    path does through emit-verify-evidence.
      seedRunTraceEvent(repoRoot, contractHash, finalizedRunTrace as JsonValue);
      const { accepted: acceptedFinal } = readAcceptedEvents(repoRoot);
      const finalized = buildChecksLatestProjection(input, acceptedFinal, contractText);
      const { provenance, ...consumerFacing } = finalized;
      expect(consumerFacing.acceptance_receipt).toEqual(finalizedRunTrace.acceptance_receipt);
      expect(consumerFacing.commands).toEqual(prepared.commands);
      expect(contentHashOf(consumerFacing)).toBe(provenance.content_hash);

      seedRunTraceEvent(repoRoot, contractHash, finalizedRunTrace as JsonValue);
      const { accepted: acceptedRepeated } = readAcceptedEvents(repoRoot);
      const repeated = buildChecksLatestProjection(input, acceptedRepeated, contractText);
      expect(repeated.commands).toEqual(prepared.commands);

      // Causality lock: the pre-fix shape -- the same overlay output with the
      // previous materialization's provenance still embedded -- reproduces the
      // exact defect, so this test cannot pass for an unrelated reason.
      seedRunTraceEvent(repoRoot, contractHash, {
        ...finalizedRunTrace,
        provenance: prepared.provenance as unknown as JsonValue,
      } as JsonValue);
      const { accepted: acceptedDrifted } = readAcceptedEvents(repoRoot);
      const drifted = buildChecksLatestProjection(input, acceptedDrifted, contractText);
      const { provenance: driftedProvenance, ...driftedContent } = drifted;
      expect(contentHashOf(driftedContent)).not.toBe(driftedProvenance.content_hash);
    });
  }, 30_000);
});

// ---------------------------------------------------------------------------
// tasks/current.md (refresh-current-status.sh, EPC-07 precedent)
// ---------------------------------------------------------------------------
describe("projection drift: tasks/current.md (refresh-current-status.sh double-regeneration)", () => {
  test("two independent non-mutating preview regenerations agree byte-for-byte modulo the volatile updated_at timestamp", () => {
    // Non-mutating (no --write): tasks/current.md itself is a point-in-time
    // snapshot, legitimately stale mid-task (root CLAUDE.md), so this never
    // compares against the tracked file directly -- it proves the
    // materializer is stable across repeated regenerations of the same live
    // source-of-truth artifacts instead, mirroring the EPC-07 precedent
    // test in tests/evidence-recovery-materializer.test.ts exactly.
    const first = run("bash", ["scripts/refresh-current-status.sh"], REPO_ROOT);
    const second = run("bash", ["scripts/refresh-current-status.sh"], REPO_ROOT);
    expect(first.status).toBe(0);
    expect(second.status).toBe(0);
    expect(first.stdout).toContain("<!-- generated-by: repo-harness refresh-current-status v1 -->");

    const strip = (text: string) =>
      text.replace(/^<!-- updated_at:.*$/m, "").replace(/^> \*\*Updated At\*\*:.*$/m, "");
    expect(strip(first.stdout)).toBe(strip(second.stdout));
  }, 30_000);
});
