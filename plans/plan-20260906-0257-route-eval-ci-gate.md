# Plan: Route eval TS arm as named CI gate

> **Status**: Executing
> **Created**: 20260906-0257
> **Slug**: route-eval-ci-gate
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Focused eval tests, check:route-eval, check-ci.sh syntax, integrity checks; no full suite
> **Rollback Surface**: Revert only codex/route-eval-ci-gate
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260906-0257-route-eval-ci-gate.contract.md`
> **Task Review**: `tasks/reviews/20260906-0257-route-eval-ci-gate.review.md`
> **Implementation Notes**: `tasks/notes/20260906-0257-route-eval-ci-gate.notes.md`
> **Substantive Change SHA256**: `sha256:add860b0064b2893ae1e9c9cd976cf57f30c6f14b8e63a09b233e1f905d93317`

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

- Active plan: `plans/plan-20260906-0257-route-eval-ci-gate.md`
- Sprint contract: `tasks/contracts/20260906-0257-route-eval-ci-gate.contract.md`
- Sprint review: `tasks/reviews/20260906-0257-route-eval-ci-gate.review.md`
- Implementation notes: `tasks/notes/20260906-0257-route-eval-ci-gate.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260906-0257-route-eval-ci-gate.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260906-0257-route-eval-ci-gate.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260906-0257-route-eval-ci-gate.md`.

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
- Contract file: `tasks/contracts/20260906-0257-route-eval-ci-gate.contract.md`
- Review file: `tasks/reviews/20260906-0257-route-eval-ci-gate.review.md`
- Implementation notes file: `tasks/notes/20260906-0257-route-eval-ci-gate.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260906-0257-route-eval-ci-gate.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260906-0257-route-eval-ci-gate.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert only codex/route-eval-ci-gate
- **Verification boundary**: Focused eval tests, check:route-eval, check-ci.sh syntax, integrity checks; no full suite
- **Review/acceptance boundary**: `tasks/reviews/20260906-0257-route-eval-ci-gate.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260906-0257-route-eval-ci-gate.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260906-0257-route-eval-ci-gate.contract.md`, `tasks/reviews/20260906-0257-route-eval-ci-gate.review.md`, and `tasks/notes/20260906-0257-route-eval-ci-gate.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260906-0257-route-eval-ci-gate.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert only codex/route-eval-ci-gate

## Captured Planning Output

## Goal
Make the route-nl-vs-ts eval a named CI gate whose subject is the prompt-intent classifier itself, so that any change to `src/cli/hook/prompt-intents.ts` or its decision vocabulary produces a numeric pass/fail in CI, and the corpus covers the classifier's full intent and action surface rather than nine hand-picked regressions. This is the prerequisite for ever retiring the regex classifier in favor of the NL decision table: the TS arm becomes the pinned oracle, the NL arm stays operator-invoked.

## P1 Map
`scripts/route-nl-vs-ts-eval.ts` owns `ROUTE_SCENARIOS` (9 entries), the TS arm (`runPromptGuardVerdictFromPrompt`), the NL arm comparison, and CLI modes `--emit-scenarios`, `--write-scenarios`, `--write-expected-decisions`, `--check-report`, `--decisions`. `tests/route-nl-vs-ts-eval.test.ts` asserts the TS arm matches expected (test "TS arm matches the current expected route table") but only inside the bulk `bun test` step. `scripts/check-ci.sh` is the CI chain invoked by `.github/workflows` via `bun run check:ci`; it has typecheck, state boundaries, three projection `--check`s, tests, workflow checks, inspection, package dry-run. No eval step. `evals/evals.json` entry 25 is the live NL-arm run (agent reads `docs/reference-configs/loop-engine-nl-decision-table.md`); it needs a provider and stays out of PR CI. Controlled vocabulary: `PROMPT_GUARD_INTENTS` (12) and `PROMPT_GUARD_ACTIONS` (17) in `src/cli/hook/prompt-guard-decision.ts`. Existing regression corpora for prompts: `tests/hook-runtime.test.ts`, `tests/cli/prompt-guard-decision.test.ts`, `tasks/lessons.md` entries on intent misclassification.

## P2 Trace
A regex edit in `prompt-intents.ts` today flows: `bun test` runs `tests/route-nl-vs-ts-eval.test.ts` → 9 scenarios compared → failure surfaces as one test among hundreds, with no per-scenario or coverage summary, and only if the edited branch happens to be one of the 9. Intents such as `passive_worktree_status`, `passive_completion_report`, `passive_next_slice_report`, `embedded_approved_plan`, `bug_fix_execution` and most `done_*` / `*_block` actions have no scenario, so a regression there is invisible to this eval. The pressure point is corpus coverage plus a named, per-scenario CI mode.

## P3 Decision
Keep scenarios typed inside `scripts/route-nl-vs-ts-eval.ts` (compile-time vocabulary check, no second corpus file, no new authority). Expand `ROUTE_SCENARIOS` so every intent in `PROMPT_GUARD_INTENTS` and every action in `PROMPT_GUARD_ACTIONS` that the TS arm can reach appears in at least one scenario; every scenario carries a `lessonSource` pointing at an existing test, lesson, or decision-table rule. Prompts are taken or minimally adapted from the existing regression corpora, not invented from taste. Add one CLI mode `--check-ts-arm`: runs the TS arm over all scenarios, prints one line per scenario, prints intent/action coverage against the two vocabularies, exits non-zero on any mismatch or if a pinned coverage constant (`REQUIRED_INTENT_COVERAGE` / `REQUIRED_ACTION_COVERAGE`, explicit arrays) is not met. Actions that cannot be reached from the prompt layer are listed in the plan notes with the reason and excluded from the pinned constant; do not fake them. Wire `check:route-eval` in `package.json` and a named `[ci] route eval (TS arm)` step in `scripts/check-ci.sh` before `[ci] tests`. NL arm, report protocol, `evals/evals.json` entry, and runtime prompt-guard behavior are unchanged. Tradeoff: corpus lives in TS so non-engineers cannot edit it as data; accepted because the subject is a TS classifier and the vocabulary is TS-typed. At 10x scenarios the per-line print becomes noisy first; a `--quiet` is out of scope until that is observed.

## Scope
`scripts/route-nl-vs-ts-eval.ts`; `tests/route-nl-vs-ts-eval.test.ts`; `package.json`; `scripts/check-ci.sh`; `docs/reference-configs/loop-engine-nl-decision-table.md` (one paragraph describing the CI mode); this plan. If `scripts/check-ci.sh` has a helper projection or a test asserting its step list, update that projection or assertion in the same change. No edits to `src/cli/hook/prompt-intents.ts`, `src/cli/hook/prompt-guard-decision.ts`, `evals/evals.json`, or hook runtime.

## Task Breakdown
- [x] Add a RED test asserting `--check-ts-arm` exits non-zero on a mismatched scenario and that coverage of all intents and all reachable actions is pinned.
- [x] Expand `ROUTE_SCENARIOS` from existing regression corpora until every intent and every reachable action is covered; record unreachable actions and reasons in the plan notes section below.
- [x] Implement `--check-ts-arm` with per-scenario output, coverage summary, and non-zero exit on mismatch or coverage shortfall.
- [x] Wire `check:route-eval` in package.json and the named step in scripts/check-ci.sh; update any projection or step-list assertion.
- [x] Document the CI mode in the decision-table reference and run the verification commands.

## Promotion Gate

- **Merge/PR unit**: one reviewable PR adding a CI gate and its corpus.
- **Rollback surface**: revert the branch; no state, schema, or runtime behavior migrates.
- **Verification boundary**: focused eval test file, `bun run check:route-eval`, `bash -n scripts/check-ci.sh`, repository-integrity checks.
- **Review/acceptance boundary**: gatekeeper review of diff against this plan plus verification output.
- **High-risk surface**: none in runtime; the risk is a corpus that encodes current regex quirks as truth. Mitigation: every scenario must cite a lessonSource from an existing test, lesson, or decision-table rule.
- **Why not checklist row**: independent CI gate with its own merge and rollback boundary.

## Evidence Contract

- **State/progress path**: this plan's Task Breakdown.
- **Verification evidence**: Verification Results section below with command output.
- **Evaluator rubric**: `bun run check:route-eval` passes on the branch, fails when one scenario expectation is flipped; coverage summary lists all 12 intents and all reachable actions; `scripts/check-ci.sh` contains the named step before tests.
- **Stop condition**: all Task Breakdown rows checked and verification commands pass; report blockers without widening scope.
- **Rollback surface**: revert only this branch.

## Verification Commands

```bash
bun test tests/route-nl-vs-ts-eval.test.ts --timeout 60000
bun run check:route-eval
bash -n scripts/check-ci.sh
bun run check:type
bun run check:helpers
bash scripts/check-deploy-sql-order.sh
bash scripts/check-architecture-sync.sh
bash scripts/check-task-sync.sh
bash scripts/check-task-workflow.sh --strict
bun scripts/inspect-project-state.ts --repo . --format text
bun src/cli/index.ts init --repo . --dry-run
```

Focused eval tests plus the CI script syntax and integrity checks cover this slice. No runtime TypeScript under `src/` changes, so no full suite.

## Unreachable Actions

None. Falsifier check run before writing scenarios: every branch of
`decidePromptGuardAction` in `src/cli/hook/prompt-guard-decision.ts` is selected
by `PromptGuardIntent` plus `PromptGuardState` fields only, and
`runPromptGuardVerdictFromPrompt` in `src/cli/commands/prompt-guard-decision.ts`
supplies the intent from prompt text while `readStateFromEnv` supplies every
state field from `PROMPT_GUARD_*_STATE`, which the eval sets per scenario. All
17 `PROMPT_GUARD_ACTIONS` and all 12 `PROMPT_GUARD_INTENTS` are therefore
reachable from a prompt plus a `PromptGuardState`, so
`REQUIRED_ACTION_COVERAGE` and `REQUIRED_INTENT_COVERAGE` pin the full
vocabularies and nothing is excluded or faked.

Branch-to-scenario map for the actions that had no scenario before this change:

| Action | Reaching condition | Scenario |
|--------|--------------------|----------|
| `spec_block` | execution intent + `spec=missing` | `general-execution-spec-missing` |
| `worktree_execution_advice` | `plan=none`, `worktree=linked_target` | `linked-worktree-execution` |
| `plan_capture_missing_active_advice` | `plan=none`, projection intent | `plan-projection-missing-active` |
| `plan_status_no_active_block` | `plan=none`, non-projection execution intent | `embedded-approved-plan-no-active`, `bug-fix-ignores-pending-plan`, `general-execution-no-active-plan` |
| `plan_status_not_approved_block` | `plan=draft`, non-projection execution intent | `plan-shaped-markdown-draft` |
| `evidence_contract_block` | `plan=approved`, `evidence=incomplete` | `approved-plan-incomplete-evidence` |
| `contract_missing_block` | `plan=approved`, `contract=missing`, non-projection intent | `approved-plan-generic-execution-no-contract` |
| `done_missing_active_plan` | done intent, `plan=none` | `done-missing-active-plan` |
| `done_contract_path_missing` | done intent, `contractPath=missing` | `done-contract-path-missing` |
| `done_missing_contract` | done intent, `contract=missing` | `done-missing-contract` |
| `done_evidence_contract_block` | done intent, `evidence=incomplete` | `done-evidence-contract-block` |
| `allow` on an execution intent | `plan=executing`, `contract=present` | `executing-plan-with-contract-allows` |

## Verification Results

RED capture (`/tmp/route-eval-red.log`) was taken with the new tests in place and
`scripts/route-nl-vs-ts-eval.ts` reverted to `HEAD`:

```
SyntaxError: Export named 'checkTsArm' not found in module '.../scripts/route-nl-vs-ts-eval.ts'
 0 pass
 1 fail
 1 error
TEST_EXIT=1
error: Script not found "check:route-eval"
CHECK_EXIT=1
```

Green run after implementation:

```
$ bun test tests/route-nl-vs-ts-eval.test.ts --timeout 60000
 10 pass
 0 fail
 233 expect() calls
Ran 10 tests across 1 file. [107.00ms]

$ bun test tests/bootstrap-files.test.ts --timeout 60000
 15 pass
 0 fail
 459 expect() calls
Ran 15 tests across 1 file. [16.00ms]

$ bun run check:route-eval
OK       done-future-wording expected=none/allow actual=none/allow
... (31 scenario lines, all OK)
route-eval ts-arm scenarios=31 mismatches=0
covered intents 12/12
covered actions 17/17
missing intents: (none)
missing actions: (none)
result=pass

$ bash -n scripts/check-ci.sh
(no output, exit 0)

$ bun run check:type
$ node node_modules/typescript/bin/tsc --noEmit
(no output, exit 0)

$ bun run check:helpers
[helpers] projection OK: 56 helpers (sha256:d0469b8f0fea6b89fc4c995108c8650bda82928a88975f102a266b5e55066e57)

$ bash scripts/check-deploy-sql-order.sh
[deploy-sql] OK

$ bash scripts/check-architecture-sync.sh
[ArchitectureSync] mode=strict gate_min_severity=medium changed_capabilities=4 blocking=0
[ArchitectureProjection] provider=archctx apply=automatic state=ready pending=0 running=0 dead_letters=0 human_actions=0 adoption_required=0 blocking=0 uncommitted=0

$ REPO_HARNESS_DIFF_BASE=origin/main REPO_HARNESS_DIFF_MODE=merge-base bash scripts/check-task-sync.sh
[task-sync] Bound canonical workflow evidence: plans/plan-20260906-0257-route-eval-ci-gate.md (sha256:add860b0064b2893ae1e9c9cd976cf57f30c6f14b8e63a09b233e1f905d93317).
(exit 0)

$ bash scripts/check-task-workflow.sh --strict
[workflow] OK

$ bun scripts/inspect-project-state.ts --repo . --format text
mode: audit
legacy_contract_version: current-v1
drift_signals: (none)
required_decisions: (none)
upgrade_plan:
- (none)

$ bun src/cli/index.ts init --repo . --dry-run
[init-plan] mode: standard
[init-plan] apply: no
[init-plan] operations: 0 total, 0 planned, 0 skipped
[init-plan] warning(low): The repo-harness source checkout owns its workflow surfaces; downstream init is not applicable.
```

Corpus: `ROUTE_SCENARIOS` 8 -> 31 scenarios; 12/12 intents and 17/17 actions covered.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Add a RED test asserting `--check-ts-arm` exits non-zero on a mismatched scenario and that coverage of all intents and all reachable actions is pinned.
- [x] Expand `ROUTE_SCENARIOS` from existing regression corpora until every intent and every reachable action is covered; record unreachable actions and reasons in the plan notes section below.
- [x] Implement `--check-ts-arm` with per-scenario output, coverage summary, and non-zero exit on mismatch or coverage shortfall.
- [x] Wire `check:route-eval` in package.json and the named step in scripts/check-ci.sh; update any projection or step-list assertion.
- [x] Document the CI mode in the decision-table reference and run the verification commands.
