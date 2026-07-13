# Implementation Notes: verifier-evidence-lifecycle-cutover

> **Status**: Active
> **Plan**: plans/plan-20260714-0421-verifier-evidence-lifecycle-cutover.md
> **Contract**: tasks/contracts/20260714-0421-verifier-evidence-lifecycle-cutover.contract.md
> **Review**: tasks/reviews/20260714-0421-verifier-evidence-lifecycle-cutover.review.md
> **Last Updated**: 2026-07-14 06:28
> **Lifecycle**: notes

## Design Decisions

- P1: verifier authority is `verify-sprint.sh -> verify-contract.sh -> exit_criteria`; review authority is `workflow-state.sh` plus the hook subject CLI; benchmark production is `run-harness-profile-benchmark.ts`, while installable/self-host copies are deterministic projections.
- P2: the observed failure path was a fulfilled contract retaining the live 3x9 command under `commands_succeed`; each sprint/done/finish verification re-entered that producer, while ancestry-bound review and Card fallback created unrelated re-review and dual authority.
- P3: keep one expensive producer and make every closeout route consume frozen evidence. Preserve real provider, grader, No Harness, report-byte, and per-arm isolation invariants; remove provider/adopt/install reachability from verifier rather than adding cache/fallback policy.
- Review subject schema v2 hashes sorted normalized final content entries: path, final bytes or symlink target bytes, executable mode, deletion, or gitlink OID. Target revision is metadata; changed target paths are overlap evidence.
- External acceptance has one authority: canonical `## External Acceptance Advice` with Rubric v2, current subject, target metadata, benchmark evidence SHA-256, expected peer/source, and no P1 blockers. Human Review Card remains presentation only.
- The absolute verifier deadline is fixed at 600000 ms and shared across all declared tests/commands. Each child gets a detached process group; timeout sends SIGTERM then SIGKILL and records duration/timeout/exit/signal.
- Benchmark schema v2 subject binds runner, scenario manifest, fixture set, install inputs, and provider invocation schema. Final JSON/Markdown bytes are bound by a sidecar whose own SHA-256 is the acceptance evidence key.
- Benchmark setup occurs once per profile into three immutable bases. Each of nine scenarios receives its own local Git clone and reflink/copy HOME overlay, so 27 runtime arms remain isolated without 27 installs.
- Producer cost is a code invariant as well as an SLO: execution uses exactly two concurrent arms under one fixed 50-minute absolute deadline. Every provider owns a detached process group; deadline expiry sends SIGTERM and then SIGKILL after 500 ms. Neither limit is configurable through policy or environment.

## Deviations From Plan Or Spec

- The fixed budget is 600 seconds exactly, matching the approved hard ceiling; no 3–5 minute policy target or configurable relaxation was introduced.
- Archive now owns `Active -> Fulfilled` after all completion gates pass. Mutating contract status before review/acceptance would change reviewed content and recreate the stale-evidence loop.
- The validator imports the producer module only to reuse pure schema/subject validation functions; `import.meta.main` prevents provider execution. Structural tests and verifier command rejection keep production unreachable from closeout.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Cache live matrix inside verifier | Rejected | Still makes verifier a producer/retry owner and creates cache policy authority. |
| Hash target/source commit into subjects | Rejected | Ancestry/provenance movement is not reviewed-content movement. |
| Preserve rubric v1/manual override reader | Rejected | Explicit no-compatibility boundary requires one-shot cutover and one authority. |
| Share one writable profile installation across scenarios | Rejected | Would reduce setup but break runtime isolation; immutable base plus writable overlays preserves both. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Research: `docs/researches/20260714-gpt-review.md`
- Focused regression: `tests/unit/verifier-evidence-lifecycle-cutover.test.ts`, `tests/review-freshness.test.ts`, `tests/harness-benchmark-matrix.test.ts`, `tests/workflow-state-lib.test.ts`
- Deterministic integration: `tests/hook-runtime.test.ts`, `tests/helper-scripts.test.ts`, `tests/archive-evidence-gates.test.ts`, `tests/effective-state.test.ts`
- Fixed-budget contract pass reached all 14 machine criteria in 13.8s; the only two remaining contract failures were the intentionally pending review `qa_scores` and `manual_checks` gates.
- Full `bun test --max-concurrency 4`: 1388 pass, 1 skip, 1 timeout failure. The sole failure is the pre-existing `tests/check-agent-tooling.test.ts` six-case loop with an explicit 15s timeout; it timed out again in isolation at 15.0s (`spawnSync.status=null`). No changed implementation path is in that test or its helper. This is disclosed rather than widened in this contract.
- First authoritative producer attempt stopped before profile preparation/provider execution with `EISDIR` while hashing a generated profile HOME containing a directory symlink. `hashTree` now hashes raw symlink targets without following them, with a regression test. That failed subject produced no report or provider arm; the successful matrix must run against the post-fix subject.
- Second producer attempt ran the 27 arms sequentially and had no producer-owned deadline. At 55m41s it had persisted 20 completed arm evidence directories and was stuck 8m13s into `strict-harness/cross-capability-feature`; the final report had not been rewritten. It was terminated at the documented 50-minute hard boundary rather than allowed to become another unbounded wait. The pressure point was the serial `for` loop plus an unbounded `Bun.spawn`, not profile setup. The replacement uses a two-worker ordered pool and the same absolute deadline for all provider processes; focused regression proves the concurrency ceiling, result order, 50-minute constant, and descendant cleanup on timeout.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
