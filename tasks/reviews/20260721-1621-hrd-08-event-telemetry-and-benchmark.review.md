# Task Review: hrd-08-event-telemetry-and-benchmark

> **Status**: Pending
> **Plan**: plans/plan-20260721-1621-hrd-08-event-telemetry-and-benchmark.md
> **Contract**: tasks/contracts/20260721-1621-hrd-08-event-telemetry-and-benchmark.contract.md
> **Notes File**: tasks/notes/20260721-1621-hrd-08-event-telemetry-and-benchmark.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-21 17:25
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: pending

## Human Review Card

- Verdict: pass; AcceptanceReceipt still pending
- Change type: code-change
- Intended files changed: event telemetry protocol/runtime instrumentation, the two old-authority reader cutovers, targeted tests and characterization fixtures, architecture/runtime docs, measured research evidence, and workflow artifacts.
- Actual files changed: matches the contract's exact `allowed_paths`; production has no live reader or writer for `hook-invocations.jsonl`.
- Commands passed: targeted HRD-08/runtime/report/characterization suites, TypeScript and hook/state boundaries, the 1,778-test full suite, deploy/architecture/task/workflow gates, inspector, and adoption dry-run.
- Residual risks: measured `PreToolUse/edit` p95 is 429.05 ms, above the 150 ms target and 250 ms budget; this instrumentation slice reports the miss but intentionally does not absorb optimization.
- Reviewer action required: issue one subject-bound semantic acceptance or the contract-authorized typed owner waiver after final subject freeze.
- Rollback: revert the HRD-08 PR and discard ignored runtime samples; no telemetry migration or compatibility path exists.

## Mode Evidence

- Selected route: approved `$think` work-package executed in an isolated contract worktree.
- P1/P2/P3 evidence: recorded in the plan, including the runtime boundary, one concrete host-event trace, explicit metric semantics, and the no-dual-read authority cutover.
- Root cause or plan evidence: per-script JSONL had no event identifier, so concurrent host events could not be grouped safely and the report could not claim runtime evidence.

## Verification Evidence

- Waza `/check` run: local targeted and repository-required equivalent complete; independent read-only ship gate pending.
- Commands run: `bun run check:type`; `bun run check:state-boundaries`; `bun run check:hooks`; targeted tests listed in the contract; `bun test`; all repository required checks except final `verify-contract`/acceptance closeout.
- Manual checks: 220/220 valid event records, 20 per each of 11 routes, 220 unique IDs, zero malformed/mixed/duplicate records; no provider call and no 27-arm matrix run; no absolute workstation path in committed reports.
- Supporting artifacts: `docs/researches/20260721-hrd08-hook-runtime-baseline-vs-target.json` and `.md`; ignored frozen sample `.ai/harness/runs/hrd08-hook-event-samples.jsonl`.
- Implementation notes reviewed: yes.
- Run snapshot: Bun full suite 1,778 pass / 1 platform skip / 0 fail across 137 files; 14,777 expectations; 681.69 seconds.

## Manual Check Evidence

- [x] Full repository test suite passes once after code freeze
  - Evidence: `bun test` completed after runtime/report freeze with 1,778 pass, 1 platform skip, 0 fail, and 14,777 expectations across 137 files in 681.69 seconds.
- [x] Self-host adoption dry-run reports zero operations after code freeze
  - Evidence: `bun src/cli/index.ts adopt --repo . --dry-run` exited 0 with 0 total, 0 planned, and 0 skipped operations; it reported the expected self-host source-checkout boundary.
- [x] Frozen event sample contains exactly 220 valid records across all 11 routes
  - Evidence: the committed protocol-v2 report records 220/220 valid protocol-v1 events, 20 per public route, 220 unique IDs, and zero malformed, mixed-protocol, or duplicate records.

## Acceptance Receipt Projection

> **Disposition**: user_waiver
> **Reviewer**: User
> **Source**: user-waiver
> **Actor**: kito
> **Reviewed Subject SHA256**: sha256:043b983ca02ab3c2e62e69292f668744a6815b9fbf8b50d553e31242efc27b8d
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: e1fce20a73bea1df197ac5dba3270fbf43eb26b3
> **Verification Evidence SHA256**: sha256:f4a9396ce6909450f147125634e2d839e4cc9dd1beb78368c3e661dac38c8f6e
> **Issued At**: 2026-07-21T09:37:15.231Z

- Summary: Owner kito accepts the documented HRD-08 residual risk.
- Findings: none

## Behavior Diff Notes

- Each eligible handled host event now produces one `loop-engine-hook-event/v1` record instead of one old record per route script.
- The diet report and profile benchmark reader consume only event telemetry; missing, malformed, mixed, duplicate, or required-metric-incomplete evidence fails closed.
- PostEdit exposes one journal event transaction; Stop exposes four logical durable writes in one projection transaction; telemetry append remains fail-open and excluded from durable-write target counts.
- Host-visible route ordering, decisions, exit codes, state semantics, and internal characterization subprocess counts remain unchanged apart from the declared telemetry authority path.

## Residual Risks / Follow-ups

- PreEdit measured p50/p95 is 381.68/429.05 ms; the next bounded runtime-diet slice should optimize this known hot path rather than changing the measurement contract.
- Opaque legacy Bash steps intentionally have incomplete logical file/write metrics. HRD-09 may retire those steps, but HRD-08 does not infer their hidden I/O.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | One event authority and strict reporting work across all 11 routes; the measured latency miss is surfaced. |
| Product depth | 9/10 | Evidence distinguishes direct-runtime/logical metrics from hidden legacy and OS-level activity. |
| Design quality | 9/10 | One writer and one schema replace the unjoinable per-script authority without a compatibility path. |
| Code quality | 9/10 | Focused unit/integration/characterization coverage plus the full repository suite pass. |

## Failing Items

- LOOP-12 PreEdit latency only: p95 429.05 ms exceeds target 150 ms and budget 250 ms. This is a measured product bottleneck, not a report or instrumentation acceptance failure.

## Retest Steps

- Re-run: the contract's targeted tests, then `bun test` only if semantic source changes after acceptance.
- Re-check: regenerate the report from a new frozen sample only after a semantic runtime change; do not regenerate for lifecycle/review-only edits.

## Summary

- Pass for HRD-08. The implementation establishes one event-level telemetry authority, removes every live old reader/writer, preserves runtime behavior, and publishes truthful 220-sample LOOP-12 evidence. Final closeout still requires strict contract verification and exactly one AcceptanceReceipt.
