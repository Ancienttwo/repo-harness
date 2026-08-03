# Plan: Long-run conformance closure

> **Status**: Executing
> **Created**: 20260803-2235
> **Slug**: long-run-conformance-closure
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: risk_boundary
> **Verification Boundary**: Concurrent closeout ownership, public continuation tick conformance, packaged CLI smoke, targeted tests, and repository Required Checks.
> **Rollback Surface**: Revert the codex/long-run-conformance-closure worktree commit; no persisted data migration or compatibility path.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260803-2235-long-run-conformance-closure.contract.md`
> **Task Review**: `tasks/reviews/20260803-2235-long-run-conformance-closure.review.md`
> **Implementation Notes**: `tasks/notes/20260803-2235-long-run-conformance-closure.notes.md`

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

- Active plan: `plans/plan-20260803-2235-long-run-conformance-closure.md`
- Sprint contract: `tasks/contracts/20260803-2235-long-run-conformance-closure.contract.md`
- Sprint review: `tasks/reviews/20260803-2235-long-run-conformance-closure.review.md`
- Implementation notes: `tasks/notes/20260803-2235-long-run-conformance-closure.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260803-2235-long-run-conformance-closure.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260803-2235-long-run-conformance-closure.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260803-2235-long-run-conformance-closure.md`.

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
- Contract file: `tasks/contracts/20260803-2235-long-run-conformance-closure.contract.md`
- Review file: `tasks/reviews/20260803-2235-long-run-conformance-closure.review.md`
- Implementation notes file: `tasks/notes/20260803-2235-long-run-conformance-closure.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260803-2235-long-run-conformance-closure.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260803-2235-long-run-conformance-closure.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert the codex/long-run-conformance-closure worktree commit; no persisted data migration or compatibility path.
- **Verification boundary**: Concurrent closeout ownership, public continuation tick conformance, packaged CLI smoke, targeted tests, and repository Required Checks.
- **Review/acceptance boundary**: `tasks/reviews/20260803-2235-long-run-conformance-closure.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: risk_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260803-2235-long-run-conformance-closure.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260803-2235-long-run-conformance-closure.contract.md`, `tasks/reviews/20260803-2235-long-run-conformance-closure.review.md`, and `tasks/notes/20260803-2235-long-run-conformance-closure.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260803-2235-long-run-conformance-closure.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert the codex/long-run-conformance-closure worktree commit; no persisted data migration or compatibility path.

## Captured Planning Output

# Long-run Conformance Closure

## Thesis

Long-run safety is a protocol property, not a documentation claim. A closeout must have exactly one live owner, an attempt receipt must be formed only from two real envelopes, and the conformance proof must drive the same public commands that an installed host uses.

## Confidence

- Confidence: high.
- Why not certain: the existing serial SIGKILL suite does not characterize simultaneous closeout invocation; the first proof point is an adversarial two-process fixture.

## P1: Architecture Map

- Effective State plus the active Sprint marker remain the only next-work authority.
- `state next` remains a deterministic read-only projection; `state attempt` remains ignored liveness evidence.
- `contract-worktree.sh` and `ship-worktrees.sh` own closeout lifecycle and their tracked template mirrors must remain byte-identical.
- The closeout journal under the Git common directory owns recovery progress, never workflow state.
- The host protocol and conformance suite own only orchestration correctness; they must not add a scheduler, quota ledger, auto-resume, journal GC, or a second task selector.

## P2: Concrete Trace

Opening `state next` returns one envelope. The host executes at most one bounded unit, reads a second envelope to obtain the actual after token, records one receipt from the opening/closing pair, then reads the post-receipt envelope that applies stall detection. A verify-or-finish turn executes the documented public gate sequence before closeout. A simultaneous second closeout for the same worktree/operation must lose an atomic owner claim before any lifecycle, merge, push, or shared journal temp write.

## P3: Design Decision

Use one Git-common-dir, worktree-and-operation-scoped exclusive directory claim shared by finish and ship. Acquisition is atomic and fail-closed; normal exit releases it, SIGKILL leaves it as explicit recovery evidence, and mutating recovery paths may take over only through an explicit recovery operation after proving the recorded owner is not live. Do not add automatic stale recovery or compatibility fallback. Correct the tick sequence and make the conformance driver execute the envelope-named command and the documented gate command order through the public interfaces. Refresh the local installed CLI only after source verification passes.

## Falsifier

- If two same-worktree closeouts can both cross the owner boundary or reach a lifecycle/external-effect phase, the design fails.
- If the conformance driver can complete after an envelope command or gate step is removed/reordered, the proof remains ornamental and the design fails.
- If the installed CLI after refresh still lacks `state next` or `state attempt`, deployment closure fails.

## Allowed Paths

- `scripts/contract-worktree.sh`
- `scripts/ship-worktrees.sh`
- `assets/templates/helpers/contract-worktree.sh`
- `assets/templates/helpers/ship-worktrees.sh`
- `tests/contract-worktree-closeout-journal.test.ts`
- `tests/continuation-conformance.test.ts`
- `docs/reference-configs/long-run-continuation.md`
- `docs/researches/20260803-loopx-comparative-analysis.md`
- `plans/`
- `tasks/`

## Task Breakdown

- [x] Add atomic same-worktree closeout ownership shared by finish and ship, with explicit recovery semantics and no auto-resume.
- [x] Add adversarial concurrent closeout tests proving exactly one process owns the transaction and the loser reaches no lifecycle, merge, push, or shared journal write.
- [x] Correct the tick to opening envelope → bounded unit/gate → closing envelope → attempt receipt → post-receipt envelope.
- [x] Make the disposable-repo conformance driver execute envelope-named commands and the documented public completion-gate order; narrow any remaining stub claim to what is actually proven.
- [x] Keep script/template projections byte-identical and update durable research wording so it does not overclaim the old proof.
- [x] Run targeted tests, typecheck, helper projection checks, all repository Required Checks, then refresh and smoke-test the installed `repo-harness` CLI.

## Non-goals

- Scheduler, daemon, timer, quota/token ledger, journal GC, automatic lock reclaim, automatic crash resume, new goal authority, compatibility aliases, or unrelated todo work.

## Evidence Contract

- State/progress path: active plan task checklist, generated contract/review/notes, Effective State, and closeout journal fixture phases.
- Verification evidence: concurrent closeout regression, continuation conformance test, existing WP1-WP3 suites, helper mirror check, typecheck, installed CLI smoke, and repository Required Checks.
- Evaluator rubric: both concurrent processes cannot own one closeout; every receipt uses two observed envelope tokens; public host command order is asserted; global CLI exposes and runs `state next` and `state attempt` after refresh.
- Stop condition: all plan tasks checked, contract exit criteria pass, review recommendation is pass, installed smoke passes, and no new P1/P2 finding remains.
- Rollback surface: revert the isolated worktree commit and restore the prior user-level CLI package if runtime refresh fails.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Add atomic same-worktree closeout ownership shared by finish and ship, with explicit recovery semantics and no auto-resume.
- [x] Add adversarial concurrent closeout tests proving exactly one process owns the transaction and the loser reaches no lifecycle, merge, push, or shared journal write.
- [x] Correct the tick to opening envelope → bounded unit/gate → closing envelope → attempt receipt → post-receipt envelope.
- [x] Make the disposable-repo conformance driver execute envelope-named commands and the documented public completion-gate order; narrow any remaining stub claim to what is actually proven.
- [x] Keep script/template projections byte-identical and update durable research wording so it does not overclaim the old proof.
- [x] Run targeted tests, typecheck, helper projection checks, all repository Required Checks, then refresh and smoke-test the installed `repo-harness` CLI.
