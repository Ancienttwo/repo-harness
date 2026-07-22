#!/usr/bin/env bun
/**
 * Thin CLI wrapper (arg parsing only) so the bash `verify-sprint` chain can
 * invoke `emitAuthoritativeVerifyEvidence` (src/effects/evidence/verify-producer.ts).
 * No logic beyond parsing argv and mapping the producer's typed result to an
 * exit code.
 *
 * Exit code contract (verify-sprint.sh's `emit_verify_evidence` reads this):
 *   0 = emitted.
 *   3 = cannot-bind refusal -- no active contract, or the contract is
 *       dirty/untracked. Sprint row 6 only requires that non-subject-bound
 *       emission be impossible and that a subject mismatch fail closed; it
 *       does not require every verify run to emit. Cannot-bind is
 *       refusal-to-fabricate, not a fallback -- the caller treats it as
 *       "skip, verify result unchanged" because no gate reads the ledger
 *       yet, so skipping satisfies nothing.
 *   2 = CLI usage error (bad/missing arguments).
 *   1 = a real failure: subject mismatch, or a store/genesis error. These
 *       must fail the caller's verify run.
 * The producer module itself is unchanged by this contract: it still
 * returns one typed `{ ok: false, reason, message }` refusal for every
 * fail-closed condition; only this wrapper's mapping of `reason` to an exit
 * code distinguishes cannot-bind from real failure.
 */
import { emitAuthoritativeVerifyEvidence, type VerifyProducerFailureReason } from "../src/effects/evidence/verify-producer";

const CANNOT_BIND_REASONS: ReadonlySet<VerifyProducerFailureReason> = new Set([
  "no_active_contract",
  "contract_not_committed",
]);

function usage(): string {
  return [
    "usage: emit-verify-evidence.ts --repo-root <path> --command <string> --status pass|fail --run-snapshot <repo-relative-path>",
    "         [--contract <repo-relative-path>] [--subject-sha256 <sha256>] [--counts-json <json>] [--correlation-run-id <id>]",
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

  const result = emitAuthoritativeVerifyEvidence({
    repoRoot,
    commandLine,
    status,
    runSnapshotPath,
    counts,
    contractPath: args["contract"] || undefined,
    expectedSubjectSha256: args["subject-sha256"] || undefined,
    correlationRunId: args["correlation-run-id"] || undefined,
  });

  if (!result.ok) {
    const exitCode = CANNOT_BIND_REASONS.has(result.reason) ? 3 : 1;
    const kind = exitCode === 3 ? "cannot-bind" : "fail-closed";
    process.stderr.write(`emit-verify-evidence: ${kind} (${result.reason}): ${result.message}\n`);
    return exitCode;
  }

  process.stdout.write(`emit-verify-evidence: appended ${result.event.event_id} (contract ${result.contractPath})\n`);
  return 0;
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
