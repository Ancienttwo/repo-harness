# Plan: Fail-closed plan-status authority and truthful runner constraints

> **Status**: Archived
> **Created**: 20260720-0033
> **Slug**: plan-status-fail-closed-and-runner-truth
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: risk_boundary
> **Verification Boundary**: Targeted guard/decision/contract-run fixtures plus root required checks and verify-contract --strict
> **Rollback Surface**: Revert the single PR; characterization golden and behavior revert as one unit
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260720-0033-plan-status-fail-closed-and-runner-truth.contract.md`
> **Task Review**: `tasks/reviews/20260720-0033-plan-status-fail-closed-and-runner-truth.review.md`
> **Implementation Notes**: `tasks/notes/20260720-0033-plan-status-fail-closed-and-runner-truth.notes.md`

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

- Active plan: `plans/plan-20260720-0033-plan-status-fail-closed-and-runner-truth.md`
- Sprint contract: `tasks/contracts/20260720-0033-plan-status-fail-closed-and-runner-truth.contract.md`
- Sprint review: `tasks/reviews/20260720-0033-plan-status-fail-closed-and-runner-truth.review.md`
- Implementation notes: `tasks/notes/20260720-0033-plan-status-fail-closed-and-runner-truth.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260720-0033-plan-status-fail-closed-and-runner-truth.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260720-0033-plan-status-fail-closed-and-runner-truth.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260720-0033-plan-status-fail-closed-and-runner-truth.md`.

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
- Contract file: `tasks/contracts/20260720-0033-plan-status-fail-closed-and-runner-truth.contract.md`
- Review file: `tasks/reviews/20260720-0033-plan-status-fail-closed-and-runner-truth.review.md`
- Implementation notes file: `tasks/notes/20260720-0033-plan-status-fail-closed-and-runner-truth.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260720-0033-plan-status-fail-closed-and-runner-truth.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260720-0033-plan-status-fail-closed-and-runner-truth.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert the single PR; characterization golden and behavior revert as one unit
- **Verification boundary**: Targeted guard/decision/contract-run fixtures plus root required checks and verify-contract --strict
- **Review/acceptance boundary**: `tasks/reviews/20260720-0033-plan-status-fail-closed-and-runner-truth.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: risk_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260720-0033-plan-status-fail-closed-and-runner-truth.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260720-0033-plan-status-fail-closed-and-runner-truth.contract.md`, `tasks/reviews/20260720-0033-plan-status-fail-closed-and-runner-truth.review.md`, and `tasks/notes/20260720-0033-plan-status-fail-closed-and-runner-truth.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260720-0033-plan-status-fail-closed-and-runner-truth.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert the single PR; characterization golden and behavior revert as one unit

## Captured Planning Output

# Fail-Closed Plan-Status Authority and Truthful Runner Constraints

## Problem

The GPT-5.6 prompt-guidance audit (`docs/researches/20260716-gpt-5-6-prompt-guidance-harness-audit.md`)
names two P0 correctness defects that must outrank prompt slimming. Both were
re-verified against source on 2026-07-20:

1. **Unknown plan status fails open.** `src/cli/hook/prompt-guard-decision.ts:208-213`
   maps the `unknown` plan-status branch to `allow` for all four execution
   actions, and `assets/hooks/pre-edit-guard.sh:238` blocks only
   `Draft|Annotating` — a malformed, corrupted, or unrecognized status string
   falls through both layers and permits implementation edits. Malformed
   authority must fail closed at the edit boundary.
2. **Declared runner constraints are not truthful.** `scripts/contract-run.ts`
   parses `tokens`, `wall_time_minutes`, `network`, and `writable_paths`
   (lines 330-338) but never consumes the first three anywhere;
   `writable_paths` appears only in worker prompt text (line 637), not as an
   enforced boundary. `tool_calls` is enforced (lines 610, 704) but counts
   worker/verifier process launches, not model tool calls, and the honest
   `runner_invocations` rename was never done. A contract that declares a
   constraint the runner silently ignores is a false safety claim.

Neither defect has a home in the Program: LSC is closed, and every HRD cutover
row is bound to behavior parity against the HRD-01 frozen baseline, so HRD
rows can only carry the fail-open forward, never fix it. The audit's slice 1
states this fix "is new implementation authority and must be explicitly added
to an approved work package". This plan is that work package (approved by the
owner in-session, 2026-07-20).

## Design Decisions

- **Edit layer is the hard gate; prompt layer stays advisory.** Per the Loop
  Program boundary (audit LOOP-09), the fix does not give the prompt
  classifier hard authority: `pre-edit-guard` (and its packaged mirror)
  gains a fail-closed default branch for any status outside the known-good
  set (`Approved|Executing|Done|...` — enumerate from the plan-status
  authority, do not hand-copy strings); the prompt decision table's
  `unknown` branch moves from silent `allow` to the conservative
  orientation/advisory action so the session is steered to repair authority,
  while the hard block lands at the edit boundary.
- **Enforce-or-reject, no silent dimensions.** For every delegation
  constraint: if non-null and enforceable, enforce it mechanically
  (`wall_time_minutes` via the bounded process runner deadline); if non-null
  and not yet enforceable (`tokens`, `network`, `writable_paths` narrowing),
  contract-run preflight must REJECT the contract with a clear message
  instead of running with a false claim. No constraint may parse to a no-op.
- **Honest counter naming.** Rename the `tool_calls` budget/report field to
  `runner_invocations` in one shot: schema, parser, enforcement, report
  output, template, exemplar docs, and tests move in the same package; no
  alias, no dual field, fail closed on the old name.
- **Behavior change is the purpose — golden handling is explicit.** If the
  HRD-01 runtime characterization golden
  (`tests/fixtures/loop-runtime/characterization.json`) legitimately shifts
  (e.g. the fixture repo's plan-status path), regenerate it once inside this
  package with a before/after note in the PR body; successor HRD rows then
  pin the post-fix baseline. Do not suppress the shift with normalization.

## Scope

- `src/cli/hook/prompt-guard-decision.ts`: `unknown` branch → conservative
  advisory action; positive/negative decision-table fixtures.
- `assets/hooks/pre-edit-guard.sh` (+ `bun run sync:hooks` projection):
  fail-closed default case for unrecognized plan status with a structured
  error naming the offending status and file; fixtures for malformed,
  empty, and unrecognized statuses.
- `scripts/contract-run.ts` (+ its asset mirror if projected):
  enforce-or-reject for `tokens`/`wall_time_minutes`/`network`/
  `writable_paths`; `wall_time_minutes` enforced via the existing bounded
  runner; `tool_calls` → `runner_invocations` one-shot rename across
  schema/report/docs/tests; contract template and
  `docs/reference-configs/sprint-contracts.md` updated in the same package.
- Tests: decision-table cases, edit-guard status fixtures, contract-run
  preflight rejection cases, rename coverage; HRD-01 characterization suite
  re-run with documented outcome.

## Out of Scope

- Any HRD row content (collector, handler cutovers, journal, circuit, telemetry, retirement).
- Prompt slimming, Context Packet, or any audit slice ≥2 work.
- The `verify-contract` qa_scores dimension-name mismatch (separate todos row).
- The solo-operator external-acceptance policy decision (separate todos row).
- Any compatibility alias, dual field, or fallback window.

## Sequencing

Execute between HRD rows only: start after HRD-02 merges and closes, and do
not run concurrently with any HRD contract worktree (shared surfaces:
`pre-edit-guard.sh`, the characterization golden). The successor HRD row
pins the live post-fix `origin/main` SHA per the Program successor rule.

## Acceptance

- Unknown/malformed/unrecognized plan status deterministically blocks
  implementation edits at the edit guard (both repo-pinned and packaged
  hook paths), with a structured reason; known-good statuses unchanged.
- Prompt decision table has no silent `allow` on `unknown`; routing/advice
  output is covered by fixtures.
- Every non-null delegation constraint is either mechanically enforced or
  rejected at preflight; a contract declaring an unenforceable non-null
  constraint fails closed with a clear message.
- `runner_invocations` is the only name in schema, report, docs, and tests;
  the old field fails closed.
- `bun test`, `bun run check:type`, `check:state-boundaries`, `check:hooks`,
  and `repo-harness run check-task-workflow --strict` pass; the HRD-01
  characterization outcome (unchanged or one-shot regenerated) is recorded
  in the PR body.

## Verification Boundary

Targeted new fixtures plus the root required checks; `repo-harness run
verify-contract --strict` against this package's contract.

## Rollback Surface

Revert the single PR; no data migration. If the characterization golden was
regenerated, the revert restores the prior golden together with the prior
behavior — they move as one unit.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Execute captured plan: Fail-closed plan-status authority and truthful runner constraints
