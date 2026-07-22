# Plan: EPC-08: Context Packet Cutover

> **Status**: Executing
> **Created**: 20260723-0024
> **Slug**: epc-08-context-packet-cutover
> **Planning Source**: repo-harness-sprint
> **Orchestration Kind**: host-plan
> **Source Ref**: sprint:plans/sprints/20260722-0001-evidence-projection-convergence.sprint.md#epc-08
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: 27-state Authority×Profile panel measured with the frozen token gates (every sample estimated_tokens <= 1500 and within_budget, panel p95 <= 700, method utf8_bytes_div_4), per-sample table committed; no-independent-assembly test proves the old path is gone; full bun test green
> **Rollback Surface**: Revert the single PR: restores the independent assembly reads and removes the projection sourcing + panel runner; budget mechanics unchanged either way
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260723-0024-epc-08-context-packet-cutover.contract.md`
> **Task Review**: `tasks/reviews/20260723-0024-epc-08-context-packet-cutover.review.md`
> **Implementation Notes**: `tasks/notes/20260723-0024-epc-08-context-packet-cutover.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-sprint planning output.
- Source ref: sprint:plans/sprints/20260722-0001-evidence-projection-convergence.sprint.md#epc-08
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260723-0024-epc-08-context-packet-cutover.md`
- Sprint contract: `tasks/contracts/20260723-0024-epc-08-context-packet-cutover.contract.md`
- Sprint review: `tasks/reviews/20260723-0024-epc-08-context-packet-cutover.review.md`
- Implementation notes: `tasks/notes/20260723-0024-epc-08-context-packet-cutover.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260723-0024-epc-08-context-packet-cutover.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260723-0024-epc-08-context-packet-cutover.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260723-0024-epc-08-context-packet-cutover.md`.

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
- Contract file: `tasks/contracts/20260723-0024-epc-08-context-packet-cutover.contract.md`
- Review file: `tasks/reviews/20260723-0024-epc-08-context-packet-cutover.review.md`
- Implementation notes file: `tasks/notes/20260723-0024-epc-08-context-packet-cutover.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260723-0024-epc-08-context-packet-cutover.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260723-0024-epc-08-context-packet-cutover.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert the single PR: restores the independent assembly reads and removes the projection sourcing + panel runner; budget mechanics unchanged either way
- **Verification boundary**: 27-state Authority×Profile panel measured with the frozen token gates (every sample estimated_tokens <= 1500 and within_budget, panel p95 <= 700, method utf8_bytes_div_4), per-sample table committed; no-independent-assembly test proves the old path is gone; full bun test green
- **Review/acceptance boundary**: `tasks/reviews/20260723-0024-epc-08-context-packet-cutover.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260723-0024-epc-08-context-packet-cutover.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260723-0024-epc-08-context-packet-cutover.contract.md`, `tasks/reviews/20260723-0024-epc-08-context-packet-cutover.review.md`, and `tasks/notes/20260723-0024-epc-08-context-packet-cutover.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260723-0024-epc-08-context-packet-cutover.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert the single PR: restores the independent assembly reads and removes the projection sourcing + panel runner; budget mechanics unchanged either way

## Captured Planning Output

> **Task Profile**: code-change

## Decision Summary

EPC-08 implements Sprint C backlog row 12 (acceptance line as amended by
EPC-00): the SessionStart Context Packet is served from canonical
projections — the EPC-06/07 checkpoint-backed recovery views, the EPC-05
materialized `checks/latest`, and the tracked `tasks/current.md`
projection — instead of its own independent assembly reads; the old
assembly path is deleted same-package (R5). Acceptance is machine-checked
against the EPC-00-frozen token gate: across the 27-state
Authority×Profile panel (9 authority states × 3 profiles), every sample
has `estimated_tokens <= 1500` with `within_budget == true`, and panel
`p95(estimated_tokens) <= 700`, method `utf8_bytes_div_4`, with the
per-sample table committed in the package's measurement report. Base SHA
pinned per R1 at fresh fetch: `9ea195b99db26895821e9ee3e29ad2f460895649`
(post-EPC-07 merge + row flip + global CLI refresh commit state).

## Why

The Context Packet is the last consumer still assembling recovery/evidence
state from primary sources on its own: HRD-04 consolidated it to one
budgeted render, but its content still comes from ad-hoc reads that can
diverge from what the canonical projections say. With checkpoint-backed
views (EPC-07), materialized checks (EPC-05), and the tracked status
snapshot as the only authorities, SessionStart must become a projection
consumer, or it remains a shadow re-derivation the audit's trust model
forbids.

## Goal

1. Inventory the current SessionStart Context Packet assembly
   (`src/cli/hook/session-context.ts` and its collaborators): every
   source it reads today, classified as (a) canonical projection
   (keep, read via the projection), (b) primary-source re-derivation
   (cut over to the corresponding projection), or (c) live session
   context that is not evidence/recovery state (legitimate direct read
   — e.g. current git branch identity; enumerate and justify each).
   Record in the contract before cutover edits.
2. Cutover: evidence and recovery content in the packet is served from
   canonical projections only — the EPC-07 recovery views / EPC-06
   checkpoint reader for evidence claims, `checks/latest` (materialized)
   for verification state, `tasks/current.md` for the derived status
   snapshot. The replaced independent assembly reads are deleted in this
   package. `SESSION_CONTEXT_TOKEN_BUDGET = 1500` and the
   `utf8_bytes_div_4` estimator stay the binding budget mechanics
   (unchanged surface).
3. Panel measurement: implement/extend a measurement runner (following
   the existing `scripts/hook-dispatch-diet-report.ts` percentile/SLO
   machinery) that renders the SessionStart Context Packet across the
   27-state panel — authority states {no plan, draft plan, approved
   work package, executing, completed, foreign worktree, missing/corrupt
   policy, invalid capability registry, conflicting active markers} ×
   profiles {Lite, Standard, Strict} — one deterministic sample per
   state, recording `estimated_tokens` and `within_budget` per sample.
   Gate: every sample <= 1500 and `within_budget == true`; panel
   p95 <= 700. SessionStart latency reported descriptively (>= 20
   iterations per state), not gated (EPC-00 confirmation).
4. Measurement report: the per-sample table (27 rows: state, profile,
   estimated_tokens, within_budget, p50/p95 latency) plus the two gate
   numbers, committed as this package's tracked report artifact
   (`tasks/reviews/` measurement appendix or a dedicated report file
   under the package's notes surface — exact placement recorded in the
   contract).
5. Old assembly path deleted same-package: the replaced reads/renderers
   removed; a no-independent-assembly test (grep/behavioral) proves the
   packet's evidence/recovery sections cannot be produced from primary
   sources anymore.
6. Characterization suites stay green with only documented updates where
   they asserted the deleted assembly internals; session-context budget
   evidence file (`session-context-budget.json`) semantics unchanged.
7. All root required checks green; full `bun test` green; one
   independent PR on `codex/epc-08-context-packet-cutover`.

## P1: Architecture Map

- Design authority: EPC-00's amended row-12 acceptance line (panel, both
  token gates, method) and frozen D4 (projections carry no independent
  trust — the packet may cite, never re-derive); EPC-05/06/07 surfaces
  consumed read-only via their public readers.
- Owned surface: `src/cli/hook/session-context.ts` (+ its direct
  assembly collaborators identified in Goal 1), the measurement runner
  script, tests. The Stop path, recovery materializer, and checkpoint
  modules are not modified.
- The 27-state fixtures likely exist in prior HRD/LSC characterization
  suites (Authority×Profile matrix) — reuse/extend those fixture
  builders rather than inventing a parallel state factory; cite what is
  reused.

## P2: Concrete Trace

EPC-07 merges -> `main` at `9ea195b9` -> EPC-08 fresh-fetches, pins it
(R1) -> worktree opens on `codex/epc-08-context-packet-cutover` ->
assembly inventory recorded -> cutover lands with old path deleted ->
panel runner measures 27 states -> report committed with per-sample
table; both token gates pass -> full suite green -> receipt via worktree
scripts -> one PR merges -> EPC-09 pins its base per R1.

## P3: Design Decision

- The packet remains a renderer with a hard budget; what changes is the
  provenance of its content (projections in, primary sources out). Live
  session identity (branch, worktree path, host) is not evidence and
  stays a direct read — the trust model governs evidence claims, not
  every string.
- One deterministic sample per panel state (not repeated-iteration token
  percentiles): packet content is deterministic per state (EPC-00
  confirmation); latency, which is not deterministic, gets the >= 20
  iteration descriptive treatment.
- The measurement report is a tracked package artifact so EPC-09's
  closeout can cite measured numbers without re-running the panel.

## Task Breakdown

- [ ] Verify fresh fetch equals pinned base `9ea195b9`; fill contract.
- [ ] Assembly inventory (keep/cutover/legitimate-direct classification)
      recorded in the contract.
- [ ] Cutover edits + old-path deletion (red-first where feasible).
- [ ] Panel measurement runner + 27-state fixtures.
- [ ] Report with per-sample table; both token gates green.
- [ ] Required checks; commit; receipt via worktree scripts; PR.

## Scope

- In scope: `src/cli/hook/session-context.ts` and the direct assembly
  collaborators the inventory names (each listed in the contract's
  allowed_paths before editing); the panel measurement runner script
  (new or extension of the existing diet-report harness); panel fixtures;
  `tests/` files for the cutover + panel; the tracked measurement report
  artifact; this package's plan/contract/review/notes; `tasks/todos.md`
  projection; `.ai/harness/worktrees/epc-08-context-packet-cutover.json`.
- Out of scope: Stop handler, recovery materializer, checkpoint modules,
  checks materializer, producers/importers (EPC-02..07 surfaces);
  `SESSION_CONTEXT_TOKEN_BUDGET` value or estimator method changes;
  `tasks/current.md`; the sprint document; any new npm dependency.
- Non-goals: latency gating (descriptive only); benchmark subject
  surfaces (R2 list) — none of them are touched.

## Stop Conditions

- Stop if `origin/main` moves past `9ea195b9` before worktree creation.
- Stop if a panel state cannot reach the token gates without content
  redesign beyond projection sourcing — report with the measured
  numbers for an orchestrator ruling (the gate numbers are frozen; the
  content knife is a design decision).
- Stop if the inventory shows the packet needs a projection that does
  not exist yet (missing canonical surface) — report, do not invent a
  new authority.
- Stop after three fail-fix-reverify rounds on one issue.

## Falsifier

The direction is wrong if the packet cannot be served from canonical
projections without exceeding the frozen token gates (projection content
too heavy), or if a required packet section has no canonical source.
Cheapest proof: the 27-row panel table with every sample <= 1500 /
within_budget and p95 <= 700, produced by the committed runner against
the cutover code.

## Cheapest Sufficient Proof

- Fresh fetch equals `9ea195b9` at pin time; contract records it.
- Panel report committed: 27 rows, both gates green, method
  `utf8_bytes_div_4`.
- Old-path deletion proven by the no-independent-assembly test.
- Full `bun test` green; root checks green in the worktree.
- `git diff --name-only <base>..HEAD` ⊆ `allowed_paths`.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Verify fresh fetch equals pinned base `9ea195b9`; fill contract.
- [ ] Assembly inventory (keep/cutover/legitimate-direct classification)
- [ ] Cutover edits + old-path deletion (red-first where feasible).
- [ ] Panel measurement runner + 27-state fixtures.
- [ ] Report with per-sample table; both token gates green.
- [ ] Required checks; commit; receipt via worktree scripts; PR.
