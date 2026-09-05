> **Archived**: 2026-09-05 23:15
> **Related Plan**: plans/archive/plan-20260905-1414-operator-server-write-gate.md
> **Outcome**: Superseded
> **Lifecycle**: review
> **Parent Run ID**: run-20260905-2315
> **Archive Projection V1**: `plans/plan-20260905-1414-operator-server-write-gate.md` => `plans/archive/plan-20260905-1414-operator-server-write-gate.md`
> **Archive Projection V1**: `tasks/notes/20260905-1414-operator-server-write-gate.notes.md` => `tasks/archive/notes-20260905-2315-operator-server-write-gate.md`
> **Archive Projection V1**: `tasks/contracts/20260905-1414-operator-server-write-gate.contract.md` => `tasks/archive/contract-20260905-2315-operator-server-write-gate.md`
> **Archive Projection V1**: `tasks/reviews/20260905-1414-operator-server-write-gate.review.md` => `tasks/archive/review-20260905-2315-operator-server-write-gate.md`

# Task Review: operator-server-write-gate

> **Status**: Complete
> **Plan**: plans/archive/plan-20260905-1414-operator-server-write-gate.md
> **Contract**: tasks/archive/contract-20260905-2315-operator-server-write-gate.md
> **Notes File**: tasks/archive/notes-20260905-2315-operator-server-write-gate.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-09-05 14:14
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 27c7de3c

## Human Review Card

- Verdict: pass
- Change type: bugfix
- Intended files changed: `src/effects/operator/server.ts`,
  `src/effects/operator/collaboration.ts`, `tests/cli/operator-serve.test.ts`,
  plus the plan, contract, review, and notes of this work package.
- Actual files changed: the intended set, minus `src/cli/commands/operator.ts`
  (the refusal log needed no CLI wiring), plus a new
  `tests/effects/operator-write-boundary.test.ts` and `tasks/todos.md`.
- Commands passed: `bun run check:type`; `bun run build:operator-web`;
  `bun test --timeout 60000 tests/cli/operator-serve.test.ts tests/effects/fleet-collector-process.test.ts tests/effects/operator-task-message.test.ts tests/cli/collaboration.test.ts tests/effects/operator-write-boundary.test.ts`
  (51 pass, 2 skip, 0 fail); the six repository-integrity checks;
  `bun test --timeout 60000` (4192 pass, 4 skip, 0 fail across 350 files).
- Residual risks: the write admission bound is new refusal behavior on a route
  that previously accepted unbounded concurrency.
- Reviewer action required: inspect diff and card
- Rollback: revert the branch's commits on `codex/operator-server-write-gate` together.

## Mode Evidence

- Selected route: planning (captured work-package plan executed in an isolated
  contract worktree).
- P1/P2/P3 evidence: `plans/archive/plan-20260905-1414-operator-server-write-gate.md`
  `## Captured Planning Output`.
- Root cause or plan evidence: `## Root Cause Evidence` in the contract, backed
  by `.ai/harness/evidence/pre-fix/operator-serve.test.log` (`PRE_FIX_EXIT=1`,
  six failing guards) and
  `.ai/harness/evidence/pre-fix/operator-write-boundary.test.log`
  (`PRE_FIX_EXIT=1`).

## Verification Evidence

- Waza `/check` run: not run; this work package was executed and verified
  directly against the plan's Verification section.
- Commands run: `bun run check:type`; the focused test set;
  `bun run build:operator-web`; `bash scripts/check-deploy-sql-order.sh`;
  `bash scripts/check-architecture-sync.sh`;
  `REPO_HARNESS_DIFF_BASE=origin/main REPO_HARNESS_DIFF_MODE=merge-base bash scripts/check-task-sync.sh`;
  `bash scripts/check-task-workflow.sh --strict`;
  `bun scripts/inspect-project-state.ts --repo . --format text`;
  `bun src/cli/index.ts init --repo . --dry-run`; `bun test --timeout 60000`;
  `bun src/cli/index.ts run verify-contract --contract tasks/archive/contract-20260905-2315-operator-server-write-gate.md --strict`
  (27/27 Fulfilled).
- Manual checks: live loopback probe against `bun src/cli/index.ts operator
  serve --port 0` — an aborted snapshot followed immediately by a re-request
  answered `HTTP/1.1 200 OK`; a `text/plain` POST answered `415 Unsupported
  Media Type` with `unsupported_media_type`; `/API/v1/fleet/snapshot` with
  `Accept: text/html` answered `404 Not Found` as
  `application/json; charset=utf-8`; `OPTIONS` answered `405` with
  `Allow: GET, HEAD, POST`; the document carried the pinned
  `Content-Security-Policy`. A separate run with stdout and stderr split proved
  stdout stays the single bound-URL line while refusals go to stderr.
- Supporting artifacts: pre-fix logs under `.ai/harness/evidence/pre-fix/`.
- Implementation notes reviewed: `tasks/archive/notes-20260905-2315-operator-server-write-gate.md`.
- Run snapshot: `.ai/harness/runs/`

## Acceptance Receipt Projection

> **Disposition**: unavailable
> **Reviewer**: unavailable
> **Source**: unavailable
> **Actor**: not-applicable
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: pending
> **Verification Evidence SHA256**: pending
> **Issued At**: pending

- Summary: No AcceptanceReceipt has been recorded.
- Findings: none

## Behavior Diff Notes

- A Fleet snapshot request arriving after a sole subscriber disconnected now
  starts a new collection instead of inheriting the cancelled one's failure.
- A second concurrent task-message write above `max_concurrency` is refused
  `503 task_message_busy` with `Retry-After: 1` instead of spawning another
  child process.
- A task-message write without an `application/json` media type is refused 415.
- `/API/...` and other case variants are a JSON 404 instead of the SPA shell.
- The static CSP gained `base-uri 'none'` and `form-action 'none'`; 405
  responses gained `Allow`; every non-2xx response writes one stderr line.

## Residual Risks / Follow-ups

- The collaboration identity mismatch is unreachable through the registry today,
  because the strict registry reader already refuses an entry whose id is not
  derived from its canonical path. The assertion is a structural guard on the
  worker boundary, not a live failure mode.
- During the collector's abort drain (up to 5.5 s), a reconnect starts a second
  collector. Nothing but the reload rate bounds how many overlap: the Fleet path
  has no admission counter of the kind the collaboration path carries.
- Write admission and collaboration admission read the same `max_concurrency`
  value but keep separate counters, so the aggregate child-process budget is
  2x `max_concurrency` plus the Fleet collector.
- The write admission counter is incremented outside the `try` whose `finally`
  releases it (`src/effects/operator/server.ts` ~1613 vs ~1643), with the
  request's cancellation and timeout setup in between. None of those statements
  throws in practice, so no counter leak is reachable today, but the release is
  not structurally bound to the acquire.
- The pre-fix evidence lives under gitignored `.ai/harness/evidence/` and does
  not travel with the branch; a later reader sees the claim, not the artifact.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | All seven plan defects are fixed and each is pinned by a live probe: the reload race answers 200 with sequence 2, `text/plain` with a good Origin is 415 while no Origin is still 403 `origin_required`, `/API/v1/fleet/snapshot` is a JSON 404, `OPTIONS` is 405 with `Allow: GET, HEAD, POST`, the CSP carries `base-uri 'none'` and `form-action 'none'`, and 9 refusals produced 9 stderr lines with stdout holding exactly 1 line. Held back from 10 by the unbounded collector overlap during the abort drain. |
| Product depth | 8/10 | The refusals are typed, named, and retryable where retry is the right answer (`503 task_message_busy` with `Retry-After: 1`), and the operator-visible surface — one stdout line, one stderr line per refusal — stays legible under load. The child-process budget is still 2x `max_concurrency` across two counters rather than one declared number. |
| Design quality | 8/10 | One `sendRefusal()` wrapper makes the logged set exactly the refused set, and the identity assertion is one exported rule at two call sites instead of a duplicated comparison. The write admission counter's acquire and release are adjacent by convention rather than structurally paired. |
| Code quality | 9/10 | `tsc` clean, `vite` operator-web build ok, focused set 51 pass / 2 skip / 0 fail, full suite 4192 pass / 4 skip / 0 fail, the six repository-integrity checks exit 0 plus CI-mode `check-task-sync` exit 0, and `verify-contract --strict` reports 27/27 Fulfilled. |

## Failing Items

- None.

## Retest Steps

- Re-run: `bun test --timeout 60000 tests/cli/operator-serve.test.ts tests/effects/operator-write-boundary.test.ts`
- Re-check: `bun src/cli/index.ts run verify-contract --contract tasks/archive/contract-20260905-2315-operator-server-write-gate.md --strict`

## Summary

- The operator board's one-write boundary is now declared as a value and gated
  by a test that counts writes against the matchers the dispatcher uses, the
  write itself is bounded and typed, and the transport around it no longer
  answers a reload with a cancelled collection's failure, leaks the SPA shell
  through a case-variant API path, or refuses a request silently.
