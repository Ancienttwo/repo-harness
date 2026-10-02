# Plan: E1 S4 selected entrypoints and closed observation inputs

> **Status**: Executing
> **Created**: 20261002-1401
> **Slug**: e1-selected-entrypoints
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: risk_boundary
> **Verification Boundary**: Four entrypoints share selected C; local full tests and typecheck; unchanged auto/admission
> **Rollback Surface**: Revert reviewed feat/e1-selected-entrypoints diff; preserve key/observation/controller/campaign evidence
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20261002-1401-e1-selected-entrypoints.contract.md`
> **Task Review**: `tasks/reviews/20261002-1401-e1-selected-entrypoints.review.md`
> **Implementation Notes**: `tasks/notes/20261002-1401-e1-selected-entrypoints.notes.md`

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

- Active plan: `plans/plan-20261002-1401-e1-selected-entrypoints.md`
- Sprint contract: `tasks/contracts/20261002-1401-e1-selected-entrypoints.contract.md`
- Sprint review: `tasks/reviews/20261002-1401-e1-selected-entrypoints.review.md`
- Implementation notes: `tasks/notes/20261002-1401-e1-selected-entrypoints.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20261002-1401-e1-selected-entrypoints.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20261002-1401-e1-selected-entrypoints.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20261002-1401-e1-selected-entrypoints.md`.

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
- Contract file: `tasks/contracts/20261002-1401-e1-selected-entrypoints.contract.md`
- Review file: `tasks/reviews/20261002-1401-e1-selected-entrypoints.review.md`
- Implementation notes file: `tasks/notes/20261002-1401-e1-selected-entrypoints.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20261002-1401-e1-selected-entrypoints.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20261002-1401-e1-selected-entrypoints.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert reviewed feat/e1-selected-entrypoints diff; preserve key/observation/controller/campaign evidence
- **Verification boundary**: Four entrypoints share selected C; local full tests and typecheck; unchanged auto/admission
- **Review/acceptance boundary**: `tasks/reviews/20261002-1401-e1-selected-entrypoints.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: risk_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20261002-1401-e1-selected-entrypoints.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20261002-1401-e1-selected-entrypoints.contract.md`, `tasks/reviews/20261002-1401-e1-selected-entrypoints.review.md`, and `tasks/notes/20261002-1401-e1-selected-entrypoints.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20261002-1401-e1-selected-entrypoints.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert reviewed feat/e1-selected-entrypoints diff; preserve key/observation/controller/campaign evidence

## Captured Planning Output

## Why
S4 wires the already accepted S1-S3 observation/C/owner contracts into four production entrypoints. MCP direct acquisition currently bypasses C; the other selected paths are absent. The owner supplied the accepted GAP1/S4 design and authorization, so no new target-model/geju decision is required.

## Goal
CLI engineer acquire (new), MCP engineer_acquire (required key/ref schema cutover), explicit controller and campaign selected inputs all carry identical observation_ref plus complete13-field assertion through acquireSelectedEngineerTask to unchanged scheduled admission. No selected malformed/missing input may call auto PICK. Preserve existing auto branches, plain R1/campaign R2 and owner budget/event/callback/recovery boundaries. Deliver local full-tests/typecheck passing local commit and reviewable local evidence for Aimpact; no Ready/merge/S5/fake Receipt/verdict.

## P1 Architecture Map
Source owners: scheduling-acquire-next owns closed assertion/choice normalization and C; engineer CLI and MCP tools own authentication and transport; controller-run owns state/events/reservations/liveness/attempts; campaign-acquisition owns R2 membership/context/callback/compensation/budget. CLI automation/campaign are transport consumers. MCP instructions and existing engineer/http/controller/campaign fixtures are schema/inventory consumers. Lower A, core13-field assertion and offer hashing remain byte-identical.

## P2 Concrete Trace
prepare under current server principal -> immutable observation/ref -> caller choice -> transport principal/fence and closed request validation -> explicit selected branch -> existing C key ledger -> observation freshness/MATCH -> unchanged A -> owner completion/callback/event/budget paths. Controller selected uses the existing acquisition key address so prior auto/unknown evidence cannot be bypassed; selected choice digest/ref is included in existing event evidence_refs. Campaign builds outer identity from the same selected options used by inner C and validates selected Task membership before reservation/effect, retaining all S3 owner guards and operator consequences. Missing choice/ref is rejected before mutation; no alternate Task or auto call.

## P3 Decisions and Tradeoffs
Reuse/export a narrow closed choice parser in existing C module (observation_ref + assertion) using its existing private13-field validator; no duplicate authority. CLI uses explicit acquire command with authorization/key/ref/assertion-file. MCP direct acquire requires key/ref and closes the old raw selected schema, with explicit refusal for unported clients; deprecated raw max_attempts is not silently ignored or carried into unbound C identity. Controller/campaign receive an explicit selected choice field and corresponding --selected marker/ref/assertion-file flags; malformed selected fields or selected-only flags without marker reject rather than defaulting to auto. Existing auto requests omit selected and retain their separate branch. Validate selected early; owner policy cannot be provided by transport. No new scheduler/runner adapter/picker/GC/store/migration. At10x, existing authority reads and immutable ledger retention dominate; optimizer/retention changes are out of scope.

## Allowed Paths
src/effects/engineers/scheduling-acquire-next.ts
src/cli/commands/engineer.ts
src/cli/mcp/engineer-tools.ts
src/cli/mcp/instructions.ts
src/effects/automation/controller-run.ts
src/cli/commands/automation.ts
src/effects/automation/campaign-acquisition.ts
src/cli/commands/campaign.ts
tests/cli/engineer.test.ts
tests/cli/mcp-engineer-tools.test.ts
tests/cli/mcp-http.test.ts
tests/unit/issue-279-automation-controller-run.test.ts
tests/effects/campaign-acquisition.test.ts
docs/reference-configs/engineer-acquisition-cutover.md
Generated timestamped plan/contract/review/notes for this work-package only. Any other necessary consumer path must be explicitly justified and added to contract before editing. No primary checkout edits, lower admission/core assertions/offer revision, assets/manifests/dependencies/version changes, benchmarks/new test files/test docs, S5, Ready, merge or fabricated receipt/verdict. EXECUTION_BOUNDARY: absent requirements are forbidden.

## Verification Boundary
Extend existing fixtures: CLI admits only the specified second offer and rejects incomplete/foreign/stale key/ref; MCP schema/inventory and HTTP clients migrate; controller selected calls facade once/selector zero and binds existing events; campaign selected identity shared with outer budget, R2 membership/compensation/replay and auto baseline. Local full suite through existing scripts/lib/ci-run-tests.sh isolated file runner with 180000ms timeout and bounded4 jobs, plus explicit bun run check:type and all9 required integrity/state/adoption gates; no parallel benchmark/test documents or hostedCI dependency. Full run is owner-authorized for this multi-entry schema cutover. Final exact evidence/notes digest and local commit; typed semantic acceptance remains owner/reviewer-owned.

## Risks / Stop Conditions
Stop if a schema consumer cannot migrate within authorized paths or routing would bypass C/owner callbacks. Validate choice before reservation on selected paths. Preserve pending/completed ordering and policy conflicts; observation is not authority and no expiry cleanup. Controller lifecycle may ignore acquisition when executing; selected input must be explicitly matched/refused, not silently applied to another acquired Task. S3 sampled pre/post scope and cooperating-writer lock limitations remain, no new atomicity claims. No full deployment/S5 canary is claimed.

## Source Authority
Primary uncommitted design: /Users/chris/Projects/repo-harness/docs/researches/20260930-fleet-responsibility-trace.md
SHA256: c5c164ce61cc512a98da2aa41916565b9faae5afdda65d0c7b4834a09d3baf95
Base: origin/main9aef6693; runbook in that base includes S3 owner decisions.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Wire four explicit selected routes and migrate inventories/schema consumers without altering auto/A.
- [ ] Extend existing fixtures and durable input/migration documentation; execute full local verification and deliver local commit for coordinator review.

## Latest coordinator/owner boundary

Continue this existing worktree and one active plan; preserve existing artifacts and do not scaffold additional contract/notes/todos. This earlier local-only remote boundary is superseded by the 14:33 correction below. Skip GitHub CI; no Ready/merge/delete/S5 or fabricated Receipt/verdict/independent review pass. Aimpact reviews actual local diff/evidence before any remote action. The unrelated untracked coordinator handoff is preserved and excluded from this worker commit. This supersedes prior remote delivery wording.

## Aimpact remote authorization correction (14:33)

After actual local full suite, typecheck, applicable integrity checks and coordinator independent review, push feat/e1-selected-entrypoints and create a Draft PR for Aimpact are authorized. These are the only remote writes. Do not Ready, merge, delete branches/worktrees, modify main or run GitHub CI. Preserve all existing artifacts; no new scaffolding. This supersedes earlier local-only remote-delivery wording.
