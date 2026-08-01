# Plan: Strip materializer-owned provenance from the verify-sprint finalize overlay

> **Status**: Archived
> **Created**: 20260801-2124
> **Slug**: verify-provenance-overlay
> **Planning Source**: waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: bun test tests/evidence-projection-drift.test.ts plus the full bun test suite and sync-helper-sources --check
> **Rollback Surface**: Revert the single commit on branch codex/verify-provenance-overlay
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260801-2124-verify-provenance-overlay.contract.md`
> **Task Review**: `tasks/reviews/20260801-2124-verify-provenance-overlay.review.md`
> **Implementation Notes**: `tasks/notes/20260801-2124-verify-provenance-overlay.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from waza-think planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260801-2124-verify-provenance-overlay.md`
- Sprint contract: `tasks/contracts/20260801-2124-verify-provenance-overlay.contract.md`
- Sprint review: `tasks/reviews/20260801-2124-verify-provenance-overlay.review.md`
- Implementation notes: `tasks/notes/20260801-2124-verify-provenance-overlay.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260801-2124-verify-provenance-overlay.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260801-2124-verify-provenance-overlay.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260801-2124-verify-provenance-overlay.md`.

## Approach
### Strategy
Use the captured planning output below as the execution source of truth.

### Trade-offs
| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Captured plan | Preserves the approved Codex Plan or Waza think decision | Requires the captured text to be concrete enough to execute | Use |

## Detailed Design
### File Changes
| File | Action | Description |
|------|--------|-------------|
| See captured planning output | Follow | Implement only the approved scope named below |

### Code Snippets
See captured planning output.

### Data Flow
See captured planning output.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Captured plan lacks enough detail | Medium | Execution may need clarification | Stop before implementation if the captured output contradicts repo rules or lacks concrete file targets |

## Task Contracts
- Contract file: `tasks/contracts/20260801-2124-verify-provenance-overlay.contract.md`
- Review file: `tasks/reviews/20260801-2124-verify-provenance-overlay.review.md`
- Implementation notes file: `tasks/notes/20260801-2124-verify-provenance-overlay.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260801-2124-verify-provenance-overlay.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260801-2124-verify-provenance-overlay.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert the single commit on branch codex/verify-provenance-overlay
- **Verification boundary**: bun test tests/evidence-projection-drift.test.ts plus the full bun test suite and sync-helper-sources --check
- **Review/acceptance boundary**: `tasks/reviews/20260801-2124-verify-provenance-overlay.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260801-2124-verify-provenance-overlay.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260801-2124-verify-provenance-overlay.contract.md`, `tasks/reviews/20260801-2124-verify-provenance-overlay.review.md`, and `tasks/notes/20260801-2124-verify-provenance-overlay.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260801-2124-verify-provenance-overlay.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert the single commit on branch codex/verify-provenance-overlay

## Captured Planning Output

## P1 map

- Authority for `.ai/harness/checks/latest.json`: `src/effects/evidence/checks-materializer.ts` (`writeChecksLatest`), whose single call site is `scripts/emit-verify-evidence.ts`.
- Producer of the evidence event the materializer projects from: `src/effects/evidence/verify-producer.ts`, driven from `scripts/verify-sprint.sh`'s `emit_verify_evidence()` (line 435).
- Two emission sites in `scripts/verify-sprint.sh`: the normal `--prepare-acceptance` run (line 976, run trace = freshly built `$checks_report`) and `finalize_prepared_acceptance()` (line 567, run trace = jq overlay on top of the already-materialized `$checks_file`).
- Detection surface: `tests/evidence-projection-drift.test.ts:265` ("this worktree's own live checks/latest.json ... is provenance.content_hash self-consistent").
- Sync pair: `scripts/verify-sprint.sh` and `assets/templates/helpers/verify-sprint.sh`, maintained by `scripts/sync-helper-sources.sh`.
- Out of scope: `src/effects/evidence/checks-materializer.ts`, `scripts/emit-verify-evidence.ts`, `scripts/acceptance-receipt.ts`.

## P2 trace

1. `verify-sprint --prepare-acceptance` builds `$checks_report` (no `provenance` key) and emits it; the materializer writes `checks/latest.json` = `{...run_trace, provenance: {..., content_hash: sha256(canonicalize(run_trace))}}`.
2. `verify-sprint` (finalize) reads that *materialized projection* back as `$checks_file`, jq-overlays `.acceptance_receipt`, `.guards[].status`, `.next_step` into `$finalized_checks`, and feeds it to `emit_verify_evidence` as the new run trace.
3. That run trace therefore carries the previous materialization's `provenance` block as ordinary payload data.
4. The materializer spreads the run trace and then overrides `provenance` with a fresh block, but computes `content_hash` as `contentHashOf(runTrace)` — over the run trace *including* the stale `provenance`.
5. Written file's consumer-facing content (file minus `provenance`) = run trace minus `provenance`. Recorded hash covers a strictly larger object. Self-consistency check fails.

Measured on the live worktree (commit `62daea2e`, event `evt-01KYYJ74Z379ASFNG69S9TCY2A`):

```
hash(run_trace as emitted, incl. stale provenance): sha256:2840da08712144701b8292de4dc1e00e1705f01ce73911e739a3cb1ab916605a
hash(run_trace minus provenance):                   sha256:4447362b5e04cd6acde03d1f14e52aa5d6f53192235caed2e4482f0897eb5f68
recorded provenance.content_hash:                   sha256:2840da08712144701b8292de4dc1e00e1705f01ce73911e739a3cb1ab916605a
```

The secondary symptom recorded in `tasks/todos.md` — the ~557-byte overlay pushing the payload past the 8192-byte inline cap in `src/effects/evidence/event-writer.ts` — is the same embedding, not a separate defect.

## P3 decision rationale

The defect is a layer violation at the re-ingestion boundary, not a competing writer: `finalize_prepared_acceptance` re-feeds a *projection* (run trace + materializer-owned `provenance`) as if it were a *source run trace*. `provenance` is derived metadata owned by the materializer; it must never travel inside a payload the materializer projects from.

Chosen fix (option 1, "let the path produce input the canonical materializer can make naturally self-consistent"): `del(.provenance)` in the finalize jq overlay, so the emitted run trace is provenance-free and `contentHashOf(runTrace)` is by construction the hash of the file's consumer-facing content. No second hash implementation, no relaxed assertion, no defensive strip inside the materializer (which would be compat code defending against a producer we control).

Rejected: recomputing and writing back `content_hash` after the overlay (option 2) — it would duplicate canonical-serialization logic outside the materializer and leave the stale block embedded in the ledger payload; and relaxing the drift assertion, which is forbidden.

Invariant preserved: `checks/latest.json` stays a deterministic projection of accepted ledger events, with `content_hash` recomputable from the published file alone.

## Task Breakdown

- [ ] Strip `.provenance` from the finalize overlay in `scripts/verify-sprint.sh` and mirror to `assets/templates/helpers/verify-sprint.sh`.
- [ ] Add a regression test to `tests/evidence-projection-drift.test.ts` that exercises the overlay path and asserts the materialized file's provenance is self-consistent, with zero relaxation of existing assertions.
- [ ] Remove the fulfilled deferred row from `tasks/todos.md` and refresh its timestamp.

## Verification

- `bun test tests/evidence-projection-drift.test.ts`
- `bun test`
- `bash scripts/sync-helper-sources.sh --check`
- `bash scripts/check-task-sync.sh`
- `repo-harness run check-task-workflow --strict`

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Strip `.provenance` from the finalize overlay in `scripts/verify-sprint.sh` and mirror to `assets/templates/helpers/verify-sprint.sh`.
- [ ] Add a regression test to `tests/evidence-projection-drift.test.ts` that exercises the overlay path and asserts the materialized file's provenance is self-consistent, with zero relaxation of existing assertions.
- [ ] Remove the fulfilled deferred row from `tasks/todos.md` and refresh its timestamp.
