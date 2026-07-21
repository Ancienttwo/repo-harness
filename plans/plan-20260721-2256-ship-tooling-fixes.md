# Plan: Ship-tooling environment fixes: predict-manifest cp-nest, protected-PATH node, archive contract binding, diet-report hermeticity

> **Status**: Executing
> **Created**: 20260721-2256
> **Slug**: ship-tooling-fixes
> **Planning Source**: waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: tasks/archive/notes-20260721-2241-bdd2-followthrough.md
> **Artifact Level**: work-package
> **Promotion Reason**: merge_boundary
> **Verification Boundary**: bun test tests/archive-evidence-gates.test.ts tests/hook-dispatch-diet-report.test.ts + full bun test deterministically green in the interactive worktree + check:type + sync:helpers/check:helpers parity + protected-env smoke of check-architecture-sync and the finish predict step + root required checks; the design-options plan archive succeeding is T3's live proof.
> **Rollback Surface**: Revert branch codex/ship-tooling-fixes; restore ~/.bun/bin/{node,jq} symlinks if needed (machine-local); no data migration, no schema.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260721-2256-ship-tooling-fixes.contract.md`
> **Task Review**: `tasks/reviews/20260721-2256-ship-tooling-fixes.review.md`
> **Implementation Notes**: `tasks/notes/20260721-2256-ship-tooling-fixes.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from waza-think planning output.
- Source ref: tasks/archive/notes-20260721-2241-bdd2-followthrough.md
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260721-2256-ship-tooling-fixes.md`
- Sprint contract: `tasks/contracts/20260721-2256-ship-tooling-fixes.contract.md`
- Sprint review: `tasks/reviews/20260721-2256-ship-tooling-fixes.review.md`
- Implementation notes: `tasks/notes/20260721-2256-ship-tooling-fixes.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260721-2256-ship-tooling-fixes.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260721-2256-ship-tooling-fixes.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260721-2256-ship-tooling-fixes.md`.

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
- Contract file: `tasks/contracts/20260721-2256-ship-tooling-fixes.contract.md`
- Review file: `tasks/reviews/20260721-2256-ship-tooling-fixes.review.md`
- Implementation notes file: `tasks/notes/20260721-2256-ship-tooling-fixes.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260721-2256-ship-tooling-fixes.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260721-2256-ship-tooling-fixes.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert branch codex/ship-tooling-fixes; restore ~/.bun/bin/{node,jq} symlinks if needed (machine-local); no data migration, no schema.
- **Verification boundary**: bun test tests/archive-evidence-gates.test.ts tests/hook-dispatch-diet-report.test.ts + full bun test deterministically green in the interactive worktree + check:type + sync:helpers/check:helpers parity + protected-env smoke of check-architecture-sync and the finish predict step + root required checks; the design-options plan archive succeeding is T3's live proof.
- **Review/acceptance boundary**: `tasks/reviews/20260721-2256-ship-tooling-fixes.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: merge_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260721-2256-ship-tooling-fixes.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260721-2256-ship-tooling-fixes.contract.md`, `tasks/reviews/20260721-2256-ship-tooling-fixes.review.md`, and `tasks/notes/20260721-2256-ship-tooling-fixes.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260721-2256-ship-tooling-fixes.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert branch codex/ship-tooling-fixes; restore ~/.bun/bin/{node,jq} symlinks if needed (machine-local); no data migration, no schema.

## Captured Planning Output

## Approach
### Strategy
One work-package fixing the four ship-tooling defects surfaced while shipping `bdd2-followthrough` (PR #109). Forks from main AFTER #109 merges (the package consumes ledger rows #109 added). One worktree, one PR. Task Profile: bugfix (Root Cause Evidence below is pre-captured for T1, the anchor defect).

- **T1 — predict-manifest cp-nest (CONFIRMED, root-cause-prover)**: `scripts/archive-workflow.sh:224` `cp -Rp .ai/harness/checks "$scratch_repo/.ai/harness/checks"` nests the ignored evidence at `checks/checks/latest.json` because the destination dir already exists in the scratch clone (tracked `.ai/harness/checks/.gitkeep` recreates it), so the nested Completed gate fails `! -s .ai/harness/checks/latest.json` (`workflow-state.sh:1653`). Fix: merge contents — `mkdir -p "$scratch_repo/.ai/harness/checks" && cp -Rp .ai/harness/checks/. "$scratch_repo/.ai/harness/checks/"` — in `scripts/archive-workflow.sh`, propagated to `assets/templates/helpers/archive-workflow.sh` via `bun run sync:helpers`.
- **T2 — bare `node` unreachable from protectedPath**: packaged/`scripts/check-architecture-sync.sh:284` calls `node -e` unguarded; `protectedPath()` (helper-runner) has no node dir. Fix: replace the `:284` capability-id extraction with jq-primary (`jq -r '[.[] | .capability_id // "root"] | unique | .[]'` — jq lives in `/usr/bin`, always inside protectedPath) plus the existing guarded-node fallback pattern from `:70-75`; no new dependency. Cleanup: remove the `~/.bun/bin/node` and `~/.bun/bin/jq` symlink workarounds and smoke the script under `env -i PATH=<protectedPath-equivalent>`.
- **T3 — archive Completed gate binds only the active contract**: `verify-sprint` resolves its contract solely from the active-plan marker (sole flag `--prepare-acceptance`), so a completed historical plan can never satisfy `completed_archive_gate`'s plan-bound evidence requirement. Fix: add an explicit `--contract <path>` override to `scripts/verify-sprint.sh` contract resolution (single authority unchanged — the archive gate keeps validating evidence↔contract binding exactly as today; no gate relaxation, no second evidence path). Acceptance proof: run it against `tasks/contracts/20260714-1353-design-options-proactive-choice.contract.md`, then `repo-harness run archive-workflow --plan plans/plan-20260714-1353-design-options-proactive-choice.md --outcome Completed` succeeds — closing the original hygiene item live.
- **T4 — diet-report test hermeticity**: `tests/hook-dispatch-diet-report.test.ts` `reportFor()` omits `eventsPath`, so `buildHookDietReport` reads the live `.ai/harness/runs/hook-events.jsonl` (`scripts/hook-dispatch-diet-report.ts:232` default) and fails in any interactive checkout. Fix: pass an isolated empty-fixture `eventsPath` in the test; assertion semantics unchanged. Restores deterministic full-suite green in interactive worktrees.

### Trade-offs
| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| One package, four fixes | All four surfaced by one ship, share the helper/test surface, one review boundary | Mixed capability (workflow-engine helpers + one runtime test) | **Chosen** — explicit plan cover; each fix independently small |
| Relax archive gate instead of `--contract` binding (T3) | No verify-sprint change | Weakens the evidence↔contract binding the gate exists for | Rejected |
| Keep node symlink, skip T2 | Zero code change | Machine-local compensation masking a product defect on every other machine | Rejected — remove compensation, fix the invocation |

## Detailed Design
### File Changes
| File | Action | Description |
|------|--------|-------------|
| `scripts/archive-workflow.sh` | edit | `:222-225` compensation copy merges contents into existing dir (`cp -Rp src/. dst/` after `mkdir -p`) |
| `assets/templates/helpers/archive-workflow.sh` | generated | `bun run sync:helpers` projection |
| `tests/archive-evidence-gates.test.ts` | edit | Regression test per the captured Root Cause Evidence: `withTempRepo` fixture with tracked `.ai/harness/checks/.gitkeep`, gitignored non-empty passing `latest.json`, `--predict-manifest` run must exit 0 |
| `scripts/check-architecture-sync.sh` | edit | `:284` capability-id extraction via jq-primary + guarded node fallback (pattern from `:70-75`) |
| `assets/templates/helpers/check-architecture-sync.sh` | generated | `bun run sync:helpers` projection |
| `scripts/verify-sprint.sh` | edit | `--contract <path>` explicit binding override in contract resolution (before active-marker fallbacks); usage line updated |
| `assets/templates/helpers/verify-sprint.sh` | generated | `bun run sync:helpers` projection |
| `tests/hook-dispatch-diet-report.test.ts` | edit | `reportFor()` passes isolated empty `eventsPath` fixture |
| `plans/plan-20260714-1353-design-options-proactive-choice.md` | archive | Via T3's new binding: verify-sprint bound to its contract → `archive-workflow --outcome Completed` (live acceptance proof) |
| `tasks/todos.md` | edit | Delist the two rows this package resolves (diet-report hermeticity; design-options archive / gate mechanism gap) per the delist pattern |
| `~/.bun/bin/node`, `~/.bun/bin/jq` | remove (machine-local) | Retire symlink workarounds after T2 lands; protected-env smoke proves they are no longer needed |

### Root Cause Evidence (bugfix profile, pre-captured for T1)
- root_cause: `scripts/archive-workflow.sh:224` `cp -Rp .ai/harness/checks "$scratch_repo/.ai/harness/checks"` nests ignored evidence at `checks/checks/latest.json` (destination pre-created by clone via tracked `.gitkeep`), failing `workflow_checks_pass`'s `! -s` guard (`assets/hooks/lib/workflow-state.sh:1653`) inside the nested Completed gate.
- repro: scratch git repo with tracked `.ai/harness/checks/.gitkeep` + gitignored non-empty `latest.json`, cloned, then the exact `:222-225` copy replayed — `find` shows the nested path and the guard fires.
- regression_guard: the `tests/archive-evidence-gates.test.ts` case above (fails on current code with `Structured checks file is missing or empty`, passes after the merge-contents fix); listed under `exit_criteria.tests_pass`.
- pre_fix_failure_artifact: re-capture during execution into `.ai/harness/runs/` with `bun test tests/archive-evidence-gates.test.ts > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` on the unfixed code (diagnosis-time artifact lived in session scratchpad; the contract gate needs a repo-local capture).

### Data Flow
finish → `predict_post_freeze_manifest` → scratch clone + compensation copy (T1 fixes the copy) → nested Completed gate reads `.ai/harness/checks/latest.json` (now present) → predict manifest → merge-gate → real archive. `verify-sprint --contract <path>` (T3) feeds plan-bound evidence to `completed_archive_gate` for historical plans; gate logic itself unchanged.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| `cp -Rp src/. dst/` semantics differ on exotic cp | Low | Low | Regression test runs the real script in a temp repo; macOS + coreutils both merge-contents with the `/.` form |
| `--contract` override misused to bypass active-work discipline | Low | Medium | Override only changes which contract verify-sprint reads; all evidence/receipt/gate validations still bind to that contract; document the flag for archive use |
| jq expression drifts from node semantics at `:284` | Low | Low | Fixture with multi-capability + missing-id match input asserts identical output |
| Symlink removal breaks another packaged helper still calling bare node | Medium | Low | `rg 'node -e' assets/templates/helpers/ scripts/` sweep in T2; protected-env smoke of the full finish flow in T9 |

## Promotion Gate
- **Merge/PR unit**: one branch `codex/ship-tooling-fixes`, one PR; forks from main after #109 merges.
- **Rollback surface**: revert the branch; restore the two symlinks if needed (machine-local); no data migration, no schema.
- **Verification boundary**: `bun test tests/archive-evidence-gates.test.ts tests/hook-dispatch-diet-report.test.ts` + full `bun test` (now expected deterministically green in interactive worktrees — T4's own proof) + `bun run check:type` + `sync:helpers`/`check:helpers` + protected-env smoke of `check-architecture-sync` and the finish predict step + root required checks.
- **Review/acceptance boundary**: gatekeeper acceptance; the design-options plan archive succeeding is T3's machine-verifiable proof.
- **High-risk surface**: none — helper scripts + tests; the one behavioral flag (`--contract`) is additive with unchanged gate validation.
- **Why not checklist row**: four ledgered defects with a shared verification boundary, its own rollback surface, and a completed diagnosis artifact; consumes two todos rows.

## Evidence Contract
- **State/progress path**: contract `exit_criteria`; Task Breakdown below.
- **Verification evidence**: suite outputs, protected-env smoke logs under `.ai/harness/runs/`, the successful design-options archive output, `check-task-workflow --strict`.
- **Evaluator rubric**: gatekeeper `PASS`; regression test red-then-green captured per bugfix profile; no gate semantics weakened (diff inspection on `workflow_checks_pass` and `completed_archive_gate` — both untouched).
- **Stop condition**: all rows checked, full suite deterministically green in this worktree, gatekeeper recommendation recorded.
- **Rollback surface**: as in Promotion Gate.

## Task Breakdown
- [x] T1 fix `scripts/archive-workflow.sh:222-225` compensation copy (merge contents); `bun run sync:helpers`; add the regression test to `tests/archive-evidence-gates.test.ts`; capture the pre-fix failure artifact on unfixed code first (bugfix gate)
- [x] T2 replace bare `node -e` at `scripts/check-architecture-sync.sh:284` with jq-primary + guarded node fallback; `bun run sync:helpers`; sweep `rg 'node -e'` across helpers for siblings; protected-env smoke
- [x] T3 add `--contract <path>` override to `scripts/verify-sprint.sh` contract resolution; `bun run sync:helpers`; prove by verify-sprint against the design-options contract then `archive-workflow --outcome Completed` for `plans/plan-20260714-1353-design-options-proactive-choice.md`
- [x] T4 pass an isolated empty `eventsPath` fixture in `tests/hook-dispatch-diet-report.test.ts` `reportFor()`; full suite deterministically green in this interactive worktree
- [x] T5 `tasks/todos.md`: delist the diet-report hermeticity row and the design-options-archive/gate-gap row (both resolved by this package)
- [x] T6 remove `~/.bun/bin/node` and `~/.bun/bin/jq` symlinks; re-smoke the protected-env finish predict step end-to-end without them
- [x] T7 full verification: named suites + full `bun test` + `check:type` + helper parity + root required checks + `check-task-workflow --strict`; hand diff + evidence to gatekeeper

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] T1 fix `scripts/archive-workflow.sh:222-225` compensation copy (merge contents); `bun run sync:helpers`; add the regression test to `tests/archive-evidence-gates.test.ts`; capture the pre-fix failure artifact on unfixed code first (bugfix gate)
- [x] T2 replace bare `node -e` at `scripts/check-architecture-sync.sh:284` with jq-primary + guarded node fallback; `bun run sync:helpers`; sweep `rg 'node -e'` across helpers for siblings; protected-env smoke
- [x] T3 add `--contract <path>` override to `scripts/verify-sprint.sh` contract resolution; `bun run sync:helpers`; prove by verify-sprint against the design-options contract then `archive-workflow --outcome Completed` for `plans/plan-20260714-1353-design-options-proactive-choice.md`
- [x] T4 pass an isolated empty `eventsPath` fixture in `tests/hook-dispatch-diet-report.test.ts` `reportFor()`; full suite deterministically green in this interactive worktree
- [x] T5 `tasks/todos.md`: delist the diet-report hermeticity row and the design-options-archive/gate-gap row (both resolved by this package)
- [x] T6 remove `~/.bun/bin/node` and `~/.bun/bin/jq` symlinks; re-smoke the protected-env finish predict step end-to-end without them
- [x] T7 full verification: named suites + full `bun test` + `check:type` + helper parity + root required checks + `check-task-workflow --strict`; hand diff + evidence to gatekeeper
