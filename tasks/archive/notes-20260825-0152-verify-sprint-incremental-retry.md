> **Archived**: 2026-08-25 01:52
> **Related Plan**: plans/archive/plan-20260824-2214-verify-sprint-incremental-retry.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260825-0152

# Implementation Notes: verify-sprint-incremental-retry

> **Status**: Active
> **Plan**: plans/plan-20260824-2214-verify-sprint-incremental-retry.md
> **Contract**: tasks/contracts/20260824-2214-verify-sprint-incremental-retry.contract.md
> **Review**: tasks/reviews/20260824-2214-verify-sprint-incremental-retry.review.md
> **Last Updated**: 2026-08-25 01:50
> **Lifecycle**: notes

## Design Decisions

- `verify-sprint` owns the retry identity because it already materializes automatic architecture projections and freezes the normalized subject used by Change Assessment and AcceptanceReceipt. `verify-contract` consumes that exact context and owns criterion scheduling; neither script reconstructs the other's authority.
- A cache entry is an explicitly `criterion_reuse`-eligible passing result keyed by repository root, normalized subject, target revision, contract digest, goal digest, exact kind/target/command, and a toolchain fingerprint. Unknown and runtime/external-state criteria execute without a cache key. The fingerprint binds Bun/bash/git/jq/repo-harness versions, bounded-runner bytes, platform, PATH, the expensive threshold, and the explicit operator override.
- Passing results live under the existing ignored `.ai/harness/runs/criteria/` evidence cache. Failures, timeouts, malformed records, missing identities, and exact-key concurrent executions never become reusable passes.
- Cache publication rejects symlinked/non-directory `.ai/harness/runs/criteria` ancestors and uses a securely-created temporary file before atomic rename. A forced execution invalidates the prior pass while holding the exact-key lock, so a forced failure cannot be followed by reuse of older green evidence.
- The expensive fuse is based on the recorded execution duration, not a command-name heuristic. A cached expensive pass is reused by default; executing it again requires `--force-expensive-rerun --reason <non-empty>`, and the reason is included in run evidence.
- The frozen identity is recomputed after contract execution. Any source, target, contract, goal, or toolchain drift during a criterion fails the dedicated `criterion_context` guard, preventing a command from mutating the subject and still producing a passing receipt.
- Internal context/preflight paths are unset at the bounded process boundary. Criterion code and nested verifier calls cannot inherit the acceptance scheduler's private authority.
- Following the supplied Seam/Tracer Bullet framing, the regression seam is the boundary between `verify-sprint`'s frozen subject and `verify-contract`'s criterion execution. Coverage follows the thin vertical path—automatic projection → identity freeze → cheap gate/expensive criterion → retry reuse/force → composed AcceptanceReceipt evidence—rather than unit-testing private shell helpers.
- The independent browser research reviewed the pre-implementation frozen head (`050145cb`), so its architectural recommendations were treated as hypotheses rather than a review of this diff. The public-Seam and Tracer Bullet findings match the implemented `verify-sprint --prepare-acceptance` fixtures. Its Scenario A distinction exposed two real gaps: `allowed_paths` did not prevent executable criteria from spawning, and known sync gates were ordered first but did not short-circuit after failure. The acceptance scheduler now consumes the scope result and stops after any failed cheap preflight; the separate Scenario B fixture exercises exact-key reuse and force.

## Deviations From Plan Or Spec

- The first prepare attempt correctly stopped before any criterion because the linked worktree lacked its ignored `node_modules` and `.codegraph` runtime. Mirroring the primary worktree's existing CodeGraph adoption made the projection authoritative; the resulting helper-template projection also refreshed `docs/architecture/modules/workflow-engine/contract-assets.md`, so that deterministic generated path was added to Allowed Paths.
- The root required-check run used `repo-harness run verify-sprint`, whose protected-helper resolver intentionally selected the installed package helper. It passed `bun test --timeout 60000` once in `1082826ms` but could not exercise this candidate cache. A follow-up through the same installed route began re-running the preceding helper criterion and was interrupted before it reached root `bun test`; candidate retry behavior is therefore proven only through direct source-helper fixtures, not by fabricating/importing a cache record from old evidence.
- After rebasing onto `main`, a candidate acceptance run began the newly invalidated full suite. The supplied scheduler analysis proved Scenario A was still incomplete, so the run was stopped: a pass for that superseded subject could not certify the required cheap-failure no-spawn invariant. No result from the interrupted run was cached as a pass.
- Final-subject run `run-20260825T002243-65436-20260824-2214-verify-sprint-incremental-retry.json` exercised Scenario A against the real repository: automatic projection changed the manifest, `check-task-sync` failed in `51ms`, and the contract report contained no `tests_pass` or non-preflight command execution. This note is the task synchronization that repairs that cheap gate before retry.
- After rebasing onto the latest local `main`, run `run-20260825T005455-80613-20260824-2214-verify-sprint-incremental-retry.json` failed the `allowed_paths` preflight in `601ms` and spawned no executable criterion. The default `origin/main` diff base lagged the approved local integration target by three commits, so two already-landed `docs/researches/` files were charged to this contract. Interim acceptance used explicit local `main` scope while remote publication remained unapproved.
- Interim prepared evidence `run-20260825T005856-94503-20260824-2214-verify-sprint-incremental-retry.json` passed all `21` contract results. Cheap gates ran first; the eligible helper criterion executed once in `111760ms`, and the root full suite executed once in `1028160ms`. No forced execution or same-subject duplicate process occurred.
- After explicit operator approval, local `main` advanced `origin/main` from `0e8f63d5` to `9913846f`. Because target revision is part of the exact criterion identity, the old passes were correctly invalidated. Final prepared evidence `run-20260825T013125-98393-20260824-2214-verify-sprint-incremental-retry.json` then passed all `21` results: helper criterion executed once in `114398ms` with cache key `sha256:9aacd6d4ac3593973f644aa49215655506dfa99d411ee78c8ac4e3f36b98f9a0`; root suite executed once in `1007952ms` with cache key `sha256:f42451bcd945ca687c9868003bd1e19b8bc7dcd024d6c19901378ecba04e57e9`; no force or duplicate spawn occurred.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| New TypeScript scheduler/cache service | Rejected | The exact invariant has two existing shell consumers and no independently deployed boundary; a new package would add authority rather than remove it. Small shell functions inside the owning scripts are sufficient. |
| Reuse the prior whole-run snapshot | Rejected | A run can contain one cheap failure after many passes. Whole-run reuse cannot rerun only the failed criterion and would blur AcceptanceReceipt provenance. |
| Cache by subject plus command only | Rejected | Contract, goal, target, repository, and toolchain changes can alter semantics without changing command text, creating a stale-pass false positive. |
| Treat known sync commands as permanently cheap | Accepted for ordering only | Known state gates run before tests, but expense is still determined from measured duration and included in the toolchain identity. |
| Move retry state entirely into `verify-sprint` | Rejected | `verify-sprint` remains the sole frozen-context authority, while the existing criterion executor owns exact-key scheduling. Direct `verify-contract` calls remain stateless unless the private orchestration context is supplied. |
| Infer reuse eligibility from command name or duration | Rejected | Duration measures cost, not determinism. Contracts opt exact criteria into reuse; unknown criteria execute every time and cannot trigger the fuse. |
| Cache passing cheap sync gates | Rejected | Their inputs include workflow state intentionally excluded from the normalized implementation subject. Re-executing millisecond gates is safer than binding them to an incomplete key. |

## Recurrence Evidence

| Incident | Frozen subject same? | Expensive criterion | Late failing gate | Duplicate runs | Wasted duration |
|---|---:|---|---|---:|---:|
| 2026-08-24 operator closeout | yes for the recorded retry identity | `bun test --timeout 60000` | `check-task-sync` | 1 | `1069849ms` |

The operator reports additional recent occurrences, but their run IDs and failure classes are not yet durable evidence. That frequency claim raises priority but does not alter cache correctness or block this repair.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Pre-fix failure: `tasks/notes/20260824-2214-verify-sprint-incremental-retry.pre-fix.txt`
- Focused regression: `bun test tests/helper-scripts.test.ts --test-name-pattern "verify-(contract|sprint)"`
- Root required-check snapshot: `.ai/harness/runs/run-20260824T230125-2655-20260824-2214-verify-sprint-incremental-retry.json` (`bun test --timeout 60000`, pass, `1082826ms`, invoked once).
- Exact-command tracer: `verify-sprint composes executed and reused criteria into frozen acceptance evidence` uses a disposable `bun test --timeout 60000` seam and asserts execution count `1` across initial run, same-subject retry, explicit force, toolchain invalidation, and source invalidation.
- Final candidate acceptance: `.ai/harness/runs/run-20260825T013125-98393-20260824-2214-verify-sprint-incremental-retry.json` (`21/21` pass; root suite executed once in `1007952ms`).

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
