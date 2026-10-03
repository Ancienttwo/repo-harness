# Plan: BRC14 BRC15 strict admission restoration
> **Substantive Change SHA256**: `sha256:7e04c9f754f4b14a3c68539aeb00a3275496cb2c69ba6a92d979b31257c8621b`

> **Status**: Executing
> **Created**: 20260908-2235
> **Slug**: brc1415-strict-admission
> **Planning Source**: waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: risk_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260908-2235-brc1415-strict-admission.contract.md --strict`.
> **Rollback Surface**: Before execution remove `plans/plan-20260908-2235-brc1415-strict-admission.md`; after execution revert branch `codex/brc1415-strict-admission` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260908-2235-brc1415-strict-admission.contract.md`
> **Task Review**: `tasks/reviews/20260908-2235-brc1415-strict-admission.review.md`
> **Implementation Notes**: `tasks/notes/20260908-2235-brc1415-strict-admission.notes.md`

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

- Active plan: `plans/plan-20260908-2235-brc1415-strict-admission.md`
- Sprint contract: `tasks/contracts/20260908-2235-brc1415-strict-admission.contract.md`
- Sprint review: `tasks/reviews/20260908-2235-brc1415-strict-admission.review.md`
- Implementation notes: `tasks/notes/20260908-2235-brc1415-strict-admission.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260908-2235-brc1415-strict-admission.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260908-2235-brc1415-strict-admission.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260908-2235-brc1415-strict-admission.md`.

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
- Contract file: `tasks/contracts/20260908-2235-brc1415-strict-admission.contract.md`
- Review file: `tasks/reviews/20260908-2235-brc1415-strict-admission.review.md`
- Implementation notes file: `tasks/notes/20260908-2235-brc1415-strict-admission.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260908-2235-brc1415-strict-admission.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260908-2235-brc1415-strict-admission.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20260908-2235-brc1415-strict-admission.md`; after execution revert branch `codex/brc1415-strict-admission` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260908-2235-brc1415-strict-admission.contract.md --strict`.
- **Review/acceptance boundary**: `tasks/reviews/20260908-2235-brc1415-strict-admission.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: risk_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260908-2235-brc1415-strict-admission.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260908-2235-brc1415-strict-admission.contract.md`, `tasks/reviews/20260908-2235-brc1415-strict-admission.review.md`, and `tasks/notes/20260908-2235-brc1415-strict-admission.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260908-2235-brc1415-strict-admission.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20260908-2235-brc1415-strict-admission.md`; after execution revert branch `codex/brc1415-strict-admission` or the explicitly reviewed diff.

## Captured Planning Output

# BRC14/BRC15 strict admission restoration

## Goal
Prepare the bounded strict-admission change after the accepted independent Docker supervision and role/probe evidence. Preserve exact history, grant, policy, settlement, deadline and campaign identity validation. Do not mark BRC14 or BRC15 complete without live acceptance.

## P1 Map
The revision guard is shared by adoption, planning, capacity, acquisition and worker entrypoints. Runtime preparation owns pinned-image version probing and independent container supervision. Fresh audit owns exact revision evidence and bounded group sequencing. Repo policy remains off. Current base is aa3cb452; work is isolated.

## P2 Trace
Stored immutable observation and original settled ledger -> current grant/policy/baseline validation -> active entrypoint -> independently supervised runtime preparation. Current valid evidence reaches an unconditional temporary refusal originally introduced for issue 354. That source path has since been replaced and accepted in 360/361/363/366. Invalid evidence must still refuse before effects.

## P3 Decide
Remove only the obsolete unconditional refusal, keep existing strict authority checks, and update real-store regression cases to assert successful read-only admission and continued refusal of unavailable, forged, unsettled, stopped, expired and mismatched evidence. No bypass flag or second admission authority. Existing Docker runtime tests retain their accepted input-bound evidence; no runtime code changes. At 10x scale browser/provider and Docker runtime dominate, not the synchronous guard. Revert this bounded source/test slice to restore unconditional refusal.

## Scope
src/effects/automation/campaign-revision-admission.ts; tests/effects/campaign-revision-observation.test.ts; docs/researches/20260908-brc14-provider-history-evidence.md; required workflow and deterministic architecture projections. Do not change repository activation policy, provider settings, model, grants, or old campaign state. Live Canary 3 is a separate authorized operation requiring a named disposable target and new finite budget. Owner resolved the activation boundary by delegating the AiphaBee target and finite budget; use isolated target, preserve manual merge.

## Verification
Current baseline: 63 tests pass at aa3cb452, /tmp/brc1415-current-baseline.log, covering fresh audit, revision observation and slot reconciliation. Focused final check: bun test tests/effects/campaign-revision-observation.test.ts. TypeScript and six required integrity checks. Compare runtime source/profile/container inputs against cc2fbc48 to retain its Docker evidence; no local full suite. Required CI applies before merge.

## Task Breakdown
- [x] Restore the strict positive revision-admission path with real-store positive/negative regression evidence.
- [x] Correct selected capability authority, raw-resource request binding and label-scoped Issue reads; preserve old observations.
- [x] Add explicit stopped-authoring continuation; verify existing BYOK #177/#178 updated in place under a fresh run.
- [x] A: prove the real admission -> existing Docker carrier composition and required negative/read-only boundaries with model-free evidence; reuse unchanged #363/#366 inputs.
- [x] A: add the complete Group 1 -> Group 2 -> Group 3 -> terminal effect regression, binding each next group to the previous final SHA and refusing Group 4.
- [ ] A: freeze the final candidate against the live target main, bind delta acceptance and pass required CI for that head.
- [ ] B preflight: resolve the observed Oracle followup editor-focus failure and canonical recovery of its failed challenge before another live call.
- [ ] B: complete one two-slot active/manual delivery using the existing real BYOK Issues, including at least one worker/verifier repair, automatic PR, Owner merge, Issue closure and exact cleanup.
- [ ] B: perform one fresh final audit for the complete two-slot snapshot; use that same observation for BRC14 and BRC15 closeout.

## Fixed Phase A Closeout Matrix

This matrix incorporates the Owner-supplied GPT review. The review inspected aa3cb452; the current candidate already removed the unconditional active-disabled fence. It is not a reason to redo completed Docker containment, role, probe or cleanup work. Remote main was observed at 1f1dad978a5583928956e844f66cb14c965b4766 on 2026-09-09; inspect its actual delta before final candidate integration. PR #367 is still Draft and has no required-CI result for its current head.

| Boundary | Evidence and remaining action | Completion claim |
|---|---|---|
| Positive admission | Existing strict guard and real-store tests; map the composition through actual adoption/acquisition to the already accepted Docker carrier, retaining missing-evidence/identity/budget/environment rejection before effects | Program reachability only; fake provider/synthetic executable is not a live model run |
| Group sequencing | Existing parameterization stops at Group 2 authoring; add Group 2 accepted -> Group 3 on Group 2 final SHA -> terminal, with Group 4 refused | Model-free three-group semantics, never three real GPT groups |
| Candidate gate | Compare unchanged runtime/profile/image inputs against #363/#366 evidence; verify only changed or uncovered inputs; required CI belongs to final candidate | No Docker re-audit or automatic full-suite rerun |
| Real delivery | One group, two slots, max_parallel_tasks=2 as capacity, active/manual, default product off; preserve #177/#178 and history, no bulk Issue recreation | At least one actual repair/test-gap PR merged and automatically closed/cleaned; an empty run cannot pass |
| BRC14 | One new final audit session bound to final_main_sha and every slot, plus complete model-free sequencing/rejection evidence | Only verified accepted/accepted_with_followups completes the existing state machine |
| BRC15 | Existing Canary 1 and BRC15a negative record/Owner decision plus this same Canary 3 delivery and activation ladder | No new shadow-quality threshold or ten-Issue experiment |
| Release | Existing release gate on the actual release candidate after BRC acceptance | Canary success does not imply package release |

Before B, freeze source candidate, target SHA, Oracle binary, profile, image and finite budgets. Derive counts from observe-revision, initial authoring/at-most-one allowed repair, challenge, all observation/adoption reads, acquisition, worker/verifier, closeout and final audit. `adopt --dry-run` is not a free preflight. Unknown requests reconcile before any retry; stopped grants and failed evidence stay immutable. No mid-run version/profile/budget changes or automatic fresh batch. Read only the selected campaign label scope, never the repository-wide Issue collection.

Excluded: auto-merge, auto-low-risk, Canary 4/5, refactor expansion, TTL/GC, new Docker foundations and repository-wide quality audits. The existing #354/#342/#346/BRC6a/BRC15a closure boundaries are retained. No new closing requirements may be added after the final acceptance matrix is frozen; newly observed failures are reported against their existing boundary.


## Approved target protection correction

Owner approved after real adoption reached a missing hardcoded fixture. Move the self-host protection inventory to `.ai/harness/campaign-protection.json` as the sole target-owned authority; no legacy read. Share the configured frozen registry with planning and fingerprint its exact input objects. Validate protection and selected registry before active revision observation; retain default off and shadow semantics. Add registry-target positive planning and fail-before-provider regressions. No Oracle, Docker, recovery migration or stopped-grant changes in this slice.
