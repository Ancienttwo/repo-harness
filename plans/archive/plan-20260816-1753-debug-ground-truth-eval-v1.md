# Plan: Hidden-ground-truth debug evaluation v1

> **Status**: Archived
> **Created**: 20260816-1753
> **Slug**: debug-ground-truth-eval-v1
> **Planning Source**: codex-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Hidden truth is excluded from the trusted stub's assigned prompt and workspace, grading replays in a fresh fixture, all four deterministic cases and repository gates pass, and canonical 3x9 benchmark evidence remains byte-identical; v1 makes no untrusted-provider process-isolation claim.
> **Rollback Surface**: Revert the isolated codex/debug-ground-truth-eval-v1 diff; no existing benchmark schema, report, or debug runtime is migrated.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260816-1753-debug-ground-truth-eval-v1.contract.md`
> **Task Review**: `tasks/reviews/20260816-1753-debug-ground-truth-eval-v1.review.md`
> **Implementation Notes**: `tasks/notes/20260816-1753-debug-ground-truth-eval-v1.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from codex-plan planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260816-1753-debug-ground-truth-eval-v1.md`
- Sprint contract: `tasks/contracts/20260816-1753-debug-ground-truth-eval-v1.contract.md`
- Sprint review: `tasks/reviews/20260816-1753-debug-ground-truth-eval-v1.review.md`
- Implementation notes: `tasks/notes/20260816-1753-debug-ground-truth-eval-v1.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260816-1753-debug-ground-truth-eval-v1.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260816-1753-debug-ground-truth-eval-v1.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260816-1753-debug-ground-truth-eval-v1.md`.

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
- Contract file: `tasks/contracts/20260816-1753-debug-ground-truth-eval-v1.contract.md`
- Review file: `tasks/reviews/20260816-1753-debug-ground-truth-eval-v1.review.md`
- Implementation notes file: `tasks/notes/20260816-1753-debug-ground-truth-eval-v1.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260816-1753-debug-ground-truth-eval-v1.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260816-1753-debug-ground-truth-eval-v1.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert the isolated codex/debug-ground-truth-eval-v1 diff; no existing benchmark schema, report, or debug runtime is migrated.
- **Verification boundary**: Hidden truth is excluded from the trusted stub's assigned prompt and workspace, grading replays in a fresh fixture, all four deterministic cases and repository gates pass, and canonical 3x9 benchmark evidence remains byte-identical; v1 makes no untrusted-provider process-isolation claim.
- **Review/acceptance boundary**: `tasks/reviews/20260816-1753-debug-ground-truth-eval-v1.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260816-1753-debug-ground-truth-eval-v1.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260816-1753-debug-ground-truth-eval-v1.contract.md`, `tasks/reviews/20260816-1753-debug-ground-truth-eval-v1.review.md`, and `tasks/notes/20260816-1753-debug-ground-truth-eval-v1.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260816-1753-debug-ground-truth-eval-v1.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert the isolated codex/debug-ground-truth-eval-v1 diff; no existing benchmark schema, report, or debug runtime is migrated.

## Captured Planning Output

Build an eval-only hidden-ground-truth benchmark for the reactive debug path. This work package deliberately measures `/hunt` and root-cause evidence before changing their runtime contract.

## P1 Architecture Map

- System boundary: trusted host runner and in-process stub, a separately projected disposable fixture workspace, host-owned hidden truth omitted from the stub inputs, a fresh deterministic grader workspace, and a durable evidence report.
- Existing authorities preserved: `evals/harness/scenarios.json` and `scripts/run-harness-profile-benchmark.ts` remain the canonical 3x9 profile benchmark; `scripts/run-skill-evals.ts` remains the existing skill/adoption runner.
- New authority: `scripts/run-debug-ground-truth-eval.ts`, `evals/debug-hunt/scenarios.json`, `evals/debug-hunt/ground-truth.json`, and `evals/fixtures/debug-hunt/**`.
- Entry point: `bun run benchmark:debug -- ...` backed by the new runner.
- Ownership boundary: scenario prompts and fixtures are stub-visible; hidden truth and grader logic are host-owned and must never be copied, mounted, embedded in prompts, or made reachable from the assigned stub workspace. The injectable callback is a trusted test seam, not a sandbox for untrusted provider code.
- Out of scope: modifying Waza `/hunt`, changing `root-cause-prover`, reusing the current skill runner's sandbox-bypassing provider path, hostile-code execution, gVisor/Docker adoption, live production debugging, patch generation, and changing the current profile benchmark report.

## P2 Concrete Trace

1. The runner loads a public scenario and host-only truth from separate files and validates that fixture paths cannot escape their declared roots.
2. It creates a disposable provider workspace containing only the defective fixture, sends only the symptom prompt plus the required typed diagnostic response contract, and captures a submission artifact.
3. The runner classifies provider execution independently from grading as `submitted`, `no_submission`, or `error`.
4. A deterministic host grader parses the typed submission, compares root-cause claims and abstention behavior against hidden truth, and replays the declared reproduction command in a fresh fixture copy that never contains provider edits.
5. The report records hashes for runner, public scenario, fixture, hidden truth, submission, and grader inputs. Grading states remain distinct: `pass`, `fail`, `ungraded`, `error`, and `no_submission`.
6. The runner asserts that the existing canonical profile report bytes are unchanged.

Error paths fail closed: malformed manifests, path escape, truth/scenario mismatch, invalid typed submission, grader command failure, or missing evidence cannot become a pass.

## P3 Design Decision

- Use a separate runner/profile because `run-skill-evals.ts` exposes the source checkout and bypasses the Codex sandbox, while the current profile runner enforces a fixed 3x9 authority.
- Keep v1 to trusted TypeScript/Bun fixtures and a trusted in-process stub. The invariant is answer-key omission from assigned inputs/workspace plus fresh deterministic replay, not process isolation or container technology.
- Include four cases so the benchmark measures more than happy-path localization: deterministic logic error, async ordering error, stale persisted artifact, and a no-bug/red-herring case requiring abstention.
- At 10x scale, provider cost and fixture provisioning fail first; the manifest/report hash model permits later sharding without introducing a second semantic authority.
- This is the smallest coherent change because it creates one declared evaluation loop with executable truth and leaves runtime behavior unchanged until evidence shows a concrete gap.

## File Changes

- Add `scripts/run-debug-ground-truth-eval.ts` with manifest validation, prompt/workspace projection separation, a trusted injectable test seam, typed submission parsing, fresh replay grading, state semantics, provenance hashes, and report writing.
- Add `evals/debug-hunt/scenarios.json` containing only case ids, symptom prompts, and fixture references.
- Add `evals/debug-hunt/ground-truth.json` containing host-only expected root cause, reproduction oracle, and abstention expectation.
- Add four minimal fixtures under `evals/fixtures/debug-hunt/` for logic, async ordering, stale artifact, and red-herring/no-bug behavior.
- Add `tests/debug-ground-truth-eval.test.ts` covering truth non-disclosure, path escape rejection, fresh replay immunity to provider edits, pass/fail/abstain/status semantics, deterministic provenance, and unchanged canonical benchmark evidence.
- Add `benchmark:debug` to `package.json`.
- Update `agents/fleet/harness-evaluator.md` only to declare how to run the already-defined debug profile in a disposable repo/HOME; preserve its prohibition on inventing evaluator truth.
- Update `docs/architecture/modules/verification/evals-checks.md` and add `docs/researches/20260816-defending-code-debug-eval.md` citing Anthropic `defending-code-reference-harness` commit `d3bea6b5793b5f3d59a75ebe69a58efa88383145` and the borrowed/non-borrowed boundaries.
- Synchronize workflow artifacts required by the active plan/contract.

## Acceptance Criteria

- A test provider cannot observe any hidden-truth bytes, filenames, paths, commands, or expected answers through its prompt or workspace.
- Scenario, fixture, and truth references reject root escape and symlink escape.
- The deterministic grader replays the oracle in a fresh fixture copy and cannot be influenced by provider changes to source/tests.
- All four fixtures produce the expected result under deterministic stub submissions, including a false-positive failure and correct abstention pass for the no-bug/red-herring case.
- `pass`, `fail`, `ungraded`, `error`, and `no_submission` are represented and tested without collapsing infrastructure failures into diagnostic failures.
- The report binds runner/scenario/fixture/truth/submission/grader inputs by hash and is reproducible for fixed inputs.
- Existing `evals/harness/reports/profile-comparison.*` bytes remain unchanged.
- Focused tests, full `bun test`, deploy SQL ordering, architecture sync, task sync, strict workflow, project-state inspection, and init dry-run pass.

## Verification

- `bun test tests/debug-ground-truth-eval.test.ts`
- `bun run benchmark:debug -- --help`
- deterministic end-to-end stub run over all four cases
- `bun test`
- `bash scripts/check-deploy-sql-order.sh`
- `bash scripts/check-architecture-sync.sh`
- `bash scripts/check-task-sync.sh`
- `repo-harness run check-task-workflow --strict`
- `bun scripts/inspect-project-state.ts --repo . --format text`
- `bun src/cli/index.ts init --repo . --dry-run`

## Rollback

Revert the isolated `codex/debug-ground-truth-eval-v1` work-package diff. No existing benchmark schema/report or debug runtime behavior is migrated, so rollback removes only the new profile and its documentation.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Freeze the debug evaluation schema and answer-key isolation invariants.
- [x] Implement runner, four fixtures, hidden truth, and deterministic fresh replay grader.
- [x] Add regression tests and the declared evaluator entry point.
- [x] Record upstream research and architecture authority.
- [x] Run focused and repository-wide verification.
- [ ] Complete independent acceptance and workflow closeout.
