> **Archived**: 2026-09-06 04:00
> **Related Plan**: plans/archive/plan-20260906-0134-brc7-local-planning-handoff.md
> **Outcome**: Completed
> **Lifecycle**: plan
> **Parent Run ID**: run-20260906-0400
> **Archive Projection V1**: `plans/plan-20260906-0134-brc7-local-planning-handoff.md` => `plans/archive/plan-20260906-0134-brc7-local-planning-handoff.md`
> **Archive Projection V1**: `tasks/notes/20260906-0134-brc7-local-planning-handoff.notes.md` => `tasks/archive/notes-20260906-0400-brc7-local-planning-handoff.md`
> **Archive Projection V1**: `tasks/contracts/20260906-0134-brc7-local-planning-handoff.contract.md` => `tasks/archive/contract-20260906-0400-brc7-local-planning-handoff.md`
> **Archive Projection V1**: `tasks/reviews/20260906-0134-brc7-local-planning-handoff.review.md` => `tasks/archive/review-20260906-0400-brc7-local-planning-handoff.md`

# Plan: BRC7 Local planning handoff and feature promotion guard

> **Status**: Archived
> **Created**: 20260906-0134
> **Slug**: brc7-local-planning-handoff
> **Planning Source**: waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: sprint:plans/sprints/20260902-2238-gpt-pro-seeded-repair-campaign.sprint.md#BRC7 — Local auto-plan 交接与 feature-promotion guard
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Exact Issue and Task bound local planning admission into existing TaskOffer
> **Rollback Surface**: Revert BRC7 implementation while retaining BRC6 manifests and immutable provider receipts
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/archive/contract-20260906-0400-brc7-local-planning-handoff.md`
> **Task Review**: `tasks/archive/review-20260906-0400-brc7-local-planning-handoff.md`
> **Implementation Notes**: `tasks/archive/notes-20260906-0400-brc7-local-planning-handoff.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from waza-think planning output.
- Source ref: sprint:plans/sprints/20260902-2238-gpt-pro-seeded-repair-campaign.sprint.md#BRC7 — Local auto-plan 交接与 feature-promotion guard
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/archive/plan-20260906-0134-brc7-local-planning-handoff.md`
- Sprint contract: `tasks/archive/contract-20260906-0400-brc7-local-planning-handoff.md`
- Sprint review: `tasks/archive/review-20260906-0400-brc7-local-planning-handoff.md`
- Implementation notes: `tasks/archive/notes-20260906-0400-brc7-local-planning-handoff.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/archive/contract-20260906-0400-brc7-local-planning-handoff.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/archive/plan-20260906-0134-brc7-local-planning-handoff.md` and may start `repo-harness run contract-worktree start --plan plans/archive/plan-20260906-0134-brc7-local-planning-handoff.md`.

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
- Contract file: `tasks/archive/contract-20260906-0400-brc7-local-planning-handoff.md`
- Review file: `tasks/archive/review-20260906-0400-brc7-local-planning-handoff.md`
- Implementation notes file: `tasks/archive/notes-20260906-0400-brc7-local-planning-handoff.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/archive/contract-20260906-0400-brc7-local-planning-handoff.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/archive/plan-20260906-0134-brc7-local-planning-handoff.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert BRC7 implementation while retaining BRC6 manifests and immutable provider receipts
- **Verification boundary**: Exact Issue and Task bound local planning admission into existing TaskOffer
- **Review/acceptance boundary**: `tasks/archive/review-20260906-0400-brc7-local-planning-handoff.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/archive/plan-20260906-0134-brc7-local-planning-handoff.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/archive/contract-20260906-0400-brc7-local-planning-handoff.md`, `tasks/archive/review-20260906-0400-brc7-local-planning-handoff.md`, and `tasks/archive/notes-20260906-0400-brc7-local-planning-handoff.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/archive/review-20260906-0400-brc7-local-planning-handoff.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert BRC7 implementation while retaining BRC6 manifests and immutable provider receipts

## Captured Planning Output

## Goal

Complete Sprint BRC7: hand each adopted bugfix/test_gap to the authorized local parent session for planning, and let the existing TaskOffer projection alone determine execution readiness after exact source/task/plan proof and hard protection gates.

## Scope

In scope: post-materialization campaign step routing; replay-safe local planning handoff; closed outcomes; exact Issue observation binding; required bugfix/test-gap evidence; planned feature/protected-surface rejection; existing TaskOffer admission integration; focused integration fixtures and canonical verification.
Out of scope: BRC8 worker dispatch, Claim/Lease/WorkEnvelope changes, BRC9 budgets, campaign state-machine redesign, provider authoring, automatic merge, Task/Lease/Acceptance/Publication protocol changes.

## P1 / P2 / P3

P1: BRC6 publication owns the canonical manifest and persistent task IDs. Existing external-source observation/binding stores own provider snapshots and exact plan/task binding. fleet/acquire owns TaskOffer and revalidates offers before acquire. contract-run preflight owns bugfix Root Cause Evidence. The frozen protected-capabilities fixture and canonical archcontext nodes own protection scope.
P2: canonical adoption manifest -> registered canonical Task -> refreshed provider observation -> local parent planning job -> host capture-plan -> existing preflight + exact binding -> campaign admission proof -> existing TaskOffer execution_ready. Controller never invokes a planner or asks whether it finished. BRC5 authoring retains its original-target check; the separate post-adoption path verifies publication ancestry.
P3: preserve existing protocol bytes. Extend existing refresh input with required caller-owned policy while retaining the existing binding input (the observation store deduplicates source_revision). Do not guess the latest observation. Reuse preflight through a CLI-injected callback; expose its validated artifact digests so later reads can reject changed evidence without a new Root Cause Evidence parser. No new runtime dependency, service, config or credential. Existing gh manual intake is reused and injected in tests. Tenfold load first stresses synchronous per-repository provider refresh and canonical file reads; refresh once per step, cap planning to one job per step, reuse one manifest/protection snapshot per offer collection.

## Direction and tradeoff

Thesis: planning is a constrained handoff, not a second scheduler. Confidence high in TaskOffer/binding reuse; planning evidence is trusted local-host output bound to bytes, not a claim that a controller performed semantic planning. The feature declaration is an explicit host-authored planned-surface contract; omission fails closed and declared additions hard-stop. BRC8 remains responsible for execution drift against that admitted scope. Rejected approach: controller runs hunt/LLM or parses plan prose to invent semantic classifications. It would violate local parent ownership and duplicate authority.

More than eight files are required across campaign core/effects/CLI, fleet admission, external-source explicit inputs, preflight evidence readback, tests and architecture/workflow records. One merge and rollback boundary is necessary: emitting jobs without admission protection would make the feature unsafe.

## Contract and data flow

```text
canonical manifest + grant + canonical policy + protected inventory
                    |                         |
                    v                         v
              campaign planning step -> immutable local-host job
                    ^                         |
                    |                 host hunt/characterize
                    |                 host capture-plan
                    |                         |
existing TaskOffer <- admission proof <- host outcome submission
                           |                  |
                 external source binding <- preflight evidence
```

1. Extend existing campaign step CLI with local host/session and optional planning-result JSON. Before adoption it retains the existing authoring route. After a stored publication exists, require its materialized commit to be a canonical ancestor and the current canonical manifest bytes to match the original publication. Resolve the existing grant, registry identity, expiry, manual merge and local_parent_host. Current canonical mode off rejects mutations; shadow renders only a dry-run job and never records job/result/binding. Active permits one job or one result per step. Do not append unrelated group lifecycle events.
2. Job binds campaign/group/intent/publication, stable task ID and revision, exact observation SHA/source revision, plan Source Ref, authorized host/session and frozen planned-source metadata. Persist immutable job/result records under the existing Git-common campaign store with an exclusive lock. Replay identical input idempotently; a conflicting session or different result for the same job fails closed. No host spawning, browser calls, claim, lease or worker execution.
3. Host receives exact untrusted Issue context plus instructions to use hunt for bugfix or characterize for test_gap and capture-plan with exact Sprint source ref. Result outcomes are exactly plan_ready, not_reproducible, feature_route_required, human_attention_required, source_stale, planning_failed. Results are evidence carriers only: step completion is read from TaskOffer, never the result's success label.
4. Host plan_ready submission includes a required concrete planned-path list and explicit arrays for new CLI commands, MCP tools, public exports, protocol kinds and capability nodes. Any nonempty addition yields feature_route_required with feature_surface_detected. Missing, malformed, broad/unbounded or inconsistent path declarations reject. Verify declared paths cover the contract Allowed Paths exactly. Read protected capability IDs and unmapped closure from tests/fixtures/repair-campaign/protected-capabilities.json at canonical target; resolve ownership through existing archcontext APIs. A protected primary capability, suspected path or planned path hard-stops with protected_surface_detected. Never duplicate the frozen list or reduce rejection to warnings.
5. Bugfix requires existing contract-run preflight success for Task Profile bugfix. Extend its existing validated evidence readback to return exact evidence-file hashes without introducing another parser. CLI injects the preflight runner; effects never import CLI/helpers. Test-gap requires typed characterization evidence: current behavior, regression guard, old-test gap/falsifier command and immutable artifact showing old tests pass while the new guard detects the missing coverage/old implementation or mutation. Missing evidence cannot become plan_ready. Hash all referenced artifacts and validate on subsequent read.
6. refreshExternalSource requires an explicit validated policy; the ordinary external-source CLI reads its current policy, while campaign supplies the authorized canonical policy. Consume bindExternalSource unchanged: use the stored immutable observation, require its unique source revision and verify the resulting receipt observation_sha256 equals the planning job. The store deduplicates same-revision observations; do not invent a repeated-refresh ambiguity or widen the public bind CLI. Preserve binding receipt schema and test exact digest mismatch rejection.
7. Offer collection applies campaign admission after its existing plan proof. Noncampaign offers remain on the existing path. Campaign rows require canonical manifest provenance, a valid exact ExternalSourceBinding, admitted plan/contract/evidence hashes and current provider revision. Invalid or missing campaign proof maps to the existing plan_not_projectable failure; controller exposes precise closed outcomes. Issue edit, Task revision change, plan/contract/evidence modification, grant expiry or protection drift removes readiness. Read-side performs no network or writes; controller refreshes provider before observing readiness. Acquisition retains its existing re-collection behavior and no schema changes.

## Task Breakdown

- [x] Implement strict planning contracts and pure feature/protection/evidence validation with negative fixtures.
- [x] Wire canonical post-adoption authority, immutable session handoff, exact refresh/binding and CLI-owned preflight evidence.
- [x] Integrate campaign admission into existing TaskOffer collection; test complete materialize -> job -> local plan -> readiness and staleness paths.
- [ ] Complete architecture reconciliation, one formal review, frozen verification, durable documentation and canonical finish under owner acceptance.

## Verification

Development: focused core/effects/CLI tests for planning, external source binding/refresh, contract-run preflight and fleet offers. Cover bugfix and test_gap happy paths; missing evidence; all six outcomes; all five feature kinds; protected capability/path and broad scope; off/shadow; wrong host/session; replay/conflicting outcome; canonical manifest/ancestry drift; exact observation/task/plan/contract/artifact drift; no controller planning or execution effects. Exercise actual BRC6 materialization and real TaskOffer classification in a disposable repository.

Final: type checking and state-boundaries; repository integrity checks from AGENTS; init dry-run; full bun test --timeout 60000 once after implementation/review freezes, preserving its exact subject. Expected 20–25 minutes, justified by the user's supplied full-suite requirement for runtime/shared contracts. Run canonical verify-sprint prepare with explicit deterministic_test and runtime_readback oracles. Reuse valid evidence only with subject/fingerprint/freshness proof. Stop after three retries per issue or a second out-of-scope fault.

## Rollback and completion

One local mergeable implementation commit; revert it to disable BRC7 while preserving BRC6 manifests and existing provider/budget receipts. No provider mutation is performed by planning. Persisted planning records become unused immutable evidence on rollback. Keep deployment mode off by default. Promote verified contract details into docs/researches/20260905-repair-campaign-sprint-execution-boundaries.md, update Sprint through canonical workflow, archive fulfilled artifacts. Use installed repo-harness canonical finish; do not push without authorization.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Implement strict planning contracts and pure feature/protection/evidence validation with negative fixtures.
- [x] Wire canonical post-adoption authority, immutable session handoff, exact refresh/binding and CLI-owned preflight evidence.
- [x] Integrate campaign admission into existing TaskOffer collection; test complete materialize -> job -> local plan -> readiness and staleness paths.
- [ ] Complete architecture reconciliation, one formal review, frozen verification, durable documentation and canonical finish under owner acceptance.

## Approved stale-slot closure correction

User approved the bounded follow-up: when source drift precedes the first handoff, create the existing job identity from the immutable adoption observation, retain source_stale, and expose that job for the authorized local parent to close through the existing terminal-result submission. No automatic terminal result, readiness, new protocol or controller planning. Regression covers original observation binding, repeated stale response, idempotent replay, rejected plan_ready and wrong owner, explicit closure without provider access, and later-slot admission.
