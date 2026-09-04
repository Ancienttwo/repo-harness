> **Archived**: 2026-09-05 03:14
> **Related Plan**: plans/archive/plan-20260821-2226-package-owned-test-runner.md
> **Outcome**: Superseded
> **Lifecycle**: plan
> **Parent Run ID**: run-20260905-0314
> **Archive Projection V1**: `plans/plan-20260821-2226-package-owned-test-runner.md` => `plans/archive/plan-20260821-2226-package-owned-test-runner.md`
> **Archive Projection V1**: `tasks/notes/20260821-2226-package-owned-test-runner.notes.md` => `tasks/archive/notes-20260905-0314-package-owned-test-runner.md`
> **Archive Projection V1**: `tasks/contracts/20260821-2226-package-owned-test-runner.contract.md` => `tasks/archive/contract-20260905-0314-package-owned-test-runner.md`
> **Archive Projection V1**: `tasks/reviews/20260821-2226-package-owned-test-runner.review.md` => `tasks/archive/review-20260905-0314-package-owned-test-runner.md`

# Plan: Package-Owned Contract Test Runner

> **Status**: Archived
> **Created**: 20260821-2226
> **Slug**: package-owned-test-runner
> **Planning Source**: user-approved-plan
> **Orchestration Kind**: user-approved-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Focused helper regression, strict contract verification, required repository checks, and the BYOK consumer reproduction.
> **Rollback Surface**: Revert the package-owned test runner commit; no schema, publication, or installed runtime mutation is part of this worktree.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/archive/contract-20260905-0314-package-owned-test-runner.md`
> **Task Review**: `tasks/archive/review-20260905-0314-package-owned-test-runner.md`
> **Implementation Notes**: `tasks/archive/notes-20260905-0314-package-owned-test-runner.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from user-approved-plan planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/archive/plan-20260821-2226-package-owned-test-runner.md`
- Sprint contract: `tasks/archive/contract-20260905-0314-package-owned-test-runner.md`
- Sprint review: `tasks/archive/review-20260905-0314-package-owned-test-runner.md`
- Implementation notes: `tasks/archive/notes-20260905-0314-package-owned-test-runner.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/archive/contract-20260905-0314-package-owned-test-runner.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/archive/plan-20260821-2226-package-owned-test-runner.md` and may start `repo-harness run contract-worktree start --plan plans/archive/plan-20260821-2226-package-owned-test-runner.md`.

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
- Contract file: `tasks/archive/contract-20260905-0314-package-owned-test-runner.md`
- Review file: `tasks/archive/review-20260905-0314-package-owned-test-runner.md`
- Implementation notes file: `tasks/archive/notes-20260905-0314-package-owned-test-runner.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/archive/contract-20260905-0314-package-owned-test-runner.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/archive/plan-20260821-2226-package-owned-test-runner.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert the package-owned test runner commit; no schema, publication, or installed runtime mutation is part of this worktree.
- **Verification boundary**: Focused helper regression, strict contract verification, required repository checks, and the BYOK consumer reproduction.
- **Review/acceptance boundary**: `tasks/archive/review-20260905-0314-package-owned-test-runner.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/archive/plan-20260821-2226-package-owned-test-runner.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/archive/contract-20260905-0314-package-owned-test-runner.md`, `tasks/archive/review-20260905-0314-package-owned-test-runner.md`, and `tasks/archive/notes-20260905-0314-package-owned-test-runner.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/archive/review-20260905-0314-package-owned-test-runner.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert the package-owned test runner commit; no schema, publication, or installed runtime mutation is part of this worktree.

## Captured Planning Output

## Goal
Make `exit_criteria.tests_pass` execute each test through the owning package's declared `scripts.test` authority, so package-local Vitest/Bun configuration is preserved and a bare `bun test <path>` cannot silently change semantics.

## Success Criteria
- A disposable monorepo fixture proves a workspace test that requires package Vitest configuration fails under bare Bun but passes through `bun run --cwd <owner> test -- <relative-path>`.
- The verifier records the exact resolved package-owned command for each criterion.
- Root single-package Bun tests continue to pass through the root package's declared `test` script.
- Missing ownership, ambiguous ownership, or a missing declared `test` script fails closed with a stable diagnostic.
- `--read-only` does not mutate the contract, manifests, or source.
- The BYOK release-identity contract reproduction passes without duplicating the suite under `commands_succeed`.

## Scope
- `scripts/verify-contract.sh` package-owner resolution and command dispatch.
- `assets/templates/helpers/verify-contract.sh` synced deployed-helper projection.
- Focused helper-script regression coverage.
- Plan, contract, review, notes, failure evidence, and task-state artifacts required by repo-harness workflow.
- Architecture model/projection only if the architecture gate requires it.

## Non-Scope
- No contract schema change.
- No fallback to bare Bun when package ownership or `scripts.test` is unavailable.
- No package manager abstraction, test command inference, or duplicate `commands_succeed` execution path.
- No npm publish, tag, PR, merge to main, or installed runtime refresh in this worktree.
- No changes to the separate prepare-handoff helper-resolution branch.

## Constraints
- Preserve one test execution authority: the nearest valid owning package declared by repository/workspace structure and its exact `scripts.test` command.
- Resolve paths inside the repository only; reject escape, malformed manifests, overlapping/ambiguous workspace ownership, and missing scripts.
- Keep bounded execution, deadline, log retention, and read-only behavior unchanged.
- Use the cheapest sufficient focused tests before full repository verification.

## P1 Architecture Map
`scripts/verify-contract.sh` is the source helper for contract parsing, bounded criterion execution, result recording, and failure-log retention. `assets/templates/helpers/verify-contract.sh` is the byte-synced packaged projection consumed by generated repositories. Repository/package manifests own test-runner semantics. `tests/helper-scripts.test.ts` exercises copied deployed helpers in disposable consumer repositories. Contract YAML remains the criterion list authority.

## P2 Concrete Trace
Contract YAML `tests_pass[].path` -> verifier validates the file -> resolves the unique owning package within repository/workspace declarations -> validates that package's `scripts.test` -> converts the criterion to a package-relative path -> bounded runner executes `bun run --cwd <owner> test -- <relative-path>` -> existing result parser records duration/exit/signal -> failure log retention preserves the criterion output -> contract verdict is emitted. The current pressure point is the unconditional `bun test <path>` call, which bypasses package-owned Vitest `define`/setup/config.

## P3 Design Decision
Use a deterministic, fail-closed owner resolver and invoke only the owner's declared test script. This preserves the core invariant that the package manifest/config is the semantic authority. Reject bare-Bun fallback and contract-level command duplication because both create a second steady-state execution authority. At 10x monorepo scale, repeated manifest/workspace resolution is the first pressure point; keep the implementation simple and deterministic now, and optimize only if observed.

## Fragile Assumption
Bun's `bun run --cwd <owner> test -- <relative-path>` forwards the path to both Bun-native and Vitest scripts without changing package test configuration. The focused fixture must falsify this before implementation is accepted.

## Rejected Alternative
Adding the BYOK package command to `commands_succeed` is rejected because it duplicates the same suite and leaves `tests_pass` semantically wrong for every other monorepo consumer.

## Public Interface Changes
No YAML/schema changes. The observable verifier behavior changes: `tests_pass` now requires an unambiguous owning `package.json` with `scripts.test`, and diagnostics expose the resolved package-owned command or fail-closed reason.

## External Dependencies
None. Use the repository's existing Bun and test dependencies.

## Verification
- Focused regression guard in `tests/helper-scripts.test.ts`.
- `bun test tests/helper-scripts.test.ts --timeout 60000` or the narrowest supported name filter.
- helper source/projection sync check.
- `repo-harness run verify-contract --contract <this-contract> --strict --read-only`.
- Required repository checks from root AGENTS.md after code freeze.
- BYOK external reproduction against `/Users/kito/Projects/byok-sdk-wt-local-agent-release-identity`.

## Rollback and Failure Handling
Revert the implementation commit and generated helper projection together. Any unresolved owner, malformed manifest, missing script, or bounded child failure remains an explicit failed criterion. Do not synthesize a command.

## Phase Independence
The package-test-runner fix is independently reviewable and commit-ready. Combining it with the already separate prepare-handoff fix and refreshing a local installed runtime happens later on a dedicated integration branch, after both exact diffs pass their own gates.

## Task Breakdown
- [x] Add and capture a pre-fix failing package-owned runner regression guard.
- [x] Implement deterministic fail-closed owner resolution and package-script execution.
- [x] Sync the packaged helper projection and run focused verification.
- [ ] Complete contract evidence, review gate, and required repository checks.
- [x] Prove the BYOK consumer reproduction against the frozen candidate.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Add and capture a pre-fix failing package-owned runner regression guard.
- [x] Implement deterministic fail-closed owner resolution and package-script execution.
- [x] Sync the packaged helper projection and run focused verification.
- [ ] Complete contract evidence, review gate, and required repository checks.
- [x] Prove the BYOK consumer reproduction against the frozen candidate.
