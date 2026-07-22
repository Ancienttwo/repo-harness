#!/usr/bin/env bun
/**
 * Thin CLI wrapper (arg parsing only) so the bash `verify-sprint` chain can
 * invoke `emitAuthoritativeVerifyEvidence` (src/effects/evidence/verify-producer.ts)
 * and, on a successful emission, materialize `checks/latest.json` from the
 * ledger via `src/effects/evidence/checks-materializer.ts`. This is the
 * materializer's single call site (see that module's doc comment and
 * tests/evidence-checks-materializer.test.ts's no-independent-authoring test).
 * No logic beyond parsing argv, mapping the producer's typed result to an
 * exit code, and (additively) invoking the materializer.
 *
 * Exit code contract (verify-sprint.sh's `emit_verify_evidence` reads this):
 *   0 = emitted (and, when --checks-file was given, materialized).
 *   3 = cannot-bind refusal -- no active contract, or the contract is
 *       dirty/untracked. Sprint row 6 only requires that non-subject-bound
 *       emission be impossible and that a subject mismatch fail closed; it
 *       does not require every verify run to emit. Cannot-bind is
 *       refusal-to-fabricate, not a fallback -- the caller treats it as
 *       "skip, verify result unchanged" because checks/latest.json is simply
 *       not (re)written this run (EPC-05: the caller no longer authors it
 *       directly either, so a cannot-bind run's checks/latest.json is
 *       whatever a previous run left it, or absent).
 *   2 = CLI usage error (bad/missing arguments).
 *   1 = a real failure: subject mismatch, a store/genesis error, or (when
 *       --checks-file was given) a materialization error after a successful
 *       emission. These must fail the caller's verify run.
 * The producer module itself is unchanged by this contract: it still
 * returns one typed `{ ok: false, reason, message }` refusal for every
 * fail-closed condition; only this wrapper's mapping of `reason` to an exit
 * code distinguishes cannot-bind from real failure.
 */
import { readFileSync } from "fs";
import { emitAuthoritativeVerifyEvidence, type VerifyProducerFailureReason } from "../src/effects/evidence/verify-producer";
import { writeChecksLatest } from "../src/effects/evidence/checks-materializer";
import type { JsonValue } from "../src/core/evidence/types";

const CANNOT_BIND_REASONS: ReadonlySet<VerifyProducerFailureReason> = new Set([
  "no_active_contract",
  "contract_not_committed",
]);

function usage(): string {
  return [
    "usage: emit-verify-evidence.ts --repo-root <path> --command <string> --status pass|fail --run-snapshot <repo-relative-path>",
    "         [--contract <repo-relative-path>] [--subject-sha256 <sha256>] [--counts-json <json>] [--correlation-run-id <id>]",
    "         [--run-trace-file <path>] [--checks-file <repo-relative-path>]",
  ].join("\n");
}

function parseArgs(argv: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined || !arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      out[key] = "";
      continue;
    }
    out[key] = next;
    i++;
  }
  return out;
}

function main(argv: readonly string[]): number {
  const args = parseArgs(argv);
  const repoRoot = args["repo-root"];
  const commandLine = args["command"];
  const status = args["status"];
  const runSnapshotPath = args["run-snapshot"];

  if (!repoRoot || !commandLine || (status !== "pass" && status !== "fail") || !runSnapshotPath) {
    process.stderr.write(`emit-verify-evidence: ${usage()}\n`);
    return 2;
  }

  let counts: Record<string, number> | undefined;
  const countsJson = args["counts-json"];
  if (countsJson) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(countsJson);
    } catch (error) {
      process.stderr.write(`emit-verify-evidence: --counts-json is not valid JSON: ${(error as Error).message}\n`);
      return 2;
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      process.stderr.write("emit-verify-evidence: --counts-json must be a flat JSON object\n");
      return 2;
    }
    counts = parsed as Record<string, number>;
  }

  let runTrace: JsonValue | undefined;
  const runTraceFile = args["run-trace-file"];
  if (runTraceFile) {
    let raw: string;
    try {
      raw = readFileSync(runTraceFile, "utf-8");
    } catch (error) {
      process.stderr.write(`emit-verify-evidence: --run-trace-file could not be read: ${(error as Error).message}\n`);
      return 2;
    }
    try {
      runTrace = JSON.parse(raw) as JsonValue;
    } catch (error) {
      process.stderr.write(`emit-verify-evidence: --run-trace-file is not valid JSON: ${(error as Error).message}\n`);
      return 2;
    }
  }

  const result = emitAuthoritativeVerifyEvidence({
    repoRoot,
    commandLine,
    status,
    runSnapshotPath,
    counts,
    contractPath: args["contract"] || undefined,
    expectedSubjectSha256: args["subject-sha256"] || undefined,
    correlationRunId: args["correlation-run-id"] || undefined,
    runTrace,
  });

  if (!result.ok) {
    const exitCode = CANNOT_BIND_REASONS.has(result.reason) ? 3 : 1;
    const kind = exitCode === 3 ? "cannot-bind" : "fail-closed";
    process.stderr.write(`emit-verify-evidence: ${kind} (${result.reason}): ${result.message}\n`);
    return exitCode;
  }

  process.stdout.write(`emit-verify-evidence: appended ${result.event.event_id} (contract ${result.contractPath})\n`);

  const checksFilePath = args["checks-file"];
  if (checksFilePath) {
    try {
      const projection = writeChecksLatest({
        repoRoot,
        contractPath: result.contractPath,
        subjectHash: result.event.subject_identity.subject_hash,
        checksFilePath,
      });
      process.stdout.write(
        `emit-verify-evidence: materialized ${checksFilePath} (status ${String(projection.status)}, ${projection.provenance.source_event_ids.length} source event(s))\n`,
      );
    } catch (error) {
      process.stderr.write(`emit-verify-evidence: materialization failed after a successful emission: ${(error as Error).message}\n`);
      return 1;
    }
  }

  return 0;
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
