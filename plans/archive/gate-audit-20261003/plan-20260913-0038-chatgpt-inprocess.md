# Plan: Run chatgpt browser CLI tests in-process

> **Status**: Executing
> **Created**: 20260913-0038
> **Slug**: chatgpt-inprocess
> **Planning Source**: codex-plan-or-waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Substantive Change SHA256**: `sha256:695292620362ead9c1252788c2ad21852ecca7e948f1f127552efa84879d46ba`
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Changed test file plus new helper consumers, measured against a recorded baseline and a JUnit test-name multiset.
> **Rollback Surface**: tests/cli/chatgpt-browser.test.ts and tests/helpers/cli-in-process.ts only.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260913-0038-chatgpt-inprocess.contract.md`
> **Task Review**: `tasks/reviews/20260913-0038-chatgpt-inprocess.review.md`
> **Implementation Notes**: `tasks/notes/20260913-0038-chatgpt-inprocess.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from codex-plan-or-waza-think planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260913-0038-chatgpt-inprocess.md`
- Sprint contract: `tasks/contracts/20260913-0038-chatgpt-inprocess.contract.md`
- Sprint review: `tasks/reviews/20260913-0038-chatgpt-inprocess.review.md`
- Implementation notes: `tasks/notes/20260913-0038-chatgpt-inprocess.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260913-0038-chatgpt-inprocess.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260913-0038-chatgpt-inprocess.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260913-0038-chatgpt-inprocess.md`.

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
- Contract file: `tasks/contracts/20260913-0038-chatgpt-inprocess.contract.md`
- Review file: `tasks/reviews/20260913-0038-chatgpt-inprocess.review.md`
- Implementation notes file: `tasks/notes/20260913-0038-chatgpt-inprocess.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260913-0038-chatgpt-inprocess.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260913-0038-chatgpt-inprocess.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: tests/cli/chatgpt-browser.test.ts and tests/helpers/cli-in-process.ts only.
- **Verification boundary**: Changed test file plus new helper consumers, measured against a recorded baseline and a JUnit test-name multiset.
- **Review/acceptance boundary**: `tasks/reviews/20260913-0038-chatgpt-inprocess.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260913-0038-chatgpt-inprocess.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260913-0038-chatgpt-inprocess.contract.md`, `tasks/reviews/20260913-0038-chatgpt-inprocess.review.md`, and `tasks/notes/20260913-0038-chatgpt-inprocess.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260913-0038-chatgpt-inprocess.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: tests/cli/chatgpt-browser.test.ts and tests/helpers/cli-in-process.ts only.

## Captured Planning Output

# Plan: Run chatgpt browser CLI tests in-process

## Promotion Gate

- **Merge/PR unit**: One independently reviewable test-runtime change to `tests/cli/chatgpt-browser.test.ts` and one new test helper.
- **Rollback surface**: Revert this slice; no product source, script, or workflow file changes.
- **Verification boundary**: The changed test file plus the new helper's consumers, measured against a recorded per-file baseline and a JUnit test-name multiset.
- **Review/acceptance boundary**: Local focused runs plus repository-integrity checks recorded here.
- **High-risk surface**: A silently early-returning in-process runner could make assertions read stale output, so the runner needs an explicit completion barrier and a zero-loss test-name check.
- **Why not checklist row**: It is an independent verification boundary with its own before/after measurement and its own merge unit.

## Evidence Contract

- **State/progress path**: This plan's Task Breakdown.
- **Verification evidence**: Recorded baseline and post-change elapsed time for the changed file, JUnit `<testcase name>` multiset equality, and repository-integrity command results.
- **Evaluator rubric**: Same 55 test names before and after, all passing, with measurably lower elapsed time.
- **Stop condition**: Either the file runs green in-process with identical names, or a semantic blocker is reported without changing `src/`.
- **Rollback surface**: `tests/cli/chatgpt-browser.test.ts` and `tests/helpers/cli-in-process.ts` only.

## Decision

P1: `src/cli/index.ts` exports `buildProgram()` and `runCli(argv)`; the module-level body is guarded by `import.meta.main`, so importing it has no side effects. `src/cli/commands/chatgpt.ts` owns the whole `chatgpt` command group. `src/cli/chatgpt-browser/**` holds no module-level mutable state, registers no `process` listeners, and never writes to stdout.

P2: `runChatgpt()` paid a full Bun cold start per call. Measured directly: 20 `spawnSync` CLI calls cost 4054 ms (~203 ms each) while 20 in-process `runCli` calls cost 38 ms (~1.9 ms each) after a one-time 166 ms module import. With 77 call sites, process startup is roughly 15 s of the file's runtime.

P3: The in-process runner must reproduce three process-boundary semantics. Environment: `oracle-provider.buildOracleEnv` and `secret-scan.scannerEnv` both build the child environment from a `process.env` snapshot, and Bun 1.4.0 propagates runtime `process.env` mutation and deletion to bare `spawnSync` children, so replacing `process.env` in place preserves fake-oracle and fake-gitleaks behavior. Working directory: `resolveRepoRoot` resolves against `process.cwd()`, so the runner chdirs and restores. Exit: commander's own exits become thrown `CommanderError`s through `exitOverride`, and every chatgpt action funnels through `runChatgptAction`, whose only failure exit is a `process.exit(2)` in the last statement of its catch, so a patched `process.exit` that records the code and returns reproduces the status without an unhandled rejection. The one property the CLI does not expose in-process is completion: all ten chatgpt actions discard the work promise (`void runChatgptAction(...)`), so commander's `parseAsync` resolves before the action finishes. Each action's terminal statement is a stdout write or that exit, so the runner's completion barrier is "first stdout write, or recorded exit", which is an observable contract of the command group rather than a change to it. At 10x scale the first thing to fail is a new chatgpt action that keeps working after its terminal log; the barrier is documented at the helper boundary so that contract is explicit.

## Scope

Add `tests/helpers/cli-in-process.ts` with a `runCliInProcess` runner that snapshots and restores `process.env`, `process.cwd()`, stdout/stderr writers, the console writers, and `process.exit`, and returns `{ status, stdout, stderr }`. Point `runChatgpt()` at it and await the result at every call site, converting the enclosing test bodies and `withRepo` to async. Do not change assertions, test titles, `src/`, `scripts/`, or `.github/`.

## Verification

Run the changed file isolated and together with sibling `tests/cli/chatgpt*.test.ts`, compare the JUnit `<testcase name>` multiset against the recorded baseline, and run the repository-integrity checks plus `bun run check:type` and the init dry-run. No full suite: the change is confined to one test file and one new test helper.

## Task Breakdown

- [x] Add the in-process CLI runner helper with env/cwd/stdout/exit restoration and a documented completion barrier.
- [x] Convert `runChatgpt()` and its 77 call sites to the in-process runner without touching assertions or titles.
- [x] Prove zero test loss with a JUnit test-name multiset comparison and record before/after elapsed time.
- [x] Complete focused and repository-integrity verification.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Add the in-process CLI runner helper with env/cwd/stdout/exit restoration and a documented completion barrier.
- [x] Convert `runChatgpt()` and its 77 call sites to the in-process runner without touching assertions or titles.
- [x] Prove zero test loss with a JUnit test-name multiset comparison and record before/after elapsed time.
- [x] Complete focused and repository-integrity verification.
