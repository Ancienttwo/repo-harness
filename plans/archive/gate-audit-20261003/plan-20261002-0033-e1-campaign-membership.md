# Plan: E1 S3 campaign membership and callback authority

> **Status**: Executing
> **Created**: 20261002-0033
> **Slug**: e1-campaign-membership
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: risk_boundary
> **Verification Boundary**: R2 owner guard, replay/compensation/budget evidence and unchanged admission
> **Rollback Surface**: Revert reviewed feat/e1-campaign-membership diff; preserve ledger/seal/pending/claim evidence
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20261002-0033-e1-campaign-membership.contract.md`
> **Task Review**: `tasks/reviews/20261002-0033-e1-campaign-membership.review.md`
> **Implementation Notes**: `tasks/notes/20261002-0033-e1-campaign-membership.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-plan planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20261002-0033-e1-campaign-membership.md`
- Sprint contract: `tasks/contracts/20261002-0033-e1-campaign-membership.contract.md`
- Sprint review: `tasks/reviews/20261002-0033-e1-campaign-membership.review.md`
- Implementation notes: `tasks/notes/20261002-0033-e1-campaign-membership.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20261002-0033-e1-campaign-membership.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20261002-0033-e1-campaign-membership.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20261002-0033-e1-campaign-membership.md`.

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
- Contract file: `tasks/contracts/20261002-0033-e1-campaign-membership.contract.md`
- Review file: `tasks/reviews/20261002-0033-e1-campaign-membership.review.md`
- Implementation notes file: `tasks/notes/20261002-0033-e1-campaign-membership.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20261002-0033-e1-campaign-membership.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20261002-0033-e1-campaign-membership.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert reviewed feat/e1-campaign-membership diff; preserve ledger/seal/pending/claim evidence
- **Verification boundary**: R2 owner guard, replay/compensation/budget evidence and unchanged admission
- **Review/acceptance boundary**: `tasks/reviews/20261002-0033-e1-campaign-membership.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: risk_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20261002-0033-e1-campaign-membership.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20261002-0033-e1-campaign-membership.contract.md`, `tasks/reviews/20261002-0033-e1-campaign-membership.review.md`, and `tasks/notes/20261002-0033-e1-campaign-membership.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20261002-0033-e1-campaign-membership.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert reviewed feat/e1-campaign-membership diff; preserve ledger/seal/pending/claim evidence

## Captured Planning Output

## Why
S3 closes campaign owner membership and callback/context authority gaps without replacing admission or extending production selected transports. The approved GAP3/4 direction and falsifier are already supplied by the owner; no new product/design decision or geju pass is needed.

## Goal
Current campaign admission binds R2 owner identity, checks chosen Task membership before A and current authority/membership before callback completion/replay. R1 completed keys cannot replay as R2. Preserve pending/unknown, own-claim-only compensation, budget/evidence ordering and ordinary plain behavior. Type the existing ledger cutover-required refusal and preserve MCP mapping.

## P1 Architecture Map
Owners: effects/automation/campaign-acquisition.ts owns manifest/context/compensation and budget wrapper; effects/engineers/scheduling-acquire-next.ts owns trusted before-acquire/callback ports, policy/request identity and key receipts; scheduled admission and core offers are unchanged. Planning proof reads canonical published manifests/current grant/policy. Campaign, planning, capacity and Task lease locks are separate; issue-batch publication uses its own lock and external Git writers do not share admission locks.

## P2 Concrete Trace
runCampaignAcquisition -> persisted intent/current planning authority -> authenticated principal/parent -> R2 policy/context request -> outer key conflict/pending/replay checks -> current context recheck -> reserve and durable admission -> inner key pending -> owner guard on exact auto/selected offer -> unchanged A -> callback validates current context/member and ClaimActor/envelope -> guarded own-claim compensation on failure -> inner completion -> outer result -> idempotent usage -> handoff. Effect/callback/result exceptions remain unresolved; completed replay does not re-run effect/callback/reserve or release a running claim.

## P3 Decision
Reuse existing ports/stores. Add one trusted before-acquire port used by both C facades, required only for campaign R2; keep plain R1 and disallow legacy R1 campaign requests on the active producer. Keep protocol-2 receipt/scope schema; old receipt request remains opaque digest-bound evidence, conflicts against R2 with no migration/fallback. R2 scope manifest_sha256 stays manifest digest; authorization_revision binds current grant SHA plus current campaign policy, preserving existing scope keys. Compare owner-computed context before budget/effect and callback/replay; never accept host-owned membership. Reuse releaseSprintCommand with its existing coordination.readLease port to compare acquired Task/claim/generation/branch/worktree/unit inside the existing Task lock. Unknown, missing or rotated ownership refuses compensation. No abstraction/dependency/store/schema migration. At 10x, authority Git reads and inventory/ledger retention dominate, not correctness relaxation; optimization/GC is outside scope.

## Scope and Allowed Paths
- src/effects/automation/campaign-acquisition.ts
- src/effects/engineers/scheduling-acquire-next.ts
- tests/effects/campaign-acquisition.test.ts
- tests/unit/issue-280-acquire-next.test.ts
- tests/cli/mcp-engineer-tools.test.ts
- docs/reference-configs/engineer-acquisition-cutover.md
- Generated timestamped plan/contract/review/notes for this work-package only.
No edits to primary checkout, lower A, 13-field assertion, core offer revision, production selected entries, unrelated tasks/plans, assets, manifest, versions or dependencies. No S4, merge, Ready, finish, new benchmark/test file/document or fabricated AcceptanceReceipt. EXECUTION_BOUNDARY: requirements absent from the approved packet are forbidden.

## Verification Plan
Extend only existing campaign/issue-280/MCP fixtures; retain ME-1A and issue-279 controller baseline. Assert zero A/claim for wrong group, pre/post manifest/context changes, guarded compensation race/unknown/rotated Lease, callback-before-completion, pending/crash/outer orphan refusal and idempotent replay/usage. Simulate existing R1 completed protocol-2 receipts as exact historical bytes; R2 conflicts before any effect/callback/budget. Test typed cutover-required through MCP. Checks: these five test files; bun run check:type; hooks/helpers/reference-configs/deploy-sql/architecture/task-sync/strict-workflow; project-state inspector and init dry-run. Avoid full suite/new parallel benchmarks. Exact-current evidence via canonical contract executor.

## Acceptance/Stop Conditions
Complete allowed scope and passing canonical checks; Draft PR is implementation delivery, semantic acceptance belongs to reviewer. Stop for unsafe owner authority bypass or scope conflict; do not relax locks or manufacture facts. Full writer serialization is not proven: document sampled pre/post guarantee, separate publication/Task locks and residual cross-store/claim-time race. Formal Receipt remains reviewer-owned.


## Source Authority
Primary uncommitted design file: /Users/chris/Projects/repo-harness/docs/researches/20260930-fleet-responsibility-trace.md
SHA256: c5c164ce61cc512a98da2aa41916565b9faae5afdda65d0c7b4834a09d3baf95
Base: origin/main dba184d9. User-authorized implementation; no deletion decision.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Implement campaign R2 owner guard/context, frozen plain behavior and exact compensation port checks.
- [x] Extend existing regression fixtures and record lock coverage/limits; contract Verification Plan owns final checks.
- [ ] Designated semantic acceptance remains outside execution-owner authority; keep PR Draft.
